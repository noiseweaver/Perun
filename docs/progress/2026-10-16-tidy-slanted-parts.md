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
- The bundled examples tidy exactly as before (no example has an odd-slanted part; the one
  labelled stub stays).
- Tests in `tidy.test.ts`.

## Next

- Gady tries it in the preview artifact.

## Open issues

- None known.
