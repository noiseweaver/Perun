// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The teaching toolbar (PLAN.md Phase 9, not in upstream): pencil, laser pointer and eraser, the
// theme's pen colors, Undo and Clear. Drawings are an overlay and never saved with the circuit.

import { controller } from '../SimController.ts';
import { shownTheme, useApp, type TeachTool } from '../store.ts';
import { Icon, type IconName } from './Icon.tsx';
import { t, tf } from '../i18n.ts';

const TOOLS: [TeachTool, IconName, string][] = [
  ['pencil', 'edit', 'Pencil'],
  ['laser', 'laser', 'Laser pointer'],
  ['eraser', 'eraser', 'Eraser'],
];

export function TeachBar() {
  const teach = useApp((s) => s.teach);
  const pens = useApp((s) => shownTheme(s).teaching.pens);
  if (teach.tool === null) return null;
  return (
    <div
      className="teach-bar"
      role="toolbar"
      aria-label={t('Drawing tools')}
      data-testid="teach-bar"
    >
      <div className="teach-group">
        {TOOLS.map(([tool, icon, label]) => (
          <button
            key={tool}
            type="button"
            className="icon-button"
            aria-label={t(label)}
            title={t(label)}
            aria-pressed={teach.tool === tool}
            onClick={() => controller.setTeachTool(tool)}
            data-testid={`teach-${tool}`}
          >
            <Icon name={icon} />
          </button>
        ))}
      </div>
      {/* pen colors only matter to the pencil */}
      {teach.tool === 'pencil' && (
        <div className="teach-group" role="radiogroup" aria-label={t('Pen color')}>
          {pens.map((color, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              className="teach-swatch"
              style={{ background: color }}
              aria-checked={teach.pen === i}
              aria-label={tf('Pen {n}', { n: i + 1 })}
              title={tf('Pen {n}', { n: i + 1 })}
              onClick={() => controller.setTeachPen(i)}
              data-testid={`teach-pen-${i}`}
            />
          ))}
        </div>
      )}
      <div className="teach-group">
        <button
          type="button"
          className="icon-button"
          aria-label={t('Undo drawing')}
          title={t('Undo drawing')}
          disabled={!teach.canUndo}
          onClick={() => controller.teachUndo()}
          data-testid="teach-undo"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('Clear drawings')}
          title={t('Clear drawings')}
          disabled={teach.strokes === 0}
          onClick={() => controller.teachClear()}
          data-testid="teach-clear"
        >
          <Icon name="delete" />
        </button>
        <button
          type="button"
          className="button"
          onClick={() => controller.setTeachTool(null)}
          data-testid="teach-done"
        >
          {t('Done')}
        </button>
      </div>
    </div>
  );
}
