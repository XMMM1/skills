# Hooks

Hand-written, never generated — `sync/sync.mjs` does not touch this directory. Claude Code
auto-discovers `hooks.json` when the bundle is installed as a **plugin**
(`/plugin install skills@XMMM1`). **`npx skills add` never installs hooks** — nothing here
fires on that surface.

## What fires today

| Hook | Matcher | Script | Current behavior |
|---|---|---|---|
| SessionStart | `startup\|clear\|compact` | `session-start` | Injects the router; optionally the base role and per-project context (below) |
| PreToolUse | `Bash` | `pre-tool-use` | No-op template — always allows |
| PostToolUse | `Write\|Edit` | `post-tool-use` | No-op template — no feedback |

## Activating the base role

Edit `skills/matej/base-role/SKILL.md`: write your role/behavior text and remove the
`PLACEHOLDER` comment. While the word `PLACEHOLDER` appears anywhere in that file,
`session-start` skips it — the scaffold ships inert. Once activated, the body is injected
into every session in every project where the plugin is installed, wrapped in `<base-role>`.

## Giving a project auto-injected context

In the host repository, create:

```
.claude/xmmm1-context.md
```

Whatever it contains is injected at session start wrapped in `<project-context>`. No file,
no output — projects opt in one by one. `session-start` resolves the project via
`$CLAUDE_PROJECT_DIR` (falls back to `$PWD`).

## Adding logic to the pre/post templates

Both scripts read the hook's JSON payload from stdin (`tool_name`, `tool_input`, and for
PostToolUse `tool_response`). Contract:

- **pre-tool-use** — exit 2 with the reason on stderr (or print
  `{"decision":"block","reason":"..."}` and exit 0) to **block** the call. Exit 0 silently
  to allow. Each script header has a worked example.
- **post-tool-use** — anything on stdout is fed back to the agent as feedback on the
  completed call. It cannot undo the call.

The matchers in `hooks.json` are deliberately narrow (`Bash`, `Write|Edit`) so the no-ops
cost nothing broad; widen them (e.g. `".*"`) when the scripts do real work.

## Invariants

- **One SessionStart script.** `sources.json` excludes obra's `using-superpowers` precisely
  because two session bootstraps conflict. New session-time blocks go inside
  `session-start`, never as a second SessionStart entry.
- **Never block a session.** Missing files warn to stderr and continue; `session-start`
  must always exit 0.
