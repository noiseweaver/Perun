# 2026-10-11: formula boxes (branch claude/latex-formula-block-r1h5lx)

Done: Outputs and Labels > Formula places a LaTeX formula box (a TextElm with `math` set; menu
only, like ACRailElm). The property panel has the LaTeX (the canvas follows as it is typed, one
undo step per visit to the field), Size, Color, and Linked parts (pick from a list; hovering a row
lights the part up). Live values: `\V{node}` and `\V{a,b}` for labeled nodes, `\V`, `\I`, `\P`
(and `\V[2]` ...) for linked parts, each a fixed-width slot (sign, three digits, three decimals,
prefix), refreshed ten times a second so a running circuit isn't typeset every frame.

MathJax 3 (mathjax-full, Apache-2.0, distributed with the app under GPL-3.0 through "or later")
renders to SVG, which packages/render/src/math.ts flattens into paths for the canvas and SVG
painters. It is a lazy chunk (about 575 kB compressed, mostly font outlines) that loads the first
time a formula is drawn; the service worker caches it on first use like the translations, so it
isn't part of the install download. Until it loads, or when the TeX doesn't parse, the box shows
its source (red for an error). Only the TeX packages people need are bundled: base, ams,
boldsymbol, cancel, color, gensymb, newcommand, upgreek. The embed build and the Obsidian plugin
inline MathJax (main.js grows from 4.6 to 8.2 MB, as it is in both the blocks and the editor page).
Saved format and compatibility: [deviation](../deviations/formula-boxes.md).

Above the LaTeX field, insert buttons (fraction, sub/superscript, root, times, units, Greek
letters, `\V \I \P \V{…}`) put a snippet at the cursor, wrapping any selected text in its first
slot; below it, a collapsible "LaTeX help" legend lists the common commands and the live values.

Next: nothing planned. Possible extras: more TeX packages (physics, mhchem).

Open: new labels (Formula, Linked parts, the live values hint, insert button titles, the legend) are English only. Links to a part
that is deleted show `?` until saved; on reload the remaining parts are renumbered.
