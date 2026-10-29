# 2026-10-29: Obsidian editor on iPhone

Branch `claude/project-thread-bja0hz`. Gady reported three problems with a `.circuit` file open in
the Obsidian plugin on iPhone (screenshots in Gady's thread): whenever the keyboard came up, the
editor shrank to a strip at the top above a blank band that took no taps, until the left sidebar
was opened and closed; a tall empty "chin" sat above Obsidian's floating navigation bar; and
sideways the editor was padded so much it was unusable.

## Done

- The app inside the plugin's frame no longer pads itself for the notch, rounded corners and
  home indicator: Obsidian already keeps its views clear of them, so both did and the padding
  doubled (62 pt a side in landscape, 34 pt under the run controls upright). `styles.css` reads
  the insets through `--safe-top/right/bottom/left`, which `:root[data-embedded]` (set in
  `main.tsx` when `embedConfig` is present) zeroes. The web app is unchanged.
- The reserve kept under the editor for Obsidian's floating navigation bar drops to nothing
  while the keyboard is open (`--keyboard-height` times 1000 inside a `max(0px, …)`): the bar
  slides away under the keyboard then. The screenshot fits the editor having been squeezed by
  the reserve plus a keyboard-sized bottom inset (iOS appears to count the keyboard in
  `env(safe-area-inset-bottom)` while it is open), which the first change also stops inside
  the frame. Checked in Obsidian's phone emulation with a simulated keyboard; not yet on a real
  iPhone.
- Phone on its side: Obsidian's title bar is hidden over Perun tabs (the editor's own bar
  shows the circuit's name and menus; the navigation bar stays). Obsidian pads only the left of
  its views for the camera cutout; when the phone is turned the other way (cutout on the right,
  `screen.orientation.angle` 270), the editor pads the right instead (`EditorFrame.fitNotch`).
- `pnpm obsidian:test` passes (15 checks).

## Next

- Gady to try the test build on the iPhone (keyboard, portrait chin, both landscape turns).

## Open

- The editor could also run under the floating navigation bar sideways, as Obsidian's own
  canvas does, but docked scopes sit along the canvas's bottom edge and would go under it.

Obsidian: this is the Obsidian plugin's layout; the web app is unchanged.
