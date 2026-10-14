# 2026-10-14: the "items skipped" notice explains itself and can be hidden

Branch `claude/project-thread-ohdqvd`. Gady asked for information when clicking the "unsupported
item skipped" notice, and a way to dismiss it.

## Done

- `packages/format` `Circuit.issues`: each record a load leaves out, with its kind (unknown part,
  unreadable record, scope or slider of a skipped part), the type code or error, the record as
  written and its line (text format). `warnings` is now derived from it, so the golden tools and
  tests read the same strings as before.
- The list now starts empty on every load. Before, the one `Circuit` the app keeps never cleared
  it, so after one file with a skipped item every later circuit showed the notice too, with a
  growing count.
- Control bar: the notice is two buttons. The label opens "Skipped while opening" (grouped by
  reason, unknown parts by type, each with an explanation and up to five records with their line,
  plus Copy for all of them); the cross hides the notice until the next circuit is opened. Undo
  and leaving a subcircuit keep the notice as it was (they re-read the app's own copy).
- Unit tests for the issue list and grouping; e2e test in `viewer.spec.ts`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- A paste that skips items still says nothing (as before).
- New strings are English in every language until the catalogs get them.
