# XMMM1/skills — agent contract

A vendored bundle of other people's agent skills, plus one router. Read this before touching anything.

## The one rule

**`skills/mattpocock/**` and `skills/obra/**` are vendored output. Never edit them.**

They are copies fetched from upstream. `sync/sync.mjs` overwrites them wholesale — upstream always
wins, and there is no merge logic anywhere. Any change you make to them:

1. is destroyed by the next nightly sync, silently, and
2. fails CI immediately (`verify.yml` hash-checks every vendored file against `sources.json`).

To change a vendored skill's behaviour, pick one:

- **Upstream the fix** — open a PR against `mattpocock/skills` or `obra/superpowers`.
- **Copy it to `skills/matej/<new-name>/`** — a **new** name, never the same one. The installer's
  lock file is keyed by frontmatter `name`, so two skills sharing a name cannot both install.
- **Add a router ruling** in `skills/matej/using-matej-skills/SKILL.md` if the problem is
  *which* skill fires, not what it says.

`skills/matej/**` is the only hand-editable skill directory.

## Generated files — never edit by hand

`README.md`, `NOTICE`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and the
`skills` / `excluded` blocks of `sources.json` are all produced by `sync/sync.mjs`.
Edit the script (or the hand-written top of `sources.json`), then re-run it.

## Node version — run `nvm use` first

The `skills` CLI requires **Node ≥22.20.0**. This machine's default is v16.13.1, on which the CLI
dies with a misleading `SyntaxError: ... does not provide an export named 'styleText'` rather than a
version error. `.nvmrc` pins v22.23.1; there is no auto-switch hook, so:

```bash
nvm use          # reads .nvmrc -> v22.23.1
```

The global default is deliberately left alone: other repos here pin Node 16 and 20 (`dg1-docs`
v16.17.0, `sirius` v16.20.2) and would break if it moved.

## Commands

```bash
nvm use                                 # ALWAYS first — see above

npm run sync:dry                        # report drift, write nothing
npm run sync                            # fetch, overwrite, regenerate
npm run verify                          # asserts only; no network, no writes (this is what CI runs)
npm run update                          # pull this bundle's latest into ~/.claude/skills

node sync/sync.mjs --add-upstream o/r   # license-gate + register a new upstream
```

`sync/sync.mjs` itself runs on Node 16+; only the `skills` CLI needs 22.

Never add an upstream by hand-editing `sources.json` — the license gate and clash detection are the
entire point of the command. An unlicensed repo cannot be vendored (all rights reserved), which is
why `find-skills` is installed separately rather than bundled.

## Layout, and why

```
skills/<source>/<name>/SKILL.md
```

Exactly two levels, keyed by **source**. Both parts are load-bearing:

- **Depth 2** because the installer only walks `skills/<name>/` and `skills/<category>/<name>/`.
  A third level would be silently invisible — no error, just missing skills.
- **Source-keyed, not category-keyed**, so when an upstream re-categorises a skill
  (`engineering/` → `deprecated/`) our tree doesn't churn. `sources.json` tracks `upstreamPath`;
  the local path never moves.

## Two skill sets that disagree

This bundle vendors mattpocock/skills and obra/superpowers. They contradict each other on
refactoring, on how much to involve the human, and on scope. `skills/matej/using-matej-skills`
is the tie-breaker and is injected into every session by the `SessionStart` hook. If you add or
change a ruling, that file is the place.

## Plans

Approved plans live in `plans/`, committed before implementation. See `plans/README.md`.
Read the relevant one before changing how sync or the bundle works — the reasoning behind every
decision here is recorded there, including the ones that look arbitrary.
