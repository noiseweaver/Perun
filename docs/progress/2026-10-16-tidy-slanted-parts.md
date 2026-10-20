# 2026-10-16: Tidy up handles slanted parts and loose stubs

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
- Tests in `tidy.test.ts`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- None known.
