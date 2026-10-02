# Deviations from upstream

Every intentional behaviour difference from upstream CircuitJS1 gets an entry here, with the golden
test that shows it (PLAN.md section 2).

| Area                                     | Upstream behaviour                                                                                                                                          | Our behaviour                                                           | Why                                                                                           | Golden test                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Saving scopes and sliders read from XML  | Re-serializes `<o>` (scope) and `<adj>` (slider) records from its live scopes and sliders, so some values change (a scope's `sp="64"` is saved as `sp="0"`) | Writes them back verbatim, after the elements, where upstream puts them | Scopes and sliders are ported in Phase 6; until then they are kept, not interpreted           | `auto-capac`, `auto-lrc`: `tools/golden/src/next.test.ts` compares exports without these records |
| Saving scopes and sliders read from text | Converts text `o` and `38` lines to XML `<o>` and `<adj>` when saving                                                                                       | Keeps the lines (`Circuit.textExtras`) but does not save them           | `<adj>` needs each element's edit-dialog labels (Phase 5) and `<o>` the scope model (Phase 6) | `upstream-inductkick`, `upstream-lrc` (same test)                                                |

Not deviations, for the record:

- Saving writes XML only, never the legacy text format. Upstream master does the same (its
  `VoltageElm` has no text `dump()` any more). Both formats are read.
- The text-format reader and XML writer reproduce upstream's quirks on purpose: attribute order,
  double-escaped string attributes, JS number formatting (`0.000005`, `1e-7`), and the speed
  slider round trip (`ic="10"` saves as `ic="10.20027730826997"`).
