import { expect, test, type Page } from "@playwright/test";

async function stubRuntime(page: Page) {
  await page.route("**/api/organism/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, kernel: "mondayid-organism-kernel", model: "gpt-5.6-sol", api_key_configured: true })
    });
  });
  await page.route("**/api/organism/respond", async route => {
    const body = route.request().postDataJSON() as { message?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        answer: `Runtime answer: ${body.message || ""}`,
        model: "gpt-5.6-sol",
        response_id: "resp_browser_test",
        move: {
          classification: { primary: "ACTION" },
          route: { mode: "EXECUTE", blocker: null, proof_requirement: "provider_or_artifact_readback" },
          gates: { human: "NOT_REQUIRED_BY_EFFECT", architecture_visible: false }
        },
        receipt: {
          type: "openai_response", provider: "OpenAI", response_id: "resp_browser_test",
          model: "gpt-5.6-sol", external_effect_verified: false
        }
      })
    });
  });
}

test("model response persists without pretending external execution", async ({ page }) => {
  await stubRuntime(page);
  await page.goto("/");
  const composer = page.getByPlaceholder("Скажи, что должно стать реальностью…");
  await composer.fill("Закончи хост для MondayID");
  await composer.press("Enter");
  await expect(page.locator(".message.user").getByText("Закончи хост для MondayID", { exact: true })).toBeVisible();
  await expect(page.getByText("Runtime answer: Закончи хост для MondayID", { exact: true })).toBeVisible();
  await expect(page.getByText("gpt-5.6-sol · готов", { exact: true })).toBeVisible();
  await expect(page.getByText("Выполнено", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ответ модели не считается доказательством внешнего действия.", { exact: false })).toBeVisible();
  await page.getByLabel("Фактический внешний результат").fill("Сборка проверена, результат записан пользователем.");
  await page.getByRole("button", { name: "Записать результат" }).click();
  await page.getByRole("button", { name: "Подтвердить результат" }).click();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
});

test("intent edit clears stale confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone", "Inspector is desktop-only in existing layout");
  await stubRuntime(page);
  await page.goto("/");
  await page.getByPlaceholder("Скажи, что должно стать реальностью…").fill("Первая задача");
  await page.getByRole("button", { name: "Отправить Monday" }).click();
  await expect(page.getByText("Runtime answer: Первая задача", { exact: true })).toBeVisible();
  await page.getByLabel("Фактический внешний результат").fill("Есть результат");
  await page.getByRole("button", { name: "Записать результат" }).click();
  await page.getByRole("button", { name: "Подтвердить результат" }).click();
  await page.getByLabel("Намерение", { exact: true }).fill("Другая задача");
  await expect(page.getByText("Проверено тобой")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Записать результат" })).toBeDisabled();
});

test("invalid import leaves existing history intact", async ({ page }) => {
  await stubRuntime(page);
  await page.goto("/");
  await page.getByPlaceholder("Скажи, что должно стать реальностью…").fill("Сохранить меня");
  await page.getByRole("button", { name: "Отправить Monday" }).click();
  await expect(page.getByText("Runtime answer: Сохранить меня", { exact: true })).toBeVisible();
  await page.getByLabel("Файл продолжения").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{broken') });
  await expect(page.getByRole("alert")).toContainText("корректным JSON");
  await expect(page.locator(".message.user").getByText("Сохранить меня", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Восстановить историю" })).toHaveCount(0);
});
