// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Credits after CircuitJS1 war/about.html (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import * as Dialog from '@radix-ui/react-dialog';
import { Fragment, type ReactNode } from 'react';
import { BASE } from '../startup.ts';
import { embedConfig } from '../embedConfig.ts';
import { Shell } from './DialogShell.tsx';
import { t, tf } from '../i18n.ts';

/** Where this app's source code is published (GPL-2.0 section 3). */
export const SOURCE_URL = 'https://github.com/noiseweaver/perun';
export const UPSTREAM_URL = 'https://github.com/pfalstad/circuitjs1';
/** The author and maintainer of Perun. */
export const AUTHOR_URL = 'https://github.com/noiseweaver';
/** Where the license files are: next to the app, or on the web app inside the Obsidian plugin. */
const FILES = embedConfig?.siteUrl ?? BASE;

/** The app's version, with the commit it was built from when known. */
export function versionText(): string {
  const env = import.meta.env;
  const commit = env.APP_COMMIT ? ` (${env.APP_COMMIT})` : '';
  return `${env.APP_VERSION}${commit}, built ${env.APP_BUILD_DATE}`;
}

/** Upstream's thanks, as its About box lists them. */
const THANKS = [
  'Edward Calver for 15 new components and other improvements',
  'Rodrigo Hausen for file import/export and many other UI improvements',
  'J. Mike Rollins for the Zener diode code',
  'Julius Schmidt for the spark gap code and some examples',
  'Dustin Soodak for help with the user interface improvements',
  'Jacob Calvert for the T Flip Flop',
  'Ben Hayden for scope spectrum',
  'Francisco Campos for the DC Motor',
  'Bill Collis for the thermistor and LDR',
  'Mark McGarry for AVR8js support; Uri Shaked for AVR8js',
  'Johannes Bauer for WebSocket support',
  'Thomas Reitinger, Krystian Sławiński, Usevalad Khatkevich, Lucio Sciamanna, Mauro Hemerly ' +
    'Gazzani, J. Miguel Silva, Kristian Keilen, Linhart Jiří, Karel Kupa, Franck Viard, David ' +
    'Chen, Taisuke Fukuno, 肖国栋 (Gordon Shaw), 王逸伦 and Pablo Sanz Martin for translations',
  'Andre Adrian for the improved emitter coupled oscillator',
  'Felthry for many examples',
  'Colin Howell for code improvements',
  'LZString (c) 2013 pieroxy',
];

/** Fill `{name}` placeholders in translated text with elements (links) or plain text. */
export function withLinks(text: string, values: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    const v = m?.[1] !== undefined ? values[m[1]] : undefined;
    return <Fragment key={i}>{v === undefined ? part : v}</Fragment>;
  });
}

function Link(props: { href: string; children: string; testId?: string }) {
  return (
    <a href={props.href} target="_blank" rel="noopener noreferrer" data-testid={props.testId}>
      {props.children}
    </a>
  );
}

export function AboutDialog() {
  return (
    <Shell title={t('About Perun')} className="about-dialog">
      <div className="about">
        <p className="about-version" data-testid="about-version">
          {tf('Version {version}', { version: versionText() })}
        </p>
        <p>
          {t(
            'An electronic circuit simulator: a rebuild of CircuitJS1 in TypeScript with a new interface and themes. Circuit files and simulation results stay compatible with CircuitJS1.',
          )}
        </p>
        <p data-testid="about-author">
          {withLinks(t('Perun is made and maintained by {author} ({link}).'), {
            author: 'Gadiel Zintu',
            link: <Link href={AUTHOR_URL}>github.com/noiseweaver</Link>,
          })}
        </p>
        <p>
          {withLinks(
            t(
              'CircuitJS1 is by Paul Falstad ({falstad}), with the JavaScript conversion by Iain Sharp ({lush}). Its source code is at {source}.',
            ),
            {
              falstad: <Link href="https://www.falstad.com/">falstad.com</Link>,
              lush: <Link href="http://lushprojects.com/">lushprojects.com</Link>,
              source: <Link href={UPSTREAM_URL}>github.com/pfalstad/circuitjs1</Link>,
            },
          )}
        </p>
        <details className="about-thanks">
          <summary>{t('CircuitJS1 thanks')}</summary>
          <ul>
            {THANKS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
        <p>
          {t(
            'This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 2 of the License, or (at your option) any later version.',
          )}
        </p>
        <p>
          {t(
            'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.',
          )}
        </p>
        <ul className="about-links">
          <li>
            <Link href={SOURCE_URL} testId="about-source">
              {t('Source code')}
            </Link>
          </li>
          <li>
            <Link href={`${FILES}LICENSE.txt`} testId="about-license">
              {t('GNU General Public License, version 2')}
            </Link>
          </li>
          <li>
            <Link href={`${FILES}third-party-licenses.txt`} testId="about-third-party">
              {t('Third-party licenses (libraries and fonts)')}
            </Link>
          </li>
        </ul>
      </div>
      <div className="dialog-buttons">
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('OK')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}
