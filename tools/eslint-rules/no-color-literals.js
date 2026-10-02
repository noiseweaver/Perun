// SPDX-License-Identifier: GPL-2.0-or-later
// Flags color literals in strings so every color flows from the active theme (PLAN.md section 5).
// Allowed only under packages/theme/src/builtins/ (configured in eslint.config.js).

const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

// #rgb, #rgba, #rrggbb, #rrggbbaa not followed by another word character.
const HEX = /(^|[^\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])/i;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
// A named color used as a CSS value, e.g. "color: red" or "1px solid black".
const CSS_VALUE = /(?:[:\s]|^)([a-z]+)\s*(?:;|!important|$)/gi;

/** @param {string} text */
export function findColorLiteral(text) {
  const hex = HEX.exec(text);
  if (hex) return hex[0].replace(/^[^#]/, '');
  const fn = FUNC.exec(text);
  if (fn) return fn[0];
  const trimmed = text.trim().toLowerCase();
  if (NAMED_COLORS.has(trimmed)) return trimmed;
  if (/[:;]/.test(text) || /\b(?:solid|dashed|dotted)\b/i.test(text)) {
    for (const m of text.matchAll(CSS_VALUE)) {
      const word = (m[1] ?? '').toLowerCase();
      if (NAMED_COLORS.has(word)) return word;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow color literals outside theme built-ins' },
    schema: [],
    messages: {
      color: 'Color literal "{{color}}" found. Use a theme role instead (see PLAN.md section 5).',
    },
  },
  create(context) {
    /** @param {import('eslint').Rule.Node} node @param {string} text */
    function check(node, text) {
      const color = findColorLiteral(text);
      if (color) context.report({ node, messageId: 'color', data: { color } });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default rule;
