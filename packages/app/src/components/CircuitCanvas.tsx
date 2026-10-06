// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// The context menu follows CircuitJS1's element, scope and main popup menus (Menus.java
// elmMenuBar, ScopePopupMenu.java, MouseManager.doPopupMenu, master at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032), minus sliders.

import { WireElm, type CircuitElm, type ScopeElm } from '@circuitjs-next/elements';
import * as Ctx from '@radix-ui/react-context-menu';
import { useEffect, useRef, useState } from 'react';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Icon, type IconName } from './Icon.tsx';
import { t } from '../i18n.ts';

const MOD = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function Item(props: {
  label: string;
  icon?: IconName;
  /** Draw the icon turned a quarter (Mirror Y reuses the Mirror X icon). */
  turned?: boolean;
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
      <MenuIcon name={props.icon} turned={props.turned} />
      {t(props.label)}
      {props.hint && <span className="menu-trailing menu-hint">{props.hint}</span>}
    </Ctx.Item>
  );
}

/** The leading icon column; empty when there is no icon, so the labels still line up. */
function MenuIcon(props: { name?: IconName | undefined; turned?: boolean | undefined }) {
  return (
    <span className="menu-icon" aria-hidden>
      {props.name && (
        <Icon name={props.name} size={20} className={props.turned ? 'icon icon-turned' : 'icon'} />
      )}
    </span>
  );
}

/** The circuit canvas. Drawing runs in the controller's animation loop, outside React. */
export function CircuitCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [menuElm, setMenuElm] = useState<CircuitElm | null>(null);
  const [menuScope, setMenuScope] = useState(-1);
  const [menuUndocked, setMenuUndocked] = useState<ScopeElm | null>(null);
  const canPaste = useApp((s) => s.editor.canPaste);
  const title = useApp((s) => s.title);
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
          setMenuUndocked(controller.menuUndocked);
        } else controller.scopes.scopeMenuSelected = -1;
      }}
    >
      <Ctx.Trigger asChild>
        <canvas
          ref={ref}
          className="circuit-canvas"
          data-testid="circuit-canvas"
          aria-label={`Circuit: ${t(title)}`}
          aria-describedby="canvas-help"
          tabIndex={0}
        />
      </Ctx.Trigger>
      <p id="canvas-help" className="visually-hidden">
        Press ] and [ to step through the elements, Enter to edit the selected one, arrow keys to
        move it, Delete to remove it, and Shift+F10 for its menu. Press ? for all shortcuts.
      </p>
      <Ctx.Portal>
        <Ctx.Content className="menu-content" data-testid="context-menu">
          {menuUndocked !== null ? (
            <ScopeMenuItems index={-1} undocked={menuUndocked} />
          ) : menuScope >= 0 ? (
            <ScopeMenuItems index={menuScope} undocked={null} />
          ) : menuElm !== null ? (
            <>
              <Item
                label="Edit…"
                icon="edit"
                hint="Enter"
                disabled={menuElm.getEditInfo(0) === null}
                testId="ctx-edit"
                onSelect={() => {
                  ed.select(menuElm);
                  useApp.setState({ inspectorFocus: useApp.getState().inspectorFocus + 1 });
                }}
              />
              <Item
                label="Sliders…"
                icon="tune"
                disabled={!controller.canAddSliders(menuElm)}
                testId="ctx-sliders"
                onSelect={() => controller.openSliderDialog(menuElm)}
              />
              <Ctx.Separator className="menu-separator" />
              <Item
                label="Cut"
                icon="cut"
                hint={`${MOD}X`}
                onSelect={() => controller.cut(menuElm)}
              />
              <Item
                label="Copy"
                icon="copy"
                hint={`${MOD}C`}
                onSelect={() => controller.copy(menuElm)}
              />
              <Item
                label="Delete"
                icon="delete"
                hint="Del"
                testId="ctx-delete"
                onSelect={() => ed.deleteSelected(menuElm)}
              />
              <Item
                label="Duplicate"
                icon="duplicate"
                hint={`${MOD}D`}
                onSelect={() => ed.duplicate(menuElm)}
              />
              <Ctx.Separator className="menu-separator" />
              <Item
                label="Swap Terminals"
                icon="swap"
                disabled={menuElm.getPostCount() !== 2}
                onSelect={() => ed.swapTerminals(menuElm)}
              />
              <Item
                label="Mirror X"
                icon="flip"
                disabled={!flip.x}
                onSelect={() => ed.mirrorX(menuElm)}
              />
              <Item
                label="Mirror Y"
                icon="flip"
                turned
                disabled={!flip.y}
                onSelect={() => ed.mirrorY(menuElm)}
              />
              <Item
                label="Rotate CCW"
                icon="rotateLeft"
                disabled={!(flip.xy && flip.y)}
                onSelect={() => ed.rotateCCW(menuElm)}
              />
              <Item
                label="Rotate CW"
                icon="rotateRight"
                disabled={!(flip.xy && flip.y)}
                testId="ctx-rotate-cw"
                onSelect={() => ed.rotateCW(menuElm)}
              />
              <Ctx.Separator className="menu-separator" />
              <Item
                label="View in New Scope"
                icon="scope"
                disabled={!menuElm.canViewInScope()}
                testId="ctx-view-in-scope"
                onSelect={() => controller.viewInScope(menuElm)}
              />
              <Item
                label="View in New Undocked Scope"
                icon="openInNew"
                disabled={!menuElm.canViewInScope()}
                testId="ctx-view-in-undocked-scope"
                onSelect={() => controller.viewInUndockedScope(menuElm)}
              />
              <AddToScopeItems elm={menuElm} />
              {isWire && (
                <Item
                  label="Split Wire"
                  icon="split"
                  hint={`${MOD}click`}
                  onSelect={() => ed.splitWire(controller.menuPos.x, controller.menuPos.y)}
                />
              )}
            </>
          ) : (
            <>
              <Item
                label="Paste"
                icon="paste"
                hint={`${MOD}V`}
                disabled={!canPaste}
                onSelect={() => controller.paste()}
              />
              <Item
                label="Select All"
                icon="selectAll"
                hint={`${MOD}A`}
                onSelect={() => ed.selectAll()}
              />
              <Ctx.Separator className="menu-separator" />
              <Item label="Centre Circuit" icon="fit" onSelect={() => controller.fit()} />
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
        icon="addChart"
        disabled={!can || entries.length === 0}
        testId="ctx-add-to-scope"
        onSelect={() => controller.addToScope(0, elm)}
      />
    );
  return (
    <Ctx.Sub>
      <Ctx.SubTrigger className="menu-item" disabled={!can} data-testid="ctx-add-to-scope">
        <MenuIcon name="addChart" />
        {t('Add to Existing Scope')}
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
              <MenuIcon name="scope" />
              {en.label}
            </Ctx.Item>
          ))}
        </Ctx.SubContent>
      </Ctx.Portal>
    </Ctx.Sub>
  );
}

