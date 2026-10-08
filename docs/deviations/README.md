# Deviation entries

Every intentional behaviour difference from upstream CircuitJS1 needs an entry with the golden
test that shows it (PLAN.md section 2). New entries go here, one file per deviation, so pull
requests never edit the same lines. The table in [`docs/DEVIATIONS.md`](../DEVIATIONS.md) holds
the entries up to 2026-10-08 and is frozen: Prettier realigns every row of a Markdown table when
one cell gets longer, so two branches adding rows always conflicted.

- Name: `short-slug.md`, for example `opamp-supply-rails.md`.
- Content:

  ```md
  # Area

  - Upstream: what upstream does.
  - Ours: what this port does.
  - Why: the reason.
  - Golden test: the fixture or test that shows it, or "none (display only)".
  ```

- To change an older table row, add a file here that names the row it replaces.
