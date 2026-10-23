// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** `name` without the characters Obsidian doesn't allow in a file name or a link to it. */
export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
  return s === '' || s.startsWith('.') ? `Circuit${s}` : s;
}

/** A vault path as Obsidian writes them: no doubled, leading or trailing slashes. */
function vaultPath(p: string): string {
  return p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

/** `dir` + `name`, or `name 1`, `name 2`… before its extension: the first one not taken. */
export function freePath(taken: (path: string) => boolean, dir: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let path = vaultPath(`${dir}${name}`);
  for (let n = 1; taken(path); n++) path = vaultPath(`${dir}${base} ${n}${ext}`);
  return path;
}
