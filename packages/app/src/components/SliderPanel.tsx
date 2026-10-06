// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import * as Slider from '@radix-ui/react-slider';
import { useState } from 'react';
import { controller } from '../SimController.ts';
import { SLIDER_MAX } from '../sliders.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { useCompact } from './useNarrow.ts';
import { t } from '../i18n.ts';

/**
 * The circuit's sliders (upstream shows them in its side panel under the buttons): pots, LDRs,
 * thermistors, variable rails and the sliders added with "Sliders…". A card over the top right of
 * the canvas; on phones (either way up) it starts folded.
 */
export function SliderPanel() {
  useApp((s) => s.sliderRevision);
  const compact = useCompact();
  const [folded, setFolded] = useState<boolean | null>(null);
  const entries = controller.sliders();
  if (entries.length === 0) return null;
  const isFolded = folded ?? compact;
  return (
    <section
      className="slider-panel"
      aria-label={t('Sliders')}
      data-testid="slider-panel"
      data-canvas-overlay
      data-folded={isFolded || undefined}
    >
      <button
        type="button"
        className="slider-panel-header"
        aria-expanded={!isFolded}
        onClick={() => setFolded(!isFolded)}
        data-testid="slider-panel-toggle"
      >
        <Icon name="tune" size={18} />
        <span>{t('Sliders')}</span>
        <Icon
          name={isFolded ? 'expandMore' : 'expandLess'}
          size={18}
          className="icon menu-trailing"
        />
      </button>
      {!isFolded && (
        <div className="slider-panel-list">
          {entries.map((e) => (
            <div
              key={e.key}
              className="slider-row"
              onPointerEnter={() => controller.setSliderHover(e.elm)}
              onPointerLeave={() => controller.setSliderHover(null)}
              data-testid="slider-row"
            >
              <div className="slider-row-head">
                <span className="slider-row-label">{e.label}</span>
                <span className="slider-row-value" data-testid="slider-value">
                  {e.valueText}
                </span>
              </div>
              <Slider.Root
                className="slider slider-wide"
                min={0}
                max={SLIDER_MAX}
                step={1}
                value={[Math.min(Math.max(e.position, 0), SLIDER_MAX)]}
                onValueChange={(v) => controller.setSlider(e, v[0] ?? e.position)}
                onValueCommit={() => controller.endSliderDrag()}
                onFocus={() => controller.setSliderHover(e.elm)}
                onBlur={() => controller.setSliderHover(null)}
              >
                <Slider.Track className="slider-track">
                  <Slider.Range className="slider-range" />
                </Slider.Track>
                <Slider.Thumb
                  className="slider-thumb"
                  aria-label={e.label}
                  aria-valuetext={e.valueText.trim()}
                />
              </Slider.Root>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
