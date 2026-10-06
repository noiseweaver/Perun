# Deviations from upstream

Every intentional behaviour difference from upstream CircuitJS1 gets an entry here, with the golden
test that shows it (PLAN.md section 2).

| Area                                | Upstream behaviour                                                                                                                                                                                    | Our behaviour                                                                                                                                                                                     | Why                                                                                                                                                                    | Golden test                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sliders                             | Shows sliders in its side panel; moving one is not undoable                                                                                                                                           | Shows them in a card at the top right of the circuit (folded on phones); each drag or key press is one undo step. A slider record whose element can't load is dropped with a warning              | The new layout has no side panel. Undo covers every other change, so it covers sliders too                                                                             | Not simulation: `packages/app/e2e/sliders.spec.ts`; every example with sliders saves identically (docs/EXAMPLES.md)                   |
| Text box fonts                      | Text boxes have a size and color only                                                                                                                                                                 | Each text box also has a font (sans, serif, monospace) and style (bold, italic), or follows the app's Options default. Saved as extra XML attributes `ff` and `fs`, only when set                 | Requested by the owner (2026-10-04). Upstream ignores unknown attributes, so files still open there in its default font                                                | Not simulation: `packages/format/src/textfont.test.ts` (round trip, nothing extra by default)                                         |
| Undocked scope leader post          | An undocked scope has no leader line                                                                                                                                                                  | A card's leader can be pinned to one post of what it shows. Saved as an extra XML attribute `lp` on `<Scope>`, only when set                                                                      | Requested by the owner (2026-10-04). Upstream ignores unknown attributes                                                                                               | Not simulation: `packages/app/e2e/scopes.spec.ts` (pinning, save, undo)                                                               |
| Scopes on elements not ported yet   | Restores every scope in the file                                                                                                                                                                      | Drops a scope (or a plot) whose element this port can't load yet, with a warning. Element numbers still count upstream's full list, so the other scopes find the right elements                   | The element doesn't exist here, so there is nothing to plot. Phase 8 ported every upstream element, so only a dump type upstream doesn't know either reaches this path | `tools/golden/src/scopes.test.ts`: since Phase 8 every element loads, and all 550 scopes in the upstream examples restore identically |
| Saved position of an undocked scope | Sets an undocked scope's `p` to -1 when it first draws, so a save from a headless load keeps the file's value (`p="0"`)                                                                               | Sets it to -1 on load, as a browser save after the first frame does upstream                                                                                                                      | The headless golden save is the only place they differ                                                                                                                 | `multivib-a` and `qam-256` (docs/EXAMPLES.md, "Same save: no")                                                                        |
| Routed wire obstacles               | Routes around each element's body as last drawn (`getBoundingBox`, leads set while drawing)                                                                                                           | Uses the body each element's view computes for the circuit's extent; a probe's body is taken as unselected, and gate input leads as with American gate symbols                                    | Upstream reads drawing state the sim classes here don't keep; the difference is at most a cell of the routing grid                                                     | Not simulation: routes only change drawing; routed wire examples save identically (docs/EXAMPLES.md), WireRouter.test.ts              |
| Subcircuit pin layout Cancel        | Edit Pin Layout changes the model as pins are dragged, and Cancel keeps those changes                                                                                                                 | Cancel puts the pins, size and label back as they were                                                                                                                                            | A cancelled dialog should change nothing                                                                                                                               | Not simulation: `packages/app/e2e/subcircuit.spec.ts`, `packages/elements/src/models/compositeLayout.test.ts`                         |
| Teaching tools                      | No drawing tools                                                                                                                                                                                      | A pencil, a fading laser pointer and an eraser draw over the canvas (bottom bar pencil button)                                                                                                    | Asked for by the owner for teaching (PLAN.md Phase 9)                                                                                                                  | Not simulation and not saved: the circuit file is unchanged, `packages/app/e2e/teaching.spec.ts`                                      |
| Custom transformer description      | A description ending in a separator (`1:`) throws out of the edit dialog                                                                                                                              | The dialog shows "expected number" and keeps the old description                                                                                                                                  | An edit error should not escape the dialog                                                                                                                             | Not simulation: the edit dialog only                                                                                                  |
| Current dots with no current        | Hides a branch's dots only when its dot position is exactly 0, so a branch carrying rounding noise (about 1e-16 A, as the 100 Ω branch of `lrc.txt` with the switch open) shows dots that stand still | Below 1 pA a branch counts as carrying no current and shows no dots                                                                                                                               | Owner's report (2026-10-06): dots should either move or be absent, the same everywhere                                                                                 | Not simulation: drawing only, `packages/render/src/render.test.ts`                                                                    |
| Mouse wheel value editing           | Options > Edit Values With Mouse Wheel is off by default. When on, the wheel over a resistor, capacitor or inductor opens a list of E12 values; wheel down picks bigger values                        | On by default; wheel up picks bigger values. The list fades 0.9 s after the last notch, and each wheel session is one undo step. The wheel over a number field in the property panel steps it too | Owner's request (2026-10-06). Wheel up for more matches the panel's + button                                                                                           | Not simulation: `packages/app/e2e/panels.spec.ts`                                                                                     |

