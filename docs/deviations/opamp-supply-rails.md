# Op-amp supply rails

- Upstream: The ideal op-amp's supply is only its Max and Min Output; the symbol shows no rails
- Ours: A Show supply rails checkbox (off by default) draws a V+ and a V- stub on the symbol, coloured by and labelled with the Max and Min Output voltages. Drawing only, nothing to connect to. Saved as the extra XML attribute `rl` only when set
- Why: Requested by the owner (2026-10-08). Upstream ignores unknown attributes, so the op-amp opens there without the stubs
- Golden test: Not simulation: `packages/format/src/opamprails.test.ts` (round trip, nothing extra by default)
