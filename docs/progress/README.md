# Progress entries

One file per change, so pull requests never edit the same lines. Each branch adds its own file
and never edits another branch's file or `docs/PROGRESS.md`.

- Name: `YYYY-MM-DD-short-slug.md` (the date the work started, then a slug from the branch or
  feature), for example `2026-10-08-opamp-supply-rails.md`.
- Content: a `#` heading with the date, the feature and the branch, then Done, Next and Open,
  the same as the entries in `docs/PROGRESS.md`.
- Updating your own entry later in the same branch is fine. To change what an older entry says,
  write a new file that says what changed.

Newest first: `ls -r docs/progress/*-*.md`. Entries up to 2026-10-08 are in
[`docs/PROGRESS.md`](../PROGRESS.md), which is now frozen.
