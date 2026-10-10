---
name: using-matej-skills
description: Use when starting any conversation, and whenever two skills cover the same job — establishes which of the bundled skills wins, and settles the places where mattpocock/skills and obra/superpowers directly contradict each other.
---

# Using these skills

This bundle vendors two skill sets that were written independently and **disagree with each
other**. Both are installed on purpose: each is better at different things. This file is the
tie-breaker. Where it rules, it wins over the individual skills' own wording.

- **mattpocock/skills** — dense reference material. Assumes you're competent and tells you what
  good looks like. Strongest on craft, design vocabulary, and planning.
- **obra/superpowers** — compliance engineering. Assumes you'll rationalize your way out of
  discipline and blocks it. Strongest on verification and multi-agent orchestration.

A third set, **coreyhaines31/marketingskills**, covers marketing (copy, SEO, CRO, ads, email,
pricing, launches). It overlaps with neither of the above and is covered by one ruling below.

## Rulings

**TDD → `tdd` is the reference; `test-driven-development` is the discipline.**
Use `tdd` for what makes a test worth keeping — seams, tautological tests, vertical slices.
Use `test-driven-development` for the loop itself, especially *watch the test fail first*.
**Conflict:** `test-driven-development` puts refactor inside the loop as step 3. `tdd` says
refactoring belongs to review. **`tdd` wins — do not refactor inside the red-green loop.**

**Debugging → `diagnosing-bugs`.**
Build a tight, red-capable feedback loop before forming any hypothesis; that *is* the skill.
`systematic-debugging` is the weaker of the two here — borrow only its root-cause gate
(no fixes before investigation). Do not run both.

**Design and ideation → `grilling`, `grill-me`, `to-spec`.**
`brainstorming` claims *"You MUST use this before any creative work"* and carries a
`<HARD-GATE>` blocking all implementation until it approves a design.
**That gate does not apply here.** Use `brainstorming` only when explicitly asked for it.
Use `prototype` when the question needs throwaway code rather than dialogue.

**Talking to the human → Matt's stance wins.**
Confirm seams, decisions, and ambiguity with the user. `subagent-driven-development` says
*"Do not pause to check in… 'Should I continue?' prompts waste their time"* — that applies
**only to dispatched subagents executing an approved plan**, never to the main conversation.

**Verifying → always `verification-before-completion`.**
No Matt skill covers this and it is the most valuable skill in the bundle. Before any claim
that something is done, fixed, or passing: run the command, read the output, then claim.

**Orchestration → obra, unopposed.**
`subagent-driven-development`, `dispatching-parallel-agents`, `using-git-worktrees`,
`finishing-a-development-branch`. Matt has no equivalent for any of these.

**Code review → `code-review` to give, `receiving-code-review` to receive.**
`requesting-code-review` overlaps `code-review`; prefer `code-review`.

**Plans → `to-spec` and `to-tickets`.**
They integrate with a real issue tracker. `writing-plans` / `executing-plans` are the obra
equivalents; prefer them only when running the subagent execution flow.

**Authoring skills → `writing-great-skills`.**
Terse and uses progressive disclosure. `writing-skills` is 26KB in one file; consult it only
for its TDD-for-documentation method (test the skill against a subagent before shipping).

**OKF bundles → `open-knowledge-format`.**
It owns the file format of anything in an Open Knowledge Format bundle, and it pins spec v0.2.
`ai-seo` keeps the marketing call, whether a site should publish an `/okf/` bundle at all; its OKF
notes describe v0.1, so on the format itself `open-knowledge-format` wins. `domain-modeling` still
decides what an ADR or glossary says; inside a bundle, that file also takes OKF frontmatter.

**Marketing → coreyhaines31's skills, unopposed.**
Copy, SEO, CRO, ads, email, pricing, launches and customer research all go to the marketing set.
Names that look like engineering skills are different jobs: `customer-research` is market and
customer research, not `research` (codebase research); `marketing-plan` is a go-to-market plan,
not `to-spec` or `writing-plans`; `free-tools` is a lead-gen strategy, not `prototype`. Use the
engineering skills only when you are building the tool or page itself.

## Notes

- `setup-matt-pocock-skills` configures issue-tracker and triage vocabulary. It assumes Matt's
  set is what's installed; that's still broadly true here.
- Skills under `skills/mattpocock/` sourced from `in-progress/` may change without warning.
- `using-superpowers` is deliberately not installed — this file replaces it.
