// https://docs.expo.dev/guides/using-eslint/
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Structure rules of docs/ESTANDARES.md, section 3.
const features = fs
  .readdirSync(path.join(__dirname, 'src/features'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const forbidImports = (regex, message) => ({ 'no-restricted-imports': ['error', { patterns: [{ regex, message }] }] });

const featureBoundaries = features.map((name) => ({
  files: [`src/features/${name}/**/*.{ts,tsx}`],
  rules: forbidImports(
    // Another feature, through the alias or through a relative path.
    `^(@/features/(?!${name}/)|\\.\\./(?!\\.\\./)|(\\.\\./)+features/)`,
    'A feature must not import another one: share through core/ or design/.',
  ),
}));

const RAW_COLOR = '/#([0-9a-fA-F]{3}){1,2}\\b|rgba?\\(/';
const colorMessage = 'Use the colour tokens of design/tema.ts (swatch, tint or the theme).';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  ...featureBoundaries,
  {
    files: ['src/core/**/*.{ts,tsx}', 'src/design/**/*.{ts,tsx}'],
    rules: forbidImports('(^@/|\\.\\./)features/', 'core/ and design/ are shared: they must not depend on a feature.'),
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design/tema.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${RAW_COLOR}]`, message: colorMessage },
        { selector: `TemplateElement[value.raw=${RAW_COLOR}]`, message: colorMessage },
      ],
    },
  },
]);
