# Box titles, colors and corners

- Upstream: a box (BoxElm) is a plain grey dashed rectangle with no properties. It resizes from
  the two corners it was drawn between.
- Ours: a box has a title (on the top border, centered on it, or inside the top left corner) with
  its own size, a color picked from the theme's five box colors (`circuit.boxes`) or the theme
  default, a border style (dashed, solid, dotted or none) and optional light shading drawn under
  the whole circuit. New boxes start with the title "Label". All four corners resize it. Saved as
  the extra XML attributes `tt`, `tz`, `tp`, `bc`, `bs` and `sh`, each only when it differs from
  upstream's plain box. Requested by the owner (2026-10-11): a text box alone is not enough to
  label parts of a circuit.
- Why: upstream ignores unknown attributes, so a titled box opens there as its plain dashed box.
  The old text format has no room for them, so text exports keep only the rectangle.
- Golden test: none (display only); `packages/format/src/boxtitle.test.ts` covers the round trip,
  that nothing extra is saved for a plain box, and the four corner handles.
