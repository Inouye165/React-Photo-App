import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    // Ignores for the entire project
    ignores: ['dist', 'node_modules', 'server_head_backup.js', 'server/server_head_backup.js'],
  },
  {
    // Configuration for frontend files
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // Use 'latest' for a modern syntax across the board
      ecmaVersion: 'latest',
      // Assume files are ES modules for frontend
      sourceType: 'module', 
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Ignore variables starting with an underscore
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Configuration for backend files
    files: ['server/**/*.js', 'scripts/**/*.js'],
    ignores: ['server/server_head_backup.js', 'server/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      // Assume files are scripts (CommonJS) for Node.js backend
      sourceType: 'script',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': 'off',
      'no-useless-catch': 'off',
    },
  },
  {
    // Configuration for test files
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      // Use both node and jest globals
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-redeclare': 'off',
    },
  },
])