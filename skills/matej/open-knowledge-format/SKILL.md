---
name: open-knowledge-format
description: Use when a task involves an Open Knowledge Format (OKF) bundle, a directory of markdown concepts with YAML frontmatter plus index.md and log.md — reading one, writing or editing its concepts, turning existing docs into one, or checking that one conforms.
---

# Open Knowledge Format (OKF)

An OKF **bundle** is a directory tree of markdown files. Every `.md` file other than `index.md` and
`log.md` is a **concept**: one unit of knowledge, whose ID is its path without `.md`. A bundle is
**conformant** with OKF v0.2 when:

1. every concept opens with YAML frontmatter between two `---` lines;
2. that frontmatter has a non-empty `type`;
3. every `index.md` has no frontmatter (the bundle-root one may carry only `okf_version: "0.2"`)
   and lists its directory under headings, and every `log.md` groups its entries under
   `## YYYY-MM-DD` headings, newest first.

Everything else is optional, and a reader must accept a bundle without it.

The spec is [references/SPEC.md](references/SPEC.md): OKF v0.2, copied unmodified from
[GoogleCloudPlatform/open-knowledge-format at `ad30107`](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/SPEC.md)
under the Apache License 2.0 ([license](references/SPEC-LICENSE.md)). Where this skill and the
spec differ, the spec wins. For a bundle that declares a newer `okf_version`, read the upstream
spec at that version.

## Reading a bundle

Use progressive disclosure: open the root `index.md`, follow the section that fits the question to
the next `index.md`, and open concepts last. Read each `log.md` you pass for changes made after
the concepts you rely on were verified. Before relying on a concept, read its frontmatter and say
what it implies:

- **Trust:** no `verified` means unverified; `verified` only by non-`human:` actors means
  machine-confirmed; a `human:` verifier means human-reviewed. A verification covers the content
  as it stood at its `at`. Content changed later, shown by a later `generated.at` or a source's
  later `last_modified`, is not covered.
- **Lifecycle:** `status: deprecated` is history, so follow its link to the replacement;
  `status: draft` is unreviewed; a `stale_after` in the past means it may be out of date.
- **Provenance:** a footnote `[^id]` cites the `sources` entry with that `id`. A claim without a
  footnote has no recorded source.
- **Attested Computation:** run it the way SPEC §10.5 describes. Supply only its declared
  `parameters`, run its executor, and check the receipt with its attester. `verified` vouches for
  the definition; only attestation vouches for a run.
- A link to a missing file is knowledge nobody has written yet, not a broken bundle.

## Writing

Read [references/authoring.md](references/authoring.md) before you create or edit a concept, an
`index.md` or a `log.md`. It covers the frontmatter fields, how to record yourself as the author,
and the index and log formats. Adding a concept is done when the concept, its entry in its
directory's `index.md` and, if the bundle keeps one, its `log.md` entry all exist, and the check
below passes.

To turn an existing folder of docs into a bundle, read [references/adopting.md](references/adopting.md) first.

## Checking

The checker ships with this skill and needs only Node 16 or newer:

    node <this skill's directory>/scripts/okf-check.mjs <bundle-dir>

Errors break conformance. Warnings flag the spec's SHOULDs: timestamps, actors, sources, links,
and index entries. A check is done when it prints `CONFORMANT` and every warning is either fixed
or one you can give a reason for. `--strict` fails on warnings too, which suits CI.

The checker reads a strict YAML subset: block and flow (`[ ]`, `{ }`) collections, plain, quoted
and `|` / `>` block scalars, and comments. A file that uses anchors, aliases, tags, complex keys,
document markers or the rarer constructs listed by `--help` fails as unsupported rather than
passing unread, so write frontmatter without them.
