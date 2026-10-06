#!/usr/bin/env bash
# One-time opt-in for the `npx skills add` surface, which cannot install hooks. (Plugin users
# don't need this: hooks/session-start already runs the updater.)
#
#   scripts/install-auto-update.sh              install
#   scripts/install-auto-update.sh --uninstall  remove
#
# Copies hooks/auto-update to a stable path and merges one SessionStart entry into
# ~/.claude/settings.json (backed up first; safe to re-run). The entry runs
# `auto-update --hook`: refresh at most daily in the background, and tell the user at the next
# session start whenever an update happened.

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/hooks/auto-update"
DEST_DIR="${HOME}/.local/share/xmmm1-skills"
DEST="${DEST_DIR}/auto-update"
SETTINGS="${HOME}/.claude/settings.json"
mode="${1:-install}"

command -v node >/dev/null 2>&1 || { echo "node is required to edit ${SETTINGS}" >&2; exit 1; }
[ "${mode}" = "install" ] && [ ! -f "${SRC}" ] && { echo "missing ${SRC}" >&2; exit 1; }

mkdir -p "$(dirname "${SETTINGS}")"
[ -f "${SETTINGS}" ] || echo '{}' > "${SETTINGS}"
cp "${SETTINGS}" "${SETTINGS}.bak.$(date +%Y%m%d%H%M%S)"

if [ "${mode}" = "--uninstall" ]; then
  action=remove
else
  mkdir -p "${DEST_DIR}"
  cp "${SRC}" "${DEST}"
  chmod +x "${DEST}"
  action=add
fi

node -e '
  const fs = require("fs");
  const [file, command, action] = process.argv.slice(1);
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  settings.hooks = settings.hooks || {};
  const entries = settings.hooks.SessionStart || [];
  const has = (e) => (e.hooks || []).some((h) => h.command === command);
  if (action === "add") {
    if (!entries.some(has)) entries.push({ matcher: "startup", hooks: [{ type: "command", command }] });
    settings.hooks.SessionStart = entries;
  } else {
    const kept = entries.filter((e) => !has(e));
    if (kept.length) settings.hooks.SessionStart = kept; else delete settings.hooks.SessionStart;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
' "${SETTINGS}" "${DEST} --hook" "${action}"

if [ "${action}" = "add" ]; then
  echo "Installed. Skills refresh at most once a day when Claude Code starts, and you are told when it happens."
  echo "Opt out any time: XMMM1_AUTO_UPDATE=0, or re-run with --uninstall."
else
  rm -f "${DEST}"
  echo "Removed the SessionStart entry and ${DEST}."
fi
