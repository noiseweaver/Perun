# Perun for Obsidian

Circuits in your notes, running live, and the full Perun editor for circuit files.

- **Circuit blocks.** A code block whose language is `circuit` shows the circuit running, with its
  scopes, in reading view and live preview. The bar under it has Pause/Run, Reset and Open in
  Perun (the web app, with the circuit in the link). Paste any CircuitJS1 or Perun circuit, text
  or XML:

  ````md
  ```circuit
  $ 1 0.000005 10.2 50 5 50 5e-11
  r 96 112 240 112 0 220
  w 96 112 96 240 0
  w 240 112 240 240 0
  v 96 240 240 240 0 0 40 5 0 0 0.5
  ```
  ````

  Blocks run only while they are on screen. Printing and Export to PDF show a sharp still picture.

- **Circuit files.** A `.circuit` file opens the whole Perun app in a tab: palette, scopes,
  analysis, themes. Every edit is saved to the file (as XML, what Perun's File > Save writes), so
  the file syncs and versions like any other. The command and ribbon button **New circuit** (and
  New circuit on a folder's menu) create one. A circuit file saved by Perun or CircuitJS1 can be
  renamed to `.circuit` and opened.

- **Themes.** Circuits use Perun's Obsidian Dark and Obsidian Light themes and switch with
  Obsidian. Settings > Perun > Match Obsidian's light and dark mode turns that off, and blocks
  then use the theme picked in the editor. The editor's settings (Options menu) are kept in the
  plugin's data in the vault, so they travel with it; circuit blocks follow its symbol settings
  (European resistors and gates, value size).

It works on desktop and on Obsidian for iPhone, iPad and Android.

## Install

Until it is in Obsidian's community plugin list:

1. Get `main.js`, `manifest.json` and `styles.css`: build them (below) or download the
   `perun-obsidian` artifact from a CI run on GitHub.
2. Put them in `<your vault>/.obsidian/plugins/perun/`.
3. In Obsidian, Settings > Community plugins: turn community plugins on if needed, then turn on
   Perun.

## Build

```sh
pnpm install
pnpm --filter @perun/obsidian build    # packages/obsidian/dist
```

`build.ts` builds the app with `vite build --mode embed`, puts it into one page with the example
circuits, translations and license inlined (`generated/editor.html`), and bundles the plugin with
that page inside (`dist/main.js`, about 5 MB).

## How it works

A circuit block runs the engine and renderer directly (`src/player.ts`), without the editor. A
circuit file's tab is a `TextFileView` holding the app in a frame (`src/editorView.ts`); the app
knows it is embedded from `window.perunEmbed` (packages/app/src/embedConfig.ts) and talks to the
plugin with `postMessage`: the plugin sends the circuit and theme, the app sends the circuit back
after each edit and its settings when they change. The frame's local storage is a copy of the
plugin's (`src/shim.ts`).
