# Simulation speed between notches

- Upstream: the speed slider has 260 whole notches (each about 4 % faster than the one before)
  and no typed value.
- Ours: the slider moves in quarter notches and the speed can be typed in steps per second
  (160 × iterations per frame), anywhere on the slider's range. A speed between notches is saved
  as an extra XML attribute `sp`, only when it is not a whole notch; `ic` is still written as
  upstream computes it.
- Why: requested by the owner (2026-10-08). Upstream ignores `sp` and reads `ic` as the nearest
  notch, so files open there at about the same speed.
- Golden test: none (not simulation); `packages/format/src/speed.test.ts` covers the round trip,
  nothing extra on a whole notch, and upstream's reading without `sp`.
