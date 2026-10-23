# Perun for Obsidian

Circuits in your notes, running live, and the full Perun editor for circuit files.

- **Circuit blocks.** A code block whose language is `circuit` shows the circuit running, with its
  scopes (docked and undocked), in reading view and live preview. Paste any CircuitJS1 or Perun
  circuit, text or XML:

  ````md
  ```circuit
  $ 1 0.000005 10.2 50 5 50 5e-11
  r 96 112 240 112 0 220
  w 96 112 96 240 0
  w 240 112 240 240 0
  v 96 240 240 240 0 0 40 5 0 0 0.5
  ```
  ````

- **Embedded circuit files.** `![[name.circuit]]` shows that file running, and runs it again from
  the new version whenever the file changes.

  Under each circuit, in a block or embedded: Pause/Run, Reset, Controls, and Open in Perun, which
  opens it in the editor in a tab (a block's edits are written back into the block, as XML).
  Controls shows the circuit's own sliders (the ones set up in the editor; open at first when
  there are any) and its simulation and current speed. Switches, push buttons and logic inputs
  can be clicked right in the note. Circuits run only while they are on screen. Printing and
  Export to PDF show a sharp still picture.

- **Circuit files.** A `.circuit` file opens the whole Perun app in a tab: palette, scopes,
  analysis, themes. Every edit is saved to the file (as XML, what Perun's File > Save writes), so
  the file syncs and versions like any other; File > Save a copy puts a copy next to it, and
  exported images, CSV files and the like are saved into the vault the same way. Obsidian's own
  hotkeys (Ctrl+P and the rest) work while the editor has focus. The command and ribbon button
  **New circuit** (and
  New circuit on a folder's menu) create one. A circuit file saved by Perun or CircuitJS1 can be
  renamed to `.circuit` and opened.

- **Themes.** Circuits use Perun's Obsidian Dark and Obsidian Light themes and switch with
  Obsidian. Picking another theme in the editor (Options > Theme) turns that off, and every
  editor and block then uses the picked theme; Match Obsidian's light and dark mode, at the top of
  Options > Theme or in Settings > Perun, turns it on again. Opening a circuit that is already open
  among the same tabs switches to that tab (Settings > Perun to turn off). The editor's settings (Options menu) are kept in the
  plugin's data in the vault, so they travel with it; circuit blocks follow its symbol settings
  (European resistors and gates, value size).

It works on desktop and on Obsidian for iPhone, iPad and Android.

**Network use.** The editor's example circuits and its translations (about 1.7 MB) aren't inside
the plugin, which keeps it under the 5 MB Obsidian Sync syncs. The first time an editor needs one,
the plugin downloads `perun-files.json` once from its own GitHub release
(`github.com/noiseweaver/Perun/releases`) and keeps it in the plugin's folder. Until then, or
offline, the editor shows no examples and its menus in English. Nothing else goes over the network,
and nothing is sent.

## Install

Until it is in Obsidian's community plugin list, with the
[BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin: Add beta plugin, `noiseweaver/Perun`.
BRAT installs the latest release and keeps it up to date. Or by hand:

1. Get `main.js`, `manifest.json`, `styles.css` and `perun-files.json`: from a
   [release](https://github.com/noiseweaver/Perun/releases), build them (below), or download
   the `perun-obsidian` artifact from a CI run on GitHub.
2. Put them in `<your vault>/.obsidian/plugins/perun/`.
3. In Obsidian, Settings > Community plugins: turn community plugins on if needed, then turn on
   Perun.

## Build

```sh
pnpm install
pnpm --filter @perun/obsidian build    # packages/obsidian/dist
```

`build.ts` builds the app with `vite build --mode embed`, puts it into one page with the license
inlined (`generated/editor.html`), bundles the plugin with that page inside (`dist/main.js`,
about 4.8 MB, a third of it MathJax for formula boxes), and writes the example circuits and
translations to `dist/perun-files.json`. The page carries no MathJax: the plugin lends the editor
frame its own (packages/app/src/embedMathjax.ts). The build fails if `main.js` reaches 5 MB,
which Obsidian Sync's Standard plan won't sync.

## How it works

A circuit in a note runs the engine and renderer directly (`src/player.ts`, `src/widget.ts`),
without the editor. File embeds use Obsidian's embed registry, which isn't in its published API
(as other plugins do). A circuit file's tab is a `TextFileView` holding the app in a frame, and a
block's tab an `ItemView` that writes edits back into the block (`src/editorView.ts`); the app
knows it is embedded from `window.perunEmbed` (packages/app/src/embedConfig.ts) and talks to the
plugin with `postMessage`: the plugin sends the circuit and theme, the app sends the circuit back
after each edit and its settings when they change, which the plugin keeps in its data.

Everything the app does that depends on where it runs goes through one module,
packages/app/src/platform/: stored settings and libraries, saving files, and leaving the page.
`web.ts` is the website (local storage, IndexedDB, downloads); `obsidian.ts` keeps everything
in the plugin's data and sends saved files to the plugin, which writes them into the vault next to
the circuit. ESLint stops the app using local storage, IndexedDB or downloads directly, so a new
feature that stores or saves something works in Obsidian without extra work. Blocks and the
editor share the run loop and the settings-to-drawing step (packages/app/src/stepClock.ts and
drawing.ts); a new user setting doesn't type-check until drawing.ts says whether circuits in notes
draw with it.

## Release

Releases are made by hand: Actions > **Release Obsidian plugin** > Run workflow, with a version
(or empty for the next patch). It builds the plugin with that version, tests it in the real
Obsidian app (`tools/obsidian-test`), and publishes the GitHub release only if every check passes.
The same test runs locally:

```sh
pnpm --filter @perun/obsidian build
xvfb-run -a pnpm obsidian:test    # or just pnpm obsidian:test with a screen
```
