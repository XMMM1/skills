# Writing OKF concepts, index.md and log.md

## A concept

One concept per file, named in kebab-case for what it describes (`services/billing.md`). Its path
is its ID, so a rename breaks every link to it.

```markdown
---
type: Service
title: Billing
description: Issues invoices when a user upgrades and stores them in Postgres.
resource: https://git.example.com/pebble/billing
tags: [billing, payments]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T14:05:00Z }
sources:
  - id: billing-design
    resource: https://wiki.example.com/pebble/billing-design
    title: Billing design doc
    last_modified: 2026-10-01T00:00:00Z
---

# Responsibilities

Exposes `POST /invoices`.[^billing-design] The [API](/services/api.md) calls it when a user
upgrades.

[^billing-design]: Billing design doc
```

### Frontmatter

- **`type`** (required): the kind of thing, in Title Case. Reuse the bundle's existing types
  first (`grep -rh '^type:' <bundle> | sort | uniq -c`), and coin one only when none fits.
- **`title`** is a display name. **`description`** is one sentence, and `index.md` entries repeat
  it word for word.
- **`resource`**: the canonical URI of the thing described (a repo, a table, an endpoint). Ideas
  have none.
- **`tags`**: a YAML list, `[billing, payments]`.
- **`generated`** records who produced the current body, and when. Whenever you write or
  meaningfully change a body, set `by` to yourself as `<producer>/<version>`: the tool and its
  model, such as `claude-code/claude-opus-5-5`. Set `at` to now. A person is `human:<id>`, an
  automated job is `process:<id>`.
- **`verified`** records a confirmation that actually ran, under the actor that ran it: a
  reviewer's `human:<id>`, a job's `process:<id>`. Writing a concept goes in `generated` alone.
  When you edit, keep the existing `verified` entries, because readers compare their `at` with
  `generated.at`.
- **`sources`** lists every material the content came from. Each entry needs a `resource` (a URL,
  a bundle path, or a scope such as `all queries in project X`). It also takes a stable kebab-case
  `id`, a `title`, and a `last_modified` if you know it. Cite a claim with a footnote labelled with
  that `id`, as in `[^billing-design]`.
- **`status`**: `draft` while the concept is incomplete or written from material you could not
  check. Use `deprecated` once it is superseded, and link the replacement from the body. Leave
  `status` out when the concept is stable.
- **`stale_after`**: the instant to re-check content that has a shelf life, such as a quarterly
  figure or a yearly policy.
- **Timestamps** are datetimes with an offset: `2026-10-10T14:05:00Z`. A date with no known time
  is midnight UTC: `2026-10-01T00:00:00Z`.
- **Other keys** are allowed. Keep every key you find, and leave out any field you would have to
  invent.

### Body

Write structural markdown: headings, lists, tables and fenced code. Three headings carry meaning:
`# Schema` for an asset's fields, `# Examples`, and `# Computation` (see below). Link other
concepts, and let the sentence say what the relationship is ("the [API](/services/api.md) calls
it"). Match the link style the bundle already uses. A new standalone bundle uses bundle-rooted
links (`/services/api.md`); a bundle inside a repository uses relative links, for the reason in
[adopting.md](adopting.md).

### Editing, moving, retiring

- **Editing.** When you change a body, update `generated` to yourself and now. A frontmatter-only
  fix, such as a tag, leaves `generated` alone. Keep each `sources` `id` stable, because
  footnotes join on it.
- **Moving.** Moving or renaming a concept changes its ID. Update every link to it
  (`grep -rn 'billing.md' <bundle>`) and its index entries, then log the move.
- **Retiring.** Set `status: deprecated`, link the replacement and keep the file, since links and
  history still point at it.

## index.md

An `index.md` takes no frontmatter. The one exception is the bundle-root `index.md`, which may
carry `okf_version: "0.2"` (quoted) and nothing else. Its body groups entries under headings,
with one entry per concept and per subdirectory:

```markdown
# Service

* [API](api.md) - Accepts note edits over HTTPS and writes them to Postgres.
* [Billing](billing.md) - Issues invoices when a user upgrades and stores them in Postgres.

# Subdirectories

* [Runbooks](runbooks/index.md) - How to operate Pebble in production.
```

After ` - ` comes the concept's `description`, copied. Add, rename or remove an entry in the same
change as its concept.

## log.md

```markdown
# Bundle log

## 2026-10-10
* **Creation**: Added the [billing service](/services/billing.md).

## 2026-09-14
* **Update**: Re-checked the [deploy runbook](/runbooks/deploy.md) against the new pipeline.
```

Keep one `## YYYY-MM-DD` heading per day, newest first. Put today's entries under today's
heading, and if there is none, create it above the newest one. Open each entry with a bold verb
(**Creation**, **Update**, **Deprecation**, **Verification**, **Initialization**) and link what
changed. When the bundle keeps a `log.md`, every change adds an entry. The root log covers the
whole bundle, and a directory may keep its own.

## Attested Computation

A concept with `type: Attested Computation` carries a sanctioned computation, with the fields
`runtime`, `parameters`, `executor` and `attester`. Read SPEC §10 before you write or run one.
