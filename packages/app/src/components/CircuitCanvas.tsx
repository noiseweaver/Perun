// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { useEffect, useRef } from 'react';
import { controller } from '../SimController.ts';

/** The circuit canvas. Drawing runs in the controller's animation loop, outside React. */
export function CircuitCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    controller.attach(canvas);
    return () => controller.detach();
  }, []);
  return (
    <canvas
      ref={ref}
      className="circuit-canvas"
      data-testid="circuit-canvas"
      aria-label="Circuit"
    />
  );
}