/** The scope popup menu (upstream ScopePopupMenu), for a docked scope or an undocked one. */
function ScopeMenuItems({ index, undocked }: { index: number; undocked: ScopeElm | null }) {
  const mgr = controller.scopes;
  const s = undocked !== null ? undocked.elmScope : mgr.scopes[index];
  if (s === undefined) return null;
  const run = (item: string) => () => controller.scopeMenu(item);
  return (
    <>
      <Item label="Remove Scope" icon="close" testId="scope-remove" onSelect={run('remove')} />
      {undocked !== null ? (
        <Item label="Dock Scope" icon="dock" testId="scope-dock" onSelect={run('dock')} />
      ) : (
        <Item
          label="Undock Scope"
          icon="openInNew"
          testId="scope-undock"
          onSelect={run('undock')}
        />
      )}
      <Ctx.CheckboxItem className="menu-item" checked={s.maxScale} onSelect={run('maxscale')}>
        <span className="menu-icon menu-check" aria-hidden>
          {s.maxScale && <Icon name="check" size={18} />}
        </span>
        {t('Max Scale')}
      </Ctx.CheckboxItem>
      {controller.scopes.look === 'cards' && (
        <Ctx.CheckboxItem
          className="menu-item"
          data-testid="scope-freeze"
          checked={s.frozen !== null}
          onSelect={run('freeze')}
        >
          <span className="menu-icon menu-check" aria-hidden>
            {s.frozen !== null && <Icon name="check" size={18} />}
          </span>
          {t('Freeze')}
        </Ctx.CheckboxItem>
      )}
      {undocked === null && (
        <>
          <Item
            label="Stack"
            icon="stack"
            disabled={!mgr.canStackScope(index)}
            onSelect={run('stack')}
          />
          <Item
            label="Unstack"
            icon="unstack"
            disabled={!mgr.canUnstackScope(index)}
            onSelect={run('unstack')}
          />
          <Item
            label="Combine"
            icon="combine"
            disabled={!mgr.canCombineScope()}
            onSelect={run('combine')}
          />
        </>
      )}
      <Item
        label="Remove Plot"
        icon="minus"
        disabled={controller.menuPlot < 0}
        onSelect={run('removeplot')}
      />
      <Item label="Reset" icon="replay" onSelect={run('reset')} />
      <Ctx.Separator className="menu-separator" />
      <Item label="Export CSV…" icon="download" onSelect={run('exportcsv')} />
      <Item
        label="Properties…"
        icon="settings"
        testId="scope-properties"
        onSelect={run('properties')}
      />
    </>
  );
}
