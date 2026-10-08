// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { CONFIG_MARKER, fillConfig, shimScript } from './shim.ts';

/** Run the shim in a fake frame window; returns the window and what it posted to its parent. */
function frame(storage: Record<string, string>, files: Record<string, string> = {}) {
  const posted: unknown[] = [];
  const device = new Map<string, string>();
  const win: Record<string, unknown> = {
    perunEmbed: { storage },
    parent: { postMessage: (m: unknown) => posted.push(m) },
    fetch: () => Promise.reject(new Error('network')),
    localStorage: {
      getItem: (k: string) => device.get(k) ?? null,
      setItem: (k: string, v: string) => device.set(k, v),
      removeItem: (k: string) => device.delete(k),
    },
  };
  win['window'] = win;
  const code = shimScript(files).replace(/^<script>|<\/script>$/g, '');
  // the script reads the frame only through `window`
  new Function('window', code)(win);
  return { win, posted, device, storage: win['localStorage'] as Storage };
}

describe('the editor frame', () => {
  it('fills in the configuration without breaking out of the script', () => {
    const page = `<head>${CONFIG_MARKER}</head>`;
    const html = fillConfig(page, { text: '</script><b>$& $1', n: 1 });
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('$& $1');
    const json = html.slice(html.indexOf('=') + 1, html.lastIndexOf(';</script>'));
    expect(JSON.parse(json)).toEqual({ text: '</script><b>$& $1', n: 1 });
  });

  it("keeps the app's settings in the plugin, and the clipboard on the device", () => {
    const f = frame({ a: '1' });
    expect(f.storage.getItem('a')).toBe('1');
    f.storage.setItem('b', '2');
    f.storage.setItem('b', '2');
    f.storage.removeItem('a');
    f.storage.setItem('circuitClipboard', 'x');
    expect(f.posted).toEqual([
      { perun: 'storage', key: 'b', value: '2' },
      { perun: 'storage', key: 'a', value: null },
    ]);
    expect(f.storage.getItem('circuitClipboard')).toBe('x');
    expect(f.device.get('circuitClipboard')).toBe('x');
    expect(f.storage.length).toBe(1);
    expect(f.storage.key(0)).toBe('b');
  });

  it('serves the inlined files to fetch', async () => {
    const f = frame({}, { 'setuplist.txt': 'list', 'circuits/a b.txt': 'circuit' });
    const fetch = f.win['fetch'] as (u: string) => Promise<Response>;
    expect(await (await fetch('./setuplist.txt')).text()).toBe('list');
    expect(await (await fetch('app://obsidian.md/circuits/a%20b.txt')).text()).toBe('circuit');
    await expect(fetch('https://example.com/x.txt')).rejects.toThrow('network');
  });
});
