// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { ALL_FIELDS, NO_FIELDS } from '@circuitjs-next/render';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@circuitjs-next/theme';
import {
  activeLibraryId,
  editTheme,
  importThemeFile,
  selectTheme,
  userThemeId,
} from '../themes.ts';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Fragment, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ExampleMenu } from '../examples.ts';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { openExample } from '../startup.ts';
import {
  VALUE_SIZES,
  updateSettings,
  useApp,
  type CircuitDisplay,
  setPaletteOpen,
} from '../store.ts';
import { openBode } from './BodeDialog.tsx';
import { openDcPanel } from './DcPanel.tsx';
import { openSweep } from './SweepDialog.tsx';
import { CategoryIcon } from './CategoryIcon.tsx';
import { CircuitsSheet } from './CircuitsSheet.tsx';
import { Icon, MenuIcon, type IconName } from './Icon.tsx';
import { useCompact, useNarrow } from './useNarrow.ts';
import { OpenLinkDialog } from './OpenLinkDialog.tsx';
import { promptInstall } from '../pwa.ts';
import { t, resolveLanguage, setLanguage } from '../i18n.ts';
import { VISUALIZATIONS } from '../visualizations.ts';
import { LANGUAGES } from '@circuitjs-next/elements';

const FIRST_PALETTE_THEME = 'nord';

function ExampleItems({ menu }: { menu: ExampleMenu }) {
  return (
    <>
      {menu.items.map((it, i) =>
        it.kind === 'menu' ? (
          <Fragment key={`m${i}`}>
            {/* a divider between categories (and before the first one after some circuits) */}
            {i > 0 && <Menu.Separator className="menu-separator category-separator" />}
            <Menu.Sub>
              <Menu.SubTrigger className="menu-item">
                <CategoryIcon title={it.title} />
                {t(it.title)}
                <Icon name="chevronRight" className="icon menu-trailing" />
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
                  <ExampleItems menu={it} />
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
          </Fragment>
        ) : (
          <Fragment key={it.file}>
            {i > 0 && menu.items[i - 1]?.kind === 'menu' && (
              <Menu.Separator className="menu-separator category-separator" />
            )}
            <Menu.Item
              className="menu-item"
              onSelect={() => void openExample(it.file, it.title, true, true)}
            >
              {t(it.title)}
            </Menu.Item>
          </Fragment>
        ),
      )}
    </>
  );
}

/** A top app bar menu's button: an icon and its name, or the icon alone on a phone (styles.css). */
function TriggerFace({ label, icon }: { label: string; icon: IconName }) {
  return (
    <>
      <Icon name={icon} className="icon menu-trigger-icon" />
      <span className="menu-trigger-label">{t(label)}</span>
    </>
  );
}

