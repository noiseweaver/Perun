# 2026-10-29: Placing without the properties panel, and wire ends a finger can grab

Branch `claude/project-thread-2u7l0f`. Gady asked for two things while placing parts on a phone:
the properties panel shouldn't open by itself after a part is placed (placing comes first), and
wire ends were hard to grab by touch, often needing several tries.

## Done

- A part dropped from the palette, the quick pick strip, the radial wheel or the part search is
  no longer selected, so its properties stay shut (drawing a part out in "Drag to place" mode
  already worked this way, as upstream does). Options > "Open properties after placing a part"
  (setting `editAfterPlace`, `editor`, off by default, remembered) brings back the old behaviour.
  Strings in all 16 languages (by Claude, not native-checked).
- Touch reach (`Editor.touchReach`, set per press from `TOUCH_REACH` = 20 CSS px at the current
  zoom; 0 for a mouse or pen, which keep upstream's few units):
  - a touch that lands on no part picks the nearest post within reach, else the nearest part
    within reach, instead of panning the view. A wire is drawn 3 units either side of its line,
    so before this a finger mostly missed it.
  - a wire's end is grabbed within reach of it, up to a third of the wire's length, so the
    middle third still moves the whole wire; the nearer end wins on short wires.
  - a finger grabs a wire end even while another part is selected (upstream, and the mouse,
    then move the whole wire first and need a second try).
- A tap on a wire end or a box corner without dragging now selects that part, mouse or touch.
  Before, it did nothing, which looked like a missed tap.
- Tests: editor.test.ts (placed parts unselected unless asked, touch reach on wire ends, middle
  third moves the wire, grabbing with another part selected, tap selects), editor.spec.ts (a
  finger 14 px off a wire end drags it), wheel.spec.ts (no panel after placing; the "brought back
  into view" test turns the option on).
- Editing only: files and simulation unchanged, so no deviation entry.

## Next

- Nothing planned.

## Open

- Other parts' ends keep the mouse's small grab radius on touch, so a finger on a resistor's end
  moves the resistor rather than stretching it. Widening that too would make parts hard to move.

Obsidian: works. Circuit files open the full editor in a frame, which reads the same Options;
circuits in notes aren't edited.
