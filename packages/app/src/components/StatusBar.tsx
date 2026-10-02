// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { getUnitText } from '@circuitjs-next/elements';
import { useApp } from '../store.ts';

/** Time readouts and messages (upstream shows these in the canvas info area). */
export function StatusBar() {
  const { t, timeStep, stopMessage, badConnections } = useApp((s) => s.status);
  const title = useApp((s) => s.title);
  const warnings = useApp((s) => s.warnings);
  const error = useApp((s) => s.error);
  return (
    <footer className="status-bar">
      <span className="status-title" data-testid="circuit-title">
        {title}
      </span>
      <span data-testid="sim-time">t = {getUnitText(t, 's')}</span>
      <span>time step = {getUnitText(timeStep, 's')}</span>
      {badConnections > 0 && (
        <span className="status-warn">
          {badConnections} bad connection{badConnections === 1 ? '' : 's'}
        </span>
      )}
      {warnings.length > 0 && (
        <span className="status-warn" title={warnings.join('\n')} data-testid="load-warnings">
          {warnings.length} unsupported item{warnings.length === 1 ? '' : 's'} skipped
        </span>
      )}
      {stopMessage !== null && (
        <span className="status-error" data-testid="stop-message">
          {stopMessage}
        </span>
      )}
      {error !== null && (
        <span className="status-error" data-testid="load-error">
          {error}
        </span>
      )}
    </footer>
  );
}
