// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'
import importPlugin from 'eslint-plugin-import'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import snapse from '../lint/index.ts'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    semi: false,
    quoteProps: 'as-needed',
    commaDangle: 'always-multiline',
  }),
  {
    plugins: {
      '@stylistic': stylistic,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@stylistic/spaced-comment': ['error', 'always', { markers: ['#region', '#endregion', '/'] }],
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      '@stylistic/multiline-ternary': ['error', 'always-multiline'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-tabs': 'error',
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/comma-spacing': ['error', { before: false, after: true }],
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/comma-style': ['error', 'last'],
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/operator-linebreak': ['error', 'before'],
      '@stylistic/type-generic-spacing': ['error'],
      '@stylistic/max-len': ['error', { code: 110 }],
      '@stylistic/function-call-argument-newline': ['error', 'consistent'],
      '@stylistic/object-curly-newline': ['error', {
        ImportDeclaration: { multiline: true },
      }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['examples/**'],
    rules: {
      '@stylistic/max-len': ['error', { code: 90 }],
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { snapse },
    rules: {
      'snapse/no-state-truthiness': 'error',
      'snapse/no-boolean-state-argument': 'warn',
    },
  },
  globalIgnores(['dist/']),
)
