# Daily auto-update of locally installed skills

Approved 2026-10-06. Closes the gap recorded in `vendored-skills-bundle.md`: the nightly sync
keeps the repo fresh, but `npx skills update` on the laptop was still manual.

## Why

Locally installed skills go stale until someone remembers `npm run update`. The user wants a
daily refresh that is set up by installing the bundle, and wants to be told whenever an update
actually happens.

## Constraint that shapes everything

- **Plugin install** ships `hooks/hooks.json`, so a hook is installed with the plugin.
- **`npx skills add` installs skill directories only**, never hooks or scripts. No auto-setup is
  possible there; the best available is a one-time opt-in script surfaced in the quickstart skill.

## Decisions

1. **Throttled on SessionStart, no OS scheduler.** `hooks/session-start` launches
   `hooks/auto-update` detached in the background. It runs at most once per 24h (stamp file), so
   it adds no session latency. Trade-off accepted: it fires when Claude Code opens, not on a clock.
2. **The update must be announced.** The update runs after `session-start` has already printed,
   so the result is written to a pending-notice file and shown at the *next* session start:
   - `session-start` emits `{"systemMessage": ..., "hookSpecificOutput.additionalContext": ...}`
     — `systemMessage` is displayed to the user; the context block tells the model to mention it
     in its first reply. Plain-text output stays the default when there is no notice.
   - The notice names what changed (added / updated / removed skills), by diffing
     `~/.agents/.skill-lock.json` (`skillFolderHash` per skill) before and after.
   - Failures and skips (no Node >= 22.20 found, update exited non-zero) are announced too.
     A successful run with no changes says nothing — nothing happened.
3. **`node`, not `jq`.** `jq` is not installed on this machine and the CLI needs Node anyway.
4. **Node resolution.** Hooks do not run `nvm use` and the machine default is v16, so
   `auto-update` probes `node` on PATH, then `~/.nvm/versions/node/*`, for one >= 22.20.
5. **Opt-out:** `XMMM1_AUTO_UPDATE=0`.
6. **Retry policy:** success stamp 24h; after a failed attempt, retry no sooner than 6h.
7. **CLI users:** `scripts/install-auto-update.sh` copies `auto-update` to
   `~/.local/share/xmmm1-skills/` and merges a SessionStart hook into `~/.claude/settings.json`
   (backup first, idempotent, `--uninstall`). Shared state dir means both surfaces together
   still update once a day.
8. **Still one SessionStart script.** `auto-update` is a helper `session-start` calls, not a
   second hook entry.

## Files

New: `hooks/auto-update`, `scripts/install-auto-update.sh`, this plan.
Edit: `hooks/session-start`, `hooks/README.md`, `skills/matej/xmmm1-skills-quickstart/SKILL.md`,
`.github/workflows/verify.yml`. Never touch vendored or generated files.

## Verification

Both scripts pass `bash -n`; throttle (second run no-op), opt-out, Node-16-default fallback,
notice shown once then cleared, `session-start` output unchanged when no notice,
installer idempotent + `--uninstall` against a scratch `HOME`, `npm run verify`.
