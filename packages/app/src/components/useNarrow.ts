// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { useEffect, useState } from 'react';

/** Narrow screens (phones) get sheets instead of side panels and dropdowns. Matches the CSS. */
const NARROW = '(max-width: 719px)';

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
