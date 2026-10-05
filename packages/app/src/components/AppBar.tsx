// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@circuitjs-next/theme';
import {
  activeLibraryId,
  editTheme,
  importThemeFile,
  selectTheme,
  userThemeId,
} from '../themes.ts';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ExampleMenu } from '../examples.ts';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { openExample } from '../startup.ts';
import { updateSettings, useApp, type CircuitDisplay, setPaletteOpen } from '../store.ts';
import { CircuitsSheet } from './CircuitsSheet.tsx';
import { Icon } from './Icon.tsx';
import { useNarrow } from './useNarrow.ts';
import { OpenLinkDialog } from './OpenLinkDialog.tsx';

function ExampleItems({ menu }: { menu: ExampleMenu }) {
  return (
    <>
      {menu.items.map((it, i) =>
        it.kind === 'menu' ? (
          <Menu.Sub key={`m${i}`}>
            <Menu.SubTrigger className="menu-item">
              {it.title}
              <Icon name="chevronRight" className="icon menu-trailing" />
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
                <ExampleItems menu={it} />
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
        ) : (
          <Menu.Item
            key={it.file}
            className="menu-item"
            onSelect={() => void openExample(it.file, it.title, true, true)}
          >
            {it.title}
          </Menu.Item>
        ),
      )}
    </>
  );
}

