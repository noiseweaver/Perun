# 2026-10-21: the Obsidian plugin catches up, and stays caught up

Branch `claude/project-thread-o4rr5f`. Gady said the plugin had fallen behind the web app and
asked to bring it back to parity, then for a way to keep it there without a catch-up round each
time. Gady agreed to the five-step plan, with the real-Obsidian test run only when we release.

## Done

- Audit in the real Obsidian app (1.14.4). The editor tab already had every app feature (it is
  the app in a frame), but: Save and Ctrl+S downloaded a stray file and renamed the tab, exports
  went nowhere, Obsidian's hotkeys died inside the editor, the theme library lived in Obsidian's
  IndexedDB instead of the vault, switches in notes couldn't be clicked, blocks ignored Show
  current when paused, the default text box font and the skipped-items notice, and the status
  bar covered the time readout.
- Fixed all of these. In a circuit file's tab, File > Save a copy (and Ctrl+S says every change
  is already saved) puts `<name> copy.circuit` next to it; exported images, CSV files, parts
  lists and recordings are written into the vault next to the circuit (buttons say Save to
  vault); Ctrl/Cmd/Alt keys the app doesn't use reach Obsidian (Ctrl+P, Ctrl+O and the rest);
  saved themes are kept in the plugin's data; switches, push buttons and logic
  inputs can be clicked in notes. New strings in all 16 languages (by Claude, not native-checked).
- Step 1, one platform module: `packages/app/src/platform/` (`web.ts`, `obsidian.ts`) is the only
  place that touches local storage, IndexedDB, downloads and leaving the page. ESLint bans them
  everywhere else in app, render and elements.
- Step 2, shared code: blocks run on the editor's `StepClock` (stepClock.ts), draw from
  `frameState` (drawing.ts), read settings with the app's `readSettings` (settings.ts) and place
  undocked scopes with render's `placeUndocked`. `SETTING_USE` in drawing.ts must name every user
  setting as `drawn` or `editor`, so a new setting fails the typecheck until someone decides.
- Step 3, `tools/obsidian-test/`: downloads Obsidian, opens a test vault with the plugin, and
  checks 10 things (block runs, switch click, embed, editor edit written to the file, Ctrl+P,
  export into the vault, settings in plugin data, phone layout, no console errors). All 10 pass.
  It found one more bug on its first run: Obsidian ignores keys while the frame has focus, so
  the plugin now lets go of focus for a passed-on hotkey.
- Step 4, `.github/workflows/release-obsidian.yml`: a manual Release Obsidian plugin button.
  Builds with the version (PERUN_PLUGIN_VERSION into dist/manifest.json), runs `pnpm check` and
  the Obsidian test, and publishes a GitHub release (main.js, manifest.json, styles.css) only if
  everything passes. Not run yet. BRAT can install from those releases (README).
- Step 5: CLAUDE.md "Works in Obsidian" rule, and progress entries end with an `Obsidian:` line
  (docs/progress/README.md).

## Next

- Gady tries the plugin zip (project folder `obsidian-plugin/`).
- When we agree, run Release Obsidian plugin for the first release (1.0.0), then add
  `noiseweaver/Perun` in BRAT.

## Open issues

- The first run of the release workflow on GitHub's runners is untested (the Obsidian test passes
  locally under Xvfb).
- My circuits and Warn before closing are left out of the plugin on purpose: the vault is where
  circuits live, and every edit is saved.
- Community plugin list submission still to decide.

Obsidian: this is the plugin's own work. Everything above works there; My circuits and Warn
before closing are left out (see Open issues).
