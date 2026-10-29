// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * The order undocked scope cards are drawn in, back to front (not upstream: there the element
 * order decides). A new card goes on top, and a card that is pressed comes to the top. The
 * order belongs to the view, not the circuit, so raising a card doesn't change the file or count
 * as an edit; the file keeps element order, which is the order a circuit opens in.
 */
export class CardStack<T> {
  private order: readonly T[] = [];
  /** The items as last arranged, in element order. */
  private last: readonly T[] = [];

  /** `items` (in element order) from back to front. Cheap when nothing changed. */
  arrange(items: readonly T[]): readonly T[] {
    const last = this.last;
    if (items.length === last.length && items.every((it, i) => it === last[i])) return this.order;
    this.last = [...items];
    let kept: T[];
    if (last.length > 0 && !last.some((it) => items.includes(it))) {
      // the circuit was read again (undo, redo): the same cards, as new objects in element order
      kept = this.order
        .map((it) => items[last.indexOf(it)])
        .filter((it): it is T => it !== undefined);
    } else kept = this.order.filter((it) => items.includes(it));
    for (const it of items) if (!kept.includes(it)) kept.push(it);
    this.order = kept;
    return kept;
  }

  /** Bring a card to the top. Returns false if it was there already (or isn't stacked). */
  raise(item: T): boolean {
    const i = this.order.indexOf(item);
    if (i < 0 || i === this.order.length - 1) return false;
    this.order = [...this.order.filter((it) => it !== item), item];
    return true;
  }

  /** Forget the order: another circuit opens with its cards in element order. */
  reset(): void {
    this.order = [];
    this.last = [];
  }
}
