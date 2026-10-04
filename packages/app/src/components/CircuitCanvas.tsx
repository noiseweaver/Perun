// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// The context menu follows CircuitJS1's element, scope and main popup menus (Menus.java
// elmMenuBar, ScopePopupMenu.java, MouseManager.doPopupMenu, master at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032), minus sliders.

import { WireElm, type CircuitElm } from '@circuitjs-next/elements';
import * as Ctx from '@radix-ui/react-context-menu';
import { useEffect, useRef, useState } from 'react';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';

const MOD = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function Item(props: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <Ctx.Item
      className="menu-item"
      disabled={props.disabled ?? false}
      onSelect={props.onSelect}
      data-testid={props.testId}
    >
      {props.label}
      {props.hint && <span className="menu-trailing menu-hint">{props.hint}</span>}
    </Ctx.Item>
  );
}

/** The circuit canvas. Drawing runs in the controller's animation loop, outside React. */
export function CircuitCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [menuElm, setMenuElm] = useState<CircuitElm | null>(null);
  const [menuScope, setMenuScope] = useState(-1);
  const canPaste = useApp((s) => s.editor.canPaste);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    controller.attach(canvas);
    return () => controller.detach();
  }, []);

  const ed = controller.editor;
  const flip = ed.canFlip(menuElm);
  const isWire = menuElm instanceof WireElm;

  return (
    <Ctx.Root
      onOpenChange={(open) => {
        if (open) {
          setMenuElm(controller.menuElm);
          setMenuScope(controller.menuScope);
        } else controller.scopes.scopeMenuSelected = -1;
      }}
    >
      <Ctx.Trigger asChild>
        <canvas
          ref={ref}
          className="circuit-canvas"
          data-testid="circuit-canvas"
          aria-label="Circuit"
          tabIndex={0}
        />
      </Ctx.Trigger>
      <Ctx.Portal>
        <Ctx.Content className="menu-content" data-testid="context-menu">
          {menuScope >= 0 ? (
            <ScopeMenuItems index={menuScope} />
          ) : menuElm !== null ? (
            <>
              <Item
                label="Edit…"
                hint="Enter"
                disabled={menuElm.getEditInfo(0) === null}
                testId="ctx-edit"
                onSelect={() => {
                  ed.select(menuElm);
                  useApp.setState({ inspectorFocus: useApp.getState().inspectorFocus + 1 });
                }}
              />
              <Ctx.Separator className="menu-separator" />
              <Item label="Cut" hint={`${MOD}X`} onSelect={() => controller.cut(menuElm)} />
              <Item label="Copy" hint={`${MOD}C`} onSelect={() => controller.copy(menuElm)} />
              <Item
                label="Delete"
                hint="Del"
                testId="ctx-delete"
                onSelect={() => ed.deleteSelected(menuElm)}
              />
              <Item label="Duplicate" hint={`${MOD}D`} onSelect={() => ed.duplicate(menuElm)} />
              <Ctx.Separator className="menu-separator" />
              <Item
                label="Swap Terminals"
                disabled={menuElm.getPostCount() !== 2}
                onSelect={() => ed.swapTerminals(menuElm)}
              />
              <Item label="Mirror X" disabled={!flip.x} onSelect={() => ed.mirrorX(menuElm)} />
              <Item label="Mirror Y" disabled={!flip.y} onSelect={() => ed.mirrorY(menuElm)} />
              <Item
                label="Rotate CCW"
                disabled={!(flip.xy && flip.y)}
                onSelect={() => ed.rotateCCW(menuElm)}
              />
              <Item
                label="Rotate CW"
                disabled={!(flip.xy && flip.y)}
                testId="ctx-rotate-cw"
                onSelect={() => ed.rotateCW(menuElm)}
              />
              <Ctx.Separator className="menu-separator" />
              <Item
                label="View in New Scope"
                disabled={!menuElm.canViewInScope()}
                testId="ctx-view-in-scope"
                onSelect={() => controller.viewInScope(menuElm)}
              />
              <AddToScopeItems elm={menuElm} />
              {isWire && (
                <Item
                  label="Split Wire"
                  hint={`${MOD}click`}
                  onSelect={() => ed.splitWire(controller.menuPos.x, controller.menuPos.y)}
                />
              )}
            </>
          ) : (
            <>
              <Item
                label="Paste"
                hint={`${MOD}V`}
                disabled={!canPaste}
                onSelect={() => controller.paste()}
              />
              <Item label="Select All" hint={`${MOD}A`} onSelect={() => ed.selectAll()} />
              <Ctx.Separator className="menu-separator" />
              <Item label="Centre Circuit" onSelect={() => controller.fit()} />
            </>
          )}
        </Ctx.Content>
      </Ctx.Portal>
    </Ctx.Root>
  );
}

/** "Add to Existing Scope": one item for a single scope, else a submenu naming each. */
function AddToScopeItems({ elm }: { elm: CircuitElm }) {
  const mgr = controller.scopes;
  const entries = mgr.scopeMenuEntries();
  const can = elm.canViewInScope();
  if (entries.length <= 1)
    return (
      <Item
        label="Add to Existing Scope"
        disabled={!can || entries.length === 0}
        testId="ctx-add-to-scope"
        onSelect={() => controller.addToScope(0, elm)}
      />
    );
  return (
    <Ctx.Sub>
      <Ctx.SubTrigger className="menu-item" disabled={!can} data-testid="ctx-add-to-scope">
        Add to Existing Scope
        <Icon name="chevronRight" className="icon menu-trailing" />
      </Ctx.SubTrigger>
      <Ctx.Portal>
        <Ctx.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
          {entries.map((en, i) => (
            <Ctx.Item
              key={i}
              className="menu-item"
              // hovering an entry highlights its scope, as upstream
              onPointerEnter={() => (mgr.scopeMenuSelected = i)}
              onPointerLeave={() => (mgr.scopeMenuSelected = -1)}
              onSelect={() => controller.addToScope(i, elm)}
            >
              {en.label}
            </Ctx.Item>
          ))}
        </Ctx.SubContent>
      </Ctx.Portal>
    </Ctx.Sub>
  );
}

/** The scope popup menu (upstream ScopePopupMenu, docked scopes). */
function ScopeMenuItems({ index }: { index: number }) {
  const mgr = controller.scopes;
  const s = mgr.scopes[index];
  if (s === undefined) return null;
  const run = (item: string) => () => controller.scopeMenu(item);
  return (
    <>
      <Item label="Remove Scope" testId="scope-remove" onSelect={run('remove')} />
      <Ctx.CheckboxItem className="menu-item" checked={s.maxScale} onSelect={run('maxscale')}>
        <span className="menu-check" aria-hidden>
          {s.maxScale && <Icon name="check" size={18} />}
        </span>
        Max Scale
      </Ctx.CheckboxItem>
      <Item label="Stack" disabled={!mgr.canStackScope(index)} onSelect={run('stack')} />
      <Item label="Unstack" disabled={!mgr.canUnstackScope(index)} onSelect={run('unstack')} />
      <Item label="Combine" disabled={!mgr.canCombineScope()} onSelect={run('combine')} />
      <Item label="Remove Plot" disabled={controller.menuPlot < 0} onSelect={run('removeplot')} />
      <Item label="Reset" onSelect={run('reset')} />
      <Ctx.Separator className="menu-separator" />
      <Item label="Export CSV…" onSelect={run('exportcsv')} />
      <Item label="Properties…" testId="scope-properties" onSelect={run('properties')} />
    </>
  );
}
