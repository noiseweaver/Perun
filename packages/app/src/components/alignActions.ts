// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { controller } from '../SimController.ts';
import type { IconName } from './Icon.tsx';

/** Align and spread, as the Edit menu, the right-click menu and the property panel show them. */
export interface AlignAction {
  label: string;
  icon: IconName;
  /** Spreading needs three parts; lining up two. */
  spread: boolean;
  testId: string;
  run: () => void;
}

export const ALIGN_ACTIONS: readonly AlignAction[] = [
  {
    label: 'Align left',
    icon: 'alignLeft',
    spread: false,
    testId: 'align-left',
    run: () => controller.align('left'),
  },
  {
    label: 'Align centres',
    icon: 'alignCentre',
    spread: false,
    testId: 'align-centre',
    run: () => controller.align('centre'),
  },
  {
    label: 'Align right',
    icon: 'alignRight',
    spread: false,
    testId: 'align-right',
    run: () => controller.align('right'),
  },
  {
    label: 'Align top',
    icon: 'alignTop',
    spread: false,
    testId: 'align-top',
    run: () => controller.align('top'),
  },
  {
    label: 'Align middles',
    icon: 'alignMiddle',
    spread: false,
    testId: 'align-middle',
    run: () => controller.align('middle'),
  },
  {
    label: 'Align bottom',
    icon: 'alignBottom',
    spread: false,
    testId: 'align-bottom',
    run: () => controller.align('bottom'),
  },
  {
    label: 'Spread across',
    icon: 'spreadX',
    spread: true,
    testId: 'spread-x',
    run: () => controller.spread('x'),
  },
  {
    label: 'Spread down',
    icon: 'spreadY',
    spread: true,
    testId: 'spread-y',
    run: () => controller.spread('y'),
  },
];
