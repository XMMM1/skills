#!/usr/bin/env node
// Sync engine for XMMM1/skills.
//
// Vendored skills are machine-owned: upstream always wins, so sync is fetch + overwrite
// and there is deliberately no merge logic anywhere in this file.
//
// Usage:
//   node sync/sync.mjs                      fetch, overwrite, regenerate
//   node sync/sync.mjs --dry-run            report only, write nothing
//   node sync/sync.mjs --verify             assert only (CI: no network, no writes)
//   node sync/sync.mjs --add-upstream o/r   license-gate + register a new upstream

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(ROOT, 'sources.json');
const SKILLS = path.join(ROOT, 'skills');
const AUTHORED = 'matej'; // the one hand-editable source; never synced

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const VERIFY_ONLY = args.includes('--verify');
const ADD_UPSTREAM = args[args.indexOf('--add-upstream') + 1] || null;
const isAdd = args.includes('--add-upstream');

const PERMISSIVE = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense'];

// ---------------------------------------------------------------- utilities

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: 'utf8', ...opts }).trim();

const report = { updated: [], moved: [], deprecated: [], deleted: [], added: [], quarantined: [], flagged: [] };
const problems = [];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// node 16 has fs.cp only as experimental, so do it by hand.
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

// Hash the whole skill directory, not just SKILL.md: skills ship references
// (tdd/ has tests.md + mocking.md) and an edit to those is just as much an edit.
function hashDir(dir) {
  const h = createHash('sha256');
  for (const f of walk(dir).sort()) {
    h.update(path.relative(dir, f).split(path.sep).join('/'));
    h.update('\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return 'sha256:' + h.digest('hex');
}

function frontmatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[kv[1]] = v;
  }
  return out;
}

