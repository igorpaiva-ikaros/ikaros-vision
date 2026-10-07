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
  await page.getByRole("tab", { name: "Onboarding", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CRM", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).qaToken)).toBe(token);
  expect(await page.evaluate(() => (window as any).qaMetrics.reads)).toBe(reads);
  await expect(page.locator('[data-stage="3. Cadastro"]')).toContainText(
    "Implantar carteira de seguros",
  );
  await page.getByRole("tab", { name: "Upgrades", exact: true }).click();
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
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
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

test("CS menu has five areas and calendar slots create and complete tasks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/operacao?tab=tasks");
  const menu = page.locator("aside").first().getByRole("navigation");
  await expect(menu.getByRole("link")).toHaveCount(5);
  await expect(menu.getByRole("link", { name: "CRM", exact: true })).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Histórico de entregas", exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole("link", { name: "Conversas e decisões", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Calendário semanal de tarefas" })).toBeVisible();
  await page.getByRole("button", { name: "Próxima semana" }).click();
  const slot = page.getByRole("button", { name: /Agendar .* às 10h/ }).first();
  const label = await slot.getAttribute("aria-label");
  await slot.click();
  await expect(page.getByLabel("Data e horário *")).toHaveValue(`${label!.split(" ")[1]}T10:00`);
  await page.getByLabel("Cliente *").selectOption("00000000-0000-4000-8000-000000000011");
  await page.getByLabel("Tarefa *").fill("Revisar implantação no calendário");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  const task = page.getByRole("button", { name: /Revisar implantação no calendário/ });
  await expect(task).toBeVisible();
  await task.click();
  await page.getByRole("button", { name: "Concluir tarefa" }).click();
  await expect(task).toContainText("Concluída");
  await page.screenshot({
    path: "/workspace/scratch/b964e3016bde/vision-qa/calendar-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("administrator configures catalogue and rules only on explicit save", async ({ page }) => {
  await page.goto("/administracao");
  await expect(page.getByRole("heading", { name: "Produtos e planos" })).toBeVisible();
  await page
    .getByText("Wing", { exact: false })
    .filter({ has: page.locator("span") })
    .first()
    .click();
  const plan = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Wing" }) });
  await plan.getByLabel("Mensalidade · contrato mensal (R$)").fill("1250");
  await plan.getByRole("button", { name: "Salvar plano" }).click();
  await expect(plan.locator("summary")).toContainText("1.250");
  const policy = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Bug" }) });
  await policy.locator("summary").click();
  await page.getByLabel("Bug Primeira resposta quantidade").fill("30");
  await page.getByLabel("Bug Primeira resposta unidade").selectOption("minutes");
  await page.getByLabel("Bug Primeira resposta contagem").selectOption("calendar");
  expect(await page.evaluate(() => (window as any).qaPolicySaves ?? 0)).toBe(0);
  await policy.getByRole("button", { name: "Salvar regras e recalcular abertas" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).qaPolicySaves)).toBe(1);
});

test("perfil salva grupo e oferece atalho na carteira e na demanda", async ({ page }) => {
  await page.goto("/operacao?tab=clients");
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page
    .getByLabel("Link do grupo (WhatsApp)")
    .fill("https://chat.whatsapp.com/TestGroupInvite12345");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir grupo WhatsApp" })).toHaveAttribute(
    "href",
    "https://chat.whatsapp.com/TestGroupInvite12345",
  );
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Abrir grupo WhatsApp" }),
  ).toHaveAttribute("target", "_blank");
});

