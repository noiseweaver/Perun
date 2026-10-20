# 2026-10-16: Tidy up squares circuits into rows and columns

Branch `claude/project-thread-2yctz2` (restarted from main after PR #59). Gady reported a
circuit with a slanted inductor, slanted wires and a dangling stub that Tidy up called
"Already tidy."

## Done

- Why it missed it: wires into a slanted part's posts could only become Ls through the part's own
  body, so every route was refused; tidy never turned parts, and loose wire ends were left alone.
- A two-post part drawn at an odd slant now turns to lie along the grid (the way it mostly runs),
  keeping one post, or turning about its middle, whichever lets its wires be simplest. Exactly
  45 degrees is left alone, since diamond bridges are drawn that way.
- A wire with a loose end (no post, no other wire there) is removed, and the next one if that
  leaves it loose. Kept: a loose end next to a label or part (a pin drawn out to its name, as in
  555int), on another wire's middle, or a wire with a post on its middle.
- 2026-10-20, Gady's divider (slanted resistors joined end to end, with voltage labels on their
  joins): a slanted part whose post is shared with other parts couldn't turn at all. Now the parts
  and labels joined to a post that moves go with it (up to 12, never back round to the part
  itself), and parts on a post that stays may touch its new body there.
- Junctions slide: a wire junction (no part's post) may move along its wires so a wire leaving it
  runs straight, when that makes fewer wires and bends. 12 bundled examples come out a little
  tidier for it (e.g. the diff amp's emitters join in one straight line).
- 2026-10-20, Gady's switch circuit: a ground drawn at a slant stayed, and so did the slanted wire
  beside it. One-post parts (ground, rail, label) now turn about their post to point along the
  grid, the way nearest to how they point, redrawing their own wires round them. A box edge lying
  just beyond a post (a ground's box reaches 3 units above its post) is pulled in to the post, so a
  wire may leave the post along it.
- No bundled example has an odd-slanted part; the one labelled stub (555int) stays.
- 2026-10-20, rethink after a fourth circuit (a loop with a long slanted inductor) also stayed
  "Already tidy": the separate fixes each covered one shape. Tidy up now starts with
  `square.ts`, which puts the whole circuit into rows and columns at once. Every two-post part
  and every nearly straight wire run ties its two ends to one row or column, parts with fixed
  geometry keep their offsets, each row and column goes to the grid line nearest where its points
  were, order is kept, and parts keep their length (so a part in the way is pushed along). Anything
  that would newly touch (points, a point on a wire, wires on each other, a wire through a part,
  parts on each other) is pulled apart the way it was apart and placed again; if that can't
  settle, square changes nothing. The old stages then tidy what's left.
- Kept as drawn: parts and wires at exactly 45 degrees (bridges, X crossovers in relayxor and
  jkff). A slanted run that can't become an L gets a route round parts with at most three corners
  and not much longer than it was. Wires out to a loose end move with their point.
- A wire meeting a part's lead sideways now counts as a full bend, so a square U-shaped wire
  between two parts no longer becomes an L that drags a part into the corner (Gady's inductor
  loop kept its resistor and capacitor where they were). 63 bundled examples still tidy.
- Rollback rule: tidy is undone if any net changes or more posts land on a wire's middle; fewer
  is allowed (`keepsConnections`).
- Stress test (in `tidy.test.ts`): one point of each bundled example dragged 1 to 3 grid steps
  off its row or column, then tidied. 236 of 241 come back fully square, and none changes a
  connection. The bundled examples themselves are unchanged by `square.ts`.
- Tests in `tidy.test.ts`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- A slanted part whose squared position would land on a neighbour stays slanted (a few percent of
  the stress test, more when several points are dragged).
