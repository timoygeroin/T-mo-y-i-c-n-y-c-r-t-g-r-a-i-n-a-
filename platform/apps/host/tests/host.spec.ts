import { expect, test } from "@playwright/test";

test("intent becomes a verified persistent turn", async ({ page }, testInfo) => {
  await page.goto("/");
  const composer = page.getByPlaceholder("Скажи, что должно стать реальностью…");
  await composer.fill("Закончи хост для MondayID");
  await composer.press("Enter");
  await expect(page.getByText("Закончи хост для MondayID").first()).toBeVisible();
  await page.getByRole("button", { name: "Выполнить локальный ход" }).click();
  await expect(page.getByText("Ход выполнен и ожидает подтверждения результата.")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить результат" }).click();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Проверено тобой")).toBeVisible();
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-verified.png`, fullPage: true });
});