/** A top app bar menu: a tonal button that opens a dropdown menu. */
function AppMenu(props: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="menu-trigger"
        disabled={props.disabled}
        data-testid={props.testId}
        aria-label={t(props.label)}
        title={t(props.label)}
      >
        <TriggerFace label={props.label} icon={props.icon} />
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
  // phones either way up pick circuits from a sheet: the dropdown's side submenus are cramped there
  const compact = useCompact();
  const install = useApp((s) => s.install);

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
        aria-label={t(paletteOpen ? 'Hide components' : 'Show components')}
        aria-pressed={paletteOpen}
        title={t('Components')}
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
        {/* an example's title is in the catalogs, as in the Circuits menu */}
        {t(title)}
      </h1>
      <nav className="app-bar-menus" aria-label={t('Menus')}>
        <AppMenu label="File" icon="folderOpen" testId="file-menu">
          <Item label="New blank circuit" icon="noteAdd" onSelect={() => controller.newCircuit()} />
          <Item
            label="Open file…"
            icon="folderOpen"
            hint={`${MOD}O`}
            onSelect={() => fileInput.current?.click()}
          />
          <Item label="Open link…" icon="link" onSelect={() => setLinkOpen(true)} />
          <Item label="Import from text…" icon="upload" onSelect={() => openDialog('importText')} />
          <Menu.Separator className="menu-separator" />
          <Item
            label="Save…"
            icon="save"
            hint={`${MOD}S`}
            testId="menu-save"
            onSelect={() => openDialog('save')}
          />
          <Item
            label="Export link…"
            icon="share"
            testId="menu-export-link"
            onSelect={() => openDialog('exportLink')}
          />
          <Item
            label="Export as text…"
            icon="description"
            onSelect={() => openDialog('exportText')}
          />
          <Item
            label="Export image…"
            icon="image"
            testId="menu-export-image"
            onSelect={() => openDialog('exportImage')}
          />
          <Item
            label="Parts list…"
            icon="list"
            testId="menu-parts-list"
            onSelect={() => openDialog('partsList')}
          />
          <Item
            label="Create Subcircuit…"
            icon="chip"
            testId="menu-create-subcircuit"
            onSelect={() => controller.createSubcircuit()}
          />
          <Item
            label="Subcircuit Manager…"
            icon="folder"
            testId="menu-subcircuit-manager"
            onSelect={() => openDialog('subcircuitManager')}
          />
          <Item
            label="Parameters…"
            icon="functions"
            testId="menu-params"
            onSelect={() => openDialog('params')}
          />
          <Menu.Separator className="menu-separator" />
          {install !== 'none' && (
            <Item
              label="Install app…"
              icon="download"
              testId="menu-install"
              onSelect={() => (install === 'prompt' ? void promptInstall() : openDialog('install'))}
            />
          )}
          <Item
            label="What's new…"
            icon="newReleases"
            testId="menu-whats-new"
            onSelect={() => openDialog('whatsNew')}
          />
          <Item
            label="Send a suggestion…"
            icon="feedback"
            testId="menu-feedback"
            onSelect={() => openDialog('feedback')}
          />
          <Item
            label="About…"
            icon="info"
            testId="menu-about"
            onSelect={() => openDialog('about')}
          />
        </AppMenu>

        <AppMenu label="Edit" icon="editNote" testId="edit-menu">
          <Item
            label="Undo"
            icon="undo"
            hint={`${MOD}Z`}
            disabled={!editor.canUndo}
            onSelect={() => controller.undo()}
          />
          <Item
            label="Redo"
            icon="redo"
            hint={`${MOD}Y`}
            disabled={!editor.canRedo}
            onSelect={() => controller.redo()}
          />
          <Menu.Separator className="menu-separator" />
          <Item
            label="Cut"
            icon="cut"
            hint={`${MOD}X`}
            disabled={!hasSel}
            onSelect={() => controller.cut(null)}
          />
          <Item
            label="Copy"
            icon="copy"
            hint={`${MOD}C`}
            disabled={!hasSel}
            onSelect={() => controller.copy(null)}
          />
          <Item
            label="Paste"
            icon="paste"
            hint={`${MOD}V`}
            disabled={!editor.canPaste}
            onSelect={() => controller.paste()}
          />
          <Item
            label="Duplicate"
            icon="duplicate"
            hint={`${MOD}D`}
            disabled={!hasSel}
            onSelect={() => ed.duplicate(null)}
          />
          <Item
            label="Delete"
            icon="delete"
            hint="Del"
            disabled={!hasSel}
            onSelect={() => ed.deleteSelected(null)}
          />
          <Item
            label="Select All"
            icon="selectAll"
            hint={`${MOD}A`}
            onSelect={() => ed.selectAll()}
          />
          <Menu.Separator className="menu-separator" />
          <Item label="Mirror X" icon="flip" onSelect={() => ed.mirrorX()} />
          <Item label="Mirror Y" icon="flip" turned onSelect={() => ed.mirrorY()} />
          <Item label="Rotate CCW" icon="rotateLeft" onSelect={() => ed.rotateCCW()} />
          <Item label="Rotate CW" icon="rotateRight" onSelect={() => ed.rotateCW()} />
          <Menu.Separator className="menu-separator" />
          <Item label="Centre Circuit" icon="fit" onSelect={() => controller.fit()} />
        </AppMenu>

        {compact ? (
          <button
            type="button"
            className="menu-trigger"
            disabled={examples === null}
            data-testid="circuits-menu"
            data-state={sheetOpen ? 'open' : 'closed'}
            aria-label={t('Circuits')}
            title={t('Circuits')}
            onClick={() => setSheetOpen(true)}
          >
            <TriggerFace label="Circuits" icon="library" />
          </button>
        ) : (
          <AppMenu
            label="Circuits"
            icon="library"
            disabled={examples === null}
            testId="circuits-menu"
          >
            {examples && <ExampleItems menu={examples.root} />}
          </AppMenu>
        )}
        {compact && sheetOpen && examples && (
          <CircuitsSheet root={examples.root} onClose={() => setSheetOpen(false)} />
        )}

        <AppMenu label="Scopes" icon="scope" testId="scopes-menu">
          <ScopesMenuItems />
        </AppMenu>

        <AppMenu label="Options" icon="settings" testId="options-menu">
          <CheckItem
            label="Show current"
            icon="bolt"
            checked={display.showDots}
            onCheckedChange={(v) => setDisplay({ showDots: v })}
          />
          <CheckItem
            label="Show voltage"
            icon="gradient"
            checked={display.voltageColors}
            onCheckedChange={(v) => setDisplay({ voltageColors: v })}
          />
          <CheckItem
            label="Show values"
            icon="label"
            checked={display.showValues}
            onCheckedChange={(v) => setDisplay({ showValues: v })}
          />
          <Menu.Separator className="menu-separator" />
          <CheckItem
            label="Edit Values With Mouse Wheel"
            icon="mouse"
            checked={settings.wheelEdit}
            onCheckedChange={(v) => updateSettings({ wheelEdit: v })}
            testId="menu-wheel-edit"
          />
          <CheckItem
            label="Wires follow dragged parts"
            icon="timeline"
            checked={settings.wiresFollow}
            onCheckedChange={(v) => updateSettings({ wiresFollow: v })}
            title={t('Hold Alt while dragging to leave the wires behind')}
            testId="menu-wires-follow"
          />
          <CheckItem
            label="European resistors"
            icon="euroResistor"
            checked={settings.euroResistors}
            onCheckedChange={(v) => updateSettings({ euroResistors: v })}
          />
          <CheckItem
            label="IEC gates"
            icon="chip"
            checked={settings.euroGates}
            onCheckedChange={(v) => updateSettings({ euroGates: v })}
          />
          <CheckItem
            label="Show Ω after resistances"
            icon="omega"
            checked={settings.showOhm}
            onCheckedChange={(v) => updateSettings({ showOhm: v })}
          />
          <CheckItem
            label="Junction dots"
            icon="junction"
            checked={settings.junctionDots}
            onCheckedChange={(v) => updateSettings({ junctionDots: v })}
            testId="menu-junction-dots"
          />
          <VisualizationsMenu />
          <ValueSizeMenu />
          <CheckItem
            label="Conventional current motion"
            icon="swap"
            checked={settings.conventionalCurrent}
            onCheckedChange={(v) => updateSettings({ conventionalCurrent: v })}
          />
          <OptionsSub label="Default text box font" icon="textFields" testId="menu-text-font">
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
                  <Check on={settings.textFont.family === id} /> {t(label)}
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
              <Check on={settings.textFont.bold} /> {t('Bold')}
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              className="menu-item"
              checked={settings.textFont.italic}
              onCheckedChange={(v) =>
                updateSettings({ textFont: { ...settings.textFont, italic: v } })
              }
            >
              <Check on={settings.textFont.italic} /> {t('Italic')}
            </Menu.CheckboxItem>
          </OptionsSub>
          <LanguageMenu />
          <Menu.Separator className="menu-separator" />
          <Item
            label="Simulation settings…"
            icon="settings"
            testId="menu-sim-settings"
            onSelect={() => openDialog('simSettings')}
          />
          <Item
            label="Keyboard shortcuts…"
            icon="keyboard"
            hint="?"
            onSelect={() => openDialog('shortcuts')}
          />
          <Menu.Separator className="menu-separator" />
          {narrow ? (
            // a submenu has no room beside the menu on a phone; the dialog has it all
            <Item
              label="Theme…"
              icon="palette"
              testId="menu-theme"
              onSelect={() => openDialog('themes')}
            />
          ) : (
            <ThemeMenu themeInput={themeInput} />
          )}
        </AppMenu>
      </nav>

      <div className="app-bar-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={t('Undo')}
          title={`${t('Undo')} (${MOD}Z)`}
          disabled={!editor.canUndo}
          onClick={() => controller.undo()}
          data-testid="undo"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('Redo')}
          title={`${t('Redo')} (${MOD}Y)`}
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
  icon: IconName;
  /** Draw the icon turned a quarter (Mirror Y reuses the Mirror X icon). */
  turned?: boolean;
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
      <MenuIcon name={props.icon} turned={props.turned} />
      {t(props.label)}
      {props.hint && <span className="menu-trailing menu-hint">{props.hint}</span>}
    </Menu.Item>
  );
}

