# 2026-10-23: Perun for Obsidian under 5 MB

Branch `claude/project-thread-o4rr5f`. The plugin list's scan warns about a `main.js` over 5 MB
(Obsidian Sync's Standard plan skips bigger files), and 1.0.1's was 8.4 MB. Gady chose to slim it
before publishing.

## Done

- `main.js` is 4.84 MB, and the build fails at 5 MB so it stays under.
- The editor frame borrows the plugin's MathJax instead of carrying its own copy: the embed build
  swaps render's `mathjax.ts` for `packages/app/src/embedMathjax.ts`, which asks the plugin through
  the frame element (`perunHost`, `FrameHost` in embedConfig.ts). Formulas typeset the same.
- The example circuits and translations moved to `perun-files.json` (1.66 MB), attached to the
  release next to `main.js`. The plugin reads it from its own folder, or else downloads it once
  from the GitHub release of its own version and keeps it there (`packages/obsidian/src/appFiles.ts`).
  Until then, or offline, the editor has no examples and English menus. Both READMEs say so, as the
  plugin list asks of network use.
- Font subsets the app never shows (Cyrillic extended, Greek extended, Vietnamese) are left out.
- The Obsidian test installs `perun-files.json` too and checks that the editor gets examples,
  translations and MathJax from the plugin (15 checks).
- The mirror's sync copies every release file, `perun-files.json` included.

## Next

- Release 1.0.2, sync the mirror, then Gady presses Publish in the plugin list dashboard.

## Open issues

- The download path is checked by unit tests only; the Obsidian test installs the file.
- The scan's other warnings stay: CSS lint on the app's styles, dynamic code in a dependency, and
  release attestations (a recommendation).

Obsidian: this is the plugin's own work.
