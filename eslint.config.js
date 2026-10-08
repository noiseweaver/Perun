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
    // The only place color literals may live, plus the theme package's own tests (they exercise
    // the color parser and theme validation) and the theme e2e tests (they author themes as data).
    files: [
      'packages/theme/src/builtins/**',
      'packages/theme/src/**/*.test.ts',
      'packages/app/e2e/themes.spec.ts',
      'tools/eslint-rules/**',
    ],
    rules: { 'local/no-color-literals': 'off' },
  },
  prettier,
);
