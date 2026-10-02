# Upstream

|                |                                                |
| -------------- | ---------------------------------------------- |
| Repository     | https://github.com/pfalstad/circuitjs1         |
| Pinned commit  | `5a707168778216bb6ed01bfdd62e8bbf7ae0a032`     |
| Commit date    | 2026-09-23                                     |
| Commit subject | Check in the original Gradle/GWT build scripts |
| Pinned on      | 2026-10-02                                     |
| License        | GPL-2.0-or-later (`COPYING.txt`)               |

The clone lives at `reference/circuitjs1` as a git submodule. It is read-only: never commit changes
inside it. Harness changes for golden tests go in `tools/reference-patch/` and are applied at build
time (PLAN.md section 2).

## Where things are at this commit

- Java sources: `src/com/lushprojects/circuitjs1/client/` (about 240 files, 154 element classes).
- Example circuits: `src/com/lushprojects/circuitjs1/public/circuits/` (373 files: 335 in the legacy
  text format, 38 in the XML format), indexed by
  `src/com/lushprojects/circuitjs1/public/setuplist.txt`. The build copies them to `circuitjs1/circuits/`.
- Upstream's own regression circuits: `auto-tests/` (XML circuits with `<test>` and
  `<switchevent>` tags) and `tests/`.
- Engine walkthrough: [ENGINE-NOTES.md](ENGINE-NOTES.md). Upstream's own notes are in `INTERNALS.md`.
- Element inventory: [ELEMENTS.md](ELEMENTS.md).

## Building the reference app

See [tools/reference-build/README.md](../tools/reference-build/README.md).

## Sync process

PLAN.md section 9. To see what changed since the pin:

```sh
cd reference/circuitjs1
git fetch origin
git log --oneline 5a707168778216bb6ed01bfdd62e8bbf7ae0a032..origin/master -- src/com/lushprojects/circuitjs1/client
```

When moving the pin: update this file, re-record golden fixtures, and update the SHA in the header
of every ported file whose upstream source changed.
