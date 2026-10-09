# 2026-10-08: Obsidian plugin, embeds and controls (branch claude/project-thread-bhe1tv)

Done (Gady picked "Blocks + editor"): a new package, packages/obsidian, builds an Obsidian plugin.
` ```circuit ` code blocks run the circuit live in reading view and live preview (engine and
renderer only, src/player.ts), only while on screen; print and PDF export show the schematic as
SVG. `.circuit` files open the whole app in a tab: the app is built a second time
(`vite build --mode embed`: relative paths, fonts inlined, no service worker), inlined into one
page with the examples, translations and license, and run in an iframe. Instead of refactoring the
app's global controller and store into instances, each tab's frame gets its own copy, which also
keeps the app's CSS away from Obsidian's. The app learns it is embedded from `window.perunEmbed`
(embedConfig.ts): it opens the host's circuit, skips the update banner and last-circuit restore,
sends the circuit back after each edit (by circuitVersion and unsavedChanges, so a running circuit
doesn't rewrite the file), follows host load and theme messages, and links to the web app at
https://noiseweaver.github.io/Perun/. Its local storage is a copy of the plugin's data (the
clipboard stays on the device). Circuits use Obsidian Dark and Light and switch with Obsidian (a
setting turns that off). The scope cards in a block have no header buttons (new
`ScopeManager.cardButtons`). CI builds the plugin and uploads it as the `perun-obsidian` artifact.

Done after Gady tried it: `![[name.circuit]]` embeds show the file running and follow its changes
(Obsidian's embed registry, unpublished API). Circuits in notes draw undocked scopes (scopeAnchor
moved from SimController to packages/render), and a Controls panel shows the circuit's sliders
(packages/app/src/sliders.ts, now exported) and its simulation and current speed. Open in Perun
opens the editor in an Obsidian tab instead of the web app: a file embed opens its file, a code
block opens a block tab whose edits are written back into the block, found by its text
(blockText.ts).

Checked in a real Obsidian 1.10.6 (app 1.14.4) on Linux, including its mobile emulation. Tests:
packages/obsidian/src/*.test.ts, packages/app/e2e/embed.spec.ts.

Next: Gady tries it, also on a real iPhone. Publishing: BRAT and the community plugin list both
want manifest.json at a repository's root and GitHub releases, so they need a decision (a release
workflow here, or a small separate repository).

Open: main.js is about 5 MB (the app and the 373 examples).
