// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Credits after CircuitJS1 war/about.html (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import * as Dialog from '@radix-ui/react-dialog';
import { BASE } from '../startup.ts';
import { Shell } from './DialogShell.tsx';
import { t } from '../i18n.ts';

/** Where this app's source code is published (GPL-2.0 section 3). */
export const SOURCE_URL = 'https://github.com/noiseweaver/circuitsjs-next';
export const UPSTREAM_URL = 'https://github.com/pfalstad/circuitjs1';
/** Voluntary tips. The app is free and never asks for them outside About and File > Support. */
export const SPONSOR_URL = 'https://github.com/sponsors/noiseweaver';
export const KOFI_URL = 'https://ko-fi.com/noiseweaver';

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

function Link(props: { href: string; children: string; testId?: string }) {
  return (
    <a href={props.href} target="_blank" rel="noopener noreferrer" data-testid={props.testId}>
      {props.children}
    </a>
  );
}

export function AboutDialog() {
  return (
    <Shell title={t('About circuitjs-next')} className="about-dialog">
      <div className="about">
        <p className="about-version" data-testid="about-version">
          Version {versionText()}
        </p>
        <p>
          An electronic circuit simulator: a rebuild of CircuitJS1 in TypeScript with a new
          interface and themes. Circuit files and simulation results stay compatible with
          CircuitJS1.
        </p>
        <p>
          CircuitJS1 is by Paul Falstad (<Link href="https://www.falstad.com/">falstad.com</Link>
          ), with the JavaScript conversion by Iain Sharp (
          <Link href="http://lushprojects.com/">lushprojects.com</Link>). Its source code is at{' '}
          <Link href={UPSTREAM_URL}>github.com/pfalstad/circuitjs1</Link>.
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
          This program is free software: you can redistribute it and/or modify it under the terms of
          the GNU General Public License as published by the Free Software Foundation, either
          version 2 of the License, or (at your option) any later version.
        </p>
        <p>
          This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
          without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
          See the GNU General Public License for more details.
        </p>
        <p data-testid="about-support">
          {t(
            'This app is free and stays free, with no ads and no accounts. If it helps you, you can support its development on',
          )}{' '}
          <Link href={SPONSOR_URL}>GitHub Sponsors</Link> {t('or')}{' '}
          <Link href={KOFI_URL}>Ko-fi</Link>.
        </p>
        <ul className="about-links">
          <li>
            <Link href={SOURCE_URL} testId="about-source">
              {t('Source code')}
            </Link>
          </li>
          <li>
            <Link href={`${BASE}LICENSE.txt`} testId="about-license">
              {t('GNU General Public License, version 2')}
            </Link>
          </li>
          <li>
            <Link href={`${BASE}third-party-licenses.txt`} testId="about-third-party">
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
