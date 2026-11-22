import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        // .env.local의 실제 키 대신 가짜 키로 빌드한다(SDK 요청은 fixtures가 막거나 가짜로 바꾼다)
        env: { VITE_KAKAO_MAP_JS_KEY: 'e2e-fake-key' },
        port: 4173,
        reuseExistingServer: false,
        timeout: 180_000,
      },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true },
      grepInvert: /@desktop/,
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, grep: /@desktop/ },
  ],
});
