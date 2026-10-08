# Simulation speed between notches

- Upstream: The speed slider has 260 whole notches (each about 4 % faster than the one before) and no typed value
- Ours: The slider moves in quarter notches and the speed can be typed in steps per second (160 × iterations per frame), landing anywhere on the slider's range. A speed between notches is saved as an extra XML attribute `sp`, only when it is not a whole notch; `ic` is still written as upstream computes it
- Why: Requested by the owner (2026-10-08). Upstream ignores `sp` and reads `ic` as the nearest notch, so files open there about as fast
- Golden test: Not simulation: `packages/format/src/speed.test.ts` (round trip, nothing extra on a whole notch, upstream's reading without `sp`)
