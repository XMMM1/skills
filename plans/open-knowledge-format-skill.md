# Open Knowledge Format skill

Approved 2026-10-10. Decisions 1–7 were set in the request; 8–12 were taken while planning and
are open for review in the PR.

## Why

Projects want their docs readable by agents in the Open Knowledge Format (OKF v0.2,
[spec](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md), Apache-2.0):
a directory ("bundle") of markdown concepts with YAML frontmatter, plus reserved `index.md` and
`log.md`. Nothing in the bundle teaches an agent the format, and upstream ships no validator (its
tooling is a Python reference agent that needs BigQuery and Gemini). One generic skill should let
any project read, write, adopt and check OKF, and let project skills (Cameleo's `writing-docs`)
build house rules on top of it.

## Decisions

1. **Hand-written skill under `skills/matej/`, not an upstream.** The OKF repo has no `SKILL.md`
   and no top-level `skills/` directory, so `--add-upstream` would find nothing; the
   `bundles/*/skills/*.md` files are OKF concepts of `type: Skill`, not agent skills. Checked
   against upstream `ad30107`.
2. **Self-contained.** An installed skill is copied to `~/.agents/skills/<name>/` without the rest
   of this repo, so the spec travels inside it: `references/SPEC.md` and
   `references/SPEC-LICENSE.md` are byte-identical copies of upstream `SPEC.md` and `LICENSE.md`
   at commit `ad30107c31c06aec8a7d5636e0d1058118604e6f`. The pin is bumped by hand, because the
   skill teaches v0.2 and a newer spec needs a reviewed change, not a nightly overwrite.
3. **The skill invokes OKF.** `SKILL.md` carries the three conformance rules, how to read a
   bundle, and how to check one; writing concepts, `index.md` and `log.md` is disclosed to
   `references/authoring.md`, converting existing docs to `references/adopting.md`. Written to
   `writing-great-skills`, tested with `writing-skills`' TDD-for-documentation loop.
4. **A dependency-free validator, `scripts/okf-check.mjs`.** It cannot use the host project's
   `node_modules`, and this machine's default Node is 16, so it targets Node ≥16 with no imports
   beyond `node:`. YAML is read by a built-in **strict subset parser that fails closed**: block
   and flow collections, plain/quoted/block scalars and comments are supported; anchors, aliases,
   tags, complex keys and directives fail the file as "unsupported", never pass it. The limits
   are printed in every run, listed by `--help`, and stated in `SKILL.md`. Rejected: using a full
   parser when one is resolvable (the verdict would differ by machine, and an installed copy
   cannot see the project's `node_modules`); shelling out to Python or Ruby (not guaranteed
   present; PyYAML is YAML 1.1). The subset parser is differential-tested against the `yaml`
   package during development.
5. **Name: `open-knowledge-format`.** Generic, the standard's own name, clashes with nothing in
   the bundle and not with the Cameleo project skill `writing-docs`.
6. **One router ruling.** Two overlaps need it: `ai-seo`'s description already claims "OKF",
   "Open Knowledge Format" and "knowledge bundle", and its notes describe v0.1 from the frozen
   `knowledge-catalog/okf` snapshot; `domain-modeling`'s ADR `Status` frontmatter
   (`proposed | accepted | …`) collides with OKF's `status` (`draft | stable | deprecated`). The
   ruling says which skill fires; the status mapping itself lives in `references/adopting.md`.
7. **Regenerate offline.** `sync.mjs` only regenerates after fetching every upstream. A new
   `--generate` flag (`npm run generate`) rewrites README, NOTICE and the plugin manifests from
   `sources.json` with no network. On `main` it produces no diff, so this PR carries no sync churn.
8. **Embedded third-party files are declared, generated and hash-checked.** A new hand-written
   `embedded` block in `sources.json` records repo, license, commit and a content hash per copied
   file. `generate()` writes a NOTICE section from it; `--verify` fails when a copy no longer
   matches its hash, the same guard vendored skills have, so "unmodified" is enforced, not hoped.
9. **Checker verdicts follow the spec's own split.** Errors are exactly the three conformance
   rules of §11 plus YAML it cannot read. SHOULD-level guidance from §5–§10, broken links and
   directory entries missing from an `index.md` are warnings; `--strict` makes warnings fatal.
   Deliberately not checked: the actor convention on `sources[].author` (the spec's own examples
   use `team:`), and frontmatter in `log.md` (§9 does not forbid it; upstream's `acme_retail`
   sample has one).
10. **Tests live in a repo-level `tests/`**, run by `node --test` (no dependencies), wired into
    `npm test` and `verify.yml`. Fixtures are built inline per test, so the installed skill
    carries none. The upstream sample bundles are checked when `OKF_UPSTREAM` points at a
    checkout, so CI stays offline.
11. **Version 1.2.0 → 1.3.0**, so plugin installs see a new release.
12. **Install is proved against an isolated `HOME`**, never the user's live `~/.agents`.

## Files

New: `skills/matej/open-knowledge-format/{SKILL.md, references/{SPEC.md, SPEC-LICENSE.md,
authoring.md, adopting.md}, scripts/okf-check.mjs}`, `tests/okf-check.test.mjs`, this plan.
Edit: `sync/sync.mjs`, `sources.json` (hand-written top: `embedded`, `version`), `package.json`,
`.github/workflows/verify.yml`, `CLAUDE.md`, `plans/README.md`,
`skills/matej/using-matej-skills/SKILL.md`.
Generated by `npm run generate`: `README.md`, `NOTICE`, `.claude-plugin/*`.

## Verification

`npm run verify` and `npm test` pass. The checker passes every upstream sample bundle and fails,
with one clear message each, on: no frontmatter, unparseable YAML, missing or empty `type`,
frontmatter in a non-root `index.md`, a malformed `log.md` date heading. Fresh subagents given
only the installed skill directory convert a folder of plain docs into a conformant bundle and add
a concept to an existing one; baseline runs without the skill are recorded for comparison. The
skill installs through the `skills` CLI into an isolated `HOME`.
