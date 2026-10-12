# 2026-10-12: more built-in themes, fewer lookalikes

Branch `claude/project-thread-jfxe3z`. Gady asked for more color themes and picked all ten
proposed, then asked to remove redundant ones.

## Done

- `builtins/looks.ts`: five hand-made themes after real surfaces, listed after Colorblind Safe in
  the menu: Chalkboard, E-ink, Blueprint, Phosphor and Engineering Paper. E-ink runs
  voltage from light grey to black (no hue, for greyscale e-ink like the Boox), Phosphor from dim
  to bright green.
- `builtins/palettes.ts`: Kanagawa and Ayu Dark at the end of the menu, built with `paletteTheme`
  like the others.
- Removed lookalikes (Gady picked them on a card, after a color distance comparison of every pair):
  One Dark (near Dark), Whiteboard (near Light), GitHub Light (near Obsidian Light and Light),
  GitHub Dark (near Obsidian Dark) and Night Owl (near Tokyo Night). One Dark, Whiteboard and Night
  Owl never shipped; anyone on GitHub Dark or Light falls back to Dark, and a saved theme based on
  one of them gets Dark as its base. Classic Dots stays (only its grid differs from Classic, kept by
  Gady's earlier decision). Obsidian Dark and Light stay for the Obsidian plugin.
- docs/THEMES.md built-in table updated. All 27 built-ins pass `contrastWarnings` and the axe
  pass over every theme.

## Next

- Gady tries them in the preview artifact (version 40).

## Open issues

- `contrastWarnings` does not check `ui.text` on the secondary container (paused Run button);
  only the e2e axe test does.
