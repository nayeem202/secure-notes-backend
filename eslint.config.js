import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.vercel/**',
      '.cache/**',
      '.local/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['**/*.js'],
    ignores: ['src/interfaces/http/documentation/swagger-init.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/interfaces/http/documentation/swagger-init.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
];
