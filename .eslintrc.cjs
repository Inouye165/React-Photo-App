module.exports = {
  root: true,
  ignorePatterns: ['dist/', 'build/', 'coverage/', 'node_modules/'],
  settings: {
    react: { version: 'detect' }
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:testing-library/react',
    'plugin:jest-dom/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  overrides: [
    {
      files: ['server/**/*.js'],
      env: { node: true, es2022: true }
    },
    {
      files: ['src/**/*.{js,jsx}'],
      env: { browser: true, es2022: true }
    },
    {
      files: ['**/*.{test,spec}.{js,jsx}'],
      env: { jest: true },
      plugins: ['vitest'],
      extends: ['plugin:vitest/recommended']
    }
  ],
  rules: {
    // add project-specific rules/tweaks here if needed
  }
};