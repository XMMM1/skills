# Plugin hooks scaffold: base role, per-project context, pre/post tool templates

Approved 2026-07-25. Extends the plugin's hook surface so installing it in a project gives
the agent default behavior beyond the router.

## Why

The SessionStart → router injection proved that hooks are the delivery vehicle for "behavior
that follows the bundle everywhere." The user wants three more things riding that vehicle:
a base role (text TBD — scaffold now, write later), automatic per-project context injection,
and pre/post tool hooks ready for logic later.

## Decisions

1. **Everything stays in `hooks/` + `skills/matej/`** — outside the generated surface.
   `sync/sync.mjs` is untouched; hooks are auto-discovered from `hooks/hooks.json`, and the
   generator never emits a `hooks` key.
2. **One SessionStart script, multiple tagged blocks.** The `using-superpowers` exclusion in
   `sources.json` records why two session bootstraps are forbidden. The role and project-context
   blocks are appended inside `hooks/session-start`, not as new SessionStart entries.
3. **The base role ships inert.** `skills/matej/base-role/SKILL.md` carries a `PLACEHOLDER`
   marker; `session-start` greps for it and skips injection while present. Activation is
   deleting the marker — no wiring step.
4. **Per-project context is opt-in per repo.** A host project creates
   `.claude/xmmm1-context.md`; `session-start` injects it via `$CLAUDE_PROJECT_DIR` (fallback
   `$PWD`). No file, no output.
5. **Pre/post hooks are wired no-ops with narrow matchers** (`Bash`, `Write|Edit`) so the
   templates cost nothing until they do real work. The exit-code/JSON contract is documented
   in each script header and `hooks/README.md`.
6. **Plugin-surface only.** `npx skills add` installs skills, never hooks — recorded in
   `hooks/README.md` and the quickstart. The user installs via plugin, so this is acceptable.

## Files

`hooks/hooks.json`, `hooks/session-start`, `hooks/pre-tool-use`, `hooks/post-tool-use`,
`hooks/README.md`, `skills/matej/base-role/SKILL.md`; version bump in `sources.json`
(1.0.0 → 1.1.0) with regenerated manifests.
