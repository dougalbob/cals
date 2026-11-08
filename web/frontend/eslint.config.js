import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    // `test-results/` and `playwright-report/` are Playwright output.
    ignores: ['dist/**', 'preview/**', 'coverage/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // The browser suite is TypeScript too, so it gets the same lint pass minus
    // the React-specific rules.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
  },
  {
    // The CI summary helper is a Node script, not a browser file.
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
)
