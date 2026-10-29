import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Every test starts with the A/B variant pinned (flash cards with gamification) and the
    // statistics declined, so the consent window never covers what a test clicks. The analytics
    // tests clear it (test.use({ storageState: EMPTY })).
    storageState: 'e2e/storage-state.json',
    // The words the tests speak stay silent.
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    {
      name: 'mobile',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Run explicitly: pnpm e2e --project screenshots
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/uk`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_ENABLE_DEV_UI: '1',
      // The words are spoken at zero volume: the system voice ignores --mute-audio.
      NEXT_PUBLIC_SILENT_SPEECH: '1',
      // Localhost never sends analytics, except in this test build (to check the sending).
      NEXT_PUBLIC_ANALYTICS_ON_LOCALHOST: '1',
      // Tests never write to the real spreadsheets or the chat: a beacon of a closing page slips
      // past page.route, so the test server simply has no place to send anything.
      GOOGLE_SPREADSHEET_ANALYTICS_ID: '',
      GOOGLE_SPREADSHEET_POLLS_ID: '',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
    },
  },
});
