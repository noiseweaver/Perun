// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { parseQuery, queryBoolean, startCircuitFromQuery } from '@perun/format';
import { fetchExample, fetchExampleList, findExample, type ExampleList } from './examples.ts';
import { controller } from './SimController.ts';
import { installAutosave, readLastCircuit } from './autosave.ts';
import { announceUpdate } from './whatsNew.ts';
import { useApp } from './store.ts';
import { loadLibrary, previewThemeFromQuery } from './themes.ts';
import { embedConfig } from './embedConfig.ts';
import { startEmbedded } from './embed.ts';

export const BASE = import.meta.env.BASE_URL;

/** Open an upstream example circuit by file name. */
export async function openExample(
  file: string,
  title: string,
  running = true,
  undoable = false,
): Promise<void> {
  try {
    controller.load(await fetchExample(file, BASE), title, running, undoable);
  } catch (e) {
    useApp.setState({ error: e instanceof Error ? e.message : String(e) });
  }
}

/** Open a circuit file from another site (upstream `startCircuitLink`). */
export async function openLink(url: string, running = true, undoable = false): Promise<void> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    controller.load(await r.text(), url.substring(url.lastIndexOf('/') + 1), running, undoable);
  } catch (e) {
    useApp.setState({ error: `Can't load ${url}: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/**
 * Open what an upstream-style link asks for. Accepts a full URL or just its query string, so
 * `https://www.falstad.com/circuit/circuitjs.html?ctz=...` works when pasted.
 */
export async function openQuery(
  search: string,
  examples: ExampleList | null,
  undoable = false,
): Promise<boolean> {
  const q = parseQuery(search);
  const opened = await openCircuitFromQuery(q, examples, undoable);
  // after the circuit: loading it clears the error a damaged theme link would show
  const themed = await previewThemeFromQuery(q);
  return opened || themed;
}

async function openCircuitFromQuery(
  q: Map<string, string>,
  examples: ExampleList | null,
  undoable: boolean,
): Promise<boolean> {
  const running = queryBoolean(q, 'running', true);
  const start = startCircuitFromQuery(q);
  switch (start.kind) {
    case 'text':
      controller.load(start.text, 'Linked circuit', running, undoable);
      return true;
    case 'link':
      await openLink(start.url, running, undoable);
      return true;
    case 'example': {
      const title =
        start.label ?? (examples ? findExample(examples.root, start.file)?.title : null);
      await openExample(start.file, title ?? start.file, running, undoable);
      return true;
    }
    default:
      return false;
  }
}

/** Display settings from the URL that upstream also accepts. They last for this page only. */
function applyQuerySettings(search: string): void {
  const q = parseQuery(search);
  const s = { ...useApp.getState().settings };
  if (q.has('euroResistors')) s.euroResistors = queryBoolean(q, 'euroResistors', false);
  if (q.has('IECGates')) s.euroGates = queryBoolean(q, 'IECGates', false);
  if (q.has('usResistors') && queryBoolean(q, 'usResistors', false)) s.euroResistors = false;
  if (q.has('conventionalCurrent'))
    s.conventionalCurrent = queryBoolean(q, 'conventionalCurrent', true);
  if (q.has('showOhm')) s.showOhm = queryBoolean(q, 'showOhm', false);
  useApp.setState({ settings: s });
}

/** Page start: load the example list, then the circuit the URL names, else the default one. */
export async function startup(): Promise<void> {
  if (embedConfig !== null) {
    // in a host page's frame (the Obsidian plugin): the host gives the circuit and keeps it
    void loadLibrary();
    void fetchExampleList(BASE).then(
      (list) => useApp.setState({ examples: list }),
      () => undefined,
    );
    startEmbedded(embedConfig);
    return;
  }
  const search = window.location.search;
  announceUpdate();
  applyQuerySettings(search);
  void loadLibrary();
  const listPromise = fetchExampleList(BASE).then(
    (list) => {
      useApp.setState({ examples: list });
      return list;
    },
    () => null,
  );
  const q = parseQuery(search);
  const start = startCircuitFromQuery(q);
  // a circuit in the URL itself needs no list; don't wait for it
  if (start.kind === 'text') {
    await openQuery(search, null);
    installAutosave();
    return;
  }
  const examples = await listPromise;
  if (!(await openCircuitFromQuery(q, examples, false))) {
    // reopen what was on screen last time; a fresh install gets the default circuit
    const last = readLastCircuit();
    const running = queryBoolean(q, 'running', true);
    if (!last || !controller.load(last.text, last.title, running)) {
      const def = examples?.defaultCircuit;
      if (def) await openExample(def.file, def.title, running);
    }
  }
  installAutosave();
  await previewThemeFromQuery(q);
}
