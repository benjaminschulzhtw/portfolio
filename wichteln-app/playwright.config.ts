import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;

const phones = [
  'iPhone SE',
  'iPhone SE landscape',
  'iPhone 15',
  'iPhone 15 landscape',
  'Pixel 7',
  'Pixel 7 landscape',
] as const;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  updateSnapshots: 'missing',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: phones.map((name) => ({ name, use: { ...devices[name] } })),
  // getestet wird die fertige Website: Platzhalterseite + /wichteln/, so wie sie ausgeliefert wird
  webServer: {
    command: `node scripts/build-site.mjs && node scripts/serve-site.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
