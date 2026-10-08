// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * A small XML document model and parser, enough for circuit files, without the DOM (the format
 * package also runs in Node and workers). Upstream parses with the browser's DOMParser through
 * GWT; this keeps what that exposes: element names, attributes in document order, child order and
 * text.
 */

export interface XmlText {
  text: string;
}

export class XmlElement {
  readonly name: string;
  /** Attributes in document (or insertion) order. */
  readonly attributes: [string, string][] = [];
  readonly children: (XmlElement | XmlText)[] = [];

  constructor(name: string) {
    this.name = name;
  }

  getAttribute(name: string): string | null {
    for (const [k, v] of this.attributes) if (k === name) return v;
    return null;
  }

  setAttribute(name: string, value: string): void {
    for (const a of this.attributes)
      if (a[0] === name) {
        a[1] = value;
        return;
      }
    this.attributes.push([name, value]);
  }

  removeAttribute(name: string): void {
    const i = this.attributes.findIndex((a) => a[0] === name);
    if (i >= 0) this.attributes.splice(i, 1);
  }

  appendChild(child: XmlElement | XmlText): void {
    this.children.push(child);
  }

  /** Child elements only, in order. */
  elements(): XmlElement[] {
    return this.children.filter((c): c is XmlElement => c instanceof XmlElement);
  }

  /** The first child's text, as upstream `parseContents()` reads it. */
  firstText(): string | null {
    const c = this.children[0];
    return c !== undefined && !(c instanceof XmlElement) ? c.text : null;
  }
}

export class XmlParseError extends Error {
  constructor(message: string, pos: number) {
    super(`${message} at offset ${pos}`);
    this.name = 'XmlParseError';
  }
}

const NAME_RE = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ENTITIES: Partial<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string, pos: number): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);|&/g, (m, ref: string | undefined) => {
    if (ref === undefined) throw new XmlParseError('bare &', pos);
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    const e = ENTITIES[ref];
    if (e === undefined) throw new XmlParseError(`unknown entity ${m}`, pos);
    return e;
  });
}

/** Parse a document and return its root element. Throws XmlParseError on malformed input. */
export function parseXml(src: string): XmlElement {
  let pos = 0;
  const len = src.length;
  if (src.charCodeAt(0) === 0xfeff) pos = 1;

  const fail = (msg: string): never => {
    throw new XmlParseError(msg, pos);
  };
  const skipSpace = (): void => {
    while (pos < len && ' \t\r\n'.includes(src.charAt(pos))) pos++;
  };
  const expect = (s: string): void => {
    if (!src.startsWith(s, pos)) fail(`expected ${s}`);
    pos += s.length;
  };
  const skipPast = (end: string): void => {
    const i = src.indexOf(end, pos);
    if (i < 0) fail(`unterminated, expected ${end}`);
    pos = i + end.length;
  };
  const readName = (): string => {
    NAME_RE.lastIndex = pos;
    const m = NAME_RE.exec(src);
    if (m === null) return fail('expected a name');
    pos += m[0].length;
    return m[0];
  };
  /** Skip comments, processing instructions and a doctype. True if something was skipped. */
  const skipMisc = (): boolean => {
    if (src.startsWith('<!--', pos)) skipPast('-->');
    else if (src.startsWith('<?', pos)) skipPast('?>');
    else if (src.startsWith('<!DOCTYPE', pos)) skipPast('>');
    else return false;
    return true;
  };

  const parseElement = (): XmlElement => {
    expect('<');
    const el = new XmlElement(readName());
    for (;;) {
      skipSpace();
      if (src.startsWith('/>', pos)) {
        pos += 2;
        return el;
      }
      if (src.charAt(pos) === '>') {
        pos++;
        break;
      }
      const name = readName();
      skipSpace();
      expect('=');
      skipSpace();
      const q = src.charAt(pos);
      if (q !== '"' && q !== "'") fail('expected a quoted attribute value');
      const end = src.indexOf(q, pos + 1);
      if (end < 0) fail('unterminated attribute value');
      const raw = src.slice(pos + 1, end);
      if (raw.includes('<')) fail('< in attribute value');
      if (el.getAttribute(name) !== null) fail(`duplicate attribute ${name}`);
      // attribute-value normalization: literal whitespace becomes a space
      el.attributes.push([name, decodeEntities(raw.replace(/[\t\n\r]/g, ' '), pos)]);
      pos = end + 1;
    }
    // content
    for (;;) {
      if (pos >= len) fail(`unclosed <${el.name}>`);
      if (src.startsWith('</', pos)) {
        pos += 2;
        if (readName() !== el.name) fail(`mismatched </...> for <${el.name}>`);
        skipSpace();
        expect('>');
        return el;
      }
      if (src.startsWith('<![CDATA[', pos)) {
        const end = src.indexOf(']]>', pos);
        if (end < 0) fail('unterminated CDATA');
        el.appendChild({ text: src.slice(pos + 9, end) });
        pos = end + 3;
        continue;
      }
      if (skipMisc()) continue;
      if (src.charAt(pos) === '<') {
        el.appendChild(parseElement());
        continue;
      }
      const next = src.indexOf('<', pos);
      const end = next < 0 ? len : next;
      el.appendChild({ text: decodeEntities(src.slice(pos, end), pos) });
      pos = end;
    }
  };

  for (;;) {
    skipSpace();
    if (!skipMisc()) break;
  }
  if (src.charAt(pos) !== '<') fail('expected the root element');
  const root = parseElement();
  for (;;) {
    skipSpace();
    if (pos >= len) break;
    if (!skipMisc()) fail('content after the root element');
  }
  return root;
}

/** Upstream `XMLSerializer.escapeXml`, applied by prettyPrint to every attribute and text. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Java's String.trim(): strips characters up to U+0020 only. */
function javaTrim(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 32) a++;
  while (b > a && s.charCodeAt(b - 1) <= 32) b--;
  return s.slice(a, b);
}

/**
 * Upstream `XMLSerializer.prettyPrint`: two-space indent, self-closing empty elements, text
 * trimmed. Every attribute value is escaped here even though `dumpAttr` already escaped it, so
 * saved files are double-escaped; `parseStringAttr` undoes the second level.
 */
export function prettyPrint(node: XmlElement, indent = 0): string {
  const indentStr = '  '.repeat(indent);
  let sb = indentStr + '<' + node.name;
  for (const [k, v] of node.attributes) sb += ' ' + k + '="' + escapeXml(v) + '"';
  if (node.children.length === 0) return sb + '/>\n';
  sb += '>';
  let hasElementChildren = false;
  for (const child of node.children) {
    if (child instanceof XmlElement) {
      if (!hasElementChildren) sb += '\n';
      hasElementChildren = true;
      sb += prettyPrint(child, indent + 1);
    } else {
      const text = javaTrim(child.text);
      if (text.length > 0) sb += escapeXml(text);
    }
  }
  if (hasElementChildren) sb += indentStr;
  return sb + '</' + node.name + '>\n';
}
