# Themes

A theme is a small JSON file that sets every color the app draws with, plus line widths, the grid,
fonts and the scope look. Themes are data only: no CSS, no URLs, no scripts. The app validates every
theme before it touches the page, whether it comes from a file, a link or the browser's storage.

The machine-readable schema is [theme.schema.json](theme.schema.json) (JSON Schema draft 2020-12),
generated from the zod schema in `packages/theme/src/schema.ts`. The key reference at the end of
this page is generated from the same source. Run `pnpm theme:docs` after changing the schema; a
unit test fails while either file is out of date.

## A minimal theme

Every key except `schemaVersion` is optional. Keys you leave out come from the built-in theme named
in `meta.base` (Dark when there is none), so a theme only needs what it changes:

```json
{
  "$schema": "https://github.com/noiseweaver/perun/blob/main/docs/theme.schema.json",
  "schemaVersion": 1,
  "meta": { "name": "Night Bench", "author": "gady", "base": "dark" },
  "canvas": { "background": "#1e222a" },
  "circuit": { "voltage": { "negative": "#e06c75", "positive": "#98c379" } },
  "ui": { "accent": "#61afef" }
}
```

The `$schema` line is optional. It lets editors such as VS Code check the file and complete keys as
you type; the app ignores it.

## Rules

- Colors are hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()` or `hsl()`/`hsla()`,
  at most 64 characters. Named colors (`red`) and anything else are rejected.
- Fonts are CSS font family lists: names, quotes, spaces, commas and hyphens only. The app bundles
  Roboto and JetBrains Mono; other fonts work if the viewer has them installed.
- Text fields (name, author, description, fonts) are capped at 200 characters, `scope.traces` holds
  1 to 16 colors, `style.strokeWidth` is 0.5 to 8, `style.dotRadius` 0.5 to 6 and
  `style.roundness` 0 to 2.
- A theme file is at most 16 KB. Unknown keys are dropped, so a newer theme still opens in an older
  app as far as it can.
- `meta.base` must name a built-in. Anything else falls back to Dark.
- Symbol style (IEC or ANSI resistors) and current direction are the viewer's own settings, not part
  of a theme.

## Built-in themes

| Id                 | Name             | Notes                                                                   |
| ------------------ | ---------------- | ----------------------------------------------------------------------- |
| `dark`             | Dark             | The default. Material 3 dark scheme from a blue seed, muted voltages    |
| `light`            | Light            | Material 3 light scheme, deep voltage colors with 3:1 contrast on white |
| `classic`          | Classic          | The CircuitJS1 look: black, green and red voltages, yellow current      |
| `classic-dots`     | Classic Dots     | Classic with a dot grid                                                 |
| `high-contrast`    | High Contrast    | Black and white, bright voltages, thick lines and large current dots    |
| `colorblind-safe`  | Colorblind Safe  | Blue to orange voltages and Okabe-Ito accents instead of red and green  |
| `nord`             | Nord             | After the Nord palette                                                  |
| `solarized-dark`   | Solarized Dark   | After Solarized                                                         |
| `gruvbox-dark`     | Gruvbox Dark     | After Gruvbox                                                           |
| `adwaita-dark`     | Adwaita Dark     | After GNOME's libadwaita dark style                                     |
| `solarized-light`  | Solarized Light  | After Solarized's light mode                                            |
| `dracula`          | Dracula          | After Dracula                                                           |
| `monokai`          | Monokai          | After Monokai                                                           |
| `tokyo-night`      | Tokyo Night      | After Tokyo Night                                                       |
| `catppuccin-mocha` | Catppuccin Mocha | After Catppuccin's dark flavor                                          |
| `catppuccin-latte` | Catppuccin Latte | After Catppuccin's light flavor                                         |
| `rose-pine`        | Rosé Pine        | After Rosé Pine                                                         |
| `everforest-dark`  | Everforest Dark  | After Everforest                                                        |
| `github-dark`      | GitHub Dark      | After GitHub's dark mode (Primer colors)                                |
| `github-light`     | GitHub Light     | After GitHub's light mode (Primer colors)                               |
| `obsidian-dark`    | Obsidian Dark    | After Obsidian's default dark theme                                     |
| `obsidian-light`   | Obsidian Light   | After Obsidian's default light theme                                    |

The palette themes (Nord onwards) all map colors the same way: the palette's red and green for
voltages, its yellow for current, its blue and cyan for selection and hover. Where a palette
color fails a contrast check it is nudged, with a comment in `builtins/palettes.ts`.

Every built-in passes the contrast checks below.

## Sharing

**Files.** Options > Theme > Themes… lists every theme with buttons to customize or edit it, copy a
link, export it as `<name>.theme.json`, and delete it (your own themes only). Exported files hold
the complete theme. Import theme file… (in the same menu, or the Themes dialog) reads a file, adds
it to your themes and switches to it. A file that fails validation is refused with the first few
problems, like `canvas.background: not a hex, RGB or HSL color`.

**Links.** `?theme=<value>` carries a theme in the page URL. The value is
`base64url(deflate(json))`: the theme reduced to its base plus what differs from it, compressed with
raw DEFLATE (RFC 1951) and encoded as unpadded base64url (RFC 4648 section 5). A theme that changes
a handful of colors fits in about 100 characters.

Opening a theme link never changes anything by itself. The app shows the theme as a preview with a
banner offering:

- **Apply**: add it to your themes and use it.
- **Save**: add it to your themes and keep your current theme.
- **Dismiss**: go back to your theme.

**Circuit and theme together.** File > Export link… has an "Include my theme" box. Ticked, the link
for this app carries `ctz=` (the circuit, as upstream writes it) and `theme=`. The receiver sees the
circuit in the sender's theme as a preview, with the same banner. The Falstad CircuitJS link never
carries a theme. Upstream ignores unknown parameters anyway, so a combined link pasted there still
opens the circuit.

**Your themes** are kept in the browser's IndexedDB (database `circuitjs-next`, store `themes`). The
active one is also cached in localStorage so the first frame after a reload already uses it. Both
are read back through the same validation as files.

## The theme editor

Options > Theme > Edit theme… opens the editor on the current theme. Customizing a built-in makes a
copy named "Custom <name>"; editing one of your themes changes it in place when you save.

- The sample circuit at the left (an AC source charging a capacitor, an LED, a labeled output, a
  text box and a scope) runs live in the draft theme. The rest of the app shows the draft too, until
  you save or cancel.
- "Start from" replaces every color and style setting with a built-in's, keeping the name.
- Each color has a picker and a text field that takes any accepted color syntax. A value that does
  not parse is marked and not applied. The picker has no alpha; picking keeps the color's alpha.
- Contrast warnings follow WCAG 2: text needs 4.5:1 against its background (1.4.3), and graphics
  such as voltage colors, wires, posts and current dots need 3:1 (1.4.11). Translucent colors are
  judged over their background. Checked pairs:

  | Color                                                                        | Background                                             | Minimum |
  | ---------------------------------------------------------------------------- | ------------------------------------------------------ | ------- |
  | `ui.text`                                                                    | `ui.surface`, `ui.surfaceAlt`                          | 4.5     |
  | `ui.textMuted`, `ui.danger`                                                  | `ui.surface`                                           | 4.5     |
  | `ui.surface` (text on primary buttons)                                       | `ui.accent`                                            | 4.5     |
  | `circuit.text`, `circuit.label`                                              | `canvas.background`                                    | 4.5     |
  | `scope.text`                                                                 | `scope.background` (and `scope.card` in the card look) | 4.5     |
  | `ui.accent`                                                                  | `ui.surface`                                           | 3       |
  | `circuit.voltage.*`, `component`, `post`, `currentDot`, `selection`, `hover` | `canvas.background`                                    | 3       |
  | `scope.traces[0]`, `scope.current`                                           | `scope.background`                                     | 3       |

  Warnings show beside each field and in a list under the preview; clicking one jumps to its field.
  They are advice: a theme with warnings still saves.

## Safety

Theme data reaches the page in three ways: as CSS custom properties on the root element (set with
`style.setProperty`), as canvas fill and stroke colors, and as text rendered by React. Validation
makes sure only colors and font family names get there. The decoder for links also caps the link
length (24 KB), stops inflating past 16 KB of output (so a small compressed bomb can't fill memory),
rejects malformed UTF-8 and only then parses JSON. A `meta.base` such as `__proto__` can't reach
object prototypes.

`packages/theme/src/fuzz.test.ts` feeds the decoders thousands of random JSON values, mutated and
corrupted built-ins, hostile JSON text (deep nesting, prototype keys, CSS and markup in every
string), random and damaged links and compression bombs. Every input must come back as an error or
as a complete, valid theme whose CSS variables hold no CSS syntax, markup or URLs, and nothing may
throw.

## Key reference

<!-- keys:start (generated by pnpm theme:docs) -->

| Key                        | Type                    | Dark                                               | Meaning                                                                                                                                                                              |
| -------------------------- | ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`            | `1`                     | `1`                                                | Always 1.                                                                                                                                                                            |
| **meta**                   |                         |                                                    | About the theme.                                                                                                                                                                     |
| `meta.name`                | text                    | `"Dark"`                                           | Name shown in the theme menu.                                                                                                                                                        |
| `meta.author`              | text                    | `"Perun"`                                          | Who made the theme.                                                                                                                                                                  |
| `meta.description`         | text                    | `"Low glare dark theme with muted voltage colors"` | One line about the theme.                                                                                                                                                            |
| `meta.base`                | built-in id             | `"dark"`                                           | Id of the built-in theme the missing keys come from, such as dark (the default), light or classic. Any id in the built-in themes table works.                                        |
| **canvas**                 |                         |                                                    | The circuit area.                                                                                                                                                                    |
| `canvas.background`        | color                   | `"#191c22"`                                        | Circuit area background.                                                                                                                                                             |
| `canvas.grid`              | color                   | `"#2b2f37"`                                        | Grid dots or lines.                                                                                                                                                                  |
| `canvas.gridMajor`         | color                   | `"#363b45"`                                        | Every eighth grid line or dot.                                                                                                                                                       |
| **circuit**                |                         |                                                    | Elements and wires.                                                                                                                                                                  |
| **circuit.voltage**        |                         |                                                    | Voltage coloring: wires blend between these three stops.                                                                                                                             |
| `circuit.voltage.negative` | color                   | `"#e06c75"`                                        | Most negative voltage (at minus the voltage range).                                                                                                                                  |
| `circuit.voltage.zero`     | color                   | `"#7f848e"`                                        | Zero volts.                                                                                                                                                                          |
| `circuit.voltage.positive` | color                   | `"#98c379"`                                        | Most positive voltage.                                                                                                                                                               |
| `circuit.currentDot`       | color                   | `"#e5c07b"`                                        | Moving current dots.                                                                                                                                                                 |
| `circuit.component`        | color                   | `"#c8ccd4"`                                        | Element bodies and wires when voltage colors are off.                                                                                                                                |
| `circuit.componentMuted`   | color                   | `"#7f848e"`                                        | Secondary element parts: source and LED circles, transistor envelope.                                                                                                                |
| `circuit.selection`        | color                   | `"#61afef"`                                        | Selected elements and the selection box.                                                                                                                                             |
| `circuit.hover`            | color                   | `"#56b6c2"`                                        | The element under the pointer.                                                                                                                                                       |
| `circuit.post`             | color                   | `"#c8ccd4"`                                        | Element end posts and junction dots.                                                                                                                                                 |
| `circuit.text`             | color                   | `"#c8ccd4"`                                        | Values drawn next to elements.                                                                                                                                                       |
| `circuit.label`            | color                   | `"#abb2bf"`                                        | Labels: labeled nodes, outputs, text boxes, op-amp symbols.                                                                                                                          |
| `circuit.badConnection`    | color                   | `"#e06c75"`                                        | Posts that touch an element without connecting to it.                                                                                                                                |
| `circuit.electricField`    | color                   | `"#61afef"`                                        | Field lines between capacitor plates (Show fields).                                                                                                                                  |
| `circuit.magneticField`    | color                   | `"#c678dd"`                                        | Field loops around inductors (Show fields).                                                                                                                                          |
| `circuit.energy`           | color                   | `"#d19a66"`                                        | Stored energy glow and energy flow arrows (Show fields).                                                                                                                             |
| `circuit.heat`             | color                   | `"#ff6b4a"`                                        | Glow and temperature labels on hot parts (Heat visualization).                                                                                                                       |
| **scope**                  |                         |                                                    | Oscilloscopes.                                                                                                                                                                       |
| `scope.background`         | color                   | `"#14171c"`                                        | Plot area.                                                                                                                                                                           |
| `scope.card`               | color                   | `"#21252c"`                                        | Card around each scope, with its header and legend (card look only).                                                                                                                 |
| `scope.undockedCard`       | color                   | `"#2c313a"`                                        | Card of a scope undocked onto the circuit (card look only), drawn with a soft shadow.                                                                                                |
| `scope.grid`               | color                   | `"#343a46"`                                        | Grid lines.                                                                                                                                                                          |
| `scope.gridMajor`          | color                   | `"#4b5263"`                                        | Zero line, every tenth time line, muted plots.                                                                                                                                       |
| `scope.text`               | color                   | `"#e2e2e9"`                                        | Labels, readouts, cursor, power and other plots that are not V or I.                                                                                                                 |
| `scope.current`            | color                   | `"#e5c07b"`                                        | Current plots.                                                                                                                                                                       |
| `scope.trigger`            | color                   | `"#d19a66"`                                        | Trigger level and state.                                                                                                                                                             |
| `scope.fft`                | color                   | `"#e06c75"`                                        | Spectrum (FFT) trace and labels.                                                                                                                                                     |
| `scope.fftGrid`            | color                   | `"#5c2f34"`                                        | Spectrum grid.                                                                                                                                                                       |
| `scope.traces`             | colors, 1 to 16         | `["#98c379","#61afef","#c678dd","#56b6c2","#e0...` | The first color draws voltage plots; further plots of one kind cycle through the rest.                                                                                               |
| **teaching**               |                         |                                                    | Teaching tools: the pencil and the laser pointer.                                                                                                                                    |
| `teaching.pens`            | colors, 1 to 8          | `["#ffd166","#ff6b6b","#4cc9f0","#80ed99","#f8...` | Pencil colors for drawing on the circuit; the first is the default.                                                                                                                  |
| `teaching.laser`           | color                   | `"#ff4d4d"`                                        | The laser pointer's fading trail.                                                                                                                                                    |
| **ui**                     |                         |                                                    | The app around the canvas.                                                                                                                                                           |
| `ui.surface`               | color                   | `"#111318"`                                        | App background: bars, menus, dialogs (Material surface).                                                                                                                             |
| `ui.surfaceAlt`            | color                   | `"#1d2025"`                                        | Raised containers: panels, cards, fields (Material surface container).                                                                                                               |
| `ui.border`                | color                   | `"#44474e"`                                        | Dividers and outlines (Material outline variant).                                                                                                                                    |
| `ui.text`                  | color                   | `"#e2e2e9"`                                        | Main text (Material on surface).                                                                                                                                                     |
| `ui.textMuted`             | color                   | `"#a9acb6"`                                        | Secondary text and icons (Material on surface variant).                                                                                                                              |
| `ui.accent`                | color                   | `"#a8c7fa"`                                        | Primary buttons, checked items, focus (Material primary).                                                                                                                            |
| `ui.danger`                | color                   | `"#ffb4ab"`                                        | Errors and warnings (Material error).                                                                                                                                                |
| **style**                  |                         |                                                    | Line widths, grid and fonts.                                                                                                                                                         |
| `style.strokeWidth`        | number, 0.5 to 8        | `2.5`                                              | Width of thick lines in circuit units (CircuitJS draws them 3 wide).                                                                                                                 |
| `style.dotRadius`          | number, 0.5 to 6        | `2.5`                                              | Half the side of a current dot (CircuitJS: 2).                                                                                                                                       |
| `style.grid`               | `none`, `dots`, `lines` | `"dots"`                                           | Grid drawn behind the circuit.                                                                                                                                                       |
| `style.font`               | text                    | `"'Roboto Variable', Roboto, system-ui, sans-s...` | UI text and canvas labels: a CSS font family list.                                                                                                                                   |
| `style.monoFont`           | text                    | `"'JetBrains Mono Variable', 'JetBrains Mono',...` | Component values and numeric readouts: a CSS font family list.                                                                                                                       |
| `style.scopeLook`          | `classic`, `cards`      | `"cards"`                                          | classic draws scopes as CircuitJS does; cards puts each in a card with a header, legend and labeled axes.                                                                            |
| `style.roundness`          | number, 0 to 2          | `1`                                                | Corner rounding of the UI and scope cards: 0 square, 1 Material 3 (default), 2 extra round. Large radii change faster than small ones; below 1 round buttons become rounded squares. |

<!-- keys:end -->
