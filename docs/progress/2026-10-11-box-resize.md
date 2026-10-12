# 2026-10-11: box corners resize from outside

Branch `claude/labelled-boxes-cylntw` (follow-up to PR #50). Gady reported that boxes could not be
resized after placing.

## Done

- Cause: a box was only picked when the pointer was inside its rectangle, and a corner grabbed
  only within 5 units, so a press just outside a corner (and most touches) missed it. The box's
  bounds now reach 10 units past its edges and a corner grabs within 10 units (posts keep their
  5), so all four corners resize with a mouse or a finger.
- The pointer shows a diagonal resize cursor over a box corner.
- Editor test: resizing from just outside a corner.

## Next

- Nothing planned.

## Open issues

- None.