// Rewrites are RULES, reapplied on every sync — not hand-edits. That is what lets
// them survive overwrite without resurrecting any merge machinery.
function applyRewrites(dir, rules) {
  if (!rules || !rules.length) return 0;
  let n = 0;
  for (const f of walk(dir)) {
    if (!f.endsWith('.md')) continue;
    const before = fs.readFileSync(f, 'utf8');
    let after = before;
    for (const r of rules) after = after.split(r.from).join(r.to);
    if (after !== before) {
      fs.writeFileSync(f, after);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- discovery

// skills.sh walks skills/<name>/ and skills/<category>/<name>/ only (depth 2).
// We mirror exactly that so what we vendor is what an installer can actually find.
function discover(repoDir) {
  const base = path.join(repoDir, 'skills');
  const found = [];
  if (!fs.existsSync(base)) return found;
  for (const a of fs.readdirSync(base, { withFileTypes: true })) {
    if (!a.isDirectory()) continue;
    const lvl1 = path.join(base, a.name);
    if (fs.existsSync(path.join(lvl1, 'SKILL.md'))) {
      found.push({ category: '<root>', name: a.name, dir: lvl1, rel: `skills/${a.name}` });
      continue; // shallower shadows anything nested below
    }
    for (const b of fs.readdirSync(lvl1, { withFileTypes: true })) {
      if (!b.isDirectory()) continue;
      const lvl2 = path.join(lvl1, b.name);
      if (fs.existsSync(path.join(lvl2, 'SKILL.md')))
        found.push({ category: a.name, name: b.name, dir: lvl2, rel: `skills/${a.name}/${b.name}` });
    }
  }
  return found;
}

function included(up, category) {
  if (up.exclude && up.exclude.includes(category)) return false;
  if (up.include && up.include.length) return up.include.includes(category);
  return true;
}

function clone(repo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-sync-'));
  sh('git', ['clone', '-q', '--depth', '1', `https://github.com/${repo}.git`, dir], { stdio: 'pipe' });
  const sha = sh('git', ['-C', dir, 'rev-parse', '--short', 'HEAD']);
  return { dir, sha };
}

function licenseOf(repo) {
  try {
    const raw = sh('curl', ['-sL', `https://api.github.com/repos/${repo}/license`]);
    const lic = JSON.parse(raw).license;
    return lic && lic.spdx_id && lic.spdx_id !== 'NOASSERTION' ? lic.spdx_id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- asserts

// These run with no network so CI can enforce them on every PR. Each one maps to a
// failure that is otherwise invisible until someone else's machine breaks.
function assertAll(cfg) {
  const seen = new Map();

  for (const src of fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS) : []) {
    const srcDir = path.join(SKILLS, src);
    if (!fs.statSync(srcDir).isDirectory()) continue;

    for (const name of fs.readdirSync(srcDir)) {
      const dir = path.join(srcDir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const rel = `skills/${src}/${name}`;

      const skillMd = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        problems.push(`${rel}: no SKILL.md at skills/<source>/<name>/ (depth invariant)`);
        continue;
      }

      const fm = frontmatter(skillMd);
      if (!fm) problems.push(`${rel}: unparseable YAML frontmatter`);
      else {
        if (!fm.name) problems.push(`${rel}: frontmatter missing 'name'`);
        if (!fm.description) problems.push(`${rel}: frontmatter missing 'description'`);
        if (fm.name && fm.name !== name)
          problems.push(`${rel}: frontmatter name '${fm.name}' != directory '${name}'`);
      }

      // The lock is keyed by skill name, so a duplicate name breaks install for
      // everyone — and it passes a naive check because the paths differ.
      const key = (fm && fm.name) || name;
      if (seen.has(key)) problems.push(`NAME CLASH '${key}': ${seen.get(key)} and ${rel} — cannot install`);
      else seen.set(key, rel);

      if (src === AUTHORED) continue; // authored skills are ours; nothing to compare against

      const entry = cfg.skills[key];
      if (!entry) {
        problems.push(`${rel}: vendored but absent from sources.json`);
        continue;
      }
      const actual = hashDir(dir);
      if (entry.contentHash && entry.contentHash !== actual)
        problems.push(
          `HAND-EDIT ${rel}\n    recorded ${entry.contentHash}\n    actual   ${actual}\n` +
            `    Vendored files are machine-owned. Upstream the fix, or copy to skills/${AUTHORED}/<new-name>/.`
        );

      // A rewrite rule that silently stops matching would leave dangling refs
      // pointing at a namespace that does not exist outside the upstream's plugin.
      const up = cfg.upstreams[entry.upstream];
      for (const r of (up && up.rewrite) || []) {
        for (const f of walk(dir)) {
          if (f.endsWith('.md') && fs.readFileSync(f, 'utf8').includes(r.from))
            problems.push(`${path.relative(ROOT, f)}: dangling '${r.from}' survived rewrite`);
        }
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------- generate

function generate(cfg) {
  const byUp = {};
  for (const [name, s] of Object.entries(cfg.skills)) (byUp[s.upstream] ||= []).push({ name, ...s });

  const notice = [
    'XMMM1/skills bundles skills from the upstream projects below.',
    'Each remains under its own copyright and license. Vendored copies are',
    'unmodified except for deterministic namespace rewrites listed in sources.json.',
    '',
  ];
  for (const [id, up] of Object.entries(cfg.upstreams)) {
    notice.push(`## ${up.repo} (${up.license})`, `   https://github.com/${up.repo}`, `   ${(byUp[id] || []).length} skills vendored under skills/${id}/`, '');
  }
  fs.writeFileSync(path.join(ROOT, 'NOTICE'), notice.join('\n'));

  const rows = Object.entries(cfg.skills)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, s]) => {
      const flag = s.status === 'deprecated-upstream' ? ' ⚠ deprecated upstream' : s.status === 'deleted-upstream' ? ' ⚠ deleted upstream' : '';
      return `| \`${name}\` | ${s.upstream} | ${s.concept || '—'} |${flag} |`;
    });

  const readme = [
    '# XMMM1/skills',
    '',
    '**Not my skills.** A vendored, auto-synced bundle of other people\'s work, plus one router.',
    'Upstream always wins: nothing here is hand-edited, and a nightly job opens a PR when upstream moves.',
    '',
    '```bash',
    'npx skills add XMMM1/skills        # 70+ agents',
    '```',
    '',
    'For the router to be injected every session (Claude Code only):',
    '',
    '```',
    '/plugin marketplace add XMMM1/skills',
    `/plugin install ${cfg.plugin.name}@${cfg.plugin.marketplace}`,
    '```',
    '',
    '## Sources',
    '',
    '| upstream | license | skills |',
    '| --- | --- | --- |',
    ...Object.entries(cfg.upstreams).map(([id, up]) => `| [${up.repo}](https://github.com/${up.repo}) | ${up.license} | ${(byUp[id] || []).length} |`),
    `| _authored_ | MIT | ${fs.existsSync(path.join(SKILLS, AUTHORED)) ? fs.readdirSync(path.join(SKILLS, AUTHORED)).length : 0} |`,
    '',
    '## Skills',
    '',
    '| skill | source | concept | |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Excluded',
    '',
    '| skill | why |',
    '| --- | --- |',
    ...Object.entries(cfg.excluded || {}).map(([n, e]) => `| \`${n}\` | ${e.reason} |`),
    '',
    '_This file is generated by `sync/sync.mjs`. Do not edit._',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'README.md'), readme);

  // The plugin loader walks skills/<name>/ at depth 1, but our layout is keyed by
  // source (skills/<source>/<name>/) so it finds nothing on its own. Declaring the
  // paths explicitly is the documented escape hatch: "skill paths declared in a
  // manifest are searched at their declared depth". Enumerated, never globbed —
  // a path that stops resolving must fail loudly, not vanish quietly.
  const skillPaths = [];
  for (const src of fs.readdirSync(SKILLS).sort()) {
    const srcDir = path.join(SKILLS, src);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    for (const name of fs.readdirSync(srcDir).sort())
      if (fs.existsSync(path.join(srcDir, name, 'SKILL.md'))) skillPaths.push(`./skills/${src}/${name}`);
  }

  // The version lives once, in sources.json. obra repeats "6.1.1" across five
  // manifests; generating them is how that drift never starts.
  const dir = path.join(ROOT, '.claude-plugin');
  fs.mkdirSync(dir, { recursive: true });
  writeJSON(path.join(dir, 'plugin.json'), {
    name: cfg.plugin.name,
    description: cfg.plugin.description,
    version: cfg.version,
    author: cfg.plugin.author,
    homepage: `https://github.com/${cfg.plugin.repo}`,
    repository: `https://github.com/${cfg.plugin.repo}`,
    license: 'MIT',
    keywords: cfg.plugin.keywords,
    skills: skillPaths,
  });
  writeJSON(path.join(dir, 'marketplace.json'), {
    name: cfg.plugin.marketplace,
    owner: cfg.plugin.author,
    description: cfg.plugin.description,
    plugins: [
      {
        name: cfg.plugin.name,
        source: './',
        version: cfg.version,
        description: cfg.plugin.description,
        author: cfg.plugin.author,
        skills: skillPaths,
      },
    ],
  });
}

// ---------------------------------------------------------------- add-upstream

function addUpstream(cfg, repo) {
  const id = repo.split('/')[0].toLowerCase();
  if (cfg.upstreams[id]) fail(`upstream '${id}' already registered`);

  const lic = licenseOf(repo);
  console.log(`  license: ${lic || 'NONE'}`);
  if (!lic) fail(`${repo} has no license — all rights reserved. Cannot vendor. Install it separately instead.`);
  if (!PERMISSIVE.includes(lic)) fail(`${repo} is ${lic} — not a permissive license. Refusing to vendor.`);

  const { dir, sha } = clone(repo);
  const found = discover(dir);
  const cats = [...new Set(found.map((f) => f.category))];
  console.log(`  layout:  ${cats.length === 1 && cats[0] === '<root>' ? 'flat' : 'catalog'} (${cats.join(', ')})`);
  console.log(`  ${found.length} skills found at ${sha}`);

  const clashes = found.filter((f) => cfg.skills[f.name]);
  if (clashes.length) {
    console.log('');
    for (const c of clashes) console.log(`  NAME CLASH '${c.name}': already owned by ${cfg.skills[c.name].upstream}`);
    fail(`${clashes.length} name clash(es). Both would install to ~/.agents/skills/<name>/. Nothing written — adjudicate in sources.json.`);
  }

  console.log('\n  Add to sources.json:');
  console.log(`    "${id}": { "repo": "${repo}", "license": "${lic}", "include": ${JSON.stringify(cats)} }`);
  console.log('  Then re-run sync.');
  fs.rmSync(dir, { recursive: true, force: true });
}

function fail(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- main

const cfg = readJSON(SOURCES);

if (isAdd) {
  if (!ADD_UPSTREAM) fail('--add-upstream needs owner/repo');
  console.log(`\nadd-upstream ${ADD_UPSTREAM}\n`);
  addUpstream(cfg, ADD_UPSTREAM);
  process.exit(0);
}

if (VERIFY_ONLY) {
  const seen = assertAll(cfg);
  console.log(`\nverify: ${seen.size} skills\n`);
  if (problems.length) {
    for (const p of problems) console.error('  ✗ ' + p);
    fail(`${problems.length} problem(s)`);
  }
  console.log('  ✓ names unique, frontmatter valid, depth ok, no hand-edits, no dangling refs\n');
  process.exit(0);
}

console.log(`\nsync${DRY ? ' --dry-run' : ''}\n`);

const liveNames = new Set();

for (const [id, up] of Object.entries(cfg.upstreams)) {
  const { dir, sha } = clone(up.repo);
  console.log(`${id}  ${up.repo}  @${sha}`);

  const found = discover(dir).filter((f) => included(up, f.category));
  const dest = path.join(SKILLS, id);

  for (const f of found) {
    const existing = cfg.skills[f.name];

    // A name taken by another upstream can never install: quarantine just this one
    // and let every other update in this run through.
    if (existing && existing.upstream !== id) {
      cfg.excluded[f.name] = { upstream: id, reason: `name taken by ${existing.upstream}`, status: 'needs-adjudication' };
      report.quarantined.push(`${f.name} (${id} vs ${existing.upstream})`);
      continue;
    }
    if (cfg.excluded[f.name] && cfg.excluded[f.name].upstream === id) continue;

    liveNames.add(f.name);
    const to = path.join(dest, f.name);

    if (!DRY) {
      fs.rmSync(to, { recursive: true, force: true });
      copyDir(f.dir, to);
      applyRewrites(to, up.rewrite);
    }

    const hash = DRY ? null : hashDir(to);

    if (!existing) {
      report.added.push(`${f.name} (${f.category})`);
      if (!DRY) cfg.skills[f.name] = { upstream: id, upstreamPath: f.rel, sha, contentHash: hash, status: 'active' };
      continue;
    }

    // Local path is keyed by source, never by upstreamPath — which is exactly why an
    // upstream re-categorisation (engineering/ -> deprecated/) never churns our tree.
    if (existing.upstreamPath !== f.rel) {
      const dep = f.category === 'deprecated';
      (dep ? report.deprecated : report.moved).push(`${f.name}: ${existing.upstreamPath} -> ${f.rel}`);
      if (!DRY) {
        existing.upstreamPath = f.rel;
        if (dep) {
          existing.status = 'deprecated-upstream';
          existing.deprecatedAt = new Date().toISOString().slice(0, 10);
        }
      }
    }

    if (existing.contentHash !== hash && !DRY) {
      report.updated.push(`${f.name}  ${existing.sha} -> ${sha}`);
      existing.sha = sha;
      existing.contentHash = hash;
    }
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// Deleted upstream: keep the file, flag it. Never auto-delete something in use.
for (const [name, s] of Object.entries(cfg.skills)) {
  if (!liveNames.has(name) && s.status !== 'deleted-upstream') {
    report.deleted.push(name);
    if (!DRY) {
      s.status = 'deleted-upstream';
      s.deletedAt = new Date().toISOString().slice(0, 10);
    }
  }
}

if (!DRY) {
  writeJSON(SOURCES, cfg);
  generate(cfg);
}

for (const [k, v] of Object.entries(report)) for (const line of v) console.log(`  ${k.toUpperCase().padEnd(12)} ${line}`);
if (!Object.values(report).some((v) => v.length)) console.log('  clean — no upstream drift');

// Emit a report for CI to title the PR with. Loudest event first: a deprecation
// buried under twelve routine updates is a deprecation you merge without reading.
if (!DRY && !VERIFY_ONLY) {
  const n = (k) => report[k].length;
  const title = n('quarantined')
    ? `NAME CLASH — ${n('quarantined')} skill(s) need adjudication`
    : n('deleted')
    ? `DELETED UPSTREAM — ${report.deleted.join(', ')}`
    : n('deprecated')
    ? `DEPRECATED UPSTREAM — ${report.deprecated.length} skill(s)`
    : n('added')
    ? `${n('added')} new skill(s) upstream`
    : n('updated') || n('moved')
    ? `Upstream sync — ${n('updated')} updated, ${n('moved')} moved`
    : 'Upstream sync — no changes';

  const body = [`## ${title}`, ''];
  const section = (k, h) => {
    if (!n(k)) return;
    body.push(`### ${h}`, '', ...report[k].map((l) => `- ${l}`), '');
  };
  section('quarantined', '⛔ Name clashes — not installed, decide manually');
  section('deleted', '⚠ Deleted upstream — kept locally, flagged');
  section('deprecated', '⚠ Deprecated upstream — kept locally, flagged');
  section('added', '＋ New upstream skills');
  section('moved', '→ Moved upstream (local path unchanged)');
  section('updated', '~ Content updated');
  body.push('---', '', 'Generated by `sync/sync.mjs`. Merge, then run `npx skills update` locally.', '');

  fs.writeFileSync(path.join(ROOT, '.sync-report.md'), body.join('\n'));
  fs.writeFileSync(path.join(ROOT, '.sync-title'), title + '\n');
}

assertAll(cfg);
console.log('');
if (problems.length) {
  for (const p of problems) console.error('  ✗ ' + p);
  fail(`${problems.length} problem(s)`);
}
console.log(`  ✓ ${Object.keys(cfg.skills).length} vendored, asserts pass\n`);
