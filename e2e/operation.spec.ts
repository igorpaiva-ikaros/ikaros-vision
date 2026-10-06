import { test, expect } from "@playwright/test";
test("desktop drag and cached tab navigation use real UI and router", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/operacao?tab=demands");
  const card = page.locator('[data-card-id="00000000-0000-4000-8000-000000000021"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("draggable", "true");
  await card.dragTo(page.locator('[data-stage="Em triagem"]'));
  await expect(page.locator('[data-stage="Em triagem"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await expect.poll(() => page.evaluate(() => (window as any).qaMetrics.moves)).toBe(1);
  await expect(page.getByLabel("Mover DEM-00001")).toBeEnabled();
  const token = await page.evaluate(() => {
    (window as any).qaToken = "retained-document";
    return (window as any).qaToken;
  });
  const reads = await page.evaluate(() => (window as any).qaMetrics.reads);
  await page
    .getByRole("navigation", { name: "Áreas da operação" })
    .getByRole("link", { name: "Onboarding", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Onboarding", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).qaToken)).toBe(token);
  expect(await page.evaluate(() => (window as any).qaMetrics.reads)).toBe(reads);
  await expect(page.locator('[data-stage="2. Cadastro"]')).toContainText(
    "Implantar carteira de seguros",
  );
  await page
    .getByRole("navigation", { name: "Áreas da operação" })
    .getByRole("link", { name: "Upgrades", exact: true })
    .click();
  await expect(page.locator('[data-stage="Oportunidade identificada"]')).toContainText(
    "Ampliar equipe comercial",
  );
  await page.screenshot({
    path: "/workspace/scratch/b964e3016bde/vision-qa/operation-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("schedule from card preserves client and appears in agenda", async ({ page }) => {
  await page.goto("/operacao?tab=demands");
  await page.getByRole("button", { name: "Agendar tarefa", exact: true }).click();
  await expect(page.getByLabel("Cliente *")).toBeDisabled();
  await page.getByLabel("Tarefa *").fill("Retornar com correção");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Áreas da operação" })
    .getByRole("link", { name: "Agenda", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Retornar com correção/ })).toBeVisible();
});
test("mobile has accessible movement and scheduling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operacao?tab=demands");
  await page.getByLabel("Mover DEM-00001").selectOption("Em execução");
  await expect(page.locator('[data-stage="Em execução"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await page
    .locator('[data-card-id="00000000-0000-4000-8000-000000000021"]')
    .getByRole("button", { name: "Agendar tarefa" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Data e horário *")).toBeVisible();
  await page.screenshot({
    path: "/workspace/scratch/b964e3016bde/vision-qa/operation-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("administrator can create accounts with profile photo", async ({ page }) => {
  await page.goto("/administracao");
  await expect(page.getByRole("heading", { name: "Novo colaborador" })).toBeVisible();
  await expect(page.getByLabel("E-mail (login)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha inicial")).toBeVisible();
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Novo colaborador", exact: true }) });
  await form.getByRole("button", { name: "Escolher foto" }).click();
  await form.getByLabel("Arquivo da foto de perfil").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ff763c";
        ctx.fillRect(0, 0, 32, 32);
        return c.toDataURL("image/png").split(",")[1]!;
      }),
      "base64",
    ),
  });
  await expect(form.getByAltText("Foto de ")).toBeVisible();
  await form.getByLabel("Nome", { exact: true }).fill("Novo CS");
  await form.getByLabel("E-mail (login)").fill("new@example.test");
  await form.getByLabel("Senha inicial").fill("fixture-pass-123");
  await form.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText(/Conta criada/)).toBeVisible();
});
