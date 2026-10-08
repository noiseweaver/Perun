# Progress

## 2026-10-08: support links (branch claude/project-thread-dhx7vn)

Done (Gady picked the tip jar; grants were dropped; write-up in the project's ideas/monetization.md): About has one line linking Sponsors and Ko-fi, the
README has a short Supporting section, and .github/FUNDING.yml adds the repo's Sponsor button.
No popups, reminders or tracking; every feature stays free. No File menu item: one more item
made the File menu scroll in the a11y test viewport (axe scrollable-region-focusable).

Next: merge once Gady's Sponsors and Ko-fi pages are live (handles assumed noiseweaver). Open: none.

## 2026-10-08: release polish, version 1.0.0 (branch claude/release-polish-pf6oiv)

Done: About and the README credit Gadiel Zintu (github.com/noiseweaver) as maker and maintainer.
Version 1.0.0. The circuit on screen is kept in local storage (autosave.ts: every 3 s when it
changed, and when the app goes to the background) and reopened when the URL names no circuit;
a subcircuit's own circuit is never saved over it. A crash screen (CrashScreen.tsx) replaces the
blank page after a render error, with Reload and Reload with a blank circuit (which also forgets
the kept circuit). File > What's new (whatsNew.ts) and a one-time banner on the first run of a
newer version. File > Send a suggestion (Gady picked the public issue form): email address
(required) and text, then GitHub's new issue page opens with .github/ISSUE_TEMPLATE/suggestion.yml
filled in; the sender posts it with a GitHub account, and the issue (email included) is public.
About, the release notes, the form and the crash screen are translated into every catalog
language (i18nExtra.ts, added under upstream's entries). Link previews (Open Graph tags,
public/social.png), README live link, screenshots and install steps.

Next: Gady tries the form on the installed app after the deploy. Open: the translations were
written by Claude and not reviewed by native speakers.

## 2026-10-08: themed update prompt (branch claude/themed-update-prompt-7tcphm)

Done: the "A new version is ready" bar (UpdateBanner in App.tsx, shown by pwa.ts when the
service worker has downloaded a new build; GitHub Pages adds no UI of its own) used Material's
inverse snackbar colors, so on Dark it was a light bar with a dark outline button. It now uses
the theme's raised surface, text and border colors, with a filled accent Reload button. Look only;
update behavior unchanged.

Next: Gady sees it on the next deploy after this one. Open: none.

## 2026-10-08: field follow-ups (branch claude/field-follow-ups-badkkd)

Done (Gady picked "Field follow-ups", the open items from PR #20): Options > Visualizations now
covers center-tapped and custom transformers (core flux, leakage loops, stored energy; custom
windings keep their polarity), LEDs (depletion region under reverse voltage, rays of light on the
brightness scale of ledView), varactors (depletion region whose width follows C0 / C) and the
polarized capacitor's curved plate (field lines and charge marks follow it). Undock All around a
small circuit no longer shrinks the cards until their titles are cut off: the fit used the
height the docked scopes had held, and the cards now grow (whole grid steps, at most 3x) until
they show at about their own size. Tests: packages/render/src/fields.test.ts, an e2e test in
scopes.spec.ts. Goldens unchanged (display only).

Next: Gady tries the preview and checks the live part header and scope dialog preview on a real
phone (the last PR #20 follow-up).

## 2026-10-08: iPhone bottom band after rotating or reopening (branch claude/ios-bottom-chin-qhisg1)

Done: the installed iPhone app sometimes showed an empty band under the bottom bar again after a
rotation or a return from the background. pwa.ts stretched the page to the screen only on `resize`,
and only while the window read a status bar short; iOS reports stale sizes mid-rotation and on
resume, then shrinks the window with no further resize, so a full-height reading removed the
stretch for good. Now any window as wide as the screen gets the screen's height (orientation from
the window's width), rechecked on resize, orientationchange, pageshow, focus and visibilitychange
and again over the following second. Unit test for the rule, e2e test with an emulated installed
iPhone (fails on the old code).

Next: Gady to confirm on the phone. Open: none.

## 2026-10-07: Phase 20, rewind and scrub (branch claude/project-thread-xl3poa)

Done: packages/app/src/rewind/history.ts records the last 10 s of the run frame by frame (key
frames plus changes, about 1 to 14 KB a frame on the bundled examples, at most 1.2 ms a frame) and
writes a frame back into the parts and scopes to show it. SimController records after each
frame's steps and, while a recorded frame is shown, replays instead of stepping. The timeline bar
(components/Timeline.tsx) opens from the Rewind button in the bottom bar. Tests: history.test.ts
(every example replays exactly and continues bit for bit), e2e rewind.spec.ts. Checked in Dark,
Classic, phone portrait and landscape.

Also (Gady, 2026-10-08): undocked scope cards were hard to tell from the canvas. New theme key
`scope.undockedCard` (Theme editor > Scope > Undocked card), lighter than `scope.card` in the dark
built-ins, and a soft shadow under each undocked card. The theme fuzz test then found font names
let tabs and line breaks through; font lists now allow plain spaces only.

Next: Gady tries the preview. Open: X-Y plots draw into an image as they run, so a rewound X-Y
plot keeps its newest trace.

## 2026-10-07: Phase 19, live formula cards (branch claude/project-thread-0qtuqk)

Done: packages/elements/src/formulas.ts gives a part's laws with its live values as fixed-width
tokens (`formulasFor`); packages/app/src/components/FormulaCard.tsx shows them under the property
panel's live header, updating every frame, collapsible (remembered in localStorage). Covers
resistors, lamps, capacitors, inductors, diodes/LEDs/Zeners and BJTs. Tests:
packages/format/src/formulas.test.ts (each result matches the engine), an e2e test in
panels.spec.ts. Checked in Dark, Classic, phone portrait and landscape.

Then Gady asked for the extras: MOSFET (by region), op-amp (input difference and gain, or
the limit), transformer (turns ratio against the measured V2) and sources (power delivered).
The preview's demo circuit has one of each.

Next: Gady tries the preview.

## 2026-10-07: fix white screen after a deploy (branch claude/temperature-subcircuit-params-nid9p9)

Done: after the Phase 15-18 deploy the installed app could open to a white screen. GitHub Pages sends
`max-age=600`, so the new service worker's precache got the old index.html from the browser's HTTP
cache, and that page points at hashed scripts the server no longer has. The worker now precaches with
`cache: 'reload'`, fails the install when the cached page names `assets/` files outside this build (so
the working version stays), and hashes its own code into the cache version. Reproduced in Chromium
with a local server sending the same header; broken deploy then fixed deploy recovers.

Next: none. Open: an app already stuck on the white screen may need removing and re-adding.

## 2026-10-07: Mobile polish (branch claude/mobile-landscape-menu-polish-amx0hv)

### Done

- Top bar: each menu is an icon and its name on wide screens (File folder, Edit, Circuits
  library, Scopes trace, Options gear) with no dropdown caret. On phones either way up (width
  under 720 px or height under 560 px) the menus are icon buttons beside the title in one 48 px
  row (names stay as aria-label and tooltip); portrait no longer spends a second row on them, and
  the brand tile is hidden there.
- Phone on its side (height under 560 px, landscape): `.app` becomes a grid. The bottom bar's
  run controls form a rail down the right of the canvas (Run/Stop icon only, 48 px) and the
  readouts stack two to a column at the end of the app bar's row, so the canvas gets almost the
  full height.
- Circuits sheet: now on phones either way up (it was portrait only), as a bottom sheet with a
  dimmed scrim. A tap outside, a pull down (from the handle or header, or from the list once it
  is scrolled to the top), the close button or Escape put it away.
- Icons on every top bar menu item and submenu entry (Icon.tsx gained Material paths plus three
  drawn here: European resistor, omega, junction). Options switches now show their icon first and
  the tick at the end; radio choices inside submenus keep their leading tick. The context menu's
  Max Scale and Freeze get icons too. `MenuIcon` moved to Icon.tsx and is shared.
- e2e: sheet dismissal by tap and pull (viewer.spec.ts), landscape rail layout.
- No page zoom on touch screens (Gady: zooming the interface kept hiding the buttons):
  packages/app/src/pageZoom.ts cancels Safari's gesture events and two-finger moves outside the
  canvas, body has touch-action: manipulation (no double-tap zoom), and text fields are 16px on
  coarse pointers so iPhone does not zoom into them. The viewport meta keeps user scaling, since
  user-scalable=no fails axe's meta-viewport rule and iOS ignores it.

### Next

- Gady checks the landscape rail and the sheet on the iPhone.

### Open issues

- examples.test.ts "matched pair and tempco resistor" times out at 5 s in the cloud sandbox on
  main too (slow machine); CI decides.

## 2026-10-07: Phases 15 and 16, temperature and subcircuit parameters (branch claude/temperature-subcircuit-params-nid9p9)

### Done

- Gady picked "Core leftovers" (temperature and subcircuit parameters; SPICE import later, in
  its own thread). PLAN.md gets Phases 15 and 16; the out-of-scope line names them.
- Temperature (packages/elements/src/temperature.ts): `Simulation.temperature` (°C, 27 by
  default), set in Simulation settings, saved as `temp` on `<cir>` only when not 27, and shown
  in the bottom bar (fixed width) when not 27. `Diode` (so every junction part), `TransistorElm`
  and `MosfetElm` take SPICE's temperature equations with SPICE's default coefficients: the
  thermal voltage scales with T, IS with EG = 1.11 and XTI = 3 (exp(f/N) for diodes, exp(f) for
  BJTs, ISE and ISC with NE and NC; XTB = 0), MOSFET KP as (T/Tnom)^-1.5 and the level 1
  threshold shift with GAMMA = 0 and PHI = 0.6 (about -1 mV/°C NMOS, -1.3 mV/°C PMOS). JFETs
  keep threshold and beta. Elements recompute at stamp when the temperature changed. At 27 °C
  every function returns upstream's own constant, so nothing changes: all 373 examples were
  compared exactly (500 steps each) against main and are bit for bit identical; at 85 °C 154
  differ and none produce NaN. Resistors get a Temperature coefficient (ppm/°C) property, `tc`.
- Parameters (packages/elements/src/params.ts): a small expression evaluator (SI prefixes,
  `+ - * / ^`, functions, pi). `Circuit.params` (`prm` on `<cir>`), File > Parameters… and a
  Parameters button on the subcircuit bar. `CircuitElm.paramExprs` (`px`, edit item to
  expression): typing `{R*2}` in a property panel number field binds it, a plain number unbinds
  it. Create Subcircuit and Save copy the circuit's parameters into the model (`prm` on `<ccm>`);
  Edit Model loads them back. A placed subcircuit lists them after its other properties
  (`paramValues`, `pv`, only values that differ from the default; no sliders, since upstream
  would not find the item). `CompositeElm.loadCompositeXml` applies the bindings with the copy's
  values, so nested copies can bind their values to the outer model's parameters.
- Tests: packages/format/src/params.test.ts (two copies of a divider, nested copies, round trip,
  nothing saved by default, diode drift, resistor coefficient), packages/elements/src/params.test.ts
  (expressions), packages/app/e2e/params.spec.ts.

- After #23 merged: the sweep dialog's part list starts with Circuit temperature (°C)
  (`TEMPERATURE_TARGET` in packages/app/src/analysis/sweep.ts sets each copy's temperature),
  seeded with -20, 27 and 85 °C. sweep.test.ts checks the diode drop falls about 2 mV/°C across
  the runs.

- Phase 17, self-heating and the ambient ramp (Gady picked "Self-heating" on the card, which
  includes the ramp). Engine: `Simulation.temperatureRamp`, `ambientTemperature()`,
  `selfHeating`, and `restampRequested` (checked before each step; only resistors with a
  coefficient set it). packages/elements/src/thermal.ts: `Thermal` (thermal resistance and time
  constant, one RC pole integrated exactly), `temperatureOf(e)` (the part's own temperature with
  self-heating on, else the ambient one) and `heatStep` (called from the stepFinished of
  DiodeElm, TransistorElm, MosfetElm and ResistorElm). Diode re-runs setup in doStep when its
  owner's temperature moved, BJTs and MOSFETs in startIteration. JFETs and varactors don't heat.
  Settings dialog: ramp to/over and a Self-heating box; the property panel shows a live T
  readout and the part's heat path fields. With both off, all 373 examples were compared
  exactly against the previous commit: identical. Tests: packages/format/src/thermal.test.ts
  (resistor RC response, a resistor with a coefficient at equilibrium, BJT runaway and the
  emitter-resistor fix, reset, the ramp, saving) and the self-heating test in params.spec.ts.
- Heat visualization (Gady said go, 2026-10-07): `heat` in `FieldOptions` (packages/render/src/
  fields.ts), a glow under each heating part warmer than ambient and a right-aligned, fixed-width
  " 85 °C" label over it in the monospace font. Self-heating off: the settle estimate from a
  0.5 s average of the part's power. New theme key `circuit.heat` in every built-in (contrast
  checked). Tests: packages/app/src/heat.test.ts and the Heat test in params.spec.ts.
- The mouse-wheel browser test retries its first wheel step until the pointer is over the
  resistor (it failed once in CI on a slow runner).
- Phase 18, the VCO temperature-compensation kit (Gady picked "All three"; the reason for
  temperature is VCO stability and learning about compensation). Sweeps measure each transient
  run's frequency (`measureFrequency` in packages/app/src/analysis/sweep.ts: rising crossings of
  the middle of the output's range, 10 % hysteresis, interpolated, after the first fifth of the
  run) and the dialog lists it per run with a Frequency | Pitch toggle (packages/app/src/
  analysis/pitch.ts: 12-TET, A4 = 440 Hz, middle C = C4). A temperature sweep references the
  27 °C run and shows the drift in ppm/°C or cents/°C. Capacitors get a temperature
  coefficient with dielectric presets (`tc`, like the resistor's), restamped as the temperature
  moves; electrolytics have none. `EditInfo.derived` marks a preset picker that only restates
  the number next to it, so the parts list reads the number.
- This port's own examples: packages/app/examples/{setuplist.txt,circuits/} are served and built
  by vite-plugin-examples.ts (`mergeSetupLists` puts them after upstream's last menu), with a
  thermostat icon for the new Temperature Compensation category. Three expo converter VCOs
  (one transistor, matched pair, pair with a +3300 ppm/°C tempco resistor), each about 1 kHz at
  27 °C with a scope on the ramp and a note saying what to sweep. Tests:
  packages/app/src/examples.test.ts (the merge, the files, the frequencies and the drifts),
  packages/app/src/analysis/pitch.test.ts, measureFrequency tests in sweep.test.ts.

### Next

- Gady (2026-10-07) asked to keep temperature in scope: thermal realism (package presets, shared
  heatsinks, two-stage warm-up, burning parts) and more temperature-dependent components are
  parked, not planned. Small follow-ups if wanted: a scope plot of a part's temperature, the
  thermistor following the ambient temperature.
- Possible follow-ups: per-model EG/XTI/XTB (vendor models), temperature-dependent junction
  potentials and capacitances, a slider on a circuit parameter.

### Open issues

- The NTC thermistor keeps its own temperature setting; it does not follow the circuit's.
- A slider moving a bound field leaves the binding in place, so the next parameter change sets
  the field back.

## 2026-10-06: Phases 11 and 12, parameter sweeps and Monte Carlo (branch claude/sweeps-monte-carlo-x2fno2)

### Done

- Gady answered the core features card with "Everything". PLAN.md gets Phases 11 (sweeps), 12
  (Monte Carlo), 13 (DC operating point table) and 14 (editor and export quick wins), each with
  acceptance criteria; the out-of-scope line names 11 to 13 as exceptions. Phases 13 and 14 are
  built in their own threads.
- packages/app/src/analysis/sweep.ts: `MultiRun` loads a copy of the circuit per run, applies
  the run's values through each part's `setEditValue`, and measures it: a transient (an
  output's voltage or current from reset to a stop time, 401 evenly spaced samples
  interpolated between timesteps) or an AC sweep (one `BodeSweep` per run; `BodeSweep` now also
  takes a circuit copy). Runs go in slices per animation frame and can be stopped.
- Sweeps step any value a slider could drive (`EditInfo.canCreateAdjustable`): a list
  ("1k, 2.2k, 4.7k") or a linear or log range of 2 to 10 values, rounded to three significant
  digits. Monte Carlo draws the nominal run plus 10 to 200 runs; each toleranced part gets
  nominal × (1 + tol × d), with d uniform in [-1, 1] or normal with the tolerance at 3σ, cut at
  the tolerance. A mulberry32 generator seeded from the seed and the run number, never the
  engine's `JavaRandom`, so the same seed gives the same runs and goldens are untouched.
- Tolerance: `tolerance` (percent) on ResistorElm, CapacitorElm (and the polarized one) and
  InductorElm, saved as `tol` only when set (DEVIATIONS.md). The property panel shows a
  Tolerance drop-down (None, ±0.1% to ±20%) after the part's own fields, as one undoable edit
  (packages/elements/src/tolerance.ts, `SimController.applyTolerance`).
- SweepDialog.tsx: Scopes > Parameter Sweep… and Monte Carlo…, and Sweep This Value… in the
  element context menu. Material segmented buttons pick what to vary and what to measure. A
  sweep draws a run per value in the scope trace colors with a legend that reads each run at the
  cursor; Monte Carlo draws the spread faint in the first trace color and the nominal run on
  top in the second, with nominal, mean, min and max at the cursor. Readouts are fixed-width
  monospace. CSV export. The last run stays when the dialog closes.
- Tests: sweep.test.ts (R swept in an RC step: each tau within 2% of RC; C swept in an RC
  low-pass: each -3 dB point within 2%; Monte Carlo values within tolerance, same seed same
  runs, each run's tau matches its drawn R·C; `tol` round trip). e2e: packages/app/e2e/sweep.spec.ts.

### Next

- Possible follow-ups: sweep two values at once (a grid), sweep a temperature once Phase 6 of
  the ideas list (temperature) exists, a histogram of a measured quantity (say the -3 dB point)
  over the Monte Carlo runs, tolerance on more parts (potentiometers, transformers).

### Open issues

- Run labels use upstream's `unitString`, so a resistor reads "1k" (no Ω), as upstream's own
  edit fields do.

## 2026-10-06: Phase 14, editor and export quick wins (branch claude/quick-wins-wires-export-wi0gpu)

### Done

- Wires follow a dragged part (packages/app/src/editor/wireFollow.ts). When a drag or an arrow key
  moves a selection, every unselected wire with an end on one of its posts follows. A straight
  wire with one end moving bends into an L: the wire keeps its fixed end and a new wire runs from
  the corner to the part, so the leg at the part keeps the wire's direction. A wire in line with
  the move just stretches, a slanted one stretches, a routed wire reroutes, and a wire that shrinks
  to nothing is removed when the drag ends. The wires are placed from the total offset each move,
  so holding Alt mid-drag puts them back and releasing it brings them along again. Options > Wires
  follow dragged parts (user setting `wiresFollow`, on) turns it off. One undo step per drag.
- File > Export image: SVG or PNG (1×, 2×, 4×, at most 8192 px a side) of the schematic or the
  selection, without grid, dots or highlights. Colors: Light (default, for print), the current
  theme or Classic, optionally by voltage, optionally transparent. A live preview shows the
  result. packages/render/src/schematic.ts has `SvgPainter` (the `Painter` interface writing SVG
  elements, gradients as `<linearGradient>`), `drawSchematic` shared with an off-screen canvas,
  and the post lists moved to posts.ts so both use the renderer's rules. SVG text names the
  theme's fonts but doesn't embed them.
- File > Parts list (packages/app/src/export/partsList.ts): parts grouped by palette name, value
  and settings with a count, sorted by name. The value is the first edit field with a unit (from
  "(ohms)" style labels or words like Voltage); other non-zero fields, choices and text go in
  Details; starting state ("Initial ...") is left out. Wires, ground, labels, meters, probes and
  graphics are not parts. Table in the dialog, CSV download and copy.
- Scope Export CSV opens a dialog (packages/app/src/analysis/scopeRecord.ts). "On screen only"
  is upstream's file. Full resolution records every timestep of the visible plots from now for a
  chosen simulated time (default: the scope's width), by hooking `sim.onTimeStep` after the
  scopes. Columns are "part or scope label: plot (unit)". It stops at 1M rows, on a reset, or if
  the scope goes (undo, load). Values are after AC coupling when that is on.
- e2e: packages/app/e2e/export.spec.ts.

### Next

- Possible follow-ups: PDF (via print), a netlist export, embedding fonts in the SVG, export of
  Bode and sweep results from the same dialog.

### Open issues

- An L bend picks the corner by the wire's direction only; it can run the new leg through another
  part. A routed wire avoids that if it matters.

## 2026-10-06: Phase 13, DC operating point table (branch claude/dc-bias-table-l9npgo)

### Done

- Scopes > DC Operating Point opens a card over the top right of the canvas (under the sliders,
  if any) with two tables: node voltages (GND, labeled nodes by name, the rest N1, N2 ... in the
  order the circuit meets them) and each part's voltage, current and power. Parts with more than
  two posts list each post (B/C/E, G/S/D, op-amp pins, chip pin names) with its voltage and the
  current into the part. Columns sort by clicking the header. Values use `getFixedUnitText` in
  the monospace font, so nothing shifts. Pointing at a row lights the node's wires (or the part)
  on the canvas; tapping pins it. CSV export of both tables.
- Two modes. DC solve (packages/app/src/analysis/dcop.ts, `solveOperatingPoint`) reads a copy of
  the circuit and runs the engine's DC analysis (`dcAnalysisFlag`: sources at their DC bias) step
  after step until no node moves by more than 1 nV (5 steps in a row), up to 20000 steps or 3 s.
  On the copy only, inductors become 1 pH backward-Euler shorts and capacitors are true opens
  (`CapacitorElm.dcOpen`, new, default off) instead of upstream's 100 MΩ, so a capacitor shows
  0 A and nothing leaks through it. It solves again after every edit or slider move
  (`SimController.circuitVersion`). Live reads the running simulation four times a second.
- Tests: dcop.test.ts (divider, voltage-divider NPN bias against the Thevenin hand calculation,
  capacitors carry no current, inductors short, AC source keeps only its offset, a node between
  two capacitors, CSV); e2e packages/app/e2e/dcop.spec.ts. All 32 golden circuits solve; only
  dc-motor does not settle (it spins up) and the two convergence-failure fixtures report the
  engine's error. Golden compare unchanged (44/44).

### Next

- Possible follow-ups: show a node's voltage next to it on the canvas, a reference node other
  than ground, a power column total.

### Open issues

- Big circuits with many transistors take the engine's own DC convergence time per solve (the
  op-amp-real fixture: about 0.6 s, mostly the first step's Newton iterations), and Solve mode
  repeats it after each edit.

## 2026-10-06: coil field arrows

### Done

- Gady asked whether the coil field arrows, which point against the current, are right. They are:
  the loops drawn beside a coil are the field coming back outside, which runs opposite to the field
  inside. The inside leg lay under the coil symbol, so nothing showed it. Each coil field (inductor,
  relay, transformer leakage) now also draws a short arrow just inside the coil, beside the axis,
  pointing with the current. Which way the inside field points is a convention, since a schematic
  coil does not say which way it is wound.

## 2026-10-06: Phase 10, AC analysis (branch claude/ac-bode-plots-qhbmaf)

### Done

- Gady picked AC/Bode as the first core simulator feature. PLAN.md gets Phase 10 with acceptance
  criteria; the out-of-scope line now names it as the exception.
- packages/app/src/analysis/bode.ts: `BodeSweep` reads a copy of the circuit (saved XML), turns
  the chosen `VoltageElm` into a sine (a DC source's level becomes the bias), and steps through
  log-spaced frequencies. Each point uses whole timesteps per period (at least 64, never coarser
  than the circuit's own step), correlates input and output over each period via
  `Simulation.onTimeStep`, and stops once an Aitken estimate of the remaining change is under
  0.1% twice running (or after 4000 periods / 2M steps, then drawn hollow). The engine stops on a
  period boundary with `requestPause`, so the next frequency starts on a zero crossing and the
  operating point carries over. Input is measured from the source's own node voltages, so the
  half-step source timing cancels out.
- Accuracy (bode.test.ts): RC low-pass worst 0.007 dB and 0.05° over 10 Hz to 100 kHz; RLC
  band-pass peak and bandwidth; inverting op-amp 6.02 dB and 180°. The RC sweep (41 points) is
  0.5M steps, about 0.4 s headless. Low frequencies cost the most (a 1 Hz point at 5 µs is 200k
  steps a period).
- BodeDialog.tsx: Scopes > AC Analysis (Bode Plot)… and the element context menu (a source
  becomes the input, anything else the output). Gain and phase panes on a shared log axis in the
  scope theme colors (card, traces[0], traces[1], trigger for the -3 dB lines), hollow rings for
  unsettled points, a cursor, fixed-width monospace readouts, progress, Stop, CSV export. The
  last sweep stays when the dialog closes; reopening resumes an unfinished one. A note says when
  the output never rises above -100 dB (not connected).
- e2e: packages/app/e2e/bode.spec.ts.

### Next

- Possible follow-ups: input from a current source, a reference node other than ground for the
  output, overlaying a second run, gain and phase margin readouts for loop gain.

### Open issues

- Very low start frequencies are slow because the circuit's timestep is kept. A coarser step
  there would be faster but changes accuracy for circuits with fast internal dynamics.

## 2026-10-06: field overlay prototype (branch claude/project-thread-ojpap8)

### Done

- Options > Show fields (user setting, off by default, not saved in circuits): capacitors get + and
  - charge marks and electric field lines with arrows from the + plate (strength is |V| over the
    voltage range); inductors get dashed field loops through the coil that flow with the current
    (strength against the coil's own recent peak). Display only: reads `voltdiff` and `current`.
    Code in packages/render/src/fields.ts, drawn under the elements, hidden below zoom 0.5.
- Theme keys `circuit.electricField` and `circuit.magneticField` in every built-in theme. Charge
  marks use the voltage positive and negative colors.

- Second round (Gady: "all of them are good"): a glow on capacitors, coils and transformers
  that follows stored energy on one scale for the whole circuit; chevrons into parts that absorb
  power and out of parts that deliver it (two-terminal parts); transformer core flux loops and
  leakage loops (coupling below 1); a Lenz's law EMF arrow beside each coil; relay coil fields
  with a pull arrow on each blade (scaled to the pull-in current); field lines across DC motors;
  MOSFET channel filling in past threshold; diode depletion region widening under reverse
  voltage. New theme key `circuit.energy`. `diodeGeometry`/`mosfetGeometry` are now exported for
  the overlay; `DCMotorElm` is exported from the elements package.

- Options > Visualizations submenu (Gady's ask) with a switch per overlay (charge, magnetic,
  EMF, stored energy, energy flow, diode and MOSFET) and Turn all on/off; user setting `fields`,
  migrating the first prototype's `showFields`. A foldable legend in the canvas's top left lists
  the overlays that are on, with swatches in theme colors. The energy glow is fainter.

- Scopes > Undock All (Gady's ask): every docked scope becomes a card on the circuit and all the
  cards are spread around it (packages/app/src/scopeLayout.ts). Each card goes on the side
  nearest what it shows, level with it so its leader runs straight in; crowded cards pack an
  even gap apart in target order so leaders don't cross, and the sides share cards out when one
  fills. Cards get the default size, the view fits, and one undo docks them all again. Running it
  with everything undocked just tidies the cards. Scopes > Dock All puts every undocked scope
  back in its own column (one undo). Catalan strings for these and the Visualizations menu and
  legend are in (ca at 100%).

- Livelier property panels (Gady picked the scope preview, the live header and wheel stepping):
  the scope dialog opens with the scope copied live from the canvas (title row left off) and its
  plot switches are chips with a dot in each trace color. The component panel shows the part
  drawn live by its own small `CircuitRenderer` (`plain` mode: no grid or highlights; tall parts
  turned on their side), and for two-terminal parts fixed-width V, I and P with a four-second
  sparkline. Both redraw from `controller.frameListeners`. The mouse wheel steps a number field
  in the panel, and on the canvas steps a resistor, capacitor or inductor through E12 with the
  values shown by the mouse (upstream's Edit Values With Mouse Wheel, now on by default; see
  DEVIATIONS.md). Tests in packages/app/e2e/panels.spec.ts.

- Gady's follow-ups: X-Y (Lissajous) trails keep fractional points and draw with round caps, so
  they no longer step from pixel to pixel. A scope leader on a probe drawn without its circle
  (two stubs, nothing in the middle, as upstream) ends on its + post. The laser points only while
  the button is held; pen colors show only with the pencil. Options > Value text size (Small,
  Medium, Large = upstream's 12 px, Extra large; default Medium) scales component values only.
  A probe without its circle symbol (upstream leaves its middle empty, so `amp-schmitt.txt`'s
  voltmeters looked invisible) gets a faint dashed join and a small V badge. Rail, output,
  labeled node, test point and similar part labels use the monospace font (`LABEL_FONT`).

### Next

- Gady to try the preview artifact and decide whether to keep, change or drop it.
- Not covered yet: tapped and custom transformers, LEDs and varactors, polarized capacitor plate
  shape.

## 2026-10-06: deploy, iPhone fixes, more themes

### Done

- GitHub Pages deploy (PR #13): every push to main publishes the app at
  https://noiseweaver.github.io/circuitsjs-next/, installable on iPhone through Safari > Share >
  Add to Home Screen.
- iPhone fixes (PR #14): installed on iOS 26 the page height came out short by the status bar;
  the app now stretches to the screen. The app bar clears the blur under the status bar, tapped
  buttons no longer stay shaded, and the brand icon shows on phones.
- Twelve palette themes (PR #15): Solarized Light, Dracula, Monokai, Tokyo Night, Catppuccin Mocha
  and Latte, Rosé Pine, Everforest Dark, GitHub Dark and Light, Obsidian Dark and Light.
- Current dots hide where |I| < 1 pA while running (PR #17, DEVIATIONS.md), and the iPhone top gap
  is 28 px (18 px since: 28 cleared the frost but left too tall a gap).
- Options submenus (Language, Theme, Default text box font) unfold inside the menu on phones
  instead of running off the screen.
- Catalan: the app's own catalog in `packages/app/locales/locale_ca.txt` (upstream ships none),
  served next to upstream's catalogs; `pnpm i18n` counts it.
- The property panel's actions have captions under their icons; the undocked-scope action uses the
  same arrow-out-of-a-square icon as Undock Scope. Scope card header buttons show their names on
  hover.
- Docked scope cards drag by their title (with two or more scopes): drop on a card's top or bottom
  edge to stack, its left or right edge for a new column, its middle to combine. Undoable.
  `ScopeManager.moveScope`; the Stack, Unstack and Combine commands stay.
- Example circuit names follow the interface language on phones too (the Circuits sheet, its
  search, which also matches English) and in the app bar title, from upstream's catalogs.
- `style.roundness` (0 to 2) in themes, with a slider in the theme editor: scales the Material
  shape tokens and the scope cards' corners, large radii faster than small ones; below 1 round
  buttons become rounded squares.

### Open issues

- The iOS height fix still needs checking on a real iPhone after the deploy.
- The 18 px top gap needs checking on an iPhone (12 px showed the frost).
- Docked scopes in the classic look have no header, so they rearrange only through the menu.

## 2026-10-05: Phase 9 (polish and release)

### Done

- Profiling: `pnpm bench` measures matrix sizes, frame load and allocations per step on every
  example. The engine stays on the main thread (docs/ENGINE-NOTES.md section 13).
- Accessibility: axe (WCAG 2.2 A/AA) runs in e2e over the main view, panels, dialogs, menus, a
  phone layout and every built-in theme. Keyboard: `]` and `[` step through elements with a live
  region, Shift+F10 opens the element menu. Phones in landscape start with the palette shut.
- PWA: manifest, icons, iOS home screen tags and a precaching service worker, so the app, the
  examples and the licenses work offline; a Reload banner offers new versions; File > Install app.
- i18n: Options > Language with upstream's `locale_*.txt` catalogs (`?lang=` as upstream).
- Live sliders (upstream `Adjustable`) in a card at the top right, with a Sliders dialog; each drag
  is one undo step.
- Fixed-width info box values (hover and corner box) through the fixed-width unit helpers.
- Routed wires route around elements (upstream `WireRouter`).
- Model editors: Create New Model and Edit Model for diodes, transistors, MOSFETs/JFETs, relays
  and custom logic, applied as one undoable edit.
- Subcircuit editor: File > Create Subcircuit (labeled nodes become pins), the pin layout dialog
  (drag, shift-click and rubber-band selection on one side, width and height, label, scope: this
  circuit, this session or saved in the browser), a Subcircuits palette group, Edit Model with a
  Back / Save / Save Copy bar, View Components (double-click), and File > Subcircuit Manager to
  delete models.
- Teaching tools (Gady said go, 2026-10-05): the pencil button in the bottom bar opens a drawing
  toolbar with a pencil (the theme's pen colors), a laser pointer whose glowing trail fades in
  under a second, an eraser that removes whole strokes, Undo (also Ctrl+Z while drawing), Clear and
  Done (or Escape). Strokes stay on the circuit as you pan and zoom, work with mouse, pen and
  touch (a second finger pinches instead), and are never saved in the circuit file. Themes gained
  a `teaching` section (`pens`, `laser`), checked for contrast against the canvas.
- Phone fixes from Gady's iPhone testing (2026-10-05): the menus get their own row under the title
  instead of being squeezed and clipped; the status bar inset is only added when installed (in a
  browser or another app's web view it left an empty band above the app bar); the palette list
  scrolls with a vertical swipe (a sideways drag still carries a component onto the canvas);
  dialogs open above the property sheet and the palette, menus above the Sliders card, and the
  drawing toolbar sits along the bottom of the canvas on phones. The laser trail is drawn as
  quadratic curves through the sample midpoints with butt caps, so it no longer shows a dot at
  every sample.
- The canvas context menu (right click or long press) has an icon beside every item, and
  disabled menu items are now dimmed (they looked enabled). Example circuit categories in the
  Circuits menu and the phone Circuits sheet show a small drawing of a component from the
  category (a plain icon where that would be an unreadable chip).
- Divider lines between example circuit categories (Circuits menu and the phone sheet). On touch
  screens a drag-to-select button in the bottom bar makes a one-finger drag on empty canvas draw
  a selection box instead of panning (two fingers still pan and zoom); it is hidden with a mouse.
- On phones the property sheet slides down to its handle while a component is dragged, and
  closes after View in New Scope, View in New Undocked Scope or Add to Existing Scope so the
  scope can be seen.
- Theme colors with surrounding whitespace (`"#fff\n"`) are now refused; the theme fuzz test
  found one reaching a CSS custom property.
- README, About dialog (version, upstream credits, GPL notice, links to the source, LICENSE.txt and
  third-party-licenses.txt, which the build writes).

### Next

- Release: merge PR #11, then this phase's PR (retargeted to main).

### Open issues

- Upstream's time-delay relay only switches when its contacts share a matrix with the powered
  side; the port keeps that (docs/DEVIATIONS.md, "Not deviations").
- A double-click on an element under the property panel's spot opens the panel over it first, so
  the second click misses (seen while writing the subcircuit e2e test).

## 2026-10-05: Phase 8 (element coverage)

### Done

- Every element class in upstream master is ported (154 rows in docs/ELEMENTS.md), each with its
  sim, view and edit schema, in batches: rail variants, sweep, AM/FM, audio and data input,
  battery; switches (SPDT, DPDT, make-before-break, cross, analog) and logic I/O; gates,
  Schmitt triggers, tri-state and delay buffers; digital and mixed-signal chips (flip-flops,
  counters, 555, ADC/DAC, latches, mux/demux, adders, displays); transformers, transmission
  line and relays; JFET, SCR, TRIAC, DIAC, triode, lamp, ammeter and the rest of tier 3;
  expressions and controlled sources (VCVS, VCCS, CCVS, CCCS); audio output and the CCII
  conveyors; composites (OTA, Norton amp, Darlington, crystal, comparator, real op-amp,
  optocoupler); box and line graphics; subcircuits (custom composites, with their models
  saved in the file); routed wires; RAM, ROM, instruction display and bus widths; gyrator, LED
  array, custom logic; 3-phase motor and motor protection switch; fuse, LDR, thermistor, test
  point, stop trigger, data export, wattmeters; DC motor, time-delay relay, analog mux and
  custom transformer.
- Every bundled upstream example runs: `pnpm golden:examples` compares all 373 against the
  reference build (`fixtures/examples/`). **373 of 373 pass** (target was 95%), and 371 save
  byte for byte as upstream does. The other two differ only in an undocked scope's `p`
  (docs/DEVIATIONS.md). docs/EXAMPLES.md is the generated report.
- All 550 scopes in the examples restore identically; `tools/golden/src/scopes.test.ts` now
  requires that no scope is dropped.
- 44 golden circuits, 9 of them new for Phase 8 elements the examples don't cover well (fuse,
  LDR and thermistor, wattmeters, DC motor, time-delay relay, analog mux, real op-amp models,
  optocoupler, custom transformer).
- The stop trigger pauses the simulation (`Simulation.requestPause`) and stays highlighted, as
  upstream draws it. The data export element saves `data-yyyyMMdd-HHmm.circuitjs.txt`.
- Element number text uses `String()` (GWT prints doubles the JavaScript way), see
  docs/ENGINE-NOTES.md.

### Next

- Phase 9 (PLAN.md).
- Teaching tools (pencil and laser) wait for the owner's go; they must ship before release.

### Open issues

- The subcircuit editor and the logic model editor aren't built (they say "not available yet").
- Element sliders (`<adj>`, pots, LDR, thermistor) load and save but aren't live in the UI.
- Info box values (hover and the info panel) don't have fixed-width text yet; this applies to
  every element.
- Upstream's time-delay relay only switches when its contacts share a matrix with the powered
  side; the port keeps that (docs/DEVIATIONS.md, "Not deviations").

## 2026-10-04: Phase 7 (theme system complete)

### Done

- Built-ins: Light (Material 3 light scheme), High Contrast and Colorblind Safe (blue to orange
  voltages, Okabe-Ito accents) join Dark, Classic, Classic Dots and the four community themes. Every
  built-in passes the contrast checks; Nord's and Solarized's error color got a lighter tint for it.
- Theme package: `encodeThemeParam`/`decodeThemeParam` for `?theme=` links (theme minus its base,
  raw DEFLATE, base64url), `minimizeTheme`, `themeToJson` and `themeFileName` for files,
  `contrastWarnings` (WCAG 4.5:1 for text, 3:1 for voltage colors and other graphics) and
  `themeJsonSchema`. The zod schema carries a description for every key.
- Fixed: a theme with `meta.base` set to `__proto__`, `toString` and the like crashed resolving
  (it reached `Object.prototype`); bases are now looked up as own keys only. Saved settings had the
  same lookup.
- App: Options > Theme is a submenu with the built-ins, your themes, Edit theme…, Themes… and Import
  theme file… (on phones it opens the Themes dialog). The Themes dialog lists every theme with a
  swatch and buttons to customize or edit, copy a link, export a file and delete. Your themes live
  in IndexedDB; the active one is also cached in localStorage for the first frame.
- Theme editor: a live sample circuit (AC source, RC, LED, labeled output, text, scope) drawn in the
  draft, with the whole app previewing it too; color pickers plus text fields for every key, trace
  list, line width, dot size, grid, scope look and fonts; contrast warnings beside each field and in
  a clickable list under the preview; Start from any built-in; Export and Copy link; Cancel restores.
- Links: `?theme=` opens a banner preview (Apply adds it to your themes and uses it, Save adds it
  only, Dismiss goes back); nothing is stored until then. Export link has "Include my theme", which
  adds `theme=` beside `ctz=` (never on the Falstad link). A damaged link shows an error.
- `docs/THEMES.md` (rules, built-ins, sharing, editor, safety, generated key reference) and
  `docs/theme.schema.json`, both written by `pnpm theme:docs`; `tools/theme-docs` tests fail when
  either is stale.
- Acceptance: `packages/theme/src/fuzz.test.ts` fuzzes the decoders (random JSON, mutated and
  corrupted built-ins, hostile JSON text, random and damaged links, compression bombs, bad UTF-8):
  no throw, and every accepted theme is complete with CSS-safe values. `packages/app/e2e/themes.spec.ts`
  covers success criterion 3: a theme shared by link, combined link or file applies in a fresh
  browser profile, plus the editor, library and Cancel.

### Next

- Phase 8: element coverage.

### Open issues

- Sliders (`38` lines, `<adj>`) are still kept verbatim, not live.
- The text box font submenu has the same problem on phones the theme submenu had (it opens off
  screen to the left); the theme one now opens the Themes dialog there instead.

## 2026-10-04: Phase 6 (scopes and measurement)

### Done

- Scope model ported from upstream master (`packages/elements/src/scope`): `Scope`, `ScopePlot`,
  `ScopePlot2d` (X-Y), triggers, FFT, the overlays and cursor readouts, and `ScopeSerializer`
  (text `o` lines old and new style, XML `<o>`/`<p>` records, saved defaults). `ScopeManager`
  holds what upstream kept on `CirSim`: layout, stack, unstack, combine, separate, View in New
  Scope, Add to Scope. Drawing goes through a `ScopeGraphics` interface with semantic inks; the
  renderer maps them to the theme's new scope keys (`gridMajor`, `text`, `current`, `trigger`,
  `fft`, `fftGrid`, plus `traces`).
- Engine hooks: `Simulation.onTimeStep` (after each step, after wire currents) feeds the plots,
  and `canDelayWireProcessing` follows upstream.
- `Circuit` reads scopes from text and XML and saves them from the live scopes, as upstream does.
  Element numbers count upstream's full element list (unported elements keep a placeholder), so
  scopes find the right element even when earlier ones are skipped.
- UI: scopes draw on the circuit canvas in upstream's bottom area with a draggable splitter, the
  hover info beside them, or in a box at the bottom right when there are none. Element menu: View
  in New Scope, Add to Scope. Scope menu: Remove, Max Scale, Stack, Unstack, Combine, Remove
  Plot, Reset, Export CSV, Properties. A Scopes menu arranges them all. The properties dialog
  covers plots, X-Y, vertical scale (auto, max, manual per channel, position, AC/DC, divisions),
  speed, trigger, the info shown and a label. Mouse wheel over a scope changes its speed, alt or
  middle drag moves a plot, double-click opens properties, undo covers every scope change.
- Acceptance: `pnpm golden:scopes` loads every bundled upstream example that has scopes (259
  files, 550 scopes) in the reference build and records upstream's save in
  `fixtures/scopes/upstream-examples.json`; `tools/golden/src/scopes.test.ts` loads the same
  files here and requires our `<o>` records to match. 440 scopes restore identically; the other
  110 show elements not ported yet and are dropped with a warning (docs/DEVIATIONS.md). Unit
  tests in `packages/format/src/scopes.test.ts`, browser tests in `packages/app/e2e/scopes.spec.ts`.
- On phones the app bar menus scroll sideways instead of widening the page (the Scopes menu made
  them overflow).
- Scope card look (Gady chose all seven restyle ideas, 2026-10-04), drawn by
  `packages/elements/src/scope/ScopeCardView.ts` from the same data and scales as the ported
  `Scope.draw`. Each scope sits in a card with a header (title, time per division, settings and
  close buttons), legend chips with live values (clicking V or I hides and shows that trace), the
  peak, frequency and other readouts, dotted minor grid lines with value labels, smooth 1.5 px
  traces with a shaded min/max band, and a crosshair that reads every trace (drag still measures
  Δt and Δ). The info text gets a card of its own. On screens under 600 px one scope column shows
  at a time, with numbered tabs and a sideways swipe. Themes choose the look with the new
  `style.scopeLook` key (`cards` for Dark and the community themes, `classic` for Classic) and
  color the card with `scope.card`.
- Undocked scopes (Gady, 2026-10-04): `ScopeElm` (dump type 403) ported in
  `packages/elements/src/scope/ScopeElm.ts`, loaded from text and XML and saved with its `<o>`
  inside the element, so upstream's `multivib-a` and `qam-256` now load them. Scope menu Undock
  Scope and Dock Scope, element menu View in New Undocked Scope. In the card look each is a card on
  the circuit with a leader line to what it shows, a six-dot handle to drag it by and a resize
  grip; buttons, chips, crosshair and measuring work as on docked cards.
- The info box in the corner uses the monospace font and only grows while it shows the same
  element, so it no longer jitters (card look). The speed sliders moved into a popover behind a
  speed button beside Reset.
- Spectrum view (card look): the cursor snaps to peaks and reads their frequency and level, the
  strongest peak is labeled, and dragging measures Δf.
- Last round (Gady, 2026-10-04): a freeze button on scope cards; Ctrl+wheel and two-finger pinch
  zoom the time scale; the time cursor snaps to peaks, troughs and crossings and reads period and
  frequency; a selected undocked card's leader end drags onto a post of what it shows (saved as
  `lp`). Feedback animations across the app: cards fly when docked and undocked and grow in when
  new, elements pop in and fade out, a ring marks newly joined ends, toasts for undo and redo,
  pressed buttons, Run/Stop icon turn, and panels, menus, dialogs and the toast slide or fade in.
  All of it respects reduced motion.
- Follow-ups (Gady, 2026-10-04): moving an undocked card no longer opens the property panel (it
  leaves scope cards out); the property panel has View in new scope and View in new undocked
  scope buttons; scope chip and cursor values keep three decimals and a sign space so they don't
  jump; the card look draws the spectrum as one smooth antialiased line over a faint fill; on
  phones the Circuits menu is a full-screen sheet with search and groups that open in place.

### Next

- Phase 7: theme system complete.

### Open issues

- Sliders (`38` lines, `<adj>`) are still kept verbatim, not live.

## 2026-10-02: Phase 5 (editor)

### Done

- Editing model ported from upstream `MouseManager` (`packages/app/src/editor/Editor.ts`): add,
  select, drag selected, drag post, drag row and column (alt+shift, alt+meta), pan (alt or middle
  drag, touch on empty space), grid snap, upstream's picking (`POSTGRABSQ`, `MINPOSTGRABSIZE`),
  post stretching, wire splitting where a wire or post ends on a wire and where a new wire crosses
  a junction (`wireDraggingDone`), rotate (upstream's flip pair about the snapped centre), mirror,
  swap terminals, duplicate, split wire, and switch toggling (`doSwitch`). The geometry methods
  (`drag`, `move`, `movePoint`, `flipX/Y/XY`, `flipPosts`, `creationFailed`, `dragPlace`,
  `getHandleGrabbedClose`, `noDiagonal` ...) moved onto `CircuitElm` and the tier-1 subclasses.
- Undo and redo (`History.ts`) are commands that, like upstream's `UndoManager`, restore whole-circuit
  XML snapshots; one step per drag, edit, paste or command, capped at 200.
- Copy, cut, paste and duplicate use upstream's clipboard text (`copyOfSelectedElms`, elements in
  reverse) in localStorage under upstream's `circuitClipboard` key; paste reads it with RC_RETAIN
  semantics (`Circuit.readRetain`) and offsets it clear of the original.
- Property panel generated from upstream's `EditInfo` schemas, ported for every tier-1 element
  (`packages/elements/src/edit`): numbers with upstream unit parsing and E12 steppers, text,
  checkboxes and choices, including the fields that rebuild the panel (`newDialog`). Edits apply
  while the circuit runs and undo like any other edit.
- UI: a searchable palette grouped like upstream's Draw menu with live previews (click to arm,
  then drag on the canvas, or drag straight onto it), the property panel with rotate, mirror,
  swap, duplicate and delete, a right-click menu, Edit menu, undo and redo buttons, and Save,
  Export link, Export text and Import text dialogs. Narrow screens get the panels as overlays.
- Keyboard: upstream's element keys (`w r g c L s b v V z l n p N P a t d`), Ctrl/⌘ Z, Y, X, C,
  V, D, A, S, O, Delete and Backspace, arrows to nudge, Escape, space to run and stop, Enter to edit
  the selection, `?` for the list.
- Save writes upstream's XML to a `.txt` file (upstream's default name). Export link gives a `ctz=`
  link for this app and the same one for falstad.com.
- Acceptance: `packages/app/e2e/editor.spec.ts` covers select and drag, building a running circuit
  from the palette and keys, editing a value while running, copy, paste, delete, rotate,
  rubber-band selection, undo, redo, save and export links. `packages/app/e2e/compat.spec.ts`
  runs against the reference build: a circuit built here with the mouse opens in upstream from the
  exported link and upstream saves it byte for byte the same; a circuit loaded and extended with
  the mouse in upstream opens here and saves identically; all 23 golden circuits save the same in
  both apps and upstream reads our saves back unchanged. The compat tests skip when
  `.reference-site/` is missing (CI does not build it). Unit tests cover the editor in
  `packages/app/src/editor/editor.test.ts`.

### Next

- Phase 6: scopes and measurement (scopes, hover info).

### Open issues

- `cct=` links are read but not written: upstream saves XML, and its `cct=` reader splits the
  query on `=` and does not decode `%3D`, so an XML circuit cannot travel in `cct=`. Export uses
  `ctz=`, which upstream reads.
- UI choices that differ from upstream on purpose (listed in the `Editor.ts` header): a click
  selects the element under the mouse and shift-click toggles; dragging an unselected element
  moves just it; keyboard commands act on the selection, falling back to the hovered element; the
  switch hit area includes its bottom and right edges so a click on the line a closed switch
  lies on toggles it.
- Not ported yet: model editing (the diode, transistor and MOSFET "Edit Model" buttons) and lead
  splitting (`splitLeadsAt`).
- Upstream names a `v` element read from a file `VoltageElm`; this app names it `DCVoltageElm`
  (the palette's class). The saved file is the same.
- The production bundle is 653 KB of JS (197 KB gzipped); still one chunk.

## 2026-10-02: Material restyle, Dark default, bundled fonts (between Phases 4 and 5)

### Done

- The owner asked for a Material Design look, Dark as the default theme and a better font.
- UI chrome restyled on Material 3 lines while keeping React + Radix + Zustand (no component
  library, so PLAN.md section 3 is unchanged): a top app bar with the circuit title and the File,
  Circuits and Options menus; the canvas in a rounded surface; a bottom bar with a filled run
  button, icon buttons for reset and fit (with tooltips), Material sliders, the time readouts and
  error and warning chips. Shapes, elevation, state layers and the type scale are CSS tokens in
  `packages/app/src/styles.css`, all mixed from the theme's `ui` colors (no literals). Icons are
  inline Material Icons paths (Apache 2.0) in `Icon.tsx`.
- Fonts: Roboto (variable) for UI text and canvas labels, JetBrains Mono (variable) for component
  values on the canvas (the `value` text style now draws in the theme's `monoFont`; labeled-node
  names moved to the `units` style) and the time readouts. Both are bundled with
  `@fontsource-variable`, so themes still name families only (PLAN.md section 6).
- New built-in Classic Dots (`classic-dots`): Classic colors with a dot grid.
- Dark is the default (`DEFAULT_THEME_ID = 'dark'`, also the base for themes that name none), and
  its UI colors are now a Material 3 dark scheme from a blue seed. Settings moved to the
  `circuitjs-next.settings.v2` key: version 1 always stored Classic, so its theme is dropped and its
  other settings carry over. An e2e test covers both.

### Next

- Phase 5: editor (palette, placement, wires, selection, undo, property panel, save and links).

### Open issues

- 250 of the 367 bundled examples skip at least one element: they use tier 2 and 3 elements
  (logic inputs and outputs, gates, flip-flops, 555, transformers, controlled sources,
  subcircuits ...), which PLAN.md schedules for Phase 8. The most common are logic input `L`
  (66 examples), logic output `M` (64), inverter `I` (23), variable rail `172` and sweep `170`
  (20 and 17) and logic gates (`150`, `151`, `152` ...).
- The production bundle is 578 KB of JS plus about 330 KB of font subsets (only the subsets a
  page uses are downloaded).

## 2026-10-02: Phase 4 (renderer and viewer)

### Done

- Decisions (PLAN.md section 3): the owner confirmed React with Radix headless components and
  Zustand, and chose to keep the engine on the main thread for now (revisit in Phase 9).
- `packages/theme`: theme schema (`Theme`, deep-partial `ThemeInput`) validated with zod (color
  syntax, text and font limits, 16 KB cap), color helpers that truncate like upstream's `Color`
  mixing, the Classic (upstream colors) and Dark ("Night Bench") built-ins, `resolveTheme`,
  `parseThemeJson` (never throws) and CSS variables for the UI.
- `packages/elements/src/view`: the `Painter` interface with semantic inks (role, voltage,
  voltage gradient, data color) and views for every tier-1 element plus output and text. Geometry,
  value text and labels follow upstream's `draw` methods (`interpPoint` rounding, `calcLeads`,
  `drawValues`, `drawLabeledNode`); values use GWT's number formatting.
- `packages/render`: Canvas 2D painter (HiDPI, theme stroke width and dot size), the 201-step
  voltage palette (`getVoltageColor`), current dots (`updateDotCount`, `currentMult`), grid,
  posts and bad-connection marks, pan and zoom with upstream's `centerCircuit` fit, and hit
  testing.
- `packages/format`: upstream URL handling (`cct`, `ctz`, `startCircuit`, `startLabel`,
  `startCircuitLink`, `running`, with `QueryParameters` decoding) and `Circuit.reset()`.
- `packages/app`: React + Radix + Zustand viewer. File menu (open file, open link), the upstream
  example list from `setuplist.txt` (served from the reference submodule in dev, copied into the
  build), run/stop, reset, fit, speed and current-speed sliders, display options (dots, voltage
  colors, values, small grid, IEC resistors, ohm sign, conventional current) and the theme picker.
  Clicking a switch toggles it. Convergence failures stop the run and show upstream's message.
- Checked against the reference build with screenshots side by side: the default LRC example,
  two galleries of every tier-1 element in all orientations, and several golden circuits look the
  same (positions, labels, values, colors, dot speed).
- Acceptance: `packages/app/e2e/viewer.spec.ts` loads the default example, `cct=`, `ctz=` and
  `startCircuit=` links and checks they animate; switches Classic, Dark and back at runtime and
  checks the canvas background and UI variables change with no reload; checks run/stop, reset,
  switch clicks, the open-link dialog and a convergence failure. The no-color-literal lint passes.
  CI now checks out the submodule so the examples are available to the e2e tests.

### Next

- Phase 5: editor (palette, placement, wires, selection, undo, property panel, save and links).

### Open issues

- Not drawn yet: power display mode (option flag 8), probe meter modes other than voltage (they
  need the probe statistics), and upstream's `whiteBackground` (waits for a Light theme, Phase 7).
- Small display differences from upstream: potentiometer values appear while paused (we analyze
  on load), and the probe circle takes the hover color when highlighted.
- Hover info and scopes come in Phase 6; scope and slider records are still kept but not shown.
- The production bundle is one 570 KB chunk; split it when the editor lands.

## 2026-10-02: Phase 3 (nonlinear elements and convergence)

### Done

- `packages/elements`: diode (`DiodeElm` plus the embeddable `Diode` junction used by the MOSFET
  body diodes), LED, zener, bipolar transistor (`TransistorElm`, `NTransistorElm`,
  `PTransistorElm`; Gummel-Poon with junction capacitance), MOSFET (`MosfetElm`, `NMosfetElm`,
  `PMosfetElm`; gate capacitance, body diodes, legacy flags), ideal op-amp (with the seeded
  `getrand` on its convergence path), rail (`R`), push switch, and text (`x`, load and save only;
  tier 2, but upstream examples use it). Ported from `master`, with the `dev-ts` node-voltage
  model; drawing geometry is limited to post positions.
- Device models: `DiodeModel`, `TransistorModel`, `MosfetModel` with upstream's built-ins, text
  records `34` and `32`, XML `<dm>`, `<tm>`, `<mm>`, legacy parameter models (`fwdrop=0.6`,
  `old-mosfet`), and save before the first element that uses them, as upstream does. They live in
  a `ModelLibrary` per `Simulation` (`modelsFor(sim)`), see docs/DEVIATIONS.md.
- Element types now get the simulation they join (`create(x, y, sim)`, `load(..., st, sim)`,
  `createCe(..., sim)`, `constructElement(name, x, y, sim)`), since model lookups happen while
  loading. Voltages read from a file (transistor junctions, op-amp inputs) are held on placeholder
  nodes and carried onto the real nodes by `setNode`, the dev-ts mechanism, so the first iteration
  starts where master's per-element copy would.
- Iteration, convergence checks and adaptive timestep were ported with the engine in Phase 2; no
  engine change was needed. Three new golden circuits exercise them:
  `mosfet-halving` (a 1 kV step on an off MOSFET needs about 1000 subiterations because the MOSFET
  limits each iteration to 0.5 V, so the adaptive timestep halves ten times to 4.9 ns and doubles
  back; closes the Phase 1 open issue), `convergence-fail` and `convergence-fail-adaptive`
  (a 100 kV step on a beta-2 MOSFET; both stop with `Convergence failed!` at step 1001, the
  adaptive one after halving below the minimum timestep). Recorded locally with the pinned
  Chromium 141; `pnpm golden:check` reproduces all 35 fixtures.
- Acceptance: `pnpm golden:compare --engine next tag:nonlinear` passes all 19 nonlinear circuits
  (the 16 from Phase 1 and the 3 above), most bit for bit, worst 2.7e-5 of tolerance. All 35
  golden circuits pass, their saved XML matches upstream's export (scopes and sliders aside), and
  XML load then save is byte-identical. `tools/golden/src/next.test.ts` checks all of it in
  `pnpm check`. Non-convergence ends in upstream's stop state and message at the same step.
- docs/ELEMENTS.md port status filled in for tier 1.

### Next

- Phase 4: renderer and viewer. PLAN.md section 3 says to confirm the UI framework (React with
  headless components) with the owner before starting.

### Open issues

- Loaded element voltages share nodes: if two elements on one node load different voltages (say
  two transistors with saved junction voltages on a shared node), master starts each from its own
  copy while here the last one loaded wins. No example circuit seen does this; add a golden
  circuit if one turns up.
- Not ported yet (unchanged from Phase 2): rail variants (AC, square, variable, clock), bus-width
  detection, probe statistics, custom logic and subcircuit models. Relay models (`<rlm>`) are
  skipped with a warning.
- The model edit dialogs, `getModelList` and `pickName` wait for the editor (Phase 5).

## 2026-10-02: Phase 2 (engine core and linear elements)

### Done

- Phase 1 follow-up: the reference-build job on `main` failed because CI's Chromium (153) re-recorded
  12 fixtures with last-bit differences from the local one (141). Recording is now pinned to Chromium
  141.0.7390.37 (`REFERENCE_BROWSER`, installed in CI with Playwright 1.56.1) and refuses any other
  version unless `GOLDEN_ANY_BROWSER=1`. Fixtures were re-recorded with two new fields:
  `reference.browser` and `export` (upstream's own XML save of the circuit after loading). The
  reference-build job passed with the pin on the Phase 2 pull request.
- `packages/engine`: `Simulation` (wire closure, node numbering, ground and unconnected nodes,
  closures into independent matrices, validation with repair passes, stamping, subiterations,
  adaptive timestep, wire currents), `SimElement`, `FindPathInfo`, dense LU, the EJML-derived
  sparse LU (used from 150 rows), and an exact `java.util.Random`. Ported from `dev-ts` 7ec858d
  (now pinned in docs/UPSTREAM.md) and checked against `master`; where they differ the port follows
  `master` (capacitors skip the current update on node-voltage changes, ground-node voltage reset).
- `packages/elements`: wire, ground, resistor, capacitor, inductor, voltage source (all waveforms;
  `VoltageElm`, `DCVoltageElm`, `ACVoltageElm`), current source, switch, labeled node, probe,
  output, potentiometer. Text and XML load and XML save ported from `master`. Registry mirrors
  upstream's `register`/`createCe`/`constructElement`, including `v` loading as `VoltageElm` from
  text and `DCVoltageElm` from XML.
- `packages/format`: DOM-free XML parser and upstream's `prettyPrint`; `Circuit` reads text and XML
  (`$`, `h`, elements; `o`, `38`, `<o>`, `<adj>` kept for later) and saves XML byte for byte as
  upstream; `runCircuit(text, { seed, stepsPerSample, samples })` returns the golden fixture shape.
  It steps by count, like the harness, instead of the `tEnd, sampleTimes` signature PLAN.md sketched.
- Golden engine `next` (`pnpm golden:compare --engine next`). Acceptance:
  - all 16 `linear` circuits pass (most bit for bit; worst difference 1e-9 of tolerance);
  - saving each loaded linear circuit reproduces upstream's export, scopes and sliders aside
    (docs/DEVIATIONS.md), and XML load then save is byte-identical for all 16.
    Both run in `pnpm check` (`tools/golden/src/next.test.ts`).
- `noise-rc` passes, so GWT's `java.util.Random` does match the JDK sequence (Phase 1 open issue).
- Nonlinear circuits run without hanging and fail the comparison cleanly (unknown elements are
  skipped with a warning).

### Next

- Phase 3: diode, LED, zener, BJT, MOSFET, op-amp, push switch; iteration and convergence; the
  diode and transistor model records (`34`, `32`, `<dm>`, `<tm>`, `<mm>`). Potentiometer is done.
- Add a golden circuit that exercises timestep halving (Phase 1 open issue, still open).

### Open issues

- Not ported yet: rails (`RailElm` and variants), text, bus-width detection (`detectBusWidths`, for
  digital buses), probe measurement statistics (RMS, min/max, frequency; display only), custom logic
  and subcircuit model records. The loader warns and skips them.
- Element voltages live on the nodes (dev-ts model) instead of a per-element copy as in `master`.
  `master`'s `InductorElm.reset()` also zeroes that copy, which can only matter when validation
  resets an inductor after a topology change. No golden circuit covers that yet; add one with a
  switch event when the harness supports switch events.

## 2026-10-02: Phase 1 (golden test harness)

### Done

- Reference patch `tools/reference-patch/harness.patch` (two files, about 130 lines), applied by the
  Docker build. Adds `CircuitJS1.harness`: `setSeed`, exact `step(n)` independent of wall-clock time,
  and a dump of every node voltage and every element's voltages and currents. Image tag and
  `.reference-site/reference-build.json` now carry the patch SHA. Gradle dependencies are cached in a
  BuildKit cache mount (Maven Central returned 429 on repeated builds).
- `tools/golden/`: recorder (`pnpm golden:record`, `pnpm golden:check`), comparator
  (`pnpm golden:compare`, per-value absolute and relative tolerance, first divergence, worst value,
  structural checks), stub engine, engine interface for Phase 2.
- 32 golden circuits in `tools/golden/manifest.json`: 20 written for the harness covering every
  tier-1 element (RC, RL, RLC, divider, AC and square sources, current source, switches, labeled
  nodes and probe, noise, rectifiers, LED and zener, NPN and PNP bias, N and P MOSFET switches,
  three op-amp circuits), 10 upstream examples and 2 upstream XML auto-tests. Tagged `linear`
  (Phase 2) and `nonlinear` (Phase 3). Fixtures in `fixtures/golden/` (2.3 MB).
- Acceptance: two fresh recordings matched the committed fixtures byte for byte (`pnpm golden:check`,
  run twice). `pnpm golden:compare` against the stub fails all 32 circuits with a clean report and
  exit code 1. Loading through `cct=` and through `importCircuit` gave identical traces.
- Unit tests for the comparator, fixture JSON and manifest, plus fixture consistency tests (one
  fixture per manifest entry, recorded from the current circuit text, pinned upstream SHA and current
  patch SHA; each fixture passes against itself and fails against the stub).
- The reference-build workflow now also runs on pull requests touching the patch, the harness or the
  fixtures, and runs `pnpm golden:check` after the build.

### Next

- Phase 2: port the engine core and linear elements from upstream `dev-ts`, add a headless runner
  and register it as a golden engine in `tools/golden/src/engines/index.ts`. Target: every circuit
  tagged `linear` passes `pnpm golden:compare --engine <name> tag:linear`.

### Open issues

- Fixtures come from GWT's emulation of `java.util.Random`. It is meant to reproduce the JDK
  sequence, but this was not checked. `noise-rc` will show it when the TS `java.util.Random` lands.
- `rectifier-adaptive` sets the adaptive timestep flag but converges, so no golden circuit yet
  exercises timestep halving. Add one in Phase 3 (a circuit that fails to converge at the full step).

## 2026-10-02: Phase 0 (setup and reconnaissance)

### Done

- Monorepo: pnpm workspaces with six empty packages, strict TypeScript 6.0, ESLint 10 with
  dependency-boundary and no-color-literal rules (the rule has its own tests), Prettier, Vitest,
  Playwright smoke test, GitHub Actions CI (`.github/workflows/ci.yml`).
- Upstream pinned as a submodule at `5a707168` (docs/UPSTREAM.md).
- Reference app builds in a digest-pinned Docker image (Gradle 8.7, JDK 8, GWT 2.8.2) and runs in
  Chromium: `pnpm reference:build`, `pnpm reference:serve`, `tools/reference-build/smoke.mjs`.
- docs/ELEMENTS.md: 154 element classes with dump types, XML tags, linearity, hooks, tiers.
  Generated by `tools/recon/`.
- docs/ENGINE-NOTES.md: walkthrough of analysis, stamping, LU, iteration, timestep, currents.
- PLAN.md section 4 checked item by item. CLAUDE.md created.

### Next

- Phase 1: golden test harness. Seed upstream's `java.util.Random` in the reference patch, step
  deterministically via the `ontimestep` hook, record traces.

### Open issues

- Decided 2026-10-02: the engine is ported from upstream's `dev-ts` TypeScript branch, not the Java
  code (PLAN.md section 3). Phase 2 should pin a `dev-ts` commit alongside the `master` pin.
- Upstream now saves circuits as XML. The `format` package must read both formats; whether it
  also writes the legacy text format is open.
- The reference-build workflow passed on GitHub on 2026-10-02 (manual run). It triggers on pushes that touch `reference/` or `tools/reference-build/`, or by hand.
- The offline-distribution fallback for the reference build is documented but untested.
