// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { BUILTIN_THEMES } from '@circuitjs-next/theme';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Slider from '@radix-ui/react-slider';
import { useRef, useState } from 'react';
import type { ExampleMenu } from '../examples.ts';
import { controller } from '../SimController.ts';
import { openExample } from '../startup.ts';
import { updateSettings, useApp, type CircuitDisplay } from '../store.ts';
import { OpenLinkDialog } from './OpenLinkDialog.tsx';

function ExampleItems({ menu }: { menu: ExampleMenu }) {
  return (
    <>
      {menu.items.map((it, i) =>
        it.kind === 'menu' ? (
          <Menu.Sub key={`m${i}`}>
            <Menu.SubTrigger className="menu-item">
              {it.title}
              <span className="menu-chevron" aria-hidden>
                ›
              </span>
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent className="menu-content" sideOffset={2}>
                <ExampleItems menu={it} />
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
        ) : (
          <Menu.Item
            key={it.file}
            className="menu-item"
            onSelect={() => void openExample(it.file, it.title)}
          >
            {it.title}
          </Menu.Item>
        ),
      )}
    </>
  );
}

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
      <span>{props.label}</span>
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

export function Toolbar() {
  const running = useApp((s) => s.running);
  const speed = useApp((s) => s.speed);
  const currentSpeed = useApp((s) => s.currentSpeed);
  const display = useApp((s) => s.display);
  const settings = useApp((s) => s.settings);
  const examples = useApp((s) => s.examples);
  const stopped = useApp((s) => s.status.stopMessage !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const setDisplay = (patch: Partial<CircuitDisplay>): void =>
    useApp.setState({ display: { ...useApp.getState().display, ...patch } });

  const openFile = async (f: File): Promise<void> => {
    controller.load(await f.text(), f.name);
  };

  return (
    <header className="toolbar">
      <Menu.Root>
        <Menu.Trigger className="menu-trigger">File</Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu-content" sideOffset={4} align="start">
            <Menu.Item className="menu-item" onSelect={() => fileInput.current?.click()}>
              Open file…
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => setLinkOpen(true)}>
              Open link…
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <Menu.Root>
        <Menu.Trigger
          className="menu-trigger"
          disabled={examples === null}
          data-testid="circuits-menu"
        >
          Circuits
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu-content" sideOffset={4} align="start">
            {examples && <ExampleItems menu={examples.root} />}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <Menu.Root>
        <Menu.Trigger className="menu-trigger" data-testid="options-menu">
          Options
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu-content" sideOffset={4} align="start">
            <Menu.CheckboxItem
              className="menu-item"
              checked={display.showDots}
              onCheckedChange={(v) => setDisplay({ showDots: v })}
            >
              <Check on={display.showDots} /> Show current
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              className="menu-item"
              checked={display.voltageColors}
              onCheckedChange={(v) => setDisplay({ voltageColors: v })}
            >
              <Check on={display.voltageColors} /> Show voltage
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              className="menu-item"
              checked={display.showValues}
              onCheckedChange={(v) => setDisplay({ showValues: v })}
            >
              <Check on={display.showValues} /> Show values
            </Menu.CheckboxItem>
            <Menu.Separator className="menu-separator" />
            <Menu.CheckboxItem
              className="menu-item"
              checked={settings.euroResistors}
              onCheckedChange={(v) => updateSettings({ euroResistors: v })}
            >
              <Check on={settings.euroResistors} /> European resistors
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              className="menu-item"
              checked={settings.showOhm}
              onCheckedChange={(v) => updateSettings({ showOhm: v })}
            >
              <Check on={settings.showOhm} /> Show Ω after resistances
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              className="menu-item"
              checked={settings.conventionalCurrent}
              onCheckedChange={(v) => updateSettings({ conventionalCurrent: v })}
            >
              <Check on={settings.conventionalCurrent} /> Conventional current motion
            </Menu.CheckboxItem>
            <Menu.Separator className="menu-separator" />
            <Menu.Label className="menu-label">Theme</Menu.Label>
            <Menu.RadioGroup
              value={settings.themeId}
              onValueChange={(v) => updateSettings({ themeId: v })}
            >
              {Object.entries(BUILTIN_THEMES).map(([id, t]) => (
                <Menu.RadioItem
                  key={id}
                  value={id}
                  className="menu-item"
                  data-testid={`theme-${id}`}
                >
                  <Check on={settings.themeId === id} /> {t.meta.name}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <div className="toolbar-sep" />

      <button
        type="button"
        className={`button ${running ? 'button-running' : 'button-stopped'}`}
        onClick={() => controller.setRunning(!running)}
        disabled={stopped && !running}
        data-testid="run-stop"
        aria-pressed={running}
      >
        {running ? 'Stop' : 'Run'}
      </button>
      <button
        type="button"
        className="button"
        onClick={() => controller.reset()}
        data-testid="reset"
      >
        Reset
      </button>
      <button
        type="button"
        className="button"
        onClick={() => controller.fit()}
        title="Centre the circuit"
      >
        Fit
      </button>

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

      <input
        ref={fileInput}
        type="file"
        accept=".txt,.circuitjs,.xml,text/plain"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = '';
        }}
      />
      <OpenLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
    </header>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className="menu-check" aria-hidden>
      {on ? '✓' : ''}
    </span>
  );
}
