# Obsidian test

Tests the built plugin (`packages/obsidian/dist`) in the real Obsidian app. It downloads
Obsidian's Linux build the first time (cached in `~/.cache/perun-obsidian-test`), opens the test
vault in [vault/](vault/) with the plugin turned on, and checks that:

- the plugin loads, a circuit block runs, and clicking a switch in a note changes the circuit,
- the Controls panel lines each slider up with its name,
- an embedded `![[Clipper.circuit]]` shows,
- the editor tab opens and an edit is written to the file,
- Ctrl+P opens Obsidian's command palette while the editor has focus,
- an editor opened in a new window writes its edits to the file,
- Export image saves a file into the vault, and Options are kept in the plugin's data,
- a theme picked in one editor reaches the other open editors (and Match Obsidian brings
  Obsidian's back), and opening a circuit that is already open goes to its tab,
- the phone layout shows a note and the editor,
- nothing is logged as an error.

```sh
pnpm --filter @perun/obsidian build
pnpm obsidian:test            # Linux without a screen: xvfb-run -a pnpm obsidian:test
```

Options: `--plugin <dir>` (default packages/obsidian/dist), `--cache <dir>`, `--out <dir>`
(default test-results/obsidian: a screenshot after each check, and Obsidian's log). It exits 1
when a check fails.

The **Release Obsidian plugin** workflow runs it before publishing a release; pull requests don't.
`OBSIDIAN_VERSION` in [src/run.ts](src/run.ts) is the Obsidian version tested; raise it after
trying a new Obsidian. Playwright drives Obsidian over the DevTools protocol, because its Electron
launcher times out with Obsidian.
