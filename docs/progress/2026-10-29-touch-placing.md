# 2026-10-29: Placing without the properties panel, wire ends a finger can grab, no bad connections

Branch `claude/project-thread-2u7l0f`. Gady asked for two things while placing parts on a phone:
the properties panel shouldn't open by itself after a part is placed (placing comes first), and
wire ends were hard to grab by touch, often needing several tries. Trying the preview, Gady
still got "1 bad connection" now and then and asked to make bad connections impossible.

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
- No new bad connections (an end joined to nothing, lying on another part: it looks connected
  and isn't). After a drag, a drawn part or wire, a palette, wheel or search drop, a paste, a
  rotate or a mirror, `Editor.joinBadPosts` joins each one the edit made: a post on a wire splits
  the wire there; a wire end moves onto the part's nearest pin; a part just placed or pasted
  moves so its pin is on that pin; a part end just dragged stretches onto it. When none of
  those applies (a moved part's pin lands on another part's body), the edit is put back
  (`History.revert`) with a notice, "Put back: an end would have sat on a part without connecting
  to it" (16 languages). Bad connections a file brings are left alone. Arrow-key nudges aren't
  checked, so a part can still be stepped across another one.
- The bad connection count is more exact (`badPosts` in packages/render/src/posts.ts, which
  `findPosts` now uses too; not upstream). Upstream counts every lone post inside an element's
  whole box, so a pin beside a part's lead (say a grid step beside a source's end) or in the
  empty corner of a slanted wire's box showed a bad connection that wasn't one, and here would
  have had a harmless move put back. Now a two-post part counts only on its line or beside its
  body (between its leads), a slanted part only within a grid step of its line, a slanted wire
  within 3 units, and text boxes, scopes and other parts with no pins never. Display only.
- Tests: badConnections.test.ts drags 1348 random wire ends across every bundled example and
  checks none leaves a new bad connection (63 are put back, the rest joined);
  editor.test.ts (placed parts unselected unless asked, touch reach on wire ends, middle
  third moves the wire, grabbing with another part selected, tap selects), editor.spec.ts (a
  finger 14 px off a wire end drags it), wheel.spec.ts (no panel after placing; the "brought back
  into view" test turns the option on).
- Editing and the warning count only: files and simulation unchanged, so no deviation entry.

## Next

- Nothing planned.

## Open

- Other parts' ends keep the mouse's small grab radius on touch, so a finger on a resistor's end
  moves the resistor rather than stretching it. Widening that too would make parts hard to move.

Obsidian: works. Circuit files open the full editor in a frame, which reads the same Options;
circuits in notes aren't edited.
