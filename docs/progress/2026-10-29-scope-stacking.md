# 2026-10-29: Scope card stacking order

Branch `claude/project-thread-urnpsr`. Gady noticed that overlapping undocked scope cards always
stack in the order they were placed (element order, as upstream), so a card behind another stays
behind even while you use it. Asked for: cards keep overlapping, and the one that gets focus
comes to the top.

## Done

- `CardStack` (packages/app/src/cardStack.ts) keeps the undocked cards' order, back to front: in
  element order at first, a new card on top, and a pressed card raised to the top. A press means
  any press on the card (tap, click, drag of the handle or grip, the plot, a right-click for the
  menu, picking up its leader end). In upstream's look, the scope the editor picks comes to the top.
- `SimController.layoutUndocked` draws in that order and `undockedAt` hits the top card first, so
  what you see on top is what a tap reaches.
- The order belongs to the view: raising a card is not an edit, doesn't change the file (it keeps
  element order) and doesn't mark the circuit as changed. Undo and redo read the circuit again
  with new objects; the order carries over by position. Opening another circuit starts afresh.
- Tests: `packages/app/src/cardStack.test.ts`; e2e "a card pressed behind another comes to the
  top, and stays there through undo" in scopes.spec.ts.
- View only, nothing simulated or saved changes, so no deviation entry.

## Next

- Nothing planned.

## Open

- A circuit reopens with its cards in placement order, not the last order on screen.

Obsidian: works in the editor tab for .circuit files (the app in a frame). Circuits in notes
don't take presses on cards, so they draw cards in placement order, as before.
