# Ikaros Vision

Aplicação interna de Customer Success da IKAROS. O Vision mantém a carteira, a esteira de produção e o BI no mesmo banco, separado do ERP. O Notion é o histórico e a origem de uma importação incremental. Projeto: https://lovable.dev/projects/aee205d0-22a2-4cb7-965e-0a2310bb7b8f

## Acessos

O login é obrigatório em todas as rotas. Pedro Manhães é administrador; Igor Paiva trabalha como CS. Não há cadastro público nem senha padrão no código. O administrador cria contas em Administração, escolhe o papel e atribui clientes a um CS ativo. Contas novas começam sem a regra de comissão de Igor. A desativação bloqueia a operação mesmo com uma sessão anterior ainda válida. O último administrador ativo não pode ser removido.

Administradores consultam todo o BI, equipe, carteiras, contas, migração e notificações. O CS vê apenas clientes e registros da carteira atual, nas rotas Operação, Notificações e Ajuda. RLS aplica essas regras no banco; as funções do servidor também verificam sessão e autorização. A redistribuição transfere todos os registros relacionados e preserva o beneficiário das comissões já efetivadas. Alertas antigos de uma carteira transferida deixam de ser visíveis ao antigo CS. Não há permissão de exclusão de registros na interface.

## Operação

Minha carteira → cliente → nova Demanda, Onboarding, Upgrade, Interação ou Changelog. O cliente e o responsável acompanham a criação automaticamente. O card reúne nome, código, cliente, estágio e SLA; os campos adicionais ficam no detalhe. O seletor do Kanban move etapas. Ações específicas registram primeira resposta, encaminhamento, publicação, validação, conclusão, recebimento de informações completas, aceite e efetivação. Eventos não são inferidos do status. Versões evitam sobrescrever alterações concorrentes.

Concluir demanda exige solução aplicada e confirmação de comunicação ao cliente; cancelar exige motivo. Onboarding precisa de informações completas antes da conclusão. Upgrade precisa de aceite antes da efetivação. Uma oportunidade efetivada preserva valores, plano, data e atribuição da comissão. Interações registram decisões e próximas ações; changelog documenta a entrega técnica. Ambos podem ser vinculados a uma demanda do mesmo cliente.

## SLA e calendário

O contrato determina segunda a sexta, 09h–18h, America/Sao_Paulo, excluindo feriados nacionais fixos e Sexta-feira Santa. Não se excluem pontos facultativos. Primeira resposta: 4 horas úteis. Solução ou encaminhamento: próxima data útil no mesmo horário normalizado. Registros fora da janela iniciam a contagem na próxima abertura. Onboarding: marco de 5 e limite de 15 dias úteis após informações completas, vencendo às 18h. Pequenas melhorias têm preferência de entrega no mesmo dia; desenvolvimento complexo usa prazo de entrega combinado, sem prorrogar resposta ou encaminhamento.

O SLA é uma dimensão distinta do estágio. Atraso não movimenta o Kanban nem suspende a contagem em Aguardando cliente/Bloqueada. As views calculam o estado atual no servidor. O cron SQL `ikaros-vision-sla` executa a cada 5 minutos, com o navegador fechado, e gera avisos internos de risco/atraso para o responsável e administradores ativos. Cada aviso é deduplicado por registro, obrigação, prazo, nível e destinatário. A janela de risco é configurável (5–240 minutos, padrão 60 úteis). Não há envio de e-mail, WhatsApp ou push externo. `job_runs` registra a execução e eventual erro, exibidos na Administração; o histórico de execução é retido por 7 dias. A checagem pode sinalizar o vencimento até 5 minutos depois.

Os indicadores globais leem o banco operacional a cada 30 segundos e ao atualizar manualmente. Entradas/conclusões e efetivações são filtradas pelo período em São Paulo. Backlog e risco representam o estado atual. Registros de teste (inclusive pelo cliente) ficam fora das métricas e dos alertas por padrão. Mostrar testes permite conferir a homologação.

## Comissão

Para a regra contratual habilitada de Igor: uma única mensalidade integral do novo plano, após aceite e efetivação, sem rateio ou uso da diferença. O valor é a mensalidade efetivamente contratada. Feather 697, Wing 1197 e Sun 2197 são referências, não substituem o valor do contrato. A elegibilidade e o beneficiário ficam congelados na efetivação. A previsão de pagamento é dia 10 do mês seguinte. NF até o último dia útil do mês; relatório mensal até o 5º dia útil do mês seguinte. O app não transfere dinheiro nem emite notas.

## Migração

Aplique `supabase/migrations/20261005214500_native_operation.sql` no banco do **Vision**, depois `20261005220000_sla_schedule.sql`. O enum `cs` já existe na migração Drizzle `0001_add_cs_role.sql`; a migração base é `0000_ikaros_access_and_snapshot.sql`. A execução de DDL deve ser transacional e preceder a publicação da interface. Não reaplique uma migração já concluída. O agendamento pode ser reaplicado sem criar jobs duplicados.

O administrador pode importar Clientes, Demandas, Onboarding, Upgrades, Interações e Changelog pela página Migração. Credenciais Notion ficam apenas no servidor (conexão App + chat existente ou `NOTION_TOKEN`). Todas as páginas das seis fontes são lidas antes da gravação atômica; falha de leitura não aplica importação parcial. A rotina preserva UUID, código, campos originais em `notion_raw`, e datas. Datas antigas sem horário conservam a precisão em `source_date_precision`, para não inventar horário de ocorrência. Não se modifica o Notion, o ERP nem as edições nativas existentes. Repetições importam apenas itens ainda ausentes.

Registros sem vínculo confirmado ficam em Administração → Vínculos pendentes. O administrador escolhe o cliente correto e o responsável passa a ser o da carteira. Responsáveis antigos do Notion são mapeados para identidades do Vision, não para e-mails ou metadados arbitrários. Uma fila pendente não é silenciosamente atribuída a um cliente.

## Desenvolvimento e publicação

Use npm e package-lock. Copie `.env.example` para configuração local; nunca publique `.env`, credenciais, JWTs ou senhas. URL e chave publicável do Supabase podem ir ao cliente; chave de serviço e Notion ficam exclusivamente no servidor. Funções que criam contas usam o serviço após validar o administrador; leituras operacionais usam a sessão do usuário com RLS. Não use o banco do ERP.

```sh
npm ci
npm run dev
npm run check
npm run test:e2e
```

Os testes de banco executam PostgreSQL em PGlite, com identidades fictícias e o esquema real: RLS, atribuição, conflitos, eventos, conclusão, importação idempotente, calendário, comissão e deduplicação de alertas. Os testes de navegador conferem a barreira de login em rotas diretas e no celular. Para usar um Chromium já instalado, configure `PLAYWRIGHT_CHROMIUM_PATH`.

O repositório `igorpaiva-ikaros/ikaros-vision`, branch `main`, permanece sincronizado com Lovable. Envie commits normais sem reescrever história publicada. Publique o projeto existente após aplicar e verificar o banco. O app mantém a identidade visual existente da IKAROS.
