# Deviations from upstream

Every intentional behaviour difference from upstream CircuitJS1 gets an entry here, with the golden
test that shows it (PLAN.md section 2).

| Area                                        | Upstream behaviour                                           | Our behaviour                                                                                                                                                                     | Why                                                                                                                     | Golden test                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Saving sliders read from XML                | Re-serializes `<adj>` (slider) records from its live sliders | Writes them back verbatim, after the elements, where upstream puts them                                                                                                           | Sliders are not ported yet; until then they are kept, not interpreted                                                   | `auto-capac`, `auto-lrc`: `tools/golden/src/next.test.ts` compares exports without `<adj>`                                           |
| Saving sliders read from text               | Converts text `38` lines to XML `<adj>` when saving          | Keeps the lines (`Circuit.textExtras`) but does not save them                                                                                                                     | `<adj>` needs each element's edit-dialog labels and the slider UI, not ported yet                                       | `upstream-inductkick`, `upstream-lrc` (same test)                                                                                    |
| Text box fonts                              | Text boxes have a size and color only                        | Each text box also has a font (sans, serif, monospace) and style (bold, italic), or follows the app's Options default. Saved as extra XML attributes `ff` and `fs`, only when set | Requested by the owner (2026-10-04). Upstream ignores unknown attributes, so files still open there in its default font | Not simulation: `packages/format/src/textfont.test.ts` (round trip, nothing extra by default)                                        |
| Scopes on elements not ported yet           | Restores every scope in the file                             | Drops a scope (or a plot) whose element this port can't load yet, with a warning. Element numbers still count upstream's full list, so the other scopes find the right elements   | The element doesn't exist here, so there is nothing to plot. Goes away as Phase 8 ports the elements                    | `tools/golden/src/scopes.test.ts`: 440 of 550 scopes in the upstream examples restore identically, the rest are on unported elements |
| Undocked scopes (dump type 403, `ScopeElm`) | A scope drawn as an element on the circuit                   | Not loaded yet (skipped like any unported element)                                                                                                                                | It is an element; it comes with the Phase 8 element work. Two upstream examples use it                                  | `tools/golden/src/scopes.test.ts` covers both files without it                                                                       |

Not deviations, for the record:

- The scope card look (`style.scopeLook: cards`) changes only how scopes are drawn: the data,
  auto scales and saved records are upstream's. Classic keeps upstream's look. A 2D (X-Y or V vs
  I) plot also redraws its trail image when its height changes; upstream does this for X/Y plots
  only, so its V vs I image keeps its old size after a resize.
- Saving writes XML only, never the legacy text format. Upstream master does the same (its
  `VoltageElm` has no text `dump()` any more). Both formats are read.
- The text-format reader and XML writer reproduce upstream's quirks on purpose: attribute order,
  double-escaped string attributes, JS number formatting (`0.000005`, `1e-7`), and the speed
  slider round trip (`ic="10"` saves as `ic="10.20027730826997"`).
- Device models (diode, transistor, MOSFET) live in one library per `Simulation` instead of
  upstream's page-wide static maps. A `Circuit` keeps its simulation across loads, so models
  persist the way they do on an upstream page; two circuits in one process no longer share them.
- Model lookups that scan the map (`getModelWithParameters`) go in insertion order. Upstream uses
  a `java.util.HashMap`, which GWT backs with an insertion-ordered JS map for string keys.
- Transistors keep master's crossed names for saved junction voltages (`vbe` holds base minus
  collector). dev-ts renames them to `vBE`/`vBC`; files keep master's names.
