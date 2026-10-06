// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { getFixedUnitText, viewFor, type CircuitElm } from '@circuitjs-next/elements';
import { CircuitRenderer, type FrameState } from '@circuitjs-next/render';
import type { Theme } from '@circuitjs-next/theme';
import { useEffect, useRef } from 'react';
import { controller } from '../SimController.ts';
import { shownTheme, useApp } from '../store.ts';

/** Samples kept for the sparkline: about four seconds at 60 frames a second. */
const SPARK_SAMPLES = 240;

/** Whether a part has one voltage across it and one current through it worth showing. */
function twoTerminal(elm: CircuitElm): boolean {
  return elm.getPostCount() === 2 && elm.getClassName() !== 'WireElm';
}

/**
 * The top of the property panel: the part drawn live (voltage colors, moving current dots), and
 * for two-terminal parts its voltage, current and power with a sparkline of the last few seconds.
 * It redraws after every frame of the main canvas.
 */
export function LiveHeader({ elm }: { elm: CircuitElm }) {
  const theme = useApp(shownTheme);
  const part = useRef<HTMLCanvasElement>(null);
  const spark = useRef<HTMLCanvasElement>(null);
  const vText = useRef<HTMLSpanElement>(null);
  const iText = useRef<HTMLSpanElement>(null);
  const pText = useRef<HTMLSpanElement>(null);
  const readouts = twoTerminal(elm);

  useEffect(() => {
    const canvas = part.current;
    if (!canvas) return;
    const r = new CircuitRenderer(canvas, theme);
    r.plain = true;
    r.motion = false;
    r.setElements([elm]);
    const history: { v: number; i: number }[] = [];
    const draw = (frame: FrameState): void => {
      const b = viewFor(elm)?.bbox(elm) ?? { x1: elm.x, y1: elm.y, x2: elm.x2, y2: elm.y2 };
      const bw = Math.max(b.x2 - b.x1, 1);
      const bh = Math.max(b.y2 - b.y1, 1);
      const turned = bh > bw * 1.2;
      if (turned !== canvas.hasAttribute('data-turned'))
        canvas.toggleAttribute('data-turned', turned);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      r.resize(w, h, dpr);
      const vp = r.viewport;
      // a long part's leads run off the edges, so its body is drawn big enough to read
      const len = Math.max(bw, bh);
      const across = Math.min(bw, bh);
      const long = Math.max(w, h);
      const short = Math.min(w, h);
      vp.scale = Math.min((long - 16) / Math.min(len, 80), (short - 12) / across, 2);
      vp.offsetX = (w - bw * vp.scale) / 2 - b.x1 * vp.scale;
      vp.offsetY = (h - bh * vp.scale) / 2 - b.y1 * vp.scale;
      r.refreshPosts();
      r.render({ ...frame, showValues: false });
      if (!readouts) return;
      const v = elm.getVoltageDiff();
      const i = elm.getCurrent();
      if (vText.current) vText.current.textContent = getFixedUnitText(v, 'V');
      if (iText.current) iText.current.textContent = getFixedUnitText(i, 'A');
      if (pText.current) pText.current.textContent = getFixedUnitText(elm.getPower(), 'W');
      if (frame.running || history.length === 0) {
        history.push({ v, i });
        if (history.length > SPARK_SAMPLES) history.shift();
      }
      if (spark.current) drawSpark(spark.current, history, theme);
    };
    if (controller.lastFrameState !== null) draw(controller.lastFrameState);
    controller.frameListeners.add(draw);
    return () => {
      controller.frameListeners.delete(draw);
    };
  }, [elm, theme, readouts]);

  return (
    <div className="live-header" data-testid="live-header">
      <div className="live-part">
        <canvas ref={part} className="live-part-canvas" aria-hidden />
      </div>
      {readouts && (
        <div className="live-readouts" data-testid="live-readouts">
          <div className="live-values">
            <span className="live-key" style={{ color: theme.scope.traces[0] }}>
              V
            </span>
            <span ref={vText} className="live-value" data-testid="live-v" />
            <span className="live-key" style={{ color: theme.scope.current }}>
              I
            </span>
            <span ref={iText} className="live-value" data-testid="live-i" />
            <span className="live-key" style={{ color: theme.scope.text }}>
              P
            </span>
            <span ref={pText} className="live-value" data-testid="live-p" />
          </div>
          <canvas ref={spark} className="live-spark" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Voltage and current over the last few seconds, each scaled to its own peak. */
function drawSpark(c: HTMLCanvasElement, hist: { v: number; i: number }[], theme: Theme): void {
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (c.width !== pw) c.width = pw;
  if (c.height !== ph) c.height = ph;
  const g = c.getContext('2d');
  if (g === null) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  g.strokeStyle = theme.scope.gridMajor;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, Math.round(mid) + 0.5);
  g.lineTo(w, Math.round(mid) + 0.5);
  g.stroke();
  const line = (pick: (s: { v: number; i: number }) => number, color: string): void => {
    let peak = 0;
    for (const s of hist) peak = Math.max(peak, Math.abs(pick(s)));
    // nothing to see under a picoamp or picovolt: a flat line, not amplified noise
    const k = peak > 1e-12 ? (mid - 2) / peak : 0;
    const dx = w / (SPARK_SAMPLES - 1);
    const x0 = w - (hist.length - 1) * dx;
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.beginPath();
    hist.forEach((s, n) => {
      const x = x0 + n * dx;
      const y = mid - pick(s) * k;
      if (n === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  };
  line((s) => s.i, theme.scope.current);
  line((s) => s.v, theme.scope.traces[0] ?? theme.scope.text);
}
