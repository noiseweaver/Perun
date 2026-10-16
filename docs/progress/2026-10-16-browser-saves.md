# 2026-10-16: Save circuits in the browser (My circuits)

Branch `claude/browser-saves-nzl6t3`. Gady asked to save circuits in the browser, not only as
downloaded text files, with a small preview of each, a dot in the title for unsaved changes,
and renaming a circuit by editing the title at the top left.

## Done

- `packages/app/src/myCircuits.ts`: named saves in IndexedDB (`circuitjs-next.circuits`, one
  store keyed by id: name, the circuit text exactly as File > Save writes it, a PNG thumbnail,
  created and modified times), plus plain helpers (newest first, search, name clashes, copy
  names). The first save asks the browser to keep the storage (`navigator.storage.persist`).
- `packages/app/src/browserSaves.ts`: save, save over, open, rename, delete; the thumbnail is the
  schematic export (`schematicCanvas`) in the theme on screen, at most 480 × 300, without values.
- Save dialog: "In this browser" (default) or "Download file", remembered
  (`circuitjs-next.saveTarget`). A name another save has shows "Saving replaces it" and the
  button reads Replace. Not offered inside the Obsidian plugin's frame.
- File > My circuits… and Circuits > My circuits… (phones: a row at the top of the Circuits
  sheet): cards with the thumbnail, name and date, newest first, search from 7 circuits; open on
  click; a ⋮ menu with Rename, Duplicate, Download file and Delete (asks first). The circuit on
  screen has an accent border and "On screen".
- Ctrl+S saves over the circuit's own browser save with a toast; otherwise it opens the dialog.
- The title at the top left is a button: clicking it edits the name in place (Enter or leaving
  the field keeps it, Escape cancels). For a browser save it renames the save; otherwise it
  renames the circuit and the next download offers that name.
- A dot after the title while the circuit has changes not saved anywhere.
  `SimController.unsavedChanges` became an accessor that publishes `unsaved` to the store;
  `savedAs` in the store links the circuit on screen to its save. Both survive a reload through
  the last-circuit autosave.
- Strings in all 16 languages (by Claude, not native-checked). Unit tests for the helpers,
  e2e `my-circuits.spec.ts`.
- No simulation or file format change, so no deviation entry.

- Follow-up (after #62 merged): the name has a fixed slot (`clamp(140px, 12vw, 220px)`), so a
  long name no longer pushes the menus right; it ends in an ellipsis and the tooltip has all of
  it. The slot stays narrow enough that Options' submenus still open rightwards at 1280 px wide
  in French (a wider slot flipped them left and broke `i18n.spec.ts`). Phones were already
  steady (the name takes the free space there).

## Next

- Gady tries the steady title bar in the preview artifact.

## Open issues

- Saves stay in one browser on one device; the iPhone home-screen app and Safari keep
  separate lists. Clearing site data deletes them.
- Thumbnails keep the theme they were saved in until the circuit is saved again.
- Escape while renaming inside My circuits closes the dialog (the rename is dropped).
