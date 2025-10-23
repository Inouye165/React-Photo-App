import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
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
      react.configs.flat.recommended,
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
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Ignore variables starting with an underscore
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Turn off React in JSX scope rule for modern React
      'react/react-in-jsx-scope': 'off',
      // Turn off prop-types validation for faster development
      'react/prop-types': 'off',
      // Allow unescaped entities in JSX
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Configuration for backend files
    files: ['server/**/*.js', 'scripts/**/*.js'],
    ignores: ['server/server_head_backup.js'],
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
    // Configuration for frontend test files
    files: ['src/**/*.test.js', 'src/**/*.test.jsx', 'src/**/*.spec.js', 'src/**/*.spec.jsx', 'src/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jest,
        global: 'readonly',
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Configuration for backend test files
    files: ['server/**/*.test.js', 'server/**/*.spec.js', 'server/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-redeclare': 'off',
      'no-empty': 'off',
    },
  },
])