/** Options > Theme: the built-ins and the user's themes, then the editor, library and import. */
function ThemeMenu({ themeInput }: { themeInput: RefObject<HTMLInputElement | null> }) {
  const themeId = useApp((s) => s.settings.themeId);
  const library = useApp((s) => s.library);
  return (
    <OptionsSub label="Theme" icon="palette" testId="menu-theme">
      <Menu.RadioGroup value={themeId} onValueChange={selectTheme}>
        {Object.entries(BUILTIN_THEMES).map(([id, th]) => (
          <Fragment key={id}>
            {/* the themes after editor and app palettes follow the app's own */}
            {id === FIRST_PALETTE_THEME && <Menu.Separator className="menu-separator" />}
            <Menu.RadioItem value={id} className="menu-item" data-testid={`theme-${id}`}>
              <Check on={themeId === id} /> {th.meta.name}
              {id === DEFAULT_THEME_ID && (
                <span className="menu-trailing menu-hint">{t('Default')}</span>
              )}
            </Menu.RadioItem>
          </Fragment>
        ))}
        {library.length > 0 && <Menu.Separator className="menu-separator" />}
        {library.map((th) => (
          <Menu.RadioItem
            key={th.id}
            value={userThemeId(th.id)}
            className="menu-item"
            data-testid={`theme-user-${th.theme.meta.name}`}
          >
            <Check on={themeId === userThemeId(th.id)} /> {th.theme.meta.name}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
      <Menu.Separator className="menu-separator" />
      <Item
        label="Edit theme…"
        icon="edit"
        testId="menu-edit-theme"
        onSelect={() => editTheme(useApp.getState().theme, activeLibraryId())}
      />
      <Item
        label="Themes…"
        icon="palette"
        testId="menu-themes"
        onSelect={() => openDialog('themes')}
      />
      <Item
        label="Import theme file…"
        icon="upload"
        testId="menu-import-theme"
        onSelect={() => themeInput.current?.click()}
      />
    </OptionsSub>
  );
}

/**
 * A submenu of Options. On a phone a submenu beside its menu runs off the screen, so there its
 * items unfold inside the menu instead.
 */
function OptionsSub(props: { label: string; icon: IconName; testId: string; children: ReactNode }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (narrow)
    return (
      <>
        <Menu.Item
          className="menu-item"
          data-testid={props.testId}
          aria-expanded={open}
          onSelect={(e) => {
            e.preventDefault();
            setOpen(!open);
          }}
        >
          <MenuIcon name={props.icon} />
          {t(props.label)}
          <Icon name={open ? 'expandLess' : 'expandMore'} className="icon menu-trailing" />
        </Menu.Item>
        {open && <div className="menu-inline-group">{props.children}</div>}
      </>
    );
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="menu-item" data-testid={props.testId}>
        <MenuIcon name={props.icon} />
        {t(props.label)}
        <Icon name="chevronRight" className="icon menu-trailing" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent className="menu-content" sideOffset={4} alignOffset={-8}>
          {props.children}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

/** Options > Visualizations: one switch per field, charge or energy overlay (fields.ts). */
function VisualizationsMenu() {
  const fields = useApp((s) => s.settings.fields);
  const all = Object.values(fields).every((v) => v);
  return (
    <OptionsSub label="Visualizations" icon="visibility" testId="menu-visualizations">
      {VISUALIZATIONS.map(({ key, label }) => (
        <Menu.CheckboxItem
          key={key}
          className="menu-item"
          checked={fields[key]}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(v) => updateSettings({ fields: { ...fields, [key]: v } })}
          data-testid={`menu-vis-${key}`}
        >
          <Check on={fields[key]} /> {t(label)}
        </Menu.CheckboxItem>
      ))}
      <Menu.Separator className="menu-separator" />
      <Menu.Item
        className="menu-item"
        onSelect={(e) => {
          e.preventDefault();
          updateSettings({ fields: all ? { ...NO_FIELDS } : { ...ALL_FIELDS } });
        }}
        data-testid="menu-vis-all"
      >
        <Check on={false} /> {t(all ? 'Turn all off' : 'Turn all on')}
      </Menu.Item>
    </OptionsSub>
  );
}

/** Options > Language: upstream's catalogs, or the browser's language. */
/** Options > Value text size: the size of component values on the canvas. */
function ValueSizeMenu() {
  const setting = useApp((s) => s.settings.valueSize);
  return (
    <OptionsSub label="Value text size" icon="formatSize" testId="menu-value-size">
      <Menu.RadioGroup
        value={String(setting)}
        onValueChange={(v) => updateSettings({ valueSize: Number(v) })}
      >
        {VALUE_SIZES.map((v) => (
          <Menu.RadioItem
            key={v.scale}
            value={String(v.scale)}
            className="menu-item"
            onSelect={(e) => e.preventDefault()}
            data-testid={`value-size-${v.scale}`}
          >
            <Check on={setting === v.scale} /> {t(v.label)}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </OptionsSub>
  );
}

function LanguageMenu() {
  const setting = useApp((s) => s.settings.language);
  const choose = (v: string): void => {
    updateSettings({ language: v });
    void setLanguage(resolveLanguage(v));
  };
  return (
    <OptionsSub label="Language" icon="translate" testId="menu-language">
      <Menu.RadioGroup value={setting} onValueChange={choose}>
        <Menu.RadioItem value="auto" className="menu-item" data-testid="language-auto">
          <Check on={setting === 'auto'} /> {t('Browser language')}
        </Menu.RadioItem>
        <Menu.Separator className="menu-separator" />
        {LANGUAGES.map((l) => (
          <Menu.RadioItem
            key={l.code}
            value={l.code}
            className="menu-item"
            data-testid={`language-${l.code}`}
          >
            <Check on={setting === l.code} />{' '}
            <span lang={l.code === 'kr' ? 'ko' : l.code === 'csx' ? 'cs' : l.code}>{l.name}</span>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </OptionsSub>
  );
}

/** An Options switch: its icon, its name, and a tick at the end while it is on. */
function CheckItem(props: {
  label: string;
  icon: IconName;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title?: string;
  testId?: string;
}) {
  return (
    <Menu.CheckboxItem
      className="menu-item"
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      title={props.title}
      data-testid={props.testId}
    >
      <MenuIcon name={props.icon} />
      {t(props.label)}
      <span className="menu-trailing menu-check" aria-hidden>
        {props.checked && <Icon name="check" size={18} />}
      </span>
    </Menu.CheckboxItem>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className="menu-check" aria-hidden>
      {on && <Icon name="check" size={18} />}
    </span>
  );
}

/** Upstream's Scopes menu: arrange all docked scopes at once, plus Undock All and Dock All (ours). */
function ScopesMenuItems() {
  const mgr = controller.scopes;
  const n = mgr.scopeCount;
  const last = mgr.scopes[n - 1];
  return (
    <>
      <Item
        label="Stack All"
        icon="stack"
        disabled={!(n > 1 && last !== undefined && last.position > 0)}
        onSelect={() => controller.allScopes('stackAll')}
      />
      <Item
        label="Unstack All"
        icon="unstack"
        disabled={!(n > 1 && last !== undefined && last.position !== n - 1)}
        onSelect={() => controller.allScopes('unstackAll')}
      />
      <Item
        label="Combine All"
        icon="combine"
        disabled={n <= 1}
        onSelect={() => controller.allScopes('combineAll')}
      />
      <Item
        label="Separate All"
        icon="split"
        disabled={n === 0}
        testId="scopes-separate-all"
        onSelect={() => controller.allScopes('separateAll')}
      />
      <Item
        label="Undock All"
        icon="openInNew"
        disabled={!controller.canUndockAll()}
        testId="scopes-undock-all"
        onSelect={() => controller.undockAll()}
      />
      <Item
        label="Dock All"
        icon="dock"
        disabled={!controller.canDockAll()}
        testId="scopes-dock-all"
        onSelect={() => controller.dockAll()}
      />
      <Menu.Separator className="menu-separator" />
      <Item
        label="AC Analysis (Bode Plot)…"
        icon="bode"
        testId="scopes-bode"
        onSelect={() => openBode()}
      />
      <Item
        label="DC Operating Point"
        icon="table"
        testId="scopes-dc"
        onSelect={() => openDcPanel()}
      />
      <Item
        label="Parameter Sweep…"
        icon="sweep"
        testId="scopes-sweep"
        onSelect={() => openSweep('values')}
      />
      <Item
        label="Monte Carlo…"
        icon="dice"
        testId="scopes-montecarlo"
        onSelect={() => openSweep('montecarlo')}
      />
    </>
  );
}
