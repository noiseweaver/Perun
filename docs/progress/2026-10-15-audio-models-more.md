# 2026-10-15: more audio parts and editable op-amp models

Branch `claude/project-thread-6syl7l` (PR #56, still a draft). Gady asked for more audio
component models and to edit op-amp models and add their own, and picked "Both" on a card.

## Done

- Op-amp models are named and editable (`models/OpAmpModel.ts`, docs/deviations/audio-op-amps.md):
  Create New Model and Edit Model in the real op-amp's panel, a model dialog with the datasheet
  figures, and "Keep in My Models" to have a model in every circuit.
- Saving: op-amps with a behavioural model are written as an LM741 plus `om="name"`, and custom
  models as `om` records, so CircuitJS1 can open those circuits (it previously couldn't open
  `mt` 3 to 5, which still read as TL072, NE5532 and RC4558).
- New op-amps LM358, LM833, OPA2134 and TL082; bias current may be negative (PNP inputs).
- New parts: BC549C, BC557B, 2N5089, MPSA18, NKT275, OC44; 1N4001, 1N5817, BAT41, OA91, yellow
  and white LEDs; 2N5458, MPF102, J113, 2SK30A; 2N7000, BS170. All fitted to datasheet typicals
  and tested against datasheet ranges (`format/src/audioParts.test.ts`).

## Next

- Gady tries the preview; then mark PR #56 ready.

## Open issues

- CircuitJS1 compatibility of the `om` attribute and record is read from upstream's source, not
  run (no reference build or network access to falstad.com in this session).
- New model dialog labels are English in every language.
- A model kept with the checkbox stays kept if the dialog is then cancelled.
