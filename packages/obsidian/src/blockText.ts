// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** ```circuit (or ~~~circuit) fenced blocks: the fence, the body and the closing fence. */
const BLOCK = /^([ \t]*)(`{3,}|~{3,})[ \t]*circuit[^\n]*\n([\s\S]*?)\n?^\1\2[ \t]*$/gm;

/**
 * `note` with the body of its first circuit block whose text is `old` replaced by `text`, or null
 * when no block has that text (it was edited or removed meanwhile). Blank lines at either end
 * don't count.
 */
export function replaceBlock(note: string, old: string, text: string): string | null {
  const want = old.trim();
  for (const m of note.matchAll(BLOCK)) {
    const body = m[3] ?? '';
    if (body.trim() !== want) continue;
    const start = (m.index ?? 0) + m[0].indexOf('\n') + 1;
    const end = start + body.length;
    // an empty block has no line break before its closing fence
    const brk = note[end] === '\n' ? '' : '\n';
    return note.slice(0, start) + text.trim() + brk + note.slice(end);
  }
  return null;
}
