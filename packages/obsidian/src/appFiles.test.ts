// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { appFilesUrl, loadAppFiles, parseAppFiles, type AppFilesIo } from './appFiles.ts';

const json = (version: string, files: Record<string, string>): string =>
  JSON.stringify({ version, files });

/** A plugin folder holding `disk`, and a web serving `web`. */
function io(disk: Record<string, string>, web: Record<string, string>) {
  const downloads: string[] = [];
  const io: AppFilesIo = {
    exists: (p) => Promise.resolve(p in disk),
    read: (p) => Promise.resolve(disk[p] ?? ''),
    write: (p, t) => {
      disk[p] = t;
      return Promise.resolve();
    },
    download: (u) => {
      downloads.push(u);
      const t = web[u];
      return t === undefined ? Promise.reject(new Error('404')) : Promise.resolve(t);
    },
  };
  return { io, disk, downloads };
}

describe("the editor's example circuits and translations", () => {
  it('come from the release of the same version', () => {
    expect(appFilesUrl('1.2.3')).toBe(
      'https://github.com/noiseweaver/Perun/releases/download/1.2.3/perun-files.json',
    );
  });

  it('are read only for the right version', () => {
    expect(parseAppFiles(json('1.0.2', { a: 'b' }), '1.0.2')).toEqual({ a: 'b' });
    expect(parseAppFiles(json('1.0.1', { a: 'b' }), '1.0.2')).toBeNull();
    expect(parseAppFiles('not json', '1.0.2')).toBeNull();
  });

  it('are read from the plugin folder when there', async () => {
    const t = io({ 'p/f.json': json('2.0.0', { x: 'y' }) }, {});
    expect(await loadAppFiles(t.io, 'p/f.json', '2.0.0')).toEqual({ x: 'y' });
    expect(t.downloads).toEqual([]);
  });

  it('are downloaded once, and kept, when missing or from another version', async () => {
    const t = io(
      { 'p/f.json': json('1.9.9', { old: '' }) },
      {
        [appFilesUrl('2.0.0')]: json('2.0.0', { x: 'y' }),
      },
    );
    expect(await loadAppFiles(t.io, 'p/f.json', '2.0.0')).toEqual({ x: 'y' });
    expect(await loadAppFiles(t.io, 'p/f.json', '2.0.0')).toEqual({ x: 'y' });
    expect(t.downloads).toHaveLength(1);
    expect(t.disk['p/f.json']).toBe(json('2.0.0', { x: 'y' }));
  });

  it('fail when offline', async () => {
    await expect(loadAppFiles(io({}, {}).io, 'p/f.json', '2.0.0')).rejects.toThrow('404');
  });
});
