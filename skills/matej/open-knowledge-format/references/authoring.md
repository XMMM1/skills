# Writing OKF concepts, index.md and log.md

## A concept

One concept per file, named in kebab-case for what it describes (`endpoints/create-order.md`). Its
path is its ID, so a rename breaks every link to it. Every value below is illustrative:

```markdown
---
type: API Endpoint
title: Create order
description: Creates an order from a cart and returns its id.
resource: https://api.shop.example.com/v2/orders
tags: [orders, checkout]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T14:05:00Z }
sources:
  - id: orders-openapi
    resource: https://git.example.com/shop/api/openapi.yaml
    title: Shop API OpenAPI spec
    last_modified: 2026-10-01T00:00:00Z
---

# Request

`POST /v2/orders` with a `cart_id`.[^orders-openapi] The [checkout flow](/flows/checkout.md) calls
it once payment is authorised.

[^orders-openapi]: Shop API OpenAPI spec
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
  that `id`, as in `[^orders-openapi]`.
- **`status`**: `draft` means not yet reviewed, or possibly incomplete (SPEC §5.4). That covers a
  concept written from material you could not open yourself, such as facts relayed by the user.
  Use `deprecated` once it is superseded, and link the replacement from the body. Leave `status`
  out when the concept is stable.
- **`stale_after`**: the instant to re-check content that has a shelf life, such as a quarterly
  figure or a yearly policy.
- **Timestamps** are datetimes with an offset: `2026-10-10T14:05:00Z`. A date with no known time
  is midnight UTC: `2026-10-01T00:00:00Z`.
- **Other keys** are allowed. Keep every key you find, and leave out any field you would have to
  invent.
- **Quote a value** that contains `: ` or ` #`, or that starts with one of
  `` [ ] { } , & * ! | > ' " % @ ` ``. Example: `title: "Incident response: freshness alert"`.

### Body

Write structural markdown: headings, lists, tables and fenced code. Three headings carry meaning:
`# Schema` for an asset's fields, `# Examples`, and `# Computation` (see below). Link other
concepts, and let the sentence say what the relationship is ("the [checkout flow](/flows/checkout.md)
calls it").

**Links follow one style across the bundle**: concepts, `index.md` and `log.md` alike. Keep the
style the bundle already uses. A new standalone bundle uses bundle-rooted links
(`/flows/checkout.md`); a bundle inside a repository uses relative links
(`../flows/checkout.md`), for the reason in [adopting.md](adopting.md). The examples on this page
are bundle-rooted.

### Editing, moving, retiring

- **Editing.** When you change a body, update `generated` to yourself and now. A frontmatter-only
  fix, such as a tag, leaves `generated` alone. Keep each `sources` `id` stable, because
  footnotes join on it.
- **Relationships.** Link a new relationship from the concept you are writing. Changing another
  concept's body makes you its `generated` author, so if a reverse link belongs there and you
  were not asked to edit that concept, propose it in your report.
- **Moving.** Moving or renaming a concept changes its ID. Update every link to it
  (`grep -rn 'create-order.md' <bundle>`) and its index entries, then log the move.
- **Retiring.** Set `status: deprecated`, link the replacement and keep the file, since links and
  history still point at it.

## index.md

An `index.md` takes no frontmatter. The one exception is the bundle-root `index.md`, which may
carry `okf_version: "0.2"` (quoted) and nothing else. Its body groups entries under headings,
with one entry per concept and per subdirectory:

```markdown
# API Endpoint

* [Create order](create-order.md) - Creates an order from a cart and returns its id.
* [Get order](get-order.md) - Returns one order by id.

# Subdirectories

* [Webhooks](webhooks/index.md) - Events the shop sends to partners.
```

After ` - ` comes the concept's `description`, copied. A subdirectory has no frontmatter, so its
entry gets one sentence on what its concepts cover. Add, rename or remove an entry in the same
change as its concept.

## log.md

```markdown
# Bundle log

## 2026-10-10
* **Creation**: Added the [create order endpoint](/endpoints/create-order.md).

## 2026-09-14
* **Update**: Re-checked the [refund runbook](/runbooks/refunds.md) against the new pipeline.
```

Keep one `## YYYY-MM-DD` heading per day, newest first. Put today's entries under today's
heading, and if there is none, create it above the newest one. Open each entry with a bold verb
(**Creation**, **Update**, **Deprecation**, **Verification**, **Initialization**) and link what
changed. When the bundle keeps a `log.md`, every change adds an entry. The root log covers the
whole bundle, and a directory may keep its own.

## Attested Computation

A concept with `type: Attested Computation` carries a sanctioned computation, with the fields
`runtime`, `parameters`, `executor` and `attester`. Read SPEC §10 before you write or run one.
