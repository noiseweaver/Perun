// SPDX-License-Identifier: GPL-2.0-or-later
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import noColorLiterals from './tools/eslint-rules/no-color-literals.js';

/**
 * Allowed workspace dependencies per package (PLAN.md section 5, dependency direction).
 * Each package may import only the packages listed here, and never another package's files
 * by relative path.
 */
/** @type {Record<string, string[]>} */
const ALLOWED_DEPS = {
  engine: [],
  elements: ['engine'],
  format: ['elements'],
  theme: [],
  render: ['elements', 'theme'],
  app: ['engine', 'elements', 'format', 'theme', 'render'],
  // the Obsidian plugin runs the app in a frame; it imports only the app's message types
  obsidian: ['elements', 'format', 'theme', 'render', 'app'],
};
const ALL = Object.keys(ALLOWED_DEPS);

const PLATFORM_MESSAGE =
  'Go through `platform` (packages/app/src/platform) so this also works in the Obsidian plugin.';

/** @returns {import('eslint').Linter.Config[]} */
function boundaries() {
  return Object.entries(ALLOWED_DEPS).map(([pkg, allowed]) => {
    const forbidden = ALL.filter((p) => p !== pkg && !allowed.includes(p));
    return {
      files: [`packages/${pkg}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              ...(forbidden.length
                ? [
                    {
                      group: forbidden.map((p) => `@perun/${p}`),
                      message: `@perun/${pkg} may only depend on: ${allowed.join(', ') || 'nothing'}.`,
                    },
                  ]
                : []),
              {
                group: ['../../*', '**/packages/*'],
                message: 'Import other packages by name (@perun/...), not by path.',
              },
              {
                group: ['**/reference/**'],
                message: 'Never import from the upstream reference clone.',
              },
            ],
          },
        ],
      },
    };
  });
}

export default tseslint.config(
  {
    ignores: [
      'reference/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-embed/**',
      'packages/obsidian/generated/**',
      '.reference-site/**',
      'fixtures/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    plugins: { local: { rules: { 'no-color-literals': noColorLiterals } } },
    rules: {
      'local/no-color-literals': 'error',
      // Ported upstream methods keep their parameters; a leading underscore marks unused ones.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/{render,app,obsidian}/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['packages/app/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Code passed to page.evaluate() runs in the browser.
    files: ['tools/reference-build/**/*.mjs', 'tools/golden/**/*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  ...boundaries(),
  {
    // The app runs as a web page and inside the Obsidian plugin's frame, which keeps files, data
    // and keys differently. Everything the app needs from the page goes through its platform
    // module, so a new feature works in Obsidian too (CLAUDE.md, "Works in Obsidian").
    files: ['packages/{app,render,elements}/src/**/*.{ts,tsx}'],
    ignores: ['packages/app/src/platform/**', '**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: PLATFORM_MESSAGE,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
          object: 'window',
          property,
          message: PLATFORM_MESSAGE,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          // `a.download = name`, not a `download` hook being set to a function
          selector:
            "AssignmentExpression[right.type!='ArrowFunctionExpression'][right.type!='FunctionExpression'] > MemberExpression.left[property.name='download']",
          message: `A download link: use platform.saveFile. ${PLATFORM_MESSAGE}`,
        },
        {
          selector:
            "CallExpression[callee.property.name='addEventListener'][arguments.0.value='beforeunload']",
          message: `Use platform.askBeforeLeaving. ${PLATFORM_MESSAGE}`,
        },
      ],
    },
  },
  {
    // The only place color literals may live, plus the theme package's own tests (they exercise
    // the color parser and theme validation) and the theme e2e tests (they author themes as data).
    // The translations name colors as words (a box's Red or Orange), never as styling.
    files: [
      'packages/app/src/i18nExtra.ts',
      'packages/theme/src/builtins/**',
      'packages/theme/src/**/*.test.ts',
      'packages/app/e2e/themes.spec.ts',
      'tools/eslint-rules/**',
    ],
    rules: { 'local/no-color-literals': 'off' },
  },
  prettier,
);
