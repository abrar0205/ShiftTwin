import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173/ShiftTwin/',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  reporter: process.env.CI ? [['html',{open:'never'}],['list']] : 'list',
})
