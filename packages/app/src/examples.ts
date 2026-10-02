// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Menus.java (processSetupList)
// (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

export interface ExampleItem {
  kind: 'circuit';
  file: string;
  title: string;
}

export interface ExampleMenu {
  kind: 'menu';
  title: string;
  items: (ExampleItem | ExampleMenu)[];
}

export interface ExampleList {
  root: ExampleMenu;
  /** The circuit marked with `>`, opened when the page has no circuit in its URL. */
  defaultCircuit: ExampleItem | null;
}

/** Parse upstream's `setuplist.txt`: `+Menu`, `-` (end menu), `file title`, `>file title`. */
export function parseSetupList(text: string): ExampleList {
  const root: ExampleMenu = { kind: 'menu', title: 'Circuits', items: [] };
  const stack: ExampleMenu[] = [root];
  let defaultCircuit: ExampleItem | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const current = stack[stack.length - 1] as ExampleMenu;
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line.startsWith('+')) {
      const menu: ExampleMenu = { kind: 'menu', title: line.substring(1), items: [] };
      current.items.push(menu);
      stack.push(menu);
    } else if (line.startsWith('-')) {
      if (stack.length > 1) stack.pop();
    } else {
      const i = line.indexOf(' ');
      if (i <= 0) continue;
      const first = line.startsWith('>');
      const item: ExampleItem = {
        kind: 'circuit',
        file: line.substring(first ? 1 : 0, i),
        title: line.substring(i + 1),
      };
      current.items.push(item);
      if (first && defaultCircuit === null) defaultCircuit = item;
    }
  }
  return { root, defaultCircuit };
}

/** Find an example by file name (for `?startCircuit=`). */
export function findExample(menu: ExampleMenu, file: string): ExampleItem | null {
  for (const it of menu.items) {
    if (it.kind === 'circuit' && it.file === file) return it;
    if (it.kind === 'menu') {
      const f = findExample(it, file);
      if (f) return f;
    }
  }
  return null;
}

export async function fetchExampleList(base = ''): Promise<ExampleList> {
  const r = await fetch(`${base}setuplist.txt`);
  if (!r.ok) throw new Error(`Can't load circuit list (${r.status})`);
  return parseSetupList(await r.text());
}

export async function fetchExample(file: string, base = ''): Promise<string> {
  const r = await fetch(`${base}circuits/${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`Can't load circuit ${file} (${r.status})`);
  return r.text();
}