/** A top app bar menu: a text button that opens a dropdown menu. */
function AppMenu(props: {
  label: string;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="menu-trigger" disabled={props.disabled} data-testid={props.testId}>
        {props.label}
        <Icon name="dropDown" size={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu-content" sideOffset={4} align="start">
          {props.children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Top app bar: the circuit title, then the menus (on the left, so they and their submenus open
 * rightwards with room to spare), then undo and redo at the right.
 */
export function AppBar() {
  const title = useApp((s) => s.title);
  const display = useApp((s) => s.display);
  const settings = useApp((s) => s.settings);
  const examples = useApp((s) => s.examples);
  const fileInput = useRef<HTMLInputElement>(null);
  const themeInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const narrow = useNarrow();

  const setDisplay = (patch: Partial<CircuitDisplay>): void =>
    useApp.setState({ display: { ...useApp.getState().display, ...patch } });

  const openFile = async (f: File): Promise<void> => {
    if (controller.load(await f.text(), f.name, true, true)) controller.lastFileName = f.name;
  };
  const ed = controller.editor;
  const editor = useApp((s) => s.editor);
  const paletteOpen = useApp((s) => s.paletteOpen);
  const hasSel = editor.selectionCount > 0;

  return (
    <header className="app-bar">
      <button
        type="button"
        className="icon-button"
        aria-label={paletteOpen ? 'Hide components' : 'Show components'}
        aria-pressed={paletteOpen}
        title="Components"
        data-testid="palette-toggle"
        onClick={() => setPaletteOpen(!paletteOpen)}
      >
        <Icon name="menu" />
      </button>
      <div className="app-bar-brand" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
          <path d="M2 12h4l2-5 4 10 4-10 2 5h4" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="app-bar-title" data-testid="circuit-title">
        {title}
      </h1>
      <nav className="app-bar-menus" aria-label="Menus">
        <AppMenu label="File" testId="file-menu">
          <Item label="New blank circuit" onSelect={() => controller.newCircuit()} />
          <Item label="Open file…" hint={`${MOD}O`} onSelect={() => fileInput.current?.click()} />
          <Item label="Open link…" onSelect={() => setLinkOpen(true)} />
          <Item label="Import from text…" onSelect={() => openDialog('importText')} />
          <Menu.Separator className="menu-separator" />
          <Item
            label="Save…"
            hint={`${MOD}S`}
            testId="menu-save"
            onSelect={() => openDialog('save')}
          />
          <Item
            label="Export link…"
            testId="menu-export-link"
            onSelect={() => openDialog('exportLink')}
          />
          <Item label="Export as text…" onSelect={() => openDialog('exportText')} />
        </AppMenu>

        <AppMenu label="Edit" testId="edit-menu">
          <Item
            label="Undo"
            hint={`${MOD}Z`}
            disabled={!editor.canUndo}
            onSelect={() => controller.undo()}
          />
          <Item
            label="Redo"
            hint={`${MOD}Y`}
            disabled={!editor.canRedo}
            onSelect={() => controller.redo()}
          />
          <Menu.Separator className="menu-separator" />
          <Item
            label="Cut"
            hint={`${MOD}X`}
            disabled={!hasSel}
            onSelect={() => controller.cut(null)}
          />
          <Item
            label="Copy"
            hint={`${MOD}C`}
            disabled={!hasSel}
            onSelect={() => controller.copy(null)}
          />
          <Item
            label="Paste"
            hint={`${MOD}V`}
            disabled={!editor.canPaste}
            onSelect={() => controller.paste()}
          />
          <Item
            label="Duplicate"
            hint={`${MOD}D`}
            disabled={!hasSel}
            onSelect={() => ed.duplicate(null)}
          />
          <Item
            label="Delete"
            hint="Del"
            disabled={!hasSel}
            onSelect={() => ed.deleteSelected(null)}
          />
          <Item label="Select All" hint={`${MOD}A`} onSelect={() => ed.selectAll()} />
          <Menu.Separator className="menu-separator" />
          <Item label="Mirror X" onSelect={() => ed.mirrorX()} />
          <Item label="Mirror Y" onSelect={() => ed.mirrorY()} />
          <Item label="Rotate CCW" onSelect={() => ed.rotateCCW()} />
          <Item label="Rotate CW" onSelect={() => ed.rotateCW()} />
          <Menu.Separator className="menu-separator" />
          <Item label="Centre Circuit" onSelect={() => controller.fit()} />
        </AppMenu>

        {narrow ? (
          <button
            type="button"
            className="menu-trigger"
            disabled={examples === null}
            data-testid="circuits-menu"
            data-state={sheetOpen ? 'open' : 'closed'}
            onClick={() => setSheetOpen(true)}
          >
            Circuits
            <Icon name="dropDown" size={18} />
          </button>
        ) : (
          <AppMenu label="Circuits" disabled={examples === null} testId="circuits-menu">
            {examples && <ExampleItems menu={examples.root} />}
          </AppMenu>
        )}
        {narrow && sheetOpen && examples && (
          <CircuitsSheet root={examples.root} onClose={() => setSheetOpen(false)} />
        )}

        <AppMenu label="Scopes" testId="scopes-menu">
          <ScopesMenuItems />
        </AppMenu>

        <AppMenu label="Options" testId="options-menu">
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
            checked={settings.euroGates}
            onCheckedChange={(v) => updateSettings({ euroGates: v })}
          >
            <Check on={settings.euroGates} /> IEC gates
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
            checked={settings.junctionDots}
            onCheckedChange={(v) => updateSettings({ junctionDots: v })}
            data-testid="menu-junction-dots"
          >
            <Check on={settings.junctionDots} /> Junction dots
          </Menu.CheckboxItem>
          <Menu.CheckboxItem
            className="menu-item"
            checked={settings.conventionalCurrent}
            onCheckedChange={(v) => updateSettings({ conventionalCurrent: v })}
          >
            <Check on={settings.conventionalCurrent} /> Conventional current motion
          </Menu.CheckboxItem>
          <Menu.Sub>
            <Menu.SubTrigger className="menu-item" data-testid="menu-text-font">
              Default text box font
              <Icon name="chevronRight" className="icon menu-trailing" />
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
                <Menu.RadioGroup
                  value={settings.textFont.family}
                  onValueChange={(v) =>
                    updateSettings({
                      textFont: {
                        ...settings.textFont,
                        family: v === 'serif' || v === 'mono' ? v : 'default',
                      },
                    })
                  }
                >
                  {(
                    [
                      ['default', 'Default'],
                      ['serif', 'Serif'],
                      ['mono', 'Monospace'],
                    ] as const
                  ).map(([id, label]) => (
                    <Menu.RadioItem
                      key={id}
                      value={id}
                      className="menu-item"
                      data-testid={`text-font-${id}`}
                    >
                      <Check on={settings.textFont.family === id} /> {label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
                <Menu.Separator className="menu-separator" />
                <Menu.CheckboxItem
                  className="menu-item"
                  checked={settings.textFont.bold}
                  onCheckedChange={(v) =>
                    updateSettings({ textFont: { ...settings.textFont, bold: v } })
                  }
                >
                  <Check on={settings.textFont.bold} /> Bold
                </Menu.CheckboxItem>
                <Menu.CheckboxItem
                  className="menu-item"
                  checked={settings.textFont.italic}
                  onCheckedChange={(v) =>
                    updateSettings({ textFont: { ...settings.textFont, italic: v } })
                  }
                >
                  <Check on={settings.textFont.italic} /> Italic
                </Menu.CheckboxItem>
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
          <Menu.Separator className="menu-separator" />
          <Item
            label="Simulation settings…"
            testId="menu-sim-settings"
            onSelect={() => openDialog('simSettings')}
          />
          <Item label="Keyboard shortcuts…" hint="?" onSelect={() => openDialog('shortcuts')} />
          <Menu.Separator className="menu-separator" />
          {narrow ? (
            // a submenu has no room beside the menu on a phone; the dialog has it all
            <Item label="Theme…" testId="menu-theme" onSelect={() => openDialog('themes')} />
          ) : (
            <ThemeMenu themeInput={themeInput} />
          )}
        </AppMenu>
      </nav>

      <div className="app-bar-actions">
        <button
          type="button"
          className="icon-button"
          aria-label="Undo"
          title={`Undo (${MOD}Z)`}
          disabled={!editor.canUndo}
          onClick={() => controller.undo()}
          data-testid="undo"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Redo"
          title={`Redo (${MOD}Y)`}
          disabled={!editor.canRedo}
          onClick={() => controller.redo()}
          data-testid="redo"
        >
          <Icon name="redo" />
        </button>
      </div>

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
      <input
        ref={themeInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="theme-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importThemeFile(f);
          e.target.value = '';
        }}
      />
      <OpenLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
    </header>
  );
}

const MOD = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function Item(props: {
  label: string;
  hint?: string;
  disabled?: boolean;
  testId?: string;
  onSelect: () => void;
}) {
  return (
    <Menu.Item
      className="menu-item"
      disabled={props.disabled ?? false}
      onSelect={props.onSelect}
      data-testid={props.testId}
    >
      {props.label}
      {props.hint && <span className="menu-trailing menu-hint">{props.hint}</span>}
    </Menu.Item>
  );
}

/** Options > Theme: the built-ins and the user's themes, then the editor, library and import. */
function ThemeMenu({ themeInput }: { themeInput: RefObject<HTMLInputElement | null> }) {
  const themeId = useApp((s) => s.settings.themeId);
  const library = useApp((s) => s.library);
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="menu-item" data-testid="menu-theme">
        Theme
        <Icon name="chevronRight" className="icon menu-trailing" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
          <Menu.RadioGroup value={themeId} onValueChange={selectTheme}>
            {Object.entries(BUILTIN_THEMES).map(([id, t]) => (
              <Menu.RadioItem key={id} value={id} className="menu-item" data-testid={`theme-${id}`}>
                <Check on={themeId === id} /> {t.meta.name}
                {id === DEFAULT_THEME_ID && (
                  <span className="menu-trailing menu-hint">Default</span>
                )}
              </Menu.RadioItem>
            ))}
            {library.length > 0 && <Menu.Separator className="menu-separator" />}
            {library.map((t) => (
              <Menu.RadioItem
                key={t.id}
                value={userThemeId(t.id)}
                className="menu-item"
                data-testid={`theme-user-${t.theme.meta.name}`}
              >
                <Check on={themeId === userThemeId(t.id)} /> {t.theme.meta.name}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="menu-separator" />
          <Item
            label="Edit theme…"
            testId="menu-edit-theme"
            onSelect={() => editTheme(useApp.getState().theme, activeLibraryId())}
          />
          <Item label="Themes…" testId="menu-themes" onSelect={() => openDialog('themes')} />
          <Item
            label="Import theme file…"
            testId="menu-import-theme"
            onSelect={() => themeInput.current?.click()}
          />
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className="menu-check" aria-hidden>
      {on && <Icon name="check" size={18} />}
    </span>
  );
}

/** Upstream's Scopes menu: arrange all docked scopes at once. */
function ScopesMenuItems() {
  const mgr = controller.scopes;
  const n = mgr.scopeCount;
  const last = mgr.scopes[n - 1];
  return (
    <>
      <Item
        label="Stack All"
        disabled={!(n > 1 && last !== undefined && last.position > 0)}
        onSelect={() => controller.allScopes('stackAll')}
      />
      <Item
        label="Unstack All"
        disabled={!(n > 1 && last !== undefined && last.position !== n - 1)}
        onSelect={() => controller.allScopes('unstackAll')}
      />
      <Item
        label="Combine All"
        disabled={n <= 1}
        onSelect={() => controller.allScopes('combineAll')}
      />
      <Item
        label="Separate All"
        disabled={n === 0}
        testId="scopes-separate-all"
        onSelect={() => controller.allScopes('separateAll')}
      />
    </>
  );
}