test("cadastro de cliente só aparece na carteira e CRM cria demanda pela pesquisa", async ({
  page,
}) => {
  await page.goto("/operacao?tab=demands");
  await expect(page.getByRole("button", { name: "Novo cliente", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Funis CRM" }).getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: "Demandas", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Nova demanda", exact: true }).click();
  await page.getByLabel("Pesquisar cliente para nova demanda").fill("não existe");
  await expect(page.getByText("Nenhum cliente encontrado na sua carteira.")).toBeVisible();
  await page.getByLabel("Pesquisar cliente para nova demanda").fill("CLI-00001");
  await page.getByRole("button", { name: /Corretora Exemplo CLI-00001/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Corretora Exemplo");
  await dialog.getByLabel("Nome *", { exact: true }).fill("Validar proposta do cliente");
  await dialog.getByLabel("Demanda *", { exact: true }).fill("Revisar dados da proposta enviada");
  await dialog.getByRole("button", { name: "Criar registro", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).qaSavedRecord?.client_id))
    .toBe("00000000-0000-4000-8000-000000000011");
  await expect(page.getByText("Validar proposta do cliente", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Novo cliente", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Carteira", exact: true }).click();
  await expect(page.getByRole("button", { name: "Novo cliente", exact: true })).toBeVisible();
});

test("demanda abre perfil sem perder edição e agenda tarefa vinculada", async ({ page }) => {
  await page.goto("/operacao?tab=demands");
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  let demand = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: /DEM-00001/ }) });
  await demand.getByLabel("Nome *", { exact: true }).fill("Título preservado");
  await demand.getByRole("button", { name: "Ver cliente", exact: true }).click();
  const profile = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: /Perfil do cliente/ }) });
  await expect(profile.getByLabel("Nome", { exact: true })).toHaveValue("Corretora Exemplo");
  await profile.getByRole("button", { name: "Close", exact: true }).click();
  await expect(demand.getByLabel("Nome *", { exact: true })).toHaveValue("Título preservado");
  await demand.getByRole("button", { name: "Agendar tarefa", exact: true }).click();
  const task = page.getByRole("dialog").filter({ has: page.getByLabel("Tarefa *") });
  await expect(task.getByLabel("Cliente *")).toBeDisabled();
  await task.getByLabel("Tarefa *").fill("Retorno vinculado à demanda");
  await task.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(
    demand
      .getByRole("region", { name: "Tarefas desta demanda" })
      .getByRole("button", { name: /Retorno vinculado à demanda/ }),
  ).toBeVisible();
  await expect(demand.getByLabel("Nome *", { exact: true })).toHaveValue("Título preservado");
  await demand.getByRole("button", { name: /Retorno vinculado à demanda/ }).click();
  await page.getByRole("button", { name: "Concluir tarefa", exact: true }).click();
  await expect(demand.getByRole("region", { name: "Tarefas desta demanda" })).toContainText(
    "Concluída",
  );
  await demand.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(page.getByRole("button", { name: /Retorno vinculado à demanda/ })).toBeVisible();
});

test("CS encaminha a mesma demanda, anexa evidência e comunica sem concluir", async ({ page }) => {
  await page.goto("/operacao?tab=demands");
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Encaminhar à equipe técnica", exact: true }).click();
  await dialog
    .getByLabel("Contexto e impacto para a equipe técnica")
    .fill("Erro reproduzido com impacto na proposta.");
  await dialog.getByLabel("Retorno para confirmar a previsão (São Paulo)").fill("2099-01-01T12:00");
  await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(dialog).toContainText("Recebida");
  await dialog.getByLabel("Nova observação").fill("Cliente aguarda retorno no horário combinado.");
  await dialog.getByRole("button", { name: "Enviar observação", exact: true }).click();
  await expect(dialog).toContainText("Cliente aguarda retorno no horário combinado.");
  await dialog.getByLabel("Anexar documento, imagem, vídeo ou áudio").setInputFiles({
    name: "evidencia.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Evidência local de teste"),
  });
  await expect(dialog.getByRole("button", { name: /evidencia.txt/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Aprovar para publicação" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Equipe técnica", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Equipe técnica", exact: true })).toBeVisible();
  await expect(page.getByText("Proposta de consórcio não carrega", { exact: true })).toBeVisible();
});

test("interface técnica oferece apenas fila encaminhada e notificações", async ({ page }) => {
  await page.goto("/tecnico");
  await expect(page.getByRole("heading", { name: "Equipe técnica", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Carteira", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Administração", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "CRM", exact: true })).toHaveCount(0);
});

test("barra clicável envia para Pedro, trava o card e publicação confirmada libera o CS", async ({
  page,
}) => {
  await page.goto("/operacao?tab=demands");
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Ir para Em execução", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Ir para Em execução", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await dialog.getByRole("button", { name: "Ir para Aguardando validação", exact: true }).click();
  await expect(dialog).toContainText("Aguardando validação do administrador");
  await expect(dialog.getByLabel("Nome *", { exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Ir para Em execução", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).qaValidationSent)).toBe(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const card = page.locator('[data-card-id="00000000-0000-4000-8000-000000000021"]');
  await expect(card).toHaveAttribute("draggable", "false");
  await expect(page.getByLabel("Mover DEM-00001")).toBeDisabled();
  await page.goto("/aprovacoes");
  await page.getByRole("button").filter({ hasText: "Proposta de consórcio não carrega" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Validar e confirmar publicação", exact: true }).click();
  await dialog.getByLabel("Referência do deploy realizado").fill("deploy-confirmado-42");
  await dialog
    .getByRole("button", { name: "Confirmar publicação e liberar para o CS", exact: true })
    .click();
  await expect(dialog).toContainText("Publicação registrada");
  await page.goto("/operacao?tab=demands");
  await expect(page.locator('[data-stage="Publicada"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await expect(page.getByLabel("Mover DEM-00001")).toBeEnabled();
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ir para Publicada", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Nome *", { exact: true })).toBeEnabled();
});

test("arrastar para Aguardando validação faz o mesmo envio automático", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 });
  await page.goto("/operacao?tab=demands");
  const card = page.locator('[data-card-id="00000000-0000-4000-8000-000000000021"]');
  await card.dragTo(page.locator('[data-stage="Aguardando validação"]'));
  await expect(page.locator('[data-stage="Aguardando validação"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await expect.poll(() => page.evaluate(() => (window as any).qaValidationSent)).toBe(1);
  await expect(card).toHaveAttribute("draggable", "false");
});
