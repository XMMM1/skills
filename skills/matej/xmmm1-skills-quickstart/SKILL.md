---
name: xmmm1-skills-quickstart
description: Start a new project with this bundle — install, configure the repo once, then take an idea to shipped. Read this first.
disable-model-invocation: true
---

# Quickstart

This bundle is 49 skills from two authors who **disagree with each other**, plus a router that
settles the disagreements. That design is the whole point, and it is also why installing it
casually goes wrong: pick the wrong install surface and you get the conflict without the tie-breaker.

Four parts. Skip Part 1 if you already have the bundle.

## Part 1 — Install

**Node first.** The `skills` CLI needs **≥22.20.0**. On older Node it dies with
`SyntaxError: ... does not provide an export named 'styleText'` — which names the wrong problem and
will send you hunting a phantom bug. If you see that, you are on old Node.

```bash
node --version   # must be >= 22.20.0
nvm use          # in this repo, reads .nvmrc -> v22.23.1
```

**Then pick one surface. Not both.**

```
/plugin marketplace add XMMM1/skills
/plugin install skills@XMMM1
```

The plugin is the recommended surface, and the only one that installs the `SessionStart` hook — the
hook is what injects the router into every session. Claude Code only.

```bash
npx skills add XMMM1/skills
```

`npx skills add` copies skills to `~/.claude/skills` and reaches agents beyond Claude Code, but it
**installs skills, never hooks**. The router lands as an ordinary file nothing reads, so the two
skill sets contradict each other unrefereed. Choose this only if you need the reach and will invoke
`using-matej-skills` by hand.

Installing both surfaces double-loads all 49 skills — every skill appears twice, once bare and once
`skills:`-prefixed. Harmless, wasteful, confusing. Pick one.

## Part 2 — Configure the repo, once

```
/setup-matt-pocock-skills
```

It interviews you, then writes `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`, and
a summary block into `CLAUDE.md`.

This is **not** optional decoration. `code-review`, `to-spec`, `to-tickets`, `triage`, and
`wayfinder` all read `docs/agents/issue-tracker.md` and will stop and send you here when it is
missing. Run it before the first real task, not after the first failure.

Optional, per repo:

- `/git-guardrails-claude-code` — hooks that block `push`, `reset --hard`, `clean`, `branch -D`
- `setup-pre-commit` — Husky + lint-staged
- `/setup-ts-deep-modules` — TypeScript only; dependency-cruiser boundaries

## Part 3 — Idea to shipped

The spine. Each arrow is a handoff, not a rule — step off it whenever the work is smaller than the
ceremony.

**Sharpen it.** `/grill-me` interrogates a half-formed idea until it holds. `/batch-grill-me` asks
every frontier question at once; `/grill-with-docs` leaves ADRs and a glossary behind. Do this while
the idea is still cheap to change.

**Write it down.** `/to-spec` synthesises the conversation into a spec on your tracker — no second
interview. `/to-tickets` breaks it into tracer-bullet tickets with their blocking edges declared.
When the work is bigger than one agent session can hold, `/wayfinder` maps it as decision tickets
you resolve one at a time.

**Build it.** `/implement` executes a spec or ticket. Two TDD skills are installed and they split by
job: `tdd` is the reference — what makes a test worth keeping, seams, vertical slices.
`test-driven-development` is the discipline — the loop, and *watch the test fail first*.
**Do not refactor inside the red-green loop**; refactoring belongs to review.

**When it breaks.** `diagnosing-bugs`. Build a tight, red-capable feedback loop *before* forming a
hypothesis — that is the skill, not a preamble to it. Do not also run `systematic-debugging`.

**Finish it.** `/code-review` reviews against standards and spec in parallel. `receiving-code-review`
is for the other side of that — verify the feedback, don't perform agreement.
`finishing-a-development-branch` decides merge vs PR vs cleanup.

**Before any "done".** `verification-before-completion` — run the command, read the output, *then*
claim. It is the most valuable skill here and nothing else covers it.

**Lost?** `/ask-matt` routes you to the right skill.

## Part 4 — Gotchas

**`brainstorming` is disarmed — but only on the plugin surface.** It claims *"You MUST use this
before any creative work"* and carries a `<HARD-GATE>` blocking implementation until it approves a
design. The router overrides that gate. On `npx skills add`, the router never loads and the gate
bites.

**`npm run update` is global and auto-confirmed.** It is `skills update -g -y` — it rewrites
`~/.claude/skills` for every project on the machine, not just this one.

**`in-progress` skills move.** Anything vendored from mattpocock's `in-progress/` may change without
warning on the nightly sync.

**`find-skills` installs separately.** `vercel-labs/skills` ships no license, so it cannot be
vendored here — all rights reserved.

## When two skills want the same job

`using-matej-skills` is the tie-breaker and it beats the individual skills' own wording. Read it
when two skills collide; the rulings above are its conclusions, not a substitute for it.
