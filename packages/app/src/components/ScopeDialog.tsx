// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// After CircuitJS1 ScopePropertiesDialog (src/com/lushprojects/circuitjs1/client/
// ScopePropertiesDialog.java, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the same
// settings and commands, laid out as one scrolling form.

import {
  CapacitorElm,
  MIN_MAN_SCALE,
  TRIGGER_AUTO,
  TRIGGER_EDGE_FALLING,
  TRIGGER_EDGE_RISING,
  TRIGGER_FREERUN,
  TRIGGER_NORMAL,
  UNITS_A,
  UNITS_C,
  UNITS_OHMS,
  UNITS_V,
  UNITS_W,
  VAL_CHARGE,
  VAL_CURRENT,
  VAL_IB,
  VAL_IC,
  VAL_IE,
  VAL_POWER,
  VAL_R,
  VAL_VBC,
  VAL_VBE,
  VAL_VCE,
  VAL_VOLTAGE,
  getScaleUnitsText,
  getUnitText,
  nextHighestScale,
  parseUnits,
  unitString,
  type Scope,
} from '@circuitjs-next/elements';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { Shell } from './DialogShell.tsx';
import { t } from '../i18n.ts';

const MULTA = [2.0, 2.5, 2.0];

/** The scale step below d (upstream downClickHandler). */
function nextLowerScale(d: number): number {
  d *= 0.999;
  let s = MIN_MAN_SCALE;
  let lasts = s;
  for (let a = 0; s < d; a++) {
    lasts = s;
    s *= MULTA[a % 3] ?? 2;
  }
  return lasts;
}

function unitLetter(u: number): string {
  switch (u) {
    case UNITS_V:
      return 'V';
    case UNITS_A:
      return 'I';
    case UNITS_OHMS:
      return 'R';
    case UNITS_W:
      return 'P';
    case UNITS_C:
      return 'Q';
    default:
      return '';
  }
}

