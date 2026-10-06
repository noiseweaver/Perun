# Progress

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

### Next

- Gady to try the preview artifact and decide whether to keep, change or drop it.
- Not covered yet: tapped and custom transformers, LEDs and varactors, polarized capacitor plate
  shape. Everything sits behind the one Show fields switch; separate switches may be wanted.

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
  is 28 px.
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
- `style.roundness` (0 to 2) in themes, with a slider in the theme editor: scales the Material
  shape tokens and the scope cards' corners, large radii faster than small ones; below 1 round
  buttons become rounded squares.

### Open issues

- The iOS height fix still needs checking on a real iPhone after the deploy.
- The 28 px top gap needs checking on an iPhone.
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
