# Formula boxes

- Upstream: a text box (TextElm) draws its lines as plain text; nothing typesets math.
- Ours: the palette's Formula places a text box in math mode. Each line is LaTeX, typeset with
  MathJax (SVG output, drawn as vectors on the canvas and in SVG/PNG export). `\V{out}` shows the
  voltage at a labeled node, and `\V`, `\I`, `\P` the voltage, current and power of the box's
  linked parts (`\V[2]` for the second), each in a fixed-width slot. Saved as a plain `<x>` text
  box with two extra XML attributes: `tex="1"` (math mode) and `tl` (the linked parts' numbers in
  the element list), only when set. The text keeps its backslashes doubled (`\\frac`), so
  upstream's escape handling shows the LaTeX source. Requested by the owner (2026-10-11).
- Why: upstream ignores unknown attributes, so the file opens there as a text box showing the
  formula's source, e.g. `I = \frac{V}{R} = \I`.
- Golden test: none (display only); `packages/format/src/formulaBoxes.test.ts` covers the round
  trip, what upstream would show, linked parts through copy and paste, and the live values;
  `packages/render/src/math.test.ts` the typesetting and that every live value has one width.
