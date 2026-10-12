# 2026-10-12: ten more built-in themes

Branch `claude/project-thread-jfxe3z`. Gady asked for more color themes and picked all ten
proposed.

## Done

- `builtins/looks.ts`: six hand-made themes after real surfaces, listed after Colorblind Safe in
  the menu: Chalkboard, Whiteboard, E-ink, Blueprint, Phosphor and Engineering Paper. E-ink runs
  voltage from light grey to black (no hue, for greyscale e-ink like the Boox), Phosphor from dim
  to bright green.
- `builtins/palettes.ts`: One Dark, Kanagawa, Ayu Dark and Night Owl at the end of the menu, built
  with `paletteTheme` like the others. One Dark's foreground is lightened a step so text on the
  tinted paused Run button reaches 4.5:1 (the axe e2e test caught it).
- docs/THEMES.md built-in table updated. All 32 built-ins pass `contrastWarnings` and the axe
  pass over every theme.

## Next

- Gady tries them in the preview artifact (version 39).

## Open issues

- `contrastWarnings` does not check `ui.text` on the secondary container (paused Run button);
  only the e2e axe test does.
