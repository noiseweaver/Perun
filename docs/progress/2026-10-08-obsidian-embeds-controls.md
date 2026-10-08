# 2026-10-08: Obsidian embeds and controls (branch claude/project-thread-bhe1tv)

Done (Gady asked after trying the plugin): `![[name.circuit]]` embeds show the file running and
follow its changes (Obsidian's embed registry, unpublished API). Circuits in notes draw undocked
scopes (scopeAnchor moved from SimController to packages/render), and a Controls panel shows the
circuit's sliders (packages/app/src/sliders.ts, now exported) and its simulation and current
speed. Open in Perun opens the editor in an Obsidian tab instead of the web app: a file embed opens
its file, a code block opens a block tab whose edits are written back into the block, found by
its text (blockText.ts). Checked in a real Obsidian.

Next: Gady tries it. The plugin's links to the web app now use https://noiseweaver.github.io/Perun/
(the site follows the repository name's case; PR #39 fixes the app's own links).
