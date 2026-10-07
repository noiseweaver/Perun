// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { FieldOptions } from '@circuitjs-next/render';
import type { Theme } from '@circuitjs-next/theme';
import { useState, type ReactNode } from 'react';
import { t } from '../i18n.ts';
import { shownTheme, useApp } from '../store.ts';
import { VISUALIZATIONS } from '../visualizations.ts';
import { Icon } from './Icon.tsx';

/** What each visualization looks like on the canvas, drawn small in the theme's colors. */
function Swatch({ kind, theme }: { kind: keyof FieldOptions; theme: Theme }): ReactNode {
  const c = theme.circuit;
  const svg = (children: ReactNode) => (
    <svg className="field-legend-swatch" viewBox="0 0 28 14" aria-hidden>
      {children}
    </svg>
  );
  switch (kind) {
    case 'charge':
      return svg(
        <>
          <path d="M3 7h4M5 5v4" stroke={c.voltage.positive} strokeWidth="1.3" />
          <path d="M10 2v10M18 2v10" stroke={c.component} strokeWidth="1.6" />
          <path d="M11.5 7h4" stroke={c.electricField} strokeWidth="1" />
          <path d="M17 7l-2-1.6v3.2z" fill={c.electricField} />
          <path d="M21 7h4" stroke={c.voltage.negative} strokeWidth="1.3" />
        </>,
      );
    case 'magnetic':
      return svg(
        <>
          <ellipse
            cx="14"
            cy="7"
            rx="12"
            ry="5"
            fill="none"
            stroke={c.magneticField}
            strokeDasharray="2.5 2"
          />
          <path d="M12 2l3-1.6v3.2z" fill={c.magneticField} />
        </>,
      );
    case 'emf':
      return svg(
        <>
          <path d="M4 7h18" stroke={c.text} strokeWidth="1.4" />
          <path d="M25 7l-4-2.4v4.8z" fill={c.text} />
        </>,
      );
    case 'energy':
      return svg(
        <>
          <defs>
            <radialGradient id="field-legend-glow">
              <stop offset="0" stopColor={c.energy} stopOpacity="0.6" />
              <stop offset="1" stopColor={c.energy} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="14" cy="7" r="7" fill="url(#field-legend-glow)" />
        </>,
      );
    case 'energyFlow':
      return svg(
        <path
          d="M5 4l3 3-3 3M11 4l3 3-3 3M17 4l3 3-3 3"
          fill="none"
          stroke={c.energy}
          strokeWidth="1.4"
        />,
      );
    case 'heat':
      return svg(
        <>
          <defs>
            <radialGradient id="field-legend-heat">
              <stop offset="0" stopColor={c.heat} stopOpacity="0.7" />
              <stop offset="1" stopColor={c.heat} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="8" cy="7" r="7" fill="url(#field-legend-heat)" />
          <path d="M18 3.5v5.2" stroke={c.heat} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="18" cy="10" r="2.2" fill={c.heat} />
        </>,
      );
    case 'semiconductors':
      return svg(
        <>
          <rect x="3" y="2" width="8" height="10" fill={c.electricField} opacity="0.35" />
          <path d="M16 7h10" stroke={c.voltage.negative} strokeWidth="4" opacity="0.55" />
        </>,
      );
  }
}

/**
 * A small key to the visualizations that are on (Options > Visualizations), in the canvas's top
 * left corner. It folds to its header.
 */
export function FieldLegend() {
  const fields = useApp((s) => s.settings.fields);
  const theme = useApp(shownTheme);
  const [folded, setFolded] = useState(false);
  const shown = VISUALIZATIONS.filter((v) => fields[v.key]);
  if (shown.length === 0) return null;
  return (
    <section
      className="field-legend"
      aria-label={t('Legend')}
      data-testid="field-legend"
      data-canvas-overlay
    >
      <button
        type="button"
        className="field-legend-header"
        aria-expanded={!folded}
        onClick={() => setFolded(!folded)}
      >
        <Icon name="info" size={16} />
        <span>{t('Legend')}</span>
        <Icon
          name={folded ? 'expandMore' : 'expandLess'}
          size={16}
          className="icon menu-trailing"
        />
      </button>
      {!folded && (
        <ul className="field-legend-list">
          {shown.map((v) => (
            <li key={v.key}>
              <Swatch kind={v.key} theme={theme} />
              <span>{t(v.legend)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
