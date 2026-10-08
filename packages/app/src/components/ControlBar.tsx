// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { NOMINAL_TEMPERATURE, getUnitText } from '@perun/elements';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { t, tf } from '../i18n.ts';

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
      <span className="slider-label">{t(props.label)}</span>
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
        <Slider.Thumb className="slider-thumb" aria-label={t(props.label)} />
      </Slider.Root>
    </label>
  );
}

/** Turns the teaching tools (pencil, laser, eraser) on and off. */
function DrawButton() {
  const on = useApp((s) => s.teach.tool !== null);
  const label = on ? 'Stop drawing' : 'Draw on the circuit';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button"
          onClick={() => controller.setTeachTool(on ? null : 'pencil')}
          aria-label={t(label)}
          aria-pressed={on}
          data-testid="draw-toggle"
        >
          <Icon name="edit" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {t(label)}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Shows and hides the rewind timeline (PLAN.md Phase 20). */
function RewindButton() {
  const open = useApp((s) => s.rewind.open);
  const label = open ? 'Hide the timeline' : 'Rewind';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button"
          onClick={() => controller.setRewindOpen(!open)}
          aria-label={t(label)}
          aria-pressed={open}
          data-testid="rewind-toggle"
        >
          <Icon name="history" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {t(label)}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Touch screens pan with one finger; this turns a one-finger drag into a selection box. */
function BoxSelectButton() {
  const on = useApp((s) => s.boxSelect);
  const label = on ? 'Drag to pan' : 'Drag to select';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button touch-only"
          onClick={() => useApp.setState({ boxSelect: !on })}
          aria-label={t(label)}
          aria-pressed={on}
          data-testid="box-select-toggle"
        >
          <Icon name="selectAll" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {t(label)}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
          aria-label={t(props.label)}
          data-testid={props.testId}
        >
          {props.children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {t(props.label)}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * The simulation and current speed sliders, in a popover: upstream keeps them in its sidebar all
 * the time, but they are set now and then rather than used constantly.
 */
function SpeedButton() {
  const speed = useApp((s) => s.speed);
  const currentSpeed = useApp((s) => s.currentSpeed);
  return (
    <Popover.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="icon-button"
              aria-label={t('Speed')}
              data-testid="speed-button"
            >
              <Icon name="speed" />
            </button>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip" sideOffset={6}>
            {t('Speed')}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Content
          className="speed-popover"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          data-testid="speed-popover"
        >
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Simulation time with three decimals in the largest unit below 1000, so the digit count only
 * changes when the unit does (upstream's getUnitText drops trailing digits, which jitters).
 */
export function timeText(t: number): string {
  const units: [number, string][] = [
    [1, 's'],
    [1e-3, 'ms'],
    [1e-6, 'μs'],
    [1e-9, 'ns'],
  ];
  for (const [scale, unit] of units)
    if (Math.abs(t) >= scale) return `${(t / scale).toFixed(3).padStart(7)} ${unit.padStart(2)}`;
  return t === 0 ? '  0.000  s' : `${(t / 1e-12).toFixed(3).padStart(7)} ps`;
}

/**
 * The circuit temperature in a fixed width (sign, three digits, one decimal), so the bar does not
 * shift when it changes.
 */
export function temperatureText(c: number): string {
  const s = (Object.is(Math.round(c * 10), -0) ? 0 : c).toFixed(1);
  return `T = ${s.padStart(6)} °C`;
}

/**
 * Bottom bar: run controls, speed sliders, the time readouts and messages (upstream shows these
 * in the canvas info area).
 */
export function ControlBar() {
  const running = useApp((s) => s.running);
  const rewound = useApp((s) => !s.rewind.live);
  const runLabel = running ? 'Stop' : rewound ? 'Replay' : 'Run';
  const {
    t: simTime,
    timeStep,
    temperature,
    thermal,
    stopMessage,
    badConnections,
  } = useApp((s) => s.status);
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
          disabled={stopped && !running && !rewound}
          data-testid="run-stop"
          aria-pressed={running}
          title={t(runLabel)}
        >
          <Icon
            key={running ? 'pause' : 'play'}
            name={running ? 'pause' : 'play'}
            className="icon icon-swap"
          />
          <span className="run-label">{t(runLabel)}</span>
        </button>
        <IconButton label="Reset" onClick={() => controller.reset()} testId="reset">
          <Icon name="replay" />
        </IconButton>
        <RewindButton />
        <IconButton label="Centre the circuit" onClick={() => controller.fit()}>
          <Icon name="fit" />
        </IconButton>
        <SpeedButton />
        <BoxSelectButton />
        <DrawButton />
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
            {badConnections}
            {t(badConnections === 1 ? ' bad connection' : ' bad connections')}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="chip" title={warnings.join('\n')} data-testid="load-warnings">
            <Icon name="warning" size={16} />
            {tf(
              warnings.length === 1
                ? '{n} unsupported item skipped'
                : '{n} unsupported items skipped',
              { n: warnings.length },
            )}
          </span>
        )}
        <span className="readout readout-time" data-testid="sim-time">
          t = {timeText(simTime)}
        </span>
        <button
          type="button"
          className="readout readout-step readout-button"
          title={t('Change the time step')}
          data-testid="time-step"
          onClick={() => openDialog('simSettings')}
        >
          {t('time step = ')}
          {getUnitText(timeStep, 's')}
        </button>
        {(thermal || temperature !== NOMINAL_TEMPERATURE) && (
          <button
            type="button"
            className="readout readout-temp readout-button"
            title={t('Change the circuit temperature')}
            data-testid="sim-temperature-readout"
            onClick={() => openDialog('simSettings')}
          >
            {temperatureText(temperature)}
          </button>
        )}
      </div>
    </footer>
  );
}
