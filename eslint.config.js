const js = require('@eslint/js');
const ts = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');

module.exports = [
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test/fixtures/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs['eslint-recommended'].overrides[0].rules,
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
