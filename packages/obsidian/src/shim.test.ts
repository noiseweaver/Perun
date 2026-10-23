// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { CONFIG_MARKER, fillConfig, shimScript } from './shim.ts';

/** Run the shim in a fake frame window. */
function frame(files: Record<string, string> = {}) {
  const win: Record<string, unknown> = {
    fetch: () => Promise.reject(new Error('network')),
  };
  win['window'] = win;
  const code = shimScript(files).replace(/^<script>|<\/script>$/g, '');
  // the script reads the frame only through `window`
  new Function('window', code)(win);
  return { win };
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

  it('serves the inlined files to fetch', async () => {
    const f = frame({ 'setuplist.txt': 'list', 'circuits/a b.txt': 'circuit' });
    const fetch = f.win['fetch'] as (u: string) => Promise<Response>;
    expect(await (await fetch('./setuplist.txt')).text()).toBe('list');
    expect(await (await fetch('app://obsidian.md/circuits/a%20b.txt')).text()).toBe('circuit');
    await expect(fetch('https://example.com/x.txt')).rejects.toThrow('network');
  });
});