function readNumber(s: string): number | null {
  try {
    const v = parseUnits(s);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Upstream trail slider: 0 is the old default, n is round(10^(n/10)) time steps. */
const trailSliderToSteps = (v: number): number => (v <= 0 ? 0 : Math.round(Math.pow(10, v / 10)));
const trailStepsToSlider = (steps: number): number =>
  steps <= 0 ? 0 : Math.round(Math.log10(steps) * 10);

function Check(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className={`field field-check${props.disabled ? ' field-disabled' : ''}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={props.checked}
        disabled={props.disabled ?? false}
        onChange={(e) => props.onChange(e.target.checked)}
        data-testid={props.testId}
      />
      <span>{props.label}</span>
    </label>
  );
}

function Radio(props: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <label className="scope-radio">
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        disabled={props.disabled ?? false}
        onChange={(e) => e.target.checked && props.onSelect()}
        data-testid={props.testId}
      />
      <span>{props.label}</span>
    </label>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="scope-section">
      <h3 className="scope-section-title">{props.title}</h3>
      {props.children}
    </section>
  );
}

/** Scope properties: plots, scales, trigger, X-Y settings, readouts and label. */
export function ScopePropertiesDialog() {
  const scope = controller.dialogScope;
  if (scope === null) return null;
  return <ScopeForm scope={scope} />;
}

function ScopeForm({ scope }: { scope: Scope }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [plotSel, setPlotSel] = useState(0);
  const [label, setLabel] = useState(scope.text ?? '');
  const [scaleText, setScaleText] = useState('');
  const [divText, setDivText] = useState(String(scope.manDivisions));
  const [trigText, setTrigText] = useState(unitString(null, scope.trigger.level));

  // the auto scale and the time per division change as the simulation runs
  useEffect(() => {
    const t = window.setInterval(refresh, 250);
    return () => window.clearInterval(t);
  }, []);

  const mgr = controller.scopes;
  const elm = scope.getSingleElm() ?? scope.getElm();
  const transistor = elm !== null && mgr.kinds.isTransistor(elm);
  const vp = scope.visiblePlots;
  const sel = plotSel < vp.length ? plotSel : 0;
  const plot = vp[sel];
  const manual = scope.isManualScale();

  const changed = (): void => {
    controller.unsavedChanges = true;
    refresh();
  };
  const menu = (cmd: string) => (v: boolean) => {
    scope.handleMenu(cmd, v);
    changed();
  };
  const applyLabel = (): void => {
    scope.text = label.length === 0 ? null : label;
    changed();
  };
  const applyManual = (text = scaleText): void => {
    if (!manual) return;
    const d = readNumber(text);
    if (d !== null && d > 0) scope.setManualScaleValue(sel, Math.max(d, MIN_MAN_SCALE));
    const n = Number.parseInt(divText, 10);
    if (n > 0) scope.setManDivisions(n);
    setScaleText('');
    changed();
  };

  const scaleShown =
    scaleText !== ''
      ? scaleText
      : manual
        ? plot !== undefined
          ? unitString(null, plot.manScale)
          : ''
        : unitString(null, scope.getScaleValue());
  const speedValue = 10 - Math.round(Math.log(scope.speed) / Math.log(2));
  const plotName = (i: number): string => {
    const p = scope.plots[i];
    if (p === undefined) return `Plot ${i + 1}`;
    const name = p.elm?.getScopeText(p.value) ?? `Plot ${i + 1}`;
    return `${name} (${getScaleUnitsText(p.units)})`;
  };
  const p2 = scope.plot2d;
  const plotSelect = (
    value: number,
    set: (v: number) => void,
    withNone: boolean,
    testId?: string,
  ): ReactNode => (
    <select
      className="text-input scope-select"
      value={value}
      data-testid={testId}
      onChange={(e) => {
        set(Number(e.target.value));
        scope.resetGraph();
        changed();
      }}
    >
      {withNone && <option value={-1}>{t('None')}</option>}
      {scope.plots.map((_p, i) => (
        <option key={i} value={i}>
          {plotName(i)}
        </option>
      ))}
    </select>
  );

  return (
    <Shell
      title={t('Scope properties')}
      description={scope.getScopeLabelOrText() || undefined}
      wide
      onClose={() => {
        applyLabel();
        applyManual();
        controller.dialogScope = null;
      }}
    >
      <div className="scope-dialog" data-testid="scope-dialog">
        <Section title={t('Plots')}>
          <div className="scope-grid">
            {!transistor ? (
              <>
                <Check
                  label="Show Voltage"
                  checked={scope.showV && scope.hasPlotValue(VAL_VOLTAGE)}
                  onChange={menu('showvoltage')}
                  testId="scope-show-voltage"
                />
                <Check
                  label="Show Current"
                  checked={scope.showI && scope.hasPlotValue(VAL_CURRENT)}
                  onChange={menu('showcurrent')}
                  testId="scope-show-current"
                />
              </>
            ) : (
              <>
                <Check
                  label="Show Ib"
                  checked={scope.hasPlotValue(VAL_IB)}
                  onChange={menu('showib')}
                />
                <Check
                  label="Show Ic"
                  checked={scope.hasPlotValue(VAL_IC)}
                  onChange={menu('showic')}
                />
                <Check
                  label="Show Ie"
                  checked={scope.hasPlotValue(VAL_IE)}
                  onChange={menu('showie')}
                />
                <Check
                  label="Show Vbe"
                  checked={scope.hasPlotValue(VAL_VBE)}
                  onChange={menu('showvbe')}
                />
                <Check
                  label="Show Vbc"
                  checked={scope.hasPlotValue(VAL_VBC)}
                  onChange={menu('showvbc')}
                />
                <Check
                  label="Show Vce"
                  checked={scope.hasPlotValue(VAL_VCE)}
                  onChange={menu('showvce')}
                />
              </>
            )}
            <Check
              label="Show Power Consumed"
              checked={scope.hasPlotValue(VAL_POWER)}
              onChange={menu('showpower')}
              testId="scope-show-power"
            />
            {elm instanceof CapacitorElm && (
              <Check
                label="Show Charge"
                checked={scope.hasPlotValue(VAL_CHARGE)}
                onChange={menu('showcharge')}
              />
            )}
            <Check
              label="Show Resistance"
              checked={scope.hasPlotValue(VAL_R)}
              disabled={!scope.canShowResistance()}
              onChange={menu('showresistance')}
            />
            <Check
              label="Show Spectrum"
              checked={scope.fftPlot.enabled}
              onChange={menu('showfft')}
            />
            <Check
              label="Log Spectrum"
              checked={scope.fftPlot.logSpectrum}
              onChange={menu('logspectrum')}
            />
          </div>
        </Section>

        <Section title={t('X-Y plots')}>
          <div className="scope-grid">
            <Check
              label="Show V vs I"
              checked={p2.enabled && !p2.plotXY}
              onChange={menu('showvvsi')}
            />
            <Check
              label="Plot X/Y"
              checked={p2.plotXY}
              onChange={menu('plotxy')}
              testId="scope-plot-xy"
            />
            {transistor && (
              <Check
                label="Show Vce vs Ic"
                checked={scope.isShowingVceAndIc()}
                onChange={menu('showvcevsic')}
              />
            )}
          </div>
          {p2.plotXY && (
            <div className="scope-xy-grid">
              <span>{t('X axis')}</span>
              {plotSelect(p2.plotX, (v) => (p2.plotX = v), false, 'scope-xy-x')}
              <span>{t('Y axis')}</span>
              {plotSelect(p2.plotY, (v) => (p2.plotY = v), false, 'scope-xy-y')}
              <span>{t('Brightness')}</span>
              {plotSelect(p2.plotBrightness, (v) => (p2.plotBrightness = v), true)}
              {/* eslint-disable-next-line local/no-color-literals -- a label, not a color */}
              <span>{t('Red')}</span>
              {plotSelect(p2.plotColorR, (v) => (p2.plotColorR = v), true)}
              {/* eslint-disable-next-line local/no-color-literals -- a label, not a color */}
              <span>{t('Green')}</span>
              {plotSelect(p2.plotColorG, (v) => (p2.plotColorG = v), true)}
              {/* eslint-disable-next-line local/no-color-literals -- a label, not a color */}
              <span>{t('Blue')}</span>
              {plotSelect(p2.plotColorB, (v) => (p2.plotColorB = v), true)}
            </div>
          )}
          {p2.enabled && (
            <label className="scope-slider-row">
              <span>{t('Trail persistence')}</span>
              <input
                type="range"
                min={0}
                max={50}
                value={trailStepsToSlider(p2.trailPersistence)}
                onChange={(e) => {
                  p2.trailPersistence = trailSliderToSteps(Number(e.target.value));
                  p2.lastTrailSimTime = -1;
                  changed();
                }}
              />
              <span className="scope-value">
                {p2.trailPersistence <= 0
                  ? 'default'
                  : getUnitText(p2.trailPersistence * controller.circuit.sim.maxTimeStep, 's')}
              </span>
            </label>
          )}
        </Section>

        <Section title={t('Vertical scale')}>
          <div className="scope-radios">
            <Radio
              name="vmode"
              label="Auto"
              checked={!manual && !scope.maxScale}
              onSelect={() => {
                scope.setManualScale(false, false);
                scope.setMaxScale(false);
                changed();
              }}
              testId="scope-scale-auto"
            />
            <Radio
              name="vmode"
              label="Auto (max scale)"
              checked={!manual && scope.maxScale}
              onSelect={() => {
                scope.setManualScale(false, false);
                scope.setMaxScale(true);
                changed();
              }}
            />
            <Radio
              name="vmode"
              label="Manual"
              checked={manual}
              onSelect={() => {
                scope.setManualScale(true, true);
                changed();
              }}
              testId="scope-scale-manual"
            />
          </div>
          {manual && vp.length > 1 && (
            <div className="scope-channels" role="group" aria-label={t('Channel')}>
              {vp.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip${i === sel ? ' chip-selected' : ''}`}
                  aria-pressed={i === sel}
                  onClick={() => {
                    applyManual();
                    setPlotSel(i);
                  }}
                >
                  CH {i + 1} ({unitLetter(p.units)})
                </button>
              ))}
            </div>
          )}
          <div className="scope-scale-row">
            <span className="field-label">
              {manual && plot !== undefined
                ? `CH ${sel + 1} scale (${getScaleUnitsText(plot.units)}/div)`
                : `Max value (${scope.getScaleUnitsText()})`}
            </span>
            <div className="scope-scale-input">
              {manual && (
                <button
                  type="button"
                  className="button"
                  aria-label={t('Smaller scale')}
                  onClick={() => {
                    const d = readNumber(scaleShown);
                    if (d !== null && d > 0) applyManual(unitString(null, nextLowerScale(d)));
                  }}
                >
                  −
                </button>
              )}
              <input
                className="text-input"
                value={scaleShown}
                disabled={!manual || plot === undefined}
                spellCheck={false}
                onChange={(e) => setScaleText(e.target.value)}
                onBlur={() => applyManual()}
                onKeyDown={(e) => e.key === 'Enter' && applyManual()}
                data-testid="scope-scale-value"
              />
              {manual && (
                <button
                  type="button"
                  className="button"
                  aria-label={t('Larger scale')}
                  onClick={() => {
                    const d = readNumber(scaleShown);
                    if (d !== null && d > 0) applyManual(unitString(null, nextHighestScale(d)));
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>
          {manual && plot !== undefined && (
            <>
              <label className="scope-slider-row">
                <span>CH {sel + 1} position</span>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  value={plot.manVPosition}
                  onChange={(e) => {
                    scope.setPlotPosition(sel, Number(e.target.value));
                    changed();
                  }}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    scope.setPlotPosition(sel, 0);
                    changed();
                  }}
                >
                  {t('Reset')}
                </button>
              </label>
              <div className="scope-radios">
                <Radio
                  name="acdc"
                  label="DC coupled"
                  checked={!plot.isAcCoupled()}
                  onSelect={() => {
                    plot.setAcCoupled(false);
                    changed();
                  }}
                />
                <Radio
                  name="acdc"
                  label="AC coupled"
                  checked={plot.isAcCoupled()}
                  disabled={!plot.canAcCouple()}
                  onSelect={() => {
                    plot.setAcCoupled(true);
                    changed();
                  }}
                />
              </div>
              <label className="scope-scale-row">
                <span className="field-label">{t('Number of divisions')}</span>
                <input
                  className="text-input scope-short-input"
                  value={divText}
                  inputMode="numeric"
                  onChange={(e) => setDivText(e.target.value)}
                  onBlur={() => applyManual()}
                  onKeyDown={(e) => e.key === 'Enter' && applyManual()}
                />
              </label>
            </>
          )}
        </Section>

        <Section title={t('Horizontal scale')}>
          <label className="scope-slider-row">
            <span>{t('Time scale')}</span>
            <input
              type="range"
              min={0}
              max={10}
              value={speedValue}
              data-testid="scope-speed"
              onChange={(e) => {
                const sp = Math.pow(2, 10 - Number(e.target.value));
                if (scope.speed !== sp) scope.setSpeed(sp);
                changed();
              }}
            />
            <span className="scope-value">{getUnitText(scope.calcGridStepX(), 's')}/div</span>
          </label>
        </Section>

        <Section title={t('Trigger')}>
          <div className="scope-radios">
            {(
              [
                [TRIGGER_FREERUN, 'Free run'],
                [TRIGGER_NORMAL, 'Normal'],
                [TRIGGER_AUTO, 'Auto'],
              ] as const
            ).map(([mode, text]) => (
              <Radio
                key={mode}
                name="trigmode"
                label={text}
                checked={scope.trigger.mode === mode}
                onSelect={() => {
                  scope.setTriggerMode(mode);
                  changed();
                }}
              />
            ))}
          </div>
          {scope.trigger.isActive() && (
            <>
              <div className="scope-radios">
                <span className="field-label">{t('Edge')}</span>
                <Radio
                  name="trigedge"
                  label="Rising"
                  checked={scope.trigger.edge === TRIGGER_EDGE_RISING}
                  onSelect={() => {
                    scope.trigger.edge = TRIGGER_EDGE_RISING;
                    scope.resetGraph();
                    changed();
                  }}
                />
                <Radio
                  name="trigedge"
                  label="Falling"
                  checked={scope.trigger.edge === TRIGGER_EDGE_FALLING}
                  onSelect={() => {
                    scope.trigger.edge = TRIGGER_EDGE_FALLING;
                    scope.resetGraph();
                    changed();
                  }}
                />
              </div>
              <label className="scope-scale-row">
                <span className="field-label">{t('Level')}</span>
                <input
                  className="text-input scope-short-input"
                  value={trigText}
                  spellCheck={false}
                  onChange={(e) => setTrigText(e.target.value)}
                  onBlur={() => {
                    const d = readNumber(trigText);
                    if (d === null) return;
                    scope.trigger.level = d;
                    scope.resetGraph();
                    changed();
                  }}
                />
              </label>
            </>
          )}
        </Section>

        <Section title={t('Show info')}>
          <div className="scope-grid">
            <Check label="Show Scale" checked={scope.showScale} onChange={menu('showscale')} />
            <Check label="Show Peak Value" checked={scope.showMax} onChange={menu('showpeak')} />
            <Check
              label="Show Negative Peak Value"
              checked={scope.showMin}
              onChange={menu('shownegpeak')}
            />
            <Check label="Show Peak-to-Peak" checked={scope.showP2P} onChange={menu('showp2p')} />
            <Check label="Show Frequency" checked={scope.showFreq} onChange={menu('showfreq')} />
            <Check
              label="Show Average"
              checked={scope.showAverage}
              onChange={menu('showaverage')}
            />
            <Check
              label="Show RMS Average"
              checked={scope.showRMS}
              disabled={!scope.canShowRMS()}
              onChange={menu('showrms')}
            />
            <Check
              label="Show Duty Cycle"
              checked={scope.showDutyCycle}
              onChange={menu('showduty')}
            />
            <Check
              label="Show Phase Angle"
              checked={scope.fftPlot.showPhaseAngle}
              onChange={menu('showphaseangle')}
            />
            <Check
              label="Show Extended Info"
              checked={scope.showElmInfo}
              onChange={menu('showelminfo')}
            />
          </div>
        </Section>

        <Section title={t('Custom label')}>
          <input
            className="text-input"
            value={label}
            placeholder={scope.getScopeText() ?? ''}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={applyLabel}
            onKeyDown={(e) => e.key === 'Enter' && applyLabel()}
            data-testid="scope-label"
          />
        </Section>
      </div>
      <div className="dialog-buttons">
        <button
          type="button"
          className="button"
          onClick={() => {
            scope.serializer.saveAsDefault();
          }}
        >
          {t('Save as default')}
        </button>
        <Dialog.Close asChild>
          <button
            type="button"
            className="button button-primary"
            data-testid="scope-dialog-ok"
            onClick={() => {
              applyLabel();
              applyManual();
              controller.dialogScope = null;
              openDialog(null);
            }}
          >
            {t('OK')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}
