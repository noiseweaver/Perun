// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import {
  copyName,
  filterByName,
  findByName,
  nameFromTitle,
  sortNewestFirst,
} from './myCircuits.ts';

const list = [
  { id: 'a', name: 'Fuzz Face', modified: 10 },
  { id: 'b', name: 'Tone stack', modified: 30 },
  { id: 'c', name: 'Big Muff π', modified: 20 },
  { id: 'd', name: 'Ampèremètre', modified: 30 },
];

describe('My circuits', () => {
  it('lists the last changed first, then by name', () => {
    expect(sortNewestFirst(list).map((c) => c.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('finds circuits by every word of a search, ignoring case and accents', () => {
    expect(filterByName(list, 'fuzz').map((c) => c.id)).toEqual(['a']);
    expect(filterByName(list, 'MUFF big').map((c) => c.id)).toEqual(['c']);
    expect(filterByName(list, 'amperemetre').map((c) => c.id)).toEqual(['d']);
    expect(filterByName(list, '  ')).toHaveLength(4);
    expect(filterByName(list, 'wah')).toEqual([]);
  });

  it('spots a name already taken, other than the circuit itself', () => {
    expect(findByName(list, ' tone STACK ')?.id).toBe('b');
    expect(findByName(list, 'Tone stack', 'b')).toBeUndefined();
    expect(findByName(list, 'Tone')).toBeUndefined();
  });

  it('names copies so they never clash', () => {
    expect(copyName('Fuzz Face', list)).toBe('Fuzz Face (copy)');
    const more = [...list, { name: 'Fuzz Face (copy)' }, { name: 'Fuzz Face (copy 2)' }];
    expect(copyName('Fuzz Face', more)).toBe('Fuzz Face (copy 3)');
    // a copy of a copy counts from the original's name
    expect(copyName('Fuzz Face (copy)', more)).toBe('Fuzz Face (copy 3)');
  });

  it('takes the file ending off a file name', () => {
    expect(nameFromTitle('circuitjs-20261016-150300.txt')).toBe('circuitjs-20261016-150300');
    expect(nameFromTitle('amp.circuitjs')).toBe('amp');
    expect(nameFromTitle('LRC Circuit')).toBe('LRC Circuit');
  });
});
