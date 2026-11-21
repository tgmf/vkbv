// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solidV2 from 'eslint-plugin-solid/configs/v2';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// ---------------------------------------------------------------------------------------------
// Import rules (spec 02 §2). For each src/ folder: the folders and packages it must NOT import.
// `typeOnly` folders may be imported with `import type` only. src/main.tsx is the composition
// root and is not restricted.
// ---------------------------------------------------------------------------------------------
const FOLDERS = ['sim', 'player', 'bridge', 'render', 'ui', 'content', 'i18n', 'telemetry', 'cli'];
const UI_PACKAGES = ['solid-js', 'solid-js/*', '@solidjs/*'];
const THREE = ['three', 'three/*'];

/** @type {Record<string, { allow: string[]; typeOnly?: string[]; packages: string[] }>} */
const IMPORT_TABLE = {
  sim: { allow: [], typeOnly: ['content'], packages: [...UI_PACKAGES, ...THREE, 'zod'] },
  player: { allow: ['sim', 'content'], packages: [...UI_PACKAGES, ...THREE] },
  bridge: { allow: ['sim', 'player', 'content'], packages: [...UI_PACKAGES, ...THREE] },
  render: { allow: [], typeOnly: ['content', 'sim'], packages: UI_PACKAGES },
  ui: {
    allow: ['bridge', 'player', 'render', 'i18n', 'telemetry'],
    typeOnly: ['content'],
    packages: THREE,
  },
  i18n: { allow: [], packages: [...UI_PACKAGES, ...THREE] },
  telemetry: { allow: [], packages: [...UI_PACKAGES, ...THREE] },
  cli: { allow: ['sim', 'player', 'content'], packages: [...UI_PACKAGES, ...THREE] },
};

/** no-restricted-imports options for one folder. */
function importRule(folder) {
  const { allow, typeOnly = [], packages } = IMPORT_TABLE[folder];
  const others = FOLDERS.filter((f) => f !== folder && !allow.includes(f));
  return [
    'error',
    {
      patterns: [
        ...others.map((f) => ({
          group: [`**/${f}/**`, `**/${f}`],
          allowTypeImports: typeOnly.includes(f),
          message: `src/${folder} may not import src/${f}${typeOnly.includes(f) ? ' (types only)' : ''} (spec 02 §2).`,
        })),
        { group: packages, message: `src/${folder} may not import this package (spec 02 §2).` },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Determinism bans for src/sim and src/player (CLAUDE.md, spec 02 §2, 03 §1).
// ---------------------------------------------------------------------------------------------
const POST_MESSAGE = { property: 'postMessage', message: 'Only src/bridge may post messages.' };
const PURE_PROPERTIES = [
  { object: 'Math', property: 'random', message: 'Use rand() from src/sim/rng.ts.' },
  ...['exp', 'log', 'sqrt', 'pow'].map((property) => ({
    object: 'Math',
    property,
    message: 'Integer maths only: use the EXP table, isqrt or integer arithmetic (03 §1).',
  })),
  { object: 'Date', property: 'now', message: 'The simulation must not read wall-clock time.' },
  {
    object: 'performance',
    property: 'now',
    message: 'The simulation must not read wall-clock time.',
  },
  { object: 'crypto', property: 'getRandomValues', message: 'Use rand() from src/sim/rng.ts.' },
  POST_MESSAGE,
];
const PURE_GLOBALS = [
  'Date',
  'performance',
  'crypto',
  'window',
  'document',
  'navigator',
  'self',
  'localStorage',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'fetch',
  'postMessage',
].map((name) => ({
  name,
  message: `src/sim and src/player must stay pure and deterministic: '${name}' is not allowed.`,
}));

/** Rule blocks for a src/ folder, applied to `files` (the folder itself, and its lint fixtures). */
function folderRules(folder, files) {
  const pure = folder === 'sim' || folder === 'player';
  if (folder === 'bridge') return { files, rules: { 'no-restricted-imports': importRule(folder) } };
  return {
    files,
    rules: {
      'no-restricted-imports': importRule(folder),
      'no-restricted-properties': ['error', ...(pure ? PURE_PROPERTIES : [POST_MESSAGE])],
      'no-restricted-globals': [
        'error',
        ...(pure ? PURE_GLOBALS : [{ name: 'postMessage', message: POST_MESSAGE.message }]),
      ],
    },
  };
}

const LINTED_FOLDERS = Object.keys(IMPORT_TABLE);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'docs',
      'instructions',
      'test-results',
      'playwright-report',
      'tests/lint-fixtures',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  { files: ['**/*.js'], languageOptions: { globals: globals.node } },
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  { files: ['src/**/*.tsx'], ...solidV2 },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  ...LINTED_FOLDERS.map((f) =>
    folderRules(f, [`src/${f}/**/*.{ts,tsx}`, `tests/lint-fixtures/${f}/**/*.ts`]),
  ),
  // Every other src/ file (main.tsx, content/) may not post messages either.
  {
    files: ['src/main.tsx', 'src/content/**/*.ts'],
    rules: { 'no-restricted-properties': ['error', POST_MESSAGE] },
  },
  // Lint fixtures break the rules on purpose. `npm run lint` skips them; tests/lint.test.ts lints
  // them explicitly. They are not part of a TS project, so type-aware rules are off for them.
  { files: ['tests/lint-fixtures/**/*.ts'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['tests/lint-fixtures/**/*.ts'],
    languageOptions: { parserOptions: { project: false, projectService: false } },
  },
  prettier,
);
