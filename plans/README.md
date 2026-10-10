# Plans

Approved plans, committed **before** implementation — the brief, not the postmortem.
Supersede rather than delete: mark the old plan `superseded by <slug>` at the top.

- [Vendored skills bundle](vendored-skills-bundle.md) — why this repo vendors instead of referencing, how upstream sync works, and which of the two upstreams wins where.
- [Add marketingskills upstream](add-marketingskills-upstream.md) — vendor coreyhaines31/marketingskills (50 marketing skills) as a third upstream, no conflicts with the other two.
- [Daily auto-update](auto-update.md) — throttled background `skills update` on SessionStart, with a user-visible notice at the next session whenever an update happened or failed; opt-in installer for the `npx skills add` surface.
- [Plugin hooks scaffold](plugin-hooks-scaffold.md) — base role + per-project context injection at SessionStart, plus wired no-op PreToolUse/PostToolUse templates.
- [Open Knowledge Format skill](open-knowledge-format-skill.md) — a self-contained `skills/matej/open-knowledge-format` skill with the pinned v0.2 spec and a dependency-free checker; embedded third-party files declared, NOTICEd and hash-checked by sync.
