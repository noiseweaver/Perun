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
  checks 14 things (block runs, switch click, the Controls panel, embed, editor edit written to the file, Ctrl+P,
  export into the vault, settings in plugin data, a theme reaching other tabs, switching to an
  open tab, phone layout, a new window, no console errors). All 14 pass.
  It found one more bug on its first run: Obsidian ignores keys while the frame has focus, so
  the plugin now lets go of focus for a passed-on hotkey.
- An editor opened in a new window (Open in new window, or a tab dragged out) never reached the
  plugin: its frame posts to the popout's window, and the plugin only listened in the main one,
  so edits, settings and theme choices made there were lost. The plugin now listens in every
  window (`window-open`), and the Obsidian test has a check for it.
- New tabs opened in the default theme (Gady): with Match Obsidian's light and dark mode on, every
  new editor took Obsidian's theme over the one picked in the editor, and open editors never saw
  each other's changes (each frame had its own copy of the settings). Now picking a theme in the
  editor turns following off (Options > Theme and the Themes dialog have a Match Obsidian's light
  and dark mode switch to turn it on again), and the plugin passes every stored change on to the
  other open editors, which apply settings and the theme library at once.
- Opening a circuit that is already open among the same tabs switches to that tab (the reused
  tab goes back, a new one closes). A split or a new window still opens its own editor. Plugin
  setting "Switch to a circuit that is already open", on by default.
- The Controls panel under circuits in notes was scrambled (Gady): Obsidian's SliderComponent now
  adds its own number next to each slider, which threw the panel's grid out. The panel uses plain
  range inputs in Obsidian's slider style, one grid row each, and the Obsidian test checks that
  every slider lines up with its name. (The print rules had been duplicated by mistake, which
  could print an open panel; tidied.)
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

- After main brought in the real-time speed readout, the Options menu grew tall enough to
  scroll in the test window, and the theme check's clicks stopped landing: Playwright jumped the
  mouse straight from Theme to an item, and the theme list closed on the way. The list works when
  the mouse moves like a hand, so the test now moves across into the list first, then along it.
  A failed check also names what it was waiting for.
- The wheel's undo e2e test failed now and then on CI: it measured the Undo button while the
  wheel was still scaling in, so the right-button flick let go over a wedge. It now waits for the
  wheel to settle.

## Open issues

- The first run of the release workflow on GitHub's runners is untested (the Obsidian test passes
  locally under Xvfb).
- My circuits and Warn before closing are left out of the plugin on purpose: the vault is where
  circuits live, and every edit is saved.
- Community plugin list submission still to decide.

Obsidian: this is the plugin's own work. Everything above works there; My circuits and Warn
before closing are left out (see Open issues).
