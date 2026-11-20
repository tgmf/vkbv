// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solidV2 from 'eslint-plugin-solid/configs/v2';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Sources of non-determinism that must never appear in the simulation. */
const simRestrictedProperties = [
  { object: 'Math', property: 'random', message: 'Use the seeded PRNG in src/sim/prng.ts.' },
  { object: 'Date', property: 'now', message: 'The sim must not read wall-clock time.' },
  { object: 'performance', property: 'now', message: 'The sim must not read wall-clock time.' },
  {
    object: 'crypto',
    property: 'getRandomValues',
    message: 'Use the seeded PRNG in src/sim/prng.ts.',
  },
  { property: 'postMessage', message: 'Only src/bridge may post messages.' },
];

const simRestrictedGlobals = [
  'Date',
  'performance',
  'crypto',
  'window',
  'document',
  'navigator',
  'self',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'fetch',
].map((name) => ({
  name,
  message: `src/sim must stay pure and deterministic: '${name}' is not allowed.`,
}));

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
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
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  { files: ['src/**/*.tsx'], ...solidV2 },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...simRestrictedProperties],
      'no-restricted-globals': ['error', ...simRestrictedGlobals],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/ui/**', '**/bridge/**'],
              message: 'src/sim must not import render/ui/bridge.',
            },
            {
              group: ['solid-js', 'solid-js/*', '@solidjs/*'],
              message: 'src/sim must not import UI libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/render/**/*.ts', 'src/main.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'postMessage', message: 'Use the typed client in src/bridge.' },
      ],
    },
  },
  prettier,
);
