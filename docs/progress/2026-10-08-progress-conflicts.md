# 2026-10-08: per-change progress and deviation notes (branch claude/progress-conflicts-udsi8v)

Done: every open pull request conflicted with the others in `docs/PROGRESS.md` (each prepends
its entry at the top) and three also in `docs/DEVIATIONS.md` (each adds a table row, and Prettier
realigns the whole table when a cell is wider). Both files are now frozen. New entries go in
`docs/progress/` and `docs/deviations/`, one file per change, so two branches never touch the
same lines. CLAUDE.md and PLAN.md section 2 say so, and CI fails a pull request that edits either
frozen file (only once the base branch has these folders). A custom `.gitattributes` merge driver
was ruled out: GitHub's merge button ignores it.

Next: open pull requests move their PROGRESS.md and DEVIATIONS.md changes into files here and
merge main. Open: none.