Not deviations, for the record:

- `CapacitorElm.dcOpen` (not upstream, off by default) makes a capacitor a true open circuit
  during DC analysis instead of a 100 MΩ resistor. Only the DC operating point table sets it, on
  its own copy of the circuit (packages/app/src/analysis/dcop.ts); the simulation and the golden
  tests never do.

- The scope card look (`style.scopeLook: cards`) changes only how scopes are drawn: the data,
  auto scales and saved records are upstream's. Classic keeps upstream's look. A 2D (X-Y or V vs
  I) plot also redraws its trail image when its height changes; upstream does this for X/Y plots
  only, so its V vs I image keeps its old size after a resize.
- Undocked scopes (`ScopeElm`, dump type 403) load, save and simulate as upstream's. In the card
  look they are drawn as cards over the circuit with a leader line (straight and 45° segments) to
  what they show, a six-dot drag handle and a resize grip; a card too small for a header shows
  only its plot and moves as a whole. Classic draws them as upstream does. New undocked scopes
  (Undock Scope, View in New Undocked Scope) are 224 × 144 and placed beside the element where
  they fit on screen, where upstream makes them 128 × 64, 50 px below and right of the element's
  first point. Only the size and place of new ones differ; files are the same.
- The card look's spectrum cursor snaps to nearby peaks, reads their frequency (refined between
  bins) and level, marks the strongest peak, and a drag measures Δf between two frequencies.
  Upstream shows the frequency and dB under the mouse only. Drawing only.
- Card look scope extras (owner's request, 2026-10-04), all view state, never saved: a freeze
  button holds a card's trace while the simulation runs (any reset lets it go); Ctrl+wheel (a
  trackpad pinch) and a two-finger pinch change the time scale as the wheel does; the time cursor
  snaps to peaks, troughs and mid-level crossings of the selected trace and reads the period and
  frequency to the like point before it, and a drag adds f = 1/Δt. Classic keeps upstream's cursor.
- Feedback animations (cards flying when docked or undocked, new elements popping in, deleted ones
  fading, a ring where ends join, undo and redo toasts) change drawing only, and stop when the
  system asks for reduced motion.
- Drawing additions from the 2026-10-06 pass (owner's requests), none saved or simulated:
  Options > Visualizations overlays (charge and E field, B field, Lenz EMF, stored energy,
  energy flow, diode and MOSFET regions; off by default; they read engine state only); Scopes >
  Undock All and Dock All; X-Y trails drawn at fractional points (upstream truncates to whole
  pixels) with round caps; a circle-less probe's empty middle (upstream draws nothing there)
  drawn as a faint dashed join with a small V badge, and scope leaders on it ending at its +
  post; rail, output, labeled node and test point labels in the monospace font; Options > Value
  text size (default Medium, 0.875 of upstream's 12 px); a live part preview in the property
  panel and a live scope preview in the scope dialog.
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
- `TimeDelayRelayElm` only switches when its in and out pins share a matrix with the rest of
  its circuit. When the contact side is a separate island (say `out` reaches ground only
  through a resistor), upstream stamps the closed contact across two matrices and it never
  conducts. The port does the same; the `time-delay-relay` golden ties `out` back to the
  powered side so it records a real switch.
- Text links (`?cct=`) are decoded the way upstream decodes them (`decodeURI`), so escaped
  reserved characters (`%3A`, `%3D`) stay escaped and XML circuits don't survive a `cct` link.
  Use `ctz` for XML, as upstream's export does.
