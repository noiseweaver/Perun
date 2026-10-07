// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Keyboard handling after CircuitJS1 UIManager.onPreviewNativeEvent
// (src/com/lushprojects/circuitjs1/client/UIManager.java, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: Delete, Escape, arrows, Ctrl/Cmd + Z Y X C V D A S O,
// element keys from each element's getShortcut(), switch key shortcuts and space for select mode.

import { SwitchElm } from '@circuitjs-next/elements';
import { compressCircuit } from '@circuitjs-next/format';
import { shortcutMap } from './editor/catalog.ts';
import { download } from './download.ts';
import { controller } from './SimController.ts';
import { showToast, useApp } from './store.ts';

/** Dialogs the commands open; the App renders whichever is set. */
export type DialogKind =
  | 'save'
  | 'exportLink'
  | 'exportText'
  | 'importText'
  | 'shortcuts'
  | 'simSettings'
  | 'scopeProperties'
  | 'sliders'
  | 'model'
  | 'subcircuit'
  | 'about'
  | 'subcircuitManager'
  | 'install'
  | 'themes'
  | 'themeEditor'
  | 'bode'
  | 'sweep'
  | 'exportImage'
  | 'partsList'
  | 'scopeCsv'
  | null;

export function openDialog(kind: DialogKind): void {
  useApp.setState({ dialog: kind });
}

export { showToast } from './store.ts';

/** Upstream's default file name: circuitjs-yyyyMMdd-HHmmss.txt. */
export function defaultFileName(): string {
  if (controller.lastFileName !== null) return controller.lastFileName;
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `circuitjs-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`
  );
}

/** Download the circuit, as upstream "Save As" / "Export as local file" does. */
export function saveToFile(name: string): void {
  let fname = name.trim() || defaultFileName();
  if (!fname.includes('.')) fname += '.txt';
  controller.lastFileName = fname;
  download(fname, controller.saveText(), 'text/plain');
  controller.unsavedChanges = false;
  useApp.setState({ title: fname });
}

export { download };

/** This page's address without its query, the base of exported links. */
export function pageBase(): string {
  return window.location.href.split(/[?#]/)[0] ?? '';
}

export const UPSTREAM_PAGE = 'https://www.falstad.com/circuit/circuitjs.html';

/** Upstream ExportAsUrlDialog: `?ctz=` with the lz-string compressed circuit. */
export function circuitLink(base: string): string {
  return `${base}?ctz=${compressCircuit(controller.saveText())}`;
}

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${what} copied`);
  } catch {
    showToast(`Couldn't copy the ${what.toLowerCase()}; select it and copy instead`);
  }
}

// ---- keyboard ---------------------------------------------------------------------------------

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'range' && type !== 'button';
  }
  return false;
}

/** Global key handler. Returns a function that removes it. */
export function installShortcuts(): () => void {
  const keys = shortcutMap();
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || isEditable(e.target)) return;
    // Enter and space press a focused button
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return;
    const ed = controller.editor;
    const mod = e.ctrlKey || e.metaKey;
    const done = (): void => {
      e.preventDefault();
      e.stopPropagation();
    };

    // while drawing, Escape puts the tools away and undo takes back strokes, not edits
    if (useApp.getState().teach.tool !== null) {
      if (e.key === 'Escape') {
        controller.setTeachTool(null);
        return done();
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        controller.teachUndo();
        return done();
      }
      // element shortcuts would start placing an element
      if (!mod && keys.has(e.key)) return;
    }

    if (mod && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.shiftKey) controller.redo();
          else controller.undo();
          return done();
        case 'y':
          controller.redo();
          return done();
        case 'x':
          controller.cut();
          return done();
        case 'c':
          controller.copy();
          return done();
        case 'v':
          controller.paste();
          return done();
        case 'd':
          ed.duplicate();
          return done();
        case 'a':
          ed.selectAll();
          return done();
        case 's':
          openDialog('save');
          return done();
        case 'o':
          document.querySelector<HTMLInputElement>('[data-testid="file-input"]')?.click();
          return done();
      }
      return;
    }

    // the element menu from the keyboard, at the selected element
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (controller.openMenuAtSelection()) done();
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        ed.deleteSelected();
        return done();
      case 'Escape':
        ed.setSelectMode();
        ed.clearSelection();
        return done();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const g = controller.circuit.sim.gridSize;
        const dx = e.key === 'ArrowLeft' ? -g : e.key === 'ArrowRight' ? g : 0;
        const dy = e.key === 'ArrowUp' ? -g : e.key === 'ArrowDown' ? g : 0;
        if (ed.moveSelected(dx, dy)) done();
        return;
      }
      case 'Enter':
        if (useApp.getState().editor.selected !== null) {
          useApp.setState({ inspectorFocus: useApp.getState().inspectorFocus + 1 });
          done();
        }
        return;
    }
    if (e.altKey || mod || e.key.length !== 1 || e.repeat) return;

    // switches with this key toggle (upstream SwitchElm key shortcuts)
    const k = e.key.toLowerCase();
    let toggled = false;
    for (const ce of controller.circuit.elements) {
      if (ce instanceof SwitchElm && ce.keyShortcut !== null && ce.keyShortcut === k) {
        controller.toggleSwitch(ce);
        toggled = true;
      }
    }
    if (toggled) return done();

    const cls = keys.get(e.key);
    if (cls !== undefined) {
      ed.setAddMode(cls);
      return done();
    }
    if (e.key === ' ') {
      ed.setSelectMode();
      return done();
    }
    // keyboard selection: step through the elements
    if (e.key === ']' || e.key === '[') {
      controller.selectNext(e.key === ']' ? 1 : -1);
      return done();
    }
    if (e.key === '?') {
      openDialog('shortcuts');
      return done();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
