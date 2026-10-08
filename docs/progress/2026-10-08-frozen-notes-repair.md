# 2026-10-08: frozen notes repaired (branch claude/progress-conflicts-udsi8v)

Done: PRs #38 to #42 were merged right after the notes were frozen, before they had moved their
notes, and their conflict resolutions put the dots-while-paused entry back into PROGRESS.md and
lost the Obsidian, op-amp rails and speed entries and two DEVIATIONS.md rows. Both frozen files
are back to their frozen content and every lost or misplaced note is now a file in
`docs/progress/` or `docs/deviations/`. The CI step now pins the frozen files' content, so it
also catches edits that arrive through a merge from main, and runs on pushes to main too.

Next: Gady makes the `check` job required for merging into main (Settings > Branches), so a red
pull request can't be merged. Open: none.
