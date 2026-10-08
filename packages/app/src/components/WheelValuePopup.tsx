// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { t } from '../i18n.ts';
import { useApp } from '../store.ts';

/** Every value gets the same width, so the list doesn't shift as it scrolls ("100.0k" plus one). */
const VALUE_WIDTH = 7;

/**
 * The values around a part's current one while the mouse wheel steps it on the canvas (upstream
 * ScrollValuePopup): two bigger above, the current one in the middle, two smaller below.
 */
export function WheelValuePopup() {
  const w = useApp((s) => s.wheelValue);
  if (w === null) return null;
  return (
    <div
      className="wheel-value"
      style={{ left: w.x + 18, top: w.y - 58 }}
      data-testid="wheel-value"
      aria-live="polite"
    >
      <div className="wheel-value-name">{t(w.name)}</div>
      {w.values.map((v, i) => (
        <div
          key={`${w.seq}:${i}`}
          className={`wheel-value-row${i === 2 ? ' wheel-value-current' : ''}`}
          data-off={Math.abs(i - 2)}
          data-testid={i === 2 ? 'wheel-value-current' : undefined}
        >
          {(v ?? '---').padStart(VALUE_WIDTH)}
        </div>
      ))}
    </div>
  );
}
