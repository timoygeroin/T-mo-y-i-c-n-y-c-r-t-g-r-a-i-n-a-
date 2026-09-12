import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1512, height: 982 } } },
    { name: "iphone", use: { ...devices["iPhone 15 Pro Max"], browserName: "chromium" } }
  ],
  webServer: { command: "npm run dev", url: "http://127.0.0.1:5173", reuseExistingServer: true }
});
