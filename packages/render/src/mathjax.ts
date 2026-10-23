// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// MathJax itself, loaded on demand by math.ts so circuits without formulas never fetch it.

import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/gensymb/GensymbConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/upgreek/UpgreekConfiguration.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import type { LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js';
import type { LiteText } from 'mathjax-full/js/adaptors/lite/Text.js';

/** A node of MathJax's output tree: an element with its attributes, or text. */
export interface SvgNode {
  readonly kind: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly SvgNode[];
  readonly text: string;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// the TeX of the formulas people write in circuit notes, not all of MathJax's extensions (those
// would double the download): AMS math, \boldsymbol, \cancel, \color, units from gensymb
// (\ohm, \celsius, \micro), upright Greek (\upmu) and \newcommand. No `noundefined`, so a
// mistyped macro is an error the box shows rather than red text in the formula.
const packages = [
  'base',
  'ams',
  'boldsymbol',
  'cancel',
  'color',
  'gensymb',
  'newcommand',
  'upgreek',
];
const doc = mathjax.document('', {
  InputJax: new TeX({ packages }),
  // paths inline in each glyph, so every formula is self-contained
  OutputJax: new SVG({ fontCache: 'none' }),
});

function toNode(n: LiteElement | LiteText): SvgNode {
  if (adaptor.kind(n) === '#text')
    return { kind: '#text', attrs: {}, children: [], text: adaptor.value(n) };
  const el = n as LiteElement;
  return {
    kind: adaptor.kind(el),
    attrs: { ...(el.attributes as Record<string, string>) },
    children: adaptor.childNodes(el).map((c) => toNode(c as LiteElement | LiteText)),
    text: '',
  };
}

/** Resolves when `typeset` can be called (at once here; see packages/app/src/embedMathjax.ts). */
export const ready: Promise<void> = Promise.resolve();

/** Typeset one display-style formula; the root is MathJax's `<mjx-container>`. */
export function typeset(tex: string): SvgNode {
  return toNode(doc.convert(tex, { display: true }) as LiteElement);
}
