// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { CardStack } from './cardStack.ts';

const card = (name: string): { name: string } => ({ name });
const names = (xs: readonly { name: string }[]): string[] => xs.map((x) => x.name);

describe('CardStack', () => {
  it('stacks cards in element order until one is raised', () => {
    const s = new CardStack<{ name: string }>();
    const [a, b, c] = [card('a'), card('b'), card('c')];
    expect(names(s.arrange([a, b, c]))).toEqual(['a', 'b', 'c']);
    expect(s.raise(a)).toBe(true);
    expect(names(s.arrange([a, b, c]))).toEqual(['b', 'c', 'a']);
    expect(s.raise(a)).toBe(false);
  });

  it('puts a new card on top and drops a removed one', () => {
    const s = new CardStack<{ name: string }>();
    const [a, b, c] = [card('a'), card('b'), card('c')];
    s.arrange([a, b]);
    s.raise(a);
    expect(names(s.arrange([a, b, c]))).toEqual(['b', 'a', 'c']);
    expect(names(s.arrange([b, c]))).toEqual(['b', 'c']);
  });

  it('keeps the order when undo reads the circuit again', () => {
    const s = new CardStack<{ name: string }>();
    const a = card('a');
    s.arrange([a, card('b'), card('c')]);
    s.raise(a);
    const again = [card('a2'), card('b2'), card('c2')];
    expect(names(s.arrange(again))).toEqual(['b2', 'c2', 'a2']);
  });

  it('forgets the order on reset', () => {
    const s = new CardStack<{ name: string }>();
    const a = card('a');
    s.arrange([a, card('b')]);
    s.raise(a);
    s.reset();
    expect(names(s.arrange([card('x'), card('y')]))).toEqual(['x', 'y']);
  });
});
