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
  await expect(page.getByLabel("Mover DEM-00001", { exact: true })).toBeEnabled();
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
    path: "vision-qa/operation-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("schedule from card preserves client and appears in agenda", async ({ page }) => {
  await page.goto("/operacao?tab=demands");
  await page.getByRole("button", { name: "Agendar tarefa", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Cliente ou demanda geral *", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Tarefa *", { exact: true }).fill("Retornar com correção");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(page.getByRole("button", { name: /Retornar com correção/ })).toBeVisible();
});
test("mobile has accessible movement and scheduling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operacao?tab=demands");
  await page.getByLabel("Mover DEM-00001", { exact: true }).selectOption("Em execução");
  await expect(page.locator('[data-stage="Em execução"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await page
    .locator('[data-card-id="00000000-0000-4000-8000-000000000021"]')
    .getByRole("button", { name: "Agendar tarefa" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Data e horário *", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "vision-qa/operation-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("administrator can create accounts with profile photo", async ({ page }) => {
  await page.goto("/administracao");
  await expect(page.getByRole("heading", { name: "Novo colaborador" })).toBeVisible();
  await expect(page.getByLabel("E-mail (login)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha inicial", { exact: true })).toBeVisible();
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Novo colaborador", exact: true }) });
  await form.getByRole("button", { name: "Escolher foto" }).click();
  await form.getByLabel("Arquivo da foto de perfil", { exact: true }).setInputFiles({
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
  await form.getByLabel("E-mail (login)", { exact: true }).fill("new@example.test");
  await form.getByLabel("Senha inicial", { exact: true }).fill("fixture-pass-123");
  await form.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText(/Conta criada/)).toBeVisible();
});

test("CS menu includes Concierge and calendar slots create and complete tasks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/operacao?tab=tasks");
  const menu = page.locator("aside").first().getByRole("navigation");
  await expect(menu.getByRole("link")).toHaveCount(6);
  await expect(menu.getByRole("link").last()).toHaveText("Concierge");
  await expect(page.getByLabel("Mostrar testes")).toHaveCount(0);
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
  await expect(page.getByLabel("Data e horário *", { exact: true })).toHaveValue(
    `${label!.split(" ")[1]}T10:00`,
  );
  await page
    .getByRole("combobox", { name: "Cliente ou demanda geral *", exact: true })
    .selectOption("00000000-0000-4000-8000-000000000011");
  await page.getByLabel("Tarefa *", { exact: true }).fill("Revisar implantação no calendário");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  const task = page.getByRole("button", { name: /Revisar implantação no calendário/ });
  await expect(task).toBeVisible();
  await task.click();
  await page.getByRole("button", { name: "Concluir tarefa" }).click();
  await expect(task).toContainText("Concluída");
  await page.screenshot({
    path: "vision-qa/calendar-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("administrator configures catalogue and rules only on explicit save", async ({ page }) => {
  await page.goto("/administracao");
  await page.getByRole("tab", { name: "Produtos e planos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Produtos e planos" })).toBeVisible();
  await page
    .getByText("Wing", { exact: false })
    .filter({ has: page.locator("span") })
    .first()
    .click();
  const plan = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Wing" }) });
  await plan.getByLabel("Mensalidade · contrato mensal (R$)", { exact: true }).fill("1250");
  await plan.getByRole("button", { name: "Salvar plano" }).click();
  await expect(plan.locator("summary")).toContainText("1.250");
  await page.getByRole("tab", { name: "Prazos e SLA", exact: true }).click();
  const policy = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Bug" }) });
  await policy.locator("summary").click();
  await page.getByLabel("Bug Primeira resposta quantidade", { exact: true }).fill("30");
  await page.getByLabel("Bug Primeira resposta unidade", { exact: true }).selectOption("minutes");
  await page.getByLabel("Bug Primeira resposta contagem", { exact: true }).selectOption("calendar");
  expect(await page.evaluate(() => (window as any).qaPolicySaves ?? 0)).toBe(0);
  await policy.getByRole("button", { name: "Salvar regras e recalcular abertas" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).qaPolicySaves)).toBe(1);
});

test("perfil salva grupo e oferece atalho na carteira e na demanda", async ({ page }) => {
  await page.goto("/operacao?tab=clients");
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page
    .getByLabel("Link do grupo (WhatsApp)", { exact: true })
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
  await page.getByLabel("Pesquisar cliente para nova demanda", { exact: true }).fill("não existe");
  await expect(page.getByText("Nenhum cliente encontrado na sua carteira.")).toBeVisible();
  await page.getByLabel("Pesquisar cliente para nova demanda", { exact: true }).fill("CLI-00001");
  await page.getByRole("button", { name: /Corretora Exemplo CLI-00001/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Corretora Exemplo");
  await dialog.getByLabel("Nome *", { exact: true }).fill("Validar proposta do cliente");
  await dialog.getByLabel("Demanda *", { exact: true }).fill("Revisar dados da proposta enviada");
  await dialog.getByLabel("Classificação *", { exact: true }).selectOption("Dúvida");
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
  const task = page
    .getByRole("dialog")
    .filter({ has: page.getByLabel("Tarefa *", { exact: true }) });
  await expect(
    task.getByRole("combobox", { name: "Cliente ou demanda geral *", exact: true }),
  ).toBeDisabled();
  await task.getByLabel("Tarefa *", { exact: true }).fill("Retorno vinculado à demanda");
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
    .getByLabel("Contexto e impacto para a equipe técnica", { exact: true })
    .fill("Erro reproduzido com impacto na proposta.");
  await dialog
    .getByLabel("Retorno para confirmar a previsão (São Paulo)", { exact: true })
    .fill("2099-01-01T12:00");
  await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(dialog).toContainText("Recebida");
  await dialog
    .getByLabel("Nova observação", { exact: true })
    .fill("Cliente aguarda retorno no horário combinado.");
  await dialog.getByRole("button", { name: "Enviar observação", exact: true }).click();
  await expect(dialog).toContainText("Cliente aguarda retorno no horário combinado.");
  await dialog
    .getByLabel("Anexar documento, imagem, vídeo ou áudio", { exact: true })
    .setInputFiles({
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
  await expect(page.getByLabel("Mover DEM-00001", { exact: true })).toBeDisabled();
  await page.goto("/aprovacoes");
  await page.getByRole("button").filter({ hasText: "Proposta de consórcio não carrega" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Validar e confirmar publicação", exact: true }).click();
  await dialog
    .getByLabel("Referência do deploy realizado", { exact: true })
    .fill("deploy-confirmado-42");
  await dialog
    .getByRole("button", { name: "Confirmar publicação e liberar para o CS", exact: true })
    .click();
  await expect(dialog).toContainText("Publicação registrada");
  await page.goto("/operacao?tab=demands");
  await expect(page.locator('[data-stage="Publicada"]')).toContainText(
    "Proposta de consórcio não carrega",
  );
  await expect(page.getByLabel("Mover DEM-00001", { exact: true })).toBeEnabled();
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

test("categoria filtra sem mover cards e Concierge explica por toque", async ({ page }) => {
  await page.goto("/operacao?tab=demands");
  const filters = page.getByRole("group", { name: "Filtrar demandas por categoria" });
  await filters.getByRole("button", { name: /^Upgrade/ }).click();
  await expect(page.locator('[data-card-id="00000000-0000-4000-8000-000000000021"]')).toHaveCount(
    0,
  );
  await filters.getByRole("button", { name: /^Todas/ }).click();
  await expect(page.locator('[data-card-id="00000000-0000-4000-8000-000000000021"]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).qaMetrics.moves)).toBe(0);
  await page.getByRole("link", { name: "Concierge", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Concierge", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Implantação / configuração", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Áreas do CRM" })
    .getByRole("button", { name: "Onboarding", exact: true })
    .click();
  await page.getByText("5. Migração", { exact: true }).click();
  await expect(page.getByText("Importe e confira os dados de clientes e vendas.")).toBeVisible();
  await page.getByLabel("Buscar no Concierge", { exact: true }).fill("permissões");
  await expect(page.getByRole("heading", { name: "Resultados da busca" })).toBeVisible();
  await page.screenshot({
    path: "vision-qa/concierge.png",
    fullPage: true,
  });
});

test("administrador salva rascunho, publica linguagem e separa configuração", async ({ page }) => {
  await page.goto("/administracao");
  await expect(page.getByLabel("Mostrar testes")).toBeVisible();
  await page.getByRole("tab", { name: "CRM e linguagem", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Categorias$/ })
    .click();
  await page.getByLabel("Nome de category Bug", { exact: true }).fill("Falha do sistema");
  await page.getByRole("button", { name: "Salvar rascunho e testar", exact: true }).click();
  await expect(page.getByText(/Prévia das configurações/)).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).qaPresentation.published.labels["category:Bug"]),
  ).toBeUndefined();
  await page.screenshot({ path: "vision-qa/admin-draft-settings.png", fullPage: true });
  await page
    .getByLabel("Revisei os nomes e entendo que as regras e funções originais permanecem.")
    .check();
  await page.getByRole("button", { name: "Publicar para a equipe", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).qaPresentation.published.labels["category:Bug"]),
    )
    .toBe("Falha do sistema");
  await page.locator("aside").getByRole("link", { name: "CRM", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Filtrar demandas por categoria" })
      .getByRole("button", { name: /Falha do sistema/ }),
  ).toBeVisible();
  await page.getByText("Proposta de consórcio não carrega", { exact: true }).click();
  await expect(page.getByLabel("Classificação *", { exact: true })).toHaveValue("Bug");
  await page.screenshot({ path: "vision-qa/admin-customization.png", fullPage: true });
});

test("líder acessa resultados e cadastro CS sem configuração administrativa", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("qa-leader", "true"));
  await page.goto("/administracao");
  await expect(page.getByRole("heading", { name: "Liderança CS", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resultados do time", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta CS", exact: true })).toBeVisible();
  await expect(page.getByLabel("Mostrar testes")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Prazos e SLA" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Administrador/ })).toHaveCount(0);
  await page.screenshot({ path: "vision-qa/leadership.png", fullPage: true });
});

test("CS cria demanda geral, encontra em Minhas demandas e agenda tarefa sem cliente", async ({
  page,
}) => {
  await page.goto("/operacao?tab=crm&pipeline=demands");
  await page.getByRole("button", { name: "Nova demanda", exact: true }).click();
  await page.getByRole("button", { name: /Sistema geral · Ikaros/ }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Demanda interna, sem cliente específico/)).toBeVisible();
  await dialog.getByLabel("Nome *", { exact: true }).fill("Otimizar consulta geral do ERP");
  await dialog
    .getByLabel("Demanda *", { exact: true })
    .fill("Investigar consulta de relatórios para todas as empresas.");
  await dialog.getByLabel("Classificação *", { exact: true }).selectOption("Pequena melhoria");
  await dialog
    .getByLabel("Prazo planejado de entrega (São Paulo)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await expect(dialog.getByText("Já alinhei este prazo com o cliente")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Criar registro", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(() => (window as any).qaSavedRecord);
  expect(saved.scope).toBe("system");
  expect(saved.client_id).toBeNull();
  expect(saved.owner_id).toBe("00000000-0000-4000-8000-000000000001");
  await page.getByLabel("Filtrar origem da demanda", { exact: true }).selectOption("system");
  await expect(page.getByText("Proposta de consórcio não carrega", { exact: true })).toHaveCount(0);
  await page.getByText("Otimizar consulta geral do ERP", { exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Ver cliente", exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Registrar 1ª resposta", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Cliente informado", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "vision-qa/general-demand.png", fullPage: true });
  await dialog.getByRole("button", { name: "Agendar tarefa", exact: true }).click();
  const task = page
    .getByRole("dialog")
    .filter({ has: page.getByLabel("Tarefa *", { exact: true }) });
  await expect(
    task.getByRole("combobox", { name: "Cliente ou demanda geral *", exact: true }),
  ).toBeDisabled();
  await expect(
    task.getByRole("combobox", { name: "Cliente ou demanda geral *", exact: true }),
  ).toHaveValue(`system:${saved.id}`);
  await task.getByLabel("Tarefa *", { exact: true }).fill("Investigar índices do ERP");
  await task.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Tarefas desta demanda" })
      .getByText("Investigar índices do ERP", { exact: false }),
  ).toBeVisible();
  const scheduled = await page.evaluate(() => (window as any).qaSavedTask);
  expect(scheduled.client_id).toBeNull();
  expect(scheduled.record_id).toBe(saved.id);
  expect(scheduled.record_kind).toBe("demands");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(page.getByRole("button", { name: /Investigar índices do ERP/ })).toBeVisible();
});
