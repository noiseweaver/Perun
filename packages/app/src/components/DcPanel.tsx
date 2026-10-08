// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  GroundElm,
  LabeledNodeElm,
  WireElm,
  getFixedUnitText,
  type CircuitElm,
} from '@perun/elements';
import { useEffect, useState, type PointerEvent } from 'react';
import {
  operatingPointCsv,
  readOperatingPoint,
  solveOperatingPoint,
  type OpNode,
  type OpPart,
  type OperatingPoint,
} from '../analysis/dcop.ts';
import { download } from '../commands.ts';
import { t, tf } from '../i18n.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { elementNames } from './elementNames.ts';
import { Icon } from './Icon.tsx';

type Mode = 'solve' | 'live';
type Tab = 'nodes' | 'parts';
type SortKey = 'name' | 'v' | 'i' | 'p';
type Pointer = { kind: 'node'; name: string } | { kind: 'part'; element: number };

/** How often Live mode reads the running circuit, and Solve mode checks for edits, in ms. */
const LIVE_MS = 250;
const WATCH_MS = 300;

// remembered while the panel is closed
let lastMode: Mode = 'solve';
let lastTab: Tab = 'nodes';

export function openDcPanel(open = true): void {
  useApp.setState({ dcPanel: open });
}

/** Every value has the same width as it changes (owner's rule): sign, 3+3 digits, prefix, unit. */
const fmt = (v: number, unit: string): string => getFixedUnitText(v, unit);
const BLANK = ' '.repeat(fmt(0, 'V').length);

/**
 * The DC operating point (PLAN.md Phase 13): node voltages and each part's current and power in
 * a card over the canvas. Solve finds the bias point on a copy of the circuit and solves again
 * after every edit; Live reads the running simulation. Pointing at a row highlights the node's
 * wires or the part on the canvas; tapping pins the highlight.
 */
export function DcPanel() {
  const open = useApp((s) => s.dcPanel);
  if (!open) return null;
  return <DcPanelBody />;
}

