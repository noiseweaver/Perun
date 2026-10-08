# 2026-10-08: finer simulation speed (branch claude/sim-speed-control-4ojhlc)

Done: the Speed popover's simulation slider is wider and moves in quarter notches of upstream's
scale (about 1 % per step instead of 4 %), and a field next to its label shows and takes the speed
in steps per second (160 × iterations per frame; "1k" works, 0 stops, values are held to the
slider's range of 1.31 to 61242). speed.ts holds the conversion. A speed between notches is saved
as an extra `sp` attribute (docs/deviations/speed-between-notches.md); `ic` is unchanged, so
upstream opens the file at the nearest notch. Escape in the field drops the edit and keeps the
popover open.

Next: the Obsidian embed's speed control could reuse speed.ts and the same field.

Open: none.
