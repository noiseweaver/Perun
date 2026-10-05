# Deviations from upstream

Every intentional behaviour difference from upstream CircuitJS1 gets an entry here, with the golden
test that shows it (PLAN.md section 2).

| Area                                | Upstream behaviour                                                                                                      | Our behaviour                                                                                                                                                                     | Why                                                                                                                     | Golden test                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sliders on elements not ported yet  | Re-serializes every `<adj>` (slider) record from its live slider                                                        | Rewrites `<adj>` records in upstream's form (text `38` lines too), except one whose element this port can't load yet, which is kept verbatim                                      | The element isn't there to name the slider's field                                                                      | Examples with unsupported elements (docs/EXAMPLES.md)                                                                                |
| Text box fonts                      | Text boxes have a size and color only                                                                                   | Each text box also has a font (sans, serif, monospace) and style (bold, italic), or follows the app's Options default. Saved as extra XML attributes `ff` and `fs`, only when set | Requested by the owner (2026-10-04). Upstream ignores unknown attributes, so files still open there in its default font | Not simulation: `packages/format/src/textfont.test.ts` (round trip, nothing extra by default)                                        |
| Undocked scope leader post          | An undocked scope has no leader line                                                                                    | A card's leader can be pinned to one post of what it shows. Saved as an extra XML attribute `lp` on `<Scope>`, only when set                                                      | Requested by the owner (2026-10-04). Upstream ignores unknown attributes                                                | Not simulation: `packages/app/e2e/scopes.spec.ts` (pinning, save, undo)                                                              |
| Scopes on elements not ported yet   | Restores every scope in the file                                                                                        | Drops a scope (or a plot) whose element this port can't load yet, with a warning. Element numbers still count upstream's full list, so the other scopes find the right elements   | The element doesn't exist here, so there is nothing to plot. Goes away as Phase 8 ports the elements                    | `tools/golden/src/scopes.test.ts`: 440 of 550 scopes in the upstream examples restore identically, the rest are on unported elements |
| Saved position of an undocked scope | Sets an undocked scope's `p` to -1 when it first draws, so a save from a headless load keeps the file's value (`p="0"`) | Sets it to -1 on load, as a browser save after the first frame does upstream                                                                                                      | The headless golden save is the only place they differ                                                                  | `multivib-a` (docs/EXAMPLES.md, "Same save: no")                                                                                     |

Not deviations, for the record:

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
