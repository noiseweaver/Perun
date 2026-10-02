# circuitjs-next

A TypeScript rebuild of [CircuitJS1](https://github.com/pfalstad/circuitjs1), Paul Falstad's
electronic circuit simulator, with a new UI and a JSON theme system. Simulation behaviour and circuit
files stay compatible with upstream.

Status: Phase 0 (setup and reconnaissance). See [docs/PLAN.md](docs/PLAN.md) and
[docs/PROGRESS.md](docs/PROGRESS.md).

## Development

Requires Node 22 and pnpm 10. Docker is needed only for the upstream reference build.

```sh
git clone --recurse-submodules <this repo>
pnpm install
pnpm check
```

## License and credits

GPL-2.0-or-later, see [LICENSE](LICENSE). CircuitJS1 is Copyright (C) Paul Falstad and Iain Sharp,
with contributions listed in the upstream README.
