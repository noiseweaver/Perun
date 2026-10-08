// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Rewind and scrub (PLAN.md Phase 20, not in upstream): a timeline over the last seconds of the
// run. Dragging it shows a recorded frame (the run pauses); Play replays from there at the pace it
// was recorded and carries on with the run when it catches up.

import * as Slider from '@radix-ui/react-slider';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { timeText } from './ControlBar.tsx';
import { Icon } from './Icon.tsx';
import { t } from '../i18n.ts';

export function Timeline() {
  const rewind = useApp((s) => s.rewind);
  const running = useApp((s) => s.running);
  const stopped = useApp((s) => s.status.stopMessage !== null);
  if (!rewind.open) return null;
  const { frames, index, live } = rewind;
  const empty = frames < 2;
  const playLabel = running ? 'Pause' : live ? 'Run' : 'Replay';
  return (
    <div
      className="timeline"
      role="group"
      aria-label={t('Rewind')}
      data-testid="timeline"
      data-live={live}
    >
      <button
        type="button"
        className="icon-button"
        aria-label={t(playLabel)}
        title={t(playLabel)}
        disabled={!running && live && stopped}
        onClick={() => controller.setRunning(!running)}
        data-testid="timeline-play"
      >
        <Icon name={running ? 'pause' : 'play'} />
      </button>
      <Slider.Root
        className="slider timeline-slider"
        min={0}
        max={Math.max(1, frames - 1)}
        step={1}
        value={[empty ? 1 : index]}
        disabled={empty}
        onValueChange={(v) => controller.scrub(v[0] ?? index)}
        data-testid="timeline-slider"
      >
        <Slider.Track className="slider-track">
          <Slider.Range className="slider-range" />
        </Slider.Track>
        <Slider.Thumb className="slider-thumb" aria-label={t('Time shown')} />
      </Slider.Root>
      <span className="readout readout-time timeline-time" data-testid="timeline-time">
        t = {timeText(rewind.t)}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={t('Back to live')}
        title={t('Back to live')}
        disabled={live}
        onClick={() => controller.goLive()}
        data-testid="timeline-live"
      >
        <Icon name="skipNext" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('Close the timeline')}
        title={t('Close the timeline')}
        onClick={() => controller.setRewindOpen(false)}
        data-testid="timeline-close"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
