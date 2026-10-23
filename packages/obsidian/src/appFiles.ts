// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// The editor's example circuits and translations (about 3 MB, more than the rest of the plugin)
// are not inside main.js, which Obsidian Sync's Standard plan would refuse at over 5 MB. build.ts
// writes them to perun-files.json; the Release Obsidian plugin workflow attaches that file to the
// release. The first time an editor asks for one, the plugin reads perun-files.json from its own
// folder (a hand install or the Obsidian test puts it there), or else downloads it once from the
// release of its own version and keeps it there.

export const APP_FILES = 'perun-files.json';

/** What build.ts writes: the files, and the plugin version they belong to. */
export interface AppFiles {
  version: string;
  files: Record<string, string>;
}

/** Where the release of `version` keeps its perun-files.json. */
export function appFilesUrl(version: string): string {
  return `https://github.com/noiseweaver/Perun/releases/download/${version}/${APP_FILES}`;
}

/** The files in `text`, or null if it isn't a perun-files.json for `version`. */
export function parseAppFiles(text: string, version: string): Record<string, string> | null {
  try {
    const data = JSON.parse(text) as Partial<AppFiles>;
    if (data.version !== version || typeof data.files !== 'object' || data.files === null)
      return null;
    return data.files;
  } catch {
    return null;
  }
}

/** How loadAppFiles reaches the plugin folder and the web (main.ts: vault adapter, requestUrl). */
export interface AppFilesIo {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  download(url: string): Promise<string>;
}

/** The app's files for `version`: from `path` in the plugin's folder, or downloaded once into it. */
export async function loadAppFiles(
  io: AppFilesIo,
  path: string,
  version: string,
): Promise<Record<string, string>> {
  if (await io.exists(path)) {
    const files = parseAppFiles(await io.read(path), version);
    if (files !== null) return files;
  }
  const url = appFilesUrl(version);
  const text = await io.download(url);
  const files = parseAppFiles(text, version);
  if (files === null) throw new Error(`${url} is not for this version`);
  await io.write(path, text);
  return files;
}
