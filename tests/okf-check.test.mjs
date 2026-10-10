// Tests for skills/matej/open-knowledge-format/scripts/okf-check.mjs.
// Each test builds a small bundle in a temp directory and runs the checker as an
// agent would, so what is asserted is the verdict and the message it prints.
//
// OKF_UPSTREAM=<checkout of GoogleCloudPlatform/open-knowledge-format> also runs it
// over upstream's sample bundles; CI stays offline, so that case skips there.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CHECKER = fileURLToPath(new URL('../skills/matej/open-knowledge-format/scripts/okf-check.mjs', import.meta.url));

const made = [];
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function bundle(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-check-'));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

function check(dir, ...flags) {
  try {
    return { status: 0, out: execFileSync(process.execPath, [CHECKER, ...flags, dir], { encoding: 'utf8' }) };
  } catch (e) {
    return { status: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

const concept = (fm, body = '# Notes\n\nText.\n') => `---\n${fm}\n---\n\n${body}`;

// A conformant bundle that exercises the YAML the upstream samples use: flow
// mappings, compact "- key:" lists, sequences at their key's indentation,
// multi-line plain scalars, quoted strings and a log.md with frontmatter.
const VALID = {
  'index.md': '---\nokf_version: "0.2"\n---\n\n# Pebble\n\n* [Services](services/index.md) - The processes that make up Pebble.\n',
  'log.md':
    '---\ntype: Log\n---\n\n# Bundle history\n\n## 2026-10-10\n* **Creation**: Added the [API](/services/api.md).\n\n## 2026-09-02\n* **Initialization**: Created the bundle.\n',
  'services/index.md': '# Service\n\n* [API](api.md) - Accepts note edits over HTTPS.\n* [Worker](worker.md) - Pushes changed notes to phones.\n',
  'services/api.md': concept(
    [
      'type: Service',
      'title: "API: the front door"',
      'description: Accepts note edits over HTTPS.',
      'tags: [pebble, api]',
      'generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T09:00:00Z }',
      'verified:',
      '  - { by: human:mara, at: 2026-10-10T10:00:00+02:00 }',
      'status: stable',
      'stale_after: 2027-01-01T00:00:00Z',
      'sources:',
      '- id: api-readme',
      '  resource: https://git.example.com/pebble/api/README.md',
      '  title: \'API service README\'',
      '  last_modified: 2026-09-30T00:00:00Z',
      'notes: a long value that wraps',
      '  onto a second line',
    ].join('\n'),
    '# Responsibilities\n\nWrites notes to Postgres.[^api-readme] The [worker](/services/worker.md) reads them.\n\n[^api-readme]: API service README\n'
  ),
  'services/worker.md': concept('type: Service\ndescription: Pushes changed notes to phones.'),
};

test('passes a conformant bundle', () => {
  const r = check(bundle(VALID));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^CONFORMANT: 0 errors, 0 warnings$/m);
});

test('fails a concept with no frontmatter', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': '# Worker\n\nPushes notes.\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:1: error: no frontmatter: /m);
});

test('fails frontmatter that is not valid YAML', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: Service\ntitle: Incident response: data freshness') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:3: error: frontmatter is not valid YAML: ": " inside a plain value/m);
});

test('fails a concept without a type', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('title: Worker\ndescription: Pushes notes.') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:1: error: frontmatter has no `type`/m);
});

test('fails a concept whose type is an empty string', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: ""\ndescription: Pushes notes.') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:2: error: `type` is empty/m);
});

test('fails a concept whose type has no value', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type:\ndescription: Pushes notes.') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:2: error: `type` is empty/m);
});

test('fails frontmatter in an index.md below the bundle root', () => {
  const r = check(bundle({ ...VALID, 'services/index.md': `---\ntitle: Services\n---\n\n${VALID['services/index.md']}` }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/index\.md:1: error: index\.md takes no frontmatter/m);
});

test('fails a bundle-root index.md frontmatter carrying more than okf_version', () => {
  const r = check(bundle({ ...VALID, 'index.md': VALID['index.md'].replace('okf_version: "0.2"', 'okf_version: "0.2"\ntitle: Pebble') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^index\.md:1: error: .* may only carry `okf_version`, not `title`/m);
});

test('fails an index.md entry above its first heading', () => {
  const r = check(bundle({ ...VALID, 'services/index.md': '* [API](api.md) - Accepts note edits.\n\n# Service\n\n* [Worker](worker.md) - Pushes notes.\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/index\.md:1: error: index entry above the first heading/m);
});

test('fails a log.md date heading that is not YYYY-MM-DD', () => {
  const r = check(bundle({ ...VALID, 'log.md': '# Log\n\n## 10/10/2026\n* **Creation**: Added the API.\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^log\.md:3: error: log heading "## 10\/10\/2026" is not an ISO 8601 date/m);
});

test('fails a log.md that is not newest first', () => {
  const r = check(bundle({ ...VALID, 'log.md': '# Log\n\n## 2026-09-02\n* Created.\n\n## 2026-10-10\n* Added the API.\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^log\.md:6: error: log dates must run newest first: 2026-10-10 sits below 2026-09-02/m);
});

test('fails YAML outside the subset as unsupported rather than passing it', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: &kind Service\ndescription: Pushes notes.') }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^services\/worker\.md:2: error: frontmatter uses an anchor \(&\), which okf-check's YAML subset cannot read/m);
});

test('reports SHOULD-level problems as warnings without failing', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: Service\ndescription: Pushes notes.\ngenerated: { by: claude, at: 2026-10-10 }') }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^CONFORMANT: 0 errors, 2 warnings$/m);
});

test('fails on warnings under --strict', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: Service\ndescription: Pushes notes.\nstatus: accepted') }), '--strict');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^NOT CONFORMANT: 0 errors, 1 warning \(--strict counts warnings\)$/m);
});

test('warns about a concept its index.md does not list', () => {
  const r = check(bundle({ ...VALID, 'services/billing.md': concept('type: Service\ndescription: Issues invoices.') }));
  assert.match(r.out, /^services\/index\.md:1: warning: index\.md does not list `billing\.md`$/m);
});

test('ignores links written inside inline code', () => {
  const r = check(bundle({ ...VALID, 'services/worker.md': concept('type: Service\ndescription: Pushes notes.', 'Link with `[API](/services/missing.md)`.\n') }));
  assert.match(r.out, /^CONFORMANT: 0 errors, 0 warnings$/m);
});

test('rejects a path that is not a directory as a usage error', () => {
  const r = check(path.join(bundle(VALID), 'index.md'));
  assert.equal(r.status, 2, r.out);
});

test('passes every upstream sample bundle', { skip: !process.env.OKF_UPSTREAM && 'set OKF_UPSTREAM to an upstream checkout' }, () => {
  const samples = path.join(process.env.OKF_UPSTREAM || '', 'bundles');
  const failing = fs
    .readdirSync(samples)
    .filter((name) => check(path.join(samples, name)).status !== 0);
  assert.deepEqual(failing, []);
});
