import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Regra de dependência da Clean Architecture, aplicada pelo lint.
 * Cada camada só pode importar das camadas "para dentro" (mais estáveis).
 * Dependências externas (react, pixi.js, zustand, ...) são sempre permitidas.
 */
const layerRules = [
  { from: 'assets', allow: [] },
  { from: 'core', allow: [] },
  { from: 'engine', allow: ['core'] },
  { from: 'world', allow: ['core', 'engine'] },
  { from: 'creatures', allow: ['core', 'engine'] },
  { from: 'genetics', allow: ['core'] },
  { from: 'ai', allow: ['core', 'engine', 'creatures'] },
  { from: 'simulation', allow: ['core', 'engine', 'world', 'creatures', 'genetics', 'ai'] },
  { from: 'rendering', allow: ['core', 'engine'] },
  { from: 'save', allow: ['core', 'engine', 'world'] },
  { from: 'ui', allow: ['core', 'engine', 'simulation'] },
  {
    from: 'app',
    allow: [
      'core',
      'engine',
      'world',
      'creatures',
      'genetics',
      'ai',
      'simulation',
      'rendering',
      'ui',
      'save',
    ],
  },
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      boundaries,
    },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core/**' },
        { type: 'engine', pattern: 'src/engine/**' },
        { type: 'world', pattern: 'src/world/**' },
        { type: 'creatures', pattern: 'src/creatures/**' },
        { type: 'genetics', pattern: 'src/genetics/**' },
        { type: 'ai', pattern: 'src/ai/**' },
        { type: 'simulation', pattern: 'src/simulation/**' },
        { type: 'rendering', pattern: 'src/rendering/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'save', pattern: 'src/save/**' },
        { type: 'app', pattern: 'src/app/**' },
        { type: 'assets', pattern: 'src/assets/**' },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: layerRules,
        },
      ],
    },
  },
);
