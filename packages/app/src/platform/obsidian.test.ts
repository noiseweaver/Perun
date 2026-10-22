// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbedConfig } from '../embedConfig.ts';
import { obsidianPlatform } from './obsidian.ts';

/** A frame window: what it posts to the plugin, and its own (device) local storage. */
function frame() {
  const posted: unknown[] = [];
  const device = new Map<string, string>();
  vi.stubGlobal('window', {
    parent: { postMessage: (m: unknown) => posted.push(m) },
    localStorage: {
      getItem: (k: string) => device.get(k) ?? null,
      setItem: (k: string, v: string) => device.set(k, v),
    },
  });
  return { posted, device };
}

const config = (storage: Record<string, string>): EmbedConfig => ({
  text: '',
  title: 'x',
  themeId: null,
  siteUrl: 'https://example.com/',
  storage,
});

afterEach(() => vi.unstubAllGlobals());

describe('the app in the Obsidian plugin', () => {
  it("takes another tab's changes without sending them back", () => {
    const f = frame();
    const p = obsidianPlatform(config({ a: '1' }));
    expect(p.takeStored('a', '1')).toBe(false);
    expect(p.takeStored('a', '2')).toBe(true);
    expect(p.takeStored('b', null)).toBe(false);
    expect(p.takeStored('a', null)).toBe(true);
    expect(p.storage.getItem('a')).toBeNull();
    p.followsHost?.(false);
    expect(f.posted).toEqual([{ perun: 'follow', on: false }]);
  });

  it("keeps the app's data in the plugin, and the clipboard on the device", () => {
    const f = frame();
    const p = obsidianPlatform(config({ a: '1' }));
    expect(p.storage.getItem('a')).toBe('1');
    p.storage.setItem('b', '2');
    p.storage.setItem('b', '2');
    p.storage.removeItem('a');
    p.storage.removeItem('a');
    p.deviceStorage.setItem('circuitClipboard', 'x');
    expect(f.posted).toEqual([
      { perun: 'storage', key: 'b', value: '2' },
      { perun: 'storage', key: 'a', value: null },
    ]);
    expect(f.device.get('circuitClipboard')).toBe('x');
    expect(p.storage.length).toBe(1);
    expect(p.storage.key(0)).toBe('b');
  });

  it('keeps records as a list in the plugin data', async () => {
    const f = frame();
    const p = obsidianPlatform(config({ 'db/themes': JSON.stringify([{ id: 'a', n: 1 }]) }));
    const r = p.records<{ id: string; n: number }>('db', 'themes');
    await r.put({ id: 'b', n: 2 });
    await r.put({ id: 'a', n: 3 });
    expect(await r.get('a')).toEqual({ id: 'a', n: 3 });
    await r.delete('b');
    expect(await r.getAll()).toEqual([{ id: 'a', n: 3 }]);
    expect(f.posted.at(-1)).toEqual({
      perun: 'storage',
      key: 'db/themes',
      value: JSON.stringify([{ id: 'a', n: 3 }]),
    });
  });

  it('hands files to the plugin instead of downloading them', async () => {
    const f = frame();
    const p = obsidianPlatform(config({}));
    p.saveFile('a.txt', 'hello', 'text/plain');
    p.saveFile('b.png', new Blob([new Uint8Array([1, 2])]), 'image/png');
    await new Promise((r) => setTimeout(r, 0));
    expect(f.posted[0]).toEqual({ perun: 'file', name: 'a.txt', data: 'hello' });
    const png = f.posted[1] as { name: string; data: ArrayBuffer };
    expect(png.name).toBe('b.png');
    expect([...new Uint8Array(png.data)]).toEqual([1, 2]);
  });
});
