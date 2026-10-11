# 2026-10-11: labelled boxes

Branch `claude/labelled-boxes-cylntw`. Gady asked for boxes around parts of a circuit to label
them, since a text box alone is not enough.

## Done

- Box (BoxElm) properties: Title, Title size, Title position (on the border, centered on it, or
  inside), Color (theme default or the theme's red, orange, green, blue or purple), Border
  (dashed, solid, dotted, none) and Shade inside. Saved as extra XML attributes only when set
  (docs/deviations/box-titles.md). New boxes start titled "Label".
- Titles draw bold in the theme's monospace font; a title on the border leaves a gap in the line.
  Shading draws under the whole circuit (`ElementView.drawBehind`) at 12% so parts stay readable.
- All four corners resize a box; a highlighted box shows its corner handles, and a box with no
  border shows a dashed outline while highlighted so it can still be found.
- Area selection selects a box only when it holds the whole box, as upstream's `selectRect`
  does, so dragging over the parts inside a box no longer grabs the box.
- Theme key `circuit.boxes` (five named colors) in every built-in, the theme editor (Boxes
  group), contrast checks (as text, 4.5:1) and the generated theme docs.
- Box and line elements no longer offer View in scope; the property panel shows a box whole.
- New strings in all 16 languages (by Claude, not native-checked).

## Next

- None planned. Possible later: rounded corners, a title along the bottom edge.

## Open issues

- Titles wider than their box run past the border; resize the box to fit.
