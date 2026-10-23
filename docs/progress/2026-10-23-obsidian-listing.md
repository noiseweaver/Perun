# 2026-10-23: getting Perun for Obsidian into Obsidian's plugin list

Branch `claude/project-thread-o4rr5f`. After the 1.0.0 release Gady asked what the official
Community plugins list needs, and chose a mirror repository for it so this one stays as it is.

## Done

- Checked the list's current rules (since May 2026: a dashboard at community.obsidian.md and an
  automated scan of every release, rules from `eslint-plugin-obsidianmd`). The plugin's source has
  no errors against them.
- Mirror repository [noiseweaver/perun-obsidian](https://github.com/noiseweaver/perun-obsidian):
  its Sync from Perun workflow (daily, or by hand) copies each Perun plugin release there: the
  source at that release, `manifest.json` at the top, and a release with the same tested files.
  Its README is the plugin's page in the list. Nothing in this repository changes for it.
- Manifest description starts with a verb, as the list asks. `minAppVersion` is now 1.14.4, the
  version the Obsidian test runs (1.5.7 was never tested; older Obsidian builds don't talk to
  today's Playwright, so the test can't check them).
- Circuits in notes animate on their own window's frames, so a note in a popout keeps running
  when the main window is hidden (and the scanner's timer rule is met).
- The Obsidian test takes `OBSIDIAN_VERSION` to try another version.

## Next

- Release 1.0.1 (Release Obsidian plugin) so the mirror carries the new manifest.
- Gady runs the dashboard's preview scan on noiseweaver/perun-obsidian, then submits.

## Open issues

- Scanner warnings left: the settings tab doesn't declare `getSettingDefinitions()` (Obsidian
  1.13's settings search; adopting it is a rewrite of the tab), and two sentence-case hits that are
  the name Perun.
- File embeds use Obsidian's embed registry, which isn't public API.
- `main.js` is 8.4 MB (mostly MathJax). No stated limit.

Obsidian: this is the plugin's own work.
