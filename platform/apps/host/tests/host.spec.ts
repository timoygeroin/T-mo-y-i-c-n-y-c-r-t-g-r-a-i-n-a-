import { expect, test } from "@playwright/test";

test("user-recorded result persists without pretending execution", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByPlaceholder("Скажи, что должно стать реальностью…");
  await composer.fill("Закончи хост для MondayID");
  await composer.press("Enter");
  await expect(page.locator(".message.user").getByText("Закончи хост для MondayID", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Записать результат" })).toBeDisabled();
  await expect(page.getByText("Не загружен", { exact: true })).toBeVisible();
  await expect(page.getByText("Выполнено", { exact: true })).toHaveCount(0);
  await page.getByLabel("Фактический результат").fill("Сборка проверена, результат записан пользователем.");
  await page.getByRole("button", { name: "Записать результат" }).click();
  await page.getByRole("button", { name: "Подтвердить результат" }).click();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
});

test("intent edit clears stale confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone", "Inspector is desktop-only in existing layout");
  await page.goto("/");
  await page.getByPlaceholder("Скажи, что должно стать реальностью…").fill("Первая задача");
  await page.getByRole("button", { name: "Записать намерение" }).click();
  await page.getByLabel("Фактический результат").fill("Есть результат");
  await page.getByRole("button", { name: "Записать результат" }).click();
  await page.getByRole("button", { name: "Подтвердить результат" }).click();
  await page.getByLabel("Намерение", { exact: true }).fill("Другая задача");
  await expect(page.getByText("Проверено тобой")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Записать результат" })).toBeDisabled();
});

test("invalid import leaves existing history intact", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Скажи, что должно стать реальностью…").fill("Сохранить меня");
  await page.getByRole("button", { name: "Записать намерение" }).click();
  await page.getByLabel("Файл продолжения").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{broken') });
  await expect(page.getByRole("alert")).toContainText("корректным JSON");
  await expect(page.locator(".message.user").getByText("Сохранить меня", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Восстановить историю" })).toHaveCount(0);
});
