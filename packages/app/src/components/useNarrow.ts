// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { useEffect, useState } from 'react';

/** Narrow screens (phones) get sheets instead of side panels and dropdowns. Matches the CSS. */
const NARROW = '(max-width: 719px)';
/** Phones either way up: narrow, or short (landscape). Panels over the canvas start folded. */
const COMPACT = '(max-width: 719px), (max-height: 559px)';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const change = (): void => setOn(mq.matches);
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [query]);
  return on;
}

export function useNarrow(): boolean {
  return useMedia(NARROW);
}

export function useCompact(): boolean {
  return useMedia(COMPACT);
}
