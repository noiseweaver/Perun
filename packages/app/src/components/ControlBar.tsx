// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { getUnitText } from '@circuitjs-next/elements';
import * as Slider from '@radix-ui/react-slider';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';

function LabeledSlider(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <label className="slider-field">
      <span className="slider-label">{props.label}</span>
      <Slider.Root
        className="slider"
        min={props.min}
        max={props.max}
        step={1}
        value={[props.value]}
        onValueChange={(v) => props.onChange(v[0] ?? props.value)}
        data-testid={props.testId}
      >
        <Slider.Track className="slider-track">
          <Slider.Range className="slider-range" />
        </Slider.Track>
        <Slider.Thumb className="slider-thumb" aria-label={props.label} />
      </Slider.Root>
    </label>
  );
}

/** An icon button with a plain tooltip. */
function IconButton(props: {
  label: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button"
          onClick={props.onClick}
          aria-label={props.label}
          data-testid={props.testId}
        >
          {props.children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {props.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Bottom bar: run controls, speed sliders, the time readouts and messages (upstream shows these
 * in the canvas info area).
 */
export function ControlBar() {
  const running = useApp((s) => s.running);
  const speed = useApp((s) => s.speed);
  const currentSpeed = useApp((s) => s.currentSpeed);
  const { t, timeStep, stopMessage, badConnections } = useApp((s) => s.status);
  const warnings = useApp((s) => s.warnings);
  const error = useApp((s) => s.error);
  const stopped = stopMessage !== null;

  return (
    <footer className="control-bar">
      <div className="control-group">
        <button
          type="button"
          className={`button button-filled ${running ? '' : 'button-paused'}`}
          onClick={() => controller.setRunning(!running)}
          disabled={stopped && !running}
          data-testid="run-stop"
          aria-pressed={running}
        >
          <Icon name={running ? 'pause' : 'play'} />
          {running ? 'Stop' : 'Run'}
        </button>
        <IconButton label="Reset" onClick={() => controller.reset()} testId="reset">
          <Icon name="replay" />
        </IconButton>
        <IconButton label="Centre the circuit" onClick={() => controller.fit()}>
          <Icon name="fit" />
        </IconButton>
      </div>

      <div className="control-group control-sliders">
        <LabeledSlider
          label="Simulation speed"
          min={0}
          max={259}
          value={speed}
          onChange={(v) => useApp.setState({ speed: v })}
          testId="speed-slider"
        />
        <LabeledSlider
          label="Current speed"
          min={1}
          max={99}
          value={currentSpeed}
          onChange={(v) => useApp.setState({ currentSpeed: v })}
          testId="current-slider"
        />
      </div>

      <div className="status">
        {stopMessage !== null && (
          <span className="chip chip-error" data-testid="stop-message">
            <Icon name="error" size={16} />
            {stopMessage}
          </span>
        )}
        {error !== null && (
          <span className="chip chip-error" data-testid="load-error">
            <Icon name="error" size={16} />
            {error}
          </span>
        )}
        {badConnections > 0 && (
          <span className="chip">
            <Icon name="warning" size={16} />
            {badConnections} bad connection{badConnections === 1 ? '' : 's'}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="chip" title={warnings.join('\n')} data-testid="load-warnings">
            <Icon name="warning" size={16} />
            {warnings.length} unsupported item{warnings.length === 1 ? '' : 's'} skipped
          </span>
        )}
        <span className="readout readout-time" data-testid="sim-time">
          t = {getUnitText(t, 's')}
        </span>
        <span className="readout readout-step">time step = {getUnitText(timeStep, 's')}</span>
      </div>
    </footer>
  );
}