function DcPanelBody() {
  const [mode, setModeState] = useState<Mode>(lastMode);
  const [tab, setTabState] = useState<Tab>(lastTab);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [folded, setFolded] = useState(false);
  const [op, setOp] = useState<OperatingPoint | null>(null);
  const [hover, setHover] = useState<Pointer | null>(null);
  const [pinned, setPinned] = useState<Pointer | null>(null);

  const setMode = (m: Mode): void => {
    lastMode = m;
    setModeState(m);
  };
  const setTab = (x: Tab): void => {
    lastTab = x;
    setTabState(x);
  };

  // Solve: on open and after every change to the circuit
  useEffect(() => {
    if (mode !== 'solve') return;
    let solved = -1;
    const solve = (): void => {
      if (controller.circuitVersion === solved) return;
      solved = controller.circuitVersion;
      try {
        setOp(solveOperatingPoint(controller.saveText()));
      } catch (e) {
        setOp({
          nodes: [],
          parts: [],
          settled: false,
          steps: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    solve();
    const id = window.setInterval(solve, WATCH_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  // Live: read the running circuit a few times a second
  useEffect(() => {
    if (mode !== 'live') return;
    const read = (): void => {
      setOp({ ...readOperatingPoint(controller.circuit), settled: true, steps: 0 });
    };
    read();
    const id = window.setInterval(read, LIVE_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  // the row under the pointer, else the tapped one, lights up on the canvas
  const lit = hover ?? pinned;
  useEffect(() => {
    controller.setAnalysisHighlights(op === null || lit === null ? [] : highlightFor(op, lit));
  }, [op, lit]);
  useEffect(() => () => controller.setAnalysisHighlights([]), []);

  const els = controller.circuit.elements;
  const names = elementNames(els);
  const partName = (i: number): string => {
    const e = els[i];
    return e === undefined ? '?' : (names.get(e) ?? '?');
  };

  const nodes = op === null ? [] : sortNodes(op.nodes, sort);
  const parts = op === null ? [] : sortParts(op.parts, sort, partName);
  const same = (a: Pointer | null, b: Pointer): boolean =>
    a !== null && pointerKey(a) === pointerKey(b);
  const pointerProps = (p: Pointer): RowProps => ({
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setHover(p);
    },
    onPointerLeave: () => setHover(null),
    onClick: () => setPinned(same(pinned, p) ? null : p),
    'data-pinned': same(pinned, p) || undefined,
  });

  const header = (key: SortKey, label: string, num: boolean) => (
    <th scope="col" className={num ? 'dc-num' : undefined} aria-sort={ariaSort(sort, key)}>
      <button
        type="button"
        className="dc-sort"
        data-testid={`dc-sort-${key}`}
        onClick={() =>
          setSort(
            sort.key === key
              ? { key, dir: sort.dir === 1 ? -1 : 1 }
              : { key, dir: key === 'name' ? 1 : -1 },
          )
        }
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <section
      className="dc-panel"
      aria-label={t('DC operating point')}
      data-testid="dc-panel"
      data-canvas-overlay
      data-folded={folded || undefined}
    >
      <div className="dc-panel-header">
        <button
          type="button"
          className="dc-panel-title"
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
          data-testid="dc-panel-toggle"
        >
          <Icon name="table" size={18} />
          <span>{t('DC operating point')}</span>
          <Icon name={folded ? 'expandMore' : 'expandLess'} size={18} />
        </button>
        <button
          type="button"
          className="icon-button dc-panel-close"
          aria-label={t('Close')}
          title={t('Close')}
          data-testid="dc-panel-close"
          onClick={() => openDcPanel(false)}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      {!folded && (
        <div className="dc-panel-body">
          <div className="dc-toolbar">
            <div className="dc-segmented" role="radiogroup" aria-label={t('Values')}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'solve'}
                data-testid="dc-mode-solve"
                title={t(
                  'Bias point on a copy of the circuit: capacitors open, inductors shorted, sources at their DC level',
                )}
                onClick={() => setMode('solve')}
              >
                {t('DC solve')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'live'}
                data-testid="dc-mode-live"
                title={t('Values of the running simulation, as they change')}
                onClick={() => setMode('live')}
              >
                {t('Live')}
              </button>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t('Export CSV')}
              title={t('Export CSV')}
              data-testid="dc-csv"
              disabled={op === null}
              onClick={() => {
                if (op !== null)
                  download('dc-operating-point.csv', operatingPointCsv(op, partName), 'text/csv');
              }}
            >
              <Icon name="download" size={18} />
            </button>
          </div>
          <div className="dc-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'nodes'}
              data-testid="dc-tab-nodes"
              onClick={() => setTab('nodes')}
            >
              {t('Nodes')} <span className="dc-count">{nodes.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'parts'}
              data-testid="dc-tab-parts"
              onClick={() => setTab('parts')}
            >
              {t('Parts')} <span className="dc-count">{parts.length}</span>
            </button>
          </div>
          <div className="dc-table-wrap">
            {tab === 'nodes' ? (
              <table className="dc-table" data-testid="dc-nodes">
                <thead>
                  <tr>
                    {header('name', t('Node'), false)}
                    {header('v', t('Voltage'), true)}
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n) => (
                    <tr
                      key={n.name}
                      data-testid="dc-node-row"
                      {...pointerProps({ kind: 'node', name: n.name })}
                    >
                      <td className="dc-name" title={n.name}>
                        {n.name}
                      </td>
                      <td className="dc-num">{fmt(n.v, 'V')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="dc-table" data-testid="dc-parts">
                <thead>
                  <tr>
                    {header('name', t('Part'), false)}
                    {header('v', t('Voltage'), true)}
                    {header('i', t('Current'), true)}
                    {header('p', t('Power'), true)}
                  </tr>
                </thead>
                <tbody>
                  {parts.flatMap((p) => partRows(p, partName(p.element), pointerProps))}
                </tbody>
              </table>
            )}
          </div>
          <p className="dc-note" data-testid="dc-note">
            {op?.error != null ? (
              <span className="dc-problem" role="alert">
                {op.error}
              </span>
            ) : mode === 'live' ? (
              t('Values of the running simulation.')
            ) : op !== null && !op.settled ? (
              <span className="dc-problem">
                {tf('Still changing after {n} steps: the circuit may oscillate.', { n: op.steps })}
              </span>
            ) : (
              t('Capacitors open, inductors shorted, sources at their DC level.')
            )}
            {tab === 'parts' && op?.error == null && (
              <> {t('Negative power: the part delivers power.')}</>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  onClick: () => void;
  'data-pinned': true | undefined;
}

const pointerKey = (p: Pointer): string => (p.kind === 'node' ? `n:${p.name}` : `p:${p.element}`);

function partRows(p: OpPart, name: string, pointerProps: (p: Pointer) => RowProps) {
  const ptr: Pointer = { kind: 'part', element: p.element };
  if (p.terminals === null)
    return [
      <tr key={p.element} data-testid="dc-part-row" {...pointerProps(ptr)}>
        <td className="dc-name" title={name}>
          {name}
        </td>
        <td className="dc-num">{fmt(p.v, 'V')}</td>
        <td className="dc-num">{fmt(p.i, 'A')}</td>
        <td className="dc-num">{fmt(p.p, 'W')}</td>
      </tr>,
    ];
  return [
    <tr key={p.element} data-testid="dc-part-row" {...pointerProps(ptr)}>
      <td className="dc-name" title={name}>
        {name}
      </td>
      <td className="dc-num">{BLANK}</td>
      <td className="dc-num">{BLANK}</td>
      <td className="dc-num">{fmt(p.p, 'W')}</td>
    </tr>,
    ...p.terminals.map((x) => (
      <tr key={`${p.element}:${x.post}`} className="dc-sub" {...pointerProps(ptr)}>
        <td className="dc-name">{x.label}</td>
        <td className="dc-num">{fmt(x.v, 'V')}</td>
        <td className="dc-num">{fmt(x.i, 'A')}</td>
        <td className="dc-num">{BLANK}</td>
      </tr>
    )),
  ];
}

function ariaSort(
  sort: { key: SortKey; dir: 1 | -1 },
  key: SortKey,
): 'ascending' | 'descending' | undefined {
  if (sort.key !== key) return undefined;
  return sort.dir === 1 ? 'ascending' : 'descending';
}

const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function sortNodes(nodes: OpNode[], sort: { key: SortKey; dir: 1 | -1 }): OpNode[] {
  // name order is the solver's: ground, labels, then the rest as the circuit meets them
  if (sort.key === 'name') return sort.dir === 1 ? nodes : [...nodes].reverse();
  return [...nodes].sort((a, b) => sort.dir * (a.v - b.v) || byName(a.name, b.name));
}

function sortParts(
  parts: OpPart[],
  sort: { key: SortKey; dir: 1 | -1 },
  name: (i: number) => string,
): OpPart[] {
  const value = (p: OpPart): number | null => {
    if (sort.key === 'p') return p.p;
    if (p.terminals !== null) return null;
    return sort.key === 'v' ? p.v : p.i;
  };
  return [...parts].sort((a, b) => {
    if (sort.key === 'name') return sort.dir * byName(name(a.element), name(b.element));
    const va = value(a);
    const vb = value(b);
    // parts with more than two posts have no single voltage or current: keep them last
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0);
    return sort.dir * (va - vb) || byName(name(a.element), name(b.element));
  });
}

/**
 * What a row points at on the canvas: the part, or a node's wires, labels and grounds. A node
 * with no wire (posts that touch) lights its parts too, so it is never just a hidden label.
 */
function highlightFor(op: OperatingPoint, p: Pointer): CircuitElm[] {
  const els = controller.circuit.elements;
  if (p.kind === 'part') {
    const e = els[p.element];
    return e === undefined ? [] : [e];
  }
  const node = op.nodes.find((n) => n.name === p.name);
  if (node === undefined) return [];
  const touching = node.elements.map((i) => els[i]).filter((e) => e !== undefined);
  if (!touching.some((e) => e instanceof WireElm)) return touching;
  return touching.filter(
    (e) => e instanceof WireElm || e instanceof LabeledNodeElm || e instanceof GroundElm,
  );
}
