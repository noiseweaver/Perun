// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Follows CircuitJS1 SubcircuitBar (src/com/lushprojects/circuitjs1/client/SubcircuitBar.java,
// master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: which subcircuit's parts are shown, or
// which model's circuit is being edited, with Back, and Save / Save Copy while editing.

import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { t } from '../i18n.ts';

export function SubcircuitBar() {
  const bar = useApp((s) => s.subcircuitBar);
  if (bar.viewing.length === 0 && bar.editing === null) return null;
  return (
    <div className="subcircuit-bar" role="status" data-testid="subcircuit-bar">
      {bar.viewing.length > 0 && (
        <span data-testid="subcircuit-viewing">
          {t('Viewing: ')}
          {bar.viewing.join(' > ')}
        </span>
      )}
      {bar.editing !== null && (
        <span data-testid="subcircuit-editing">
          {t('Editing: ')}
          {bar.editing}
        </span>
      )}
      <button
        type="button"
        className="button"
        onClick={() => controller.subcircuitBack()}
        data-testid="subcircuit-back"
      >
        {t('◀ Back')}
      </button>
      {bar.editing !== null && (
        <>
          <button
            type="button"
            className="button"
            onClick={() => controller.saveSubcircuitModel(false)}
            data-testid="subcircuit-save"
          >
            {t('Save')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => controller.saveSubcircuitModel(true)}
            data-testid="subcircuit-save-copy"
          >
            {t('Save Copy')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => openDialog('params')}
            data-testid="subcircuit-params"
          >
            {t('Parameters')}
          </button>
        </>
      )}
    </div>
  );
}
