# Turning existing docs into an OKF bundle

The goal is the same files, still readable where people read them today, plus the frontmatter,
indexes and log that make them a conformant bundle.

1. **Pick the bundle root**, usually `docs/`. Every `.md` file under it, other than `index.md`
   and `log.md`, becomes a concept. If something is not knowledge for this bundle (generated
   output, templates, vendored docs), move it out or choose a narrower root. A `README.md`
   inside the root is a concept too, typically `type: Overview`.
2. **Keep every path.** Add frontmatter at the top of each file and leave the file where it is,
   so links, history and bookmarks keep working.
3. **Write each file's frontmatter**, following the fields in [authoring.md](authoring.md):
   - Take `type` from what the doc is (`Overview`, `Architecture`, `Runbook`,
     `Architecture Decision Record`, `Glossary`, `Guide`), and use the same name for the same kind
     of doc across files.
   - Take `title` from the doc's heading. Write a one-sentence `description` that the body
     supports.
   - **`generated` names whoever wrote the body.** Adding frontmatter does not make you the
     author. If you leave a body unchanged, leave `generated` out, because the log entry records
     your conversion. If you rewrite a body, `generated` is you, now.
   - **Existing frontmatter stays.** Keep its keys and add `type`. Keys that belong to other
     tools, such as `sidebar_position`, `layout` or `slug`, can stay as they are.
   - **A `status` outside `draft | stable | deprecated` moves to its own key.** An ADR's
     `status: accepted` becomes `decision: accepted`, and `status` then holds the OKF lifecycle:
     - `proposed` becomes `draft`;
     - `accepted` means leaving `status` out (stable);
     - `deprecated` or `superseded by …` becomes `deprecated`, with a link to the successor in
       the body.
   - ADRs and glossaries keep the shape their own conventions give them (the `domain-modeling`
     skill, where installed). The OKF frontmatter goes on top.
4. **Keep links relative.** Inside a repository, an OKF reader resolves `/services/api.md` to the
   bundle root, but GitHub and editors resolve it to the repository root. Relative links work for
   both, so use them for new links too.
5. **Give every directory that holds concepts an `index.md`** in the format in
   [authoring.md](authoring.md). The bundle-root `index.md` also gets `okf_version: "0.2"`. A
   directory may already use `index.md` as a prose landing page, as MkDocs and Docusaurus sites
   do. Move that page to a concept with a new name, such as `overview.md`, write the listing as
   `index.md`, and tell the user that the site generator's navigation may need the new name.
6. **Add a root `log.md`** with today's `**Initialization**` entry. Say what you converted, and
   that the bodies are unchanged.
7. **Run `scripts/okf-check.mjs`** until it reports `CONFORMANT`, then work through its warnings.
8. **To keep the bundle conformant in CI**, copy `scripts/okf-check.mjs` into the project. It is
   one MIT-licensed file with no dependencies. Run it in CI as
   `node <path>/okf-check.mjs <bundle-root>`, and add `--strict` if warnings should fail the
   build.
