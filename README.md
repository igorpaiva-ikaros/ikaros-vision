# Ikaros Vision

Aplicação interna de Customer Success da IKAROS. O Vision mantém a carteira, a esteira de produção e o BI no mesmo banco, separado do ERP. O Notion é o histórico e a origem de uma importação incremental. Projeto: https://lovable.dev/projects/aee205d0-22a2-4cb7-965e-0a2310bb7b8f

## Acessos

O login é obrigatório em todas as rotas. Pedro Manhães é administrador; Igor Paiva trabalha como CS. Não há cadastro público nem senha padrão no código. O administrador cria contas em Administração, escolhe o papel e atribui clientes a um CS ativo. Contas novas começam sem a regra de comissão de Igor. A desativação bloqueia a operação mesmo com uma sessão anterior ainda válida. O último administrador ativo não pode ser removido.

Administradores consultam todo o BI, equipe, carteiras, contas, migração e notificações. O CS vê apenas clientes e registros da carteira atual, nas rotas Operação, Notificações e Ajuda. RLS aplica essas regras no banco; as funções do servidor também verificam sessão e autorização. A redistribuição transfere todos os registros relacionados e preserva o beneficiário das comissões já efetivadas. Alertas antigos de uma carteira transferida deixam de ser visíveis ao antigo CS. Não há permissão de exclusão de registros na interface.

## Operação

Carteira → cliente → nova Demanda, Onboarding, Upgrade, Conversa ou Entrega. O menu do CS tem cinco entradas: CRM, Carteira, Histórico de entregas, Conversas e decisões e Tarefas. CRM contém um seletor de funil (Demandas, Onboarding e Upgrades); não há navegação superior duplicada. O cliente e o responsável acompanham a criação automaticamente. O card reúne nome, código, cliente, estágio e SLA; os campos adicionais ficam no detalhe. Os cards podem ser arrastados entre etapas (com atualização imediata e retorno se a gravação falhar), ou movidos pelo seletor acessível no celular. Onboarding possui funil de implantação e quadro separado de situação. As áreas e etapas trazem orientações curtas. Ações específicas registram primeira resposta, encaminhamento, publicação, validação, conclusão, recebimento de informações completas, aceite e efetivação. Movimentos para encaminhamento, publicação, aceite e efetivação usam as ações auditadas correspondentes; conclusão exige informações completas, e cancelamento de demanda exige motivo. Mover para triagem não registra automaticamente a primeira resposta. Versões evitam sobrescrever alterações concorrentes.

Toda demanda nasce com categoria escolhida pelo CS (sem categoria padrão); a complexidade (Pequena · CS executa / Complexa · setor técnico) e o prazo de entrega combinado ficam visíveis no próprio card. A primeira resposta registra o acolhimento do cliente e não exige previsão de entrega. O prazo combinado é um compromisso separado do SLA oficial, com confirmação do alinhamento e justificativa ao reagendar. Concluir demanda exige solução aplicada e confirmação de comunicação ao cliente; cancelar exige motivo. Onboarding precisa de informações completas antes da conclusão. Upgrade precisa de aceite antes da efetivação. Uma oportunidade efetivada preserva valores, plano, data e atribuição da comissão. Interações registram decisões e próximas ações; changelog documenta a entrega técnica. Ambos podem ser vinculados a uma demanda do mesmo cliente.

## SLA e calendário

O contrato determina segunda a sexta, 09h–18h, America/Sao_Paulo, excluindo feriados nacionais fixos e Sexta-feira Santa. Não se excluem pontos facultativos. Primeira resposta: 4 horas úteis. Solução ou encaminhamento: próxima data útil no mesmo horário normalizado. Registros fora da janela iniciam a contagem na próxima abertura. Onboarding: marco de 5 e limite de 15 dias úteis após informações completas, vencendo às 18h. Pequenas melhorias têm preferência de entrega no mesmo dia; desenvolvimento complexo usa prazo de entrega combinado, sem prorrogar resposta ou encaminhamento.

O SLA é uma dimensão distinta do estágio. Atraso não movimenta o Kanban nem suspende a contagem em Aguardando cliente/Bloqueada. As views calculam o estado atual no servidor. O cron SQL `ikaros-vision-sla` executa a cada 5 minutos, com o navegador fechado, e gera avisos internos de risco/atraso para o responsável e administradores ativos. Cada aviso é deduplicado por registro, obrigação, prazo, nível, versão da regra e destinatário. A janela de risco é configurável (5–240 minutos, padrão 60 úteis). Não há envio de e-mail, WhatsApp ou push externo. `job_runs` registra a execução e eventual erro, exibidos na Administração; o histórico de execução é retido por 7 dias. A checagem pode sinalizar o vencimento até 5 minutos depois.

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

Relatórios de atendimentos podem ser preparados pelo fluxo autenticado e idempotente descrito em [Recebimento de relatórios](docs/AGENT-REPORT-INTAKE.md). O usuário encaminha relato e anexos; o agente confere cliente/duplicidade, registra os arquivos privados e verifica o resultado. Aplicar `20261016200000_agent_report_intake.sql` no Vision antes de publicar essa funcionalidade. Disponibilidade local não comprova registro real nem publicação.

O repositório `igorpaiva-ikaros/ikaros-vision`, branch `main`, permanece sincronizado com Lovable. Envie commits normais sem reescrever história publicada. Publique o projeto existente após aplicar e verificar o banco. O app mantém a identidade visual existente da IKAROS.

## Agenda e perfis

Tarefas: calendário semanal com mini calendário mensal, totais de conclusão de hoje/semana/mês, filtro de estado e alternativa em lista. Um horário vazio abre o agendamento pré-preenchido e tarefas simultâneas ficam empilhadas sem ocultar eventos. Datas e horas são interpretadas em São Paulo. Tarefas vinculadas a clientes e opcionalmente a um registro, com data e hora em São Paulo. O responsável acompanha a carteira, inclusive após redistribuição. Concluir ou cancelar interrompe os lembretes futuros. O servidor `task_reminder_tick` gera uma notificação interna idempotente por tarefa/data/responsável, a cada minuto, sem navegador aberto; o painel também mostra um toast no horário com a sessão aberta. Não há envio automático de WhatsApp, e-mail ou push. Tarefas agendadas manualmente em clientes de teste também lembram o CS, para validação da agenda.

Administradores criam acessos por nome, e-mail e senha, com foto opcional. Fotos PNG/JPEG/WebP são redimensionadas para 320px e armazenadas em formato JPEG no perfil protegido por RLS, sem bucket público. Editar nome/foto preserva a proteção do último administrador e as permissões existentes.

Navegação interna usa TanStack Link, sem recarregar o documento. A operação mantém cache por usuário por 30 segundos, limpa ao sair, e atualiza no servidor em paralelo. Cada coluna renderiza até 30 cards inicialmente e oferece Mostrar mais.

Aplicar `20261006113000_operation_productivity.sql` antes da publicação do frontend; em seguida `20261006113100_task_schedule.sql` para registrar o cron (pg_cron já provisionado no Vision).

`npm run test:e2e:operation` executa QA dos componentes reais com router real e dados fictícios locais: arraste, troca de aba sem reload/reconsulta, agenda, mobile e foto. A fixture não é importada nem publicada na aplicação. Os testes PostgreSQL cobrem RLS, concorrência, carteira e despacho dos lembretes separadamente.

## Catálogo e regras de SLA

Aplicar `20261006120000_crm_catalog_sla.sql` no banco do Vision antes da publicação. A migração apenas instala o catálogo, as regras e o motor; não atualiza clientes nem prazos existentes. Catálogo inicial: Feather, Wing e Sun, com mensalidades 697/1197/2197 e equivalentes mensais anuais 397/897/1897 (contrato de 12 meses), conforme a apresentação fornecida. Não há reajuste automático em clientes nem comissões. O administrador pode criar/editar/desativar produtos; desativação conserva os contratos históricos. Novos clientes exigem responsável ativo e plano ativo. Cadastro anterior sem produto continua editável sem inventar vínculo; mudar o plano exige uma seleção do catálogo. Upgrades também consultam o catálogo ativo, com valor efetivamente contratado preservado como referência de comissão.

Administração → SLA por categoria: primeira resposta, resolução/encaminhamento e entrega automática opcional, em minutos/horas/dias úteis ou corridos. A configuração inicial conserva 4 horas úteis / próxima data útil e deixa entrega automática desativada (prazo combinado manual). Onboarding de implantação mantém seus marcos vigentes de 5/15 dias úteis; a categoria Onboarding no formulário de SLA refere-se às demandas classificadas assim. A janela de risco geral permanece em 60 minutos e continua configurável.

Salvar uma regra idêntica é uma operação sem recálculo. Salvar uma alteração usa versão e bloqueio transacional: recalcula apenas demandas abertas dessa categoria com recebimento conhecido, conserva prazo manual de entrega e registros encerrados, arquiva avisos anteriores e executa a checagem imediatamente. Não inventa uma data inicial para registros importados sem recebimento; o resultado informa essas pendências. Estado de SLA e risco da carteira/BI são derivados dos prazos, sem apagar o estágio real de produção. Permissões de catálogo e regras são verificadas no servidor e nas funções PostgreSQL; CS tem leitura, administrador configura.

A migration `20261015180000_restore_sla_policy_and_first_response_deadline.sql` restaura o cálculo por categoria: a `20261007080100_shared_portfolio.sql` havia recriado o gatilho das demandas com 4 horas úteis e próxima data útil fixas, ignorando as regras salvas e o prazo automático de entrega. Aplicar depois da `20261007093000_clickable_validation_pipeline.sql` e antes de publicar a interface. Na aplicação, as demandas abertas cujos prazos divergem da regra salva são alinhadas uma única vez e os avisos antigos delas são arquivados; a checagem de 5 minutos recria os avisos com os prazos corretos.

## Concierge e categorias (15/10/2026)

O menu Concierge (`/ajuda`) explica CRM → Demandas / Onboarding / Upgrades, etapas, campos, carteira, tarefas, entregas, conversas e áreas administrativas. Ícones de ajuda funcionam por mouse, foco e toque. O conteúdo é estático e não usa IA nem créditos externos.

Novas demandas usam Dúvida / orientação, Bug, Pequena melhoria, Demanda complexa, Implantação / configuração, Onboarding ou Upgrade. Dúvida ensina a usar; implantação prepara recursos existentes; melhoria altera o produto. Suporte legado é agrupado com Dúvida nos filtros e indicadores, mas mantém sua regra histórica. O valor persistido Configuração continua associado à sua política original e aparece como Implantação / configuração. Nenhuma regra de SLA é alterada pelo renomeamento visual.

O CRM combina seleção de categoria com responsável e busca; as contagens consideram responsável, busca e filtro de testes, antes da seleção de categoria. No BI, volume e participação por categoria consideram entradas no período de São Paulo, inclusive encerradas; registros sem recebimento conhecido não entram. Backlog é mostrado separadamente.

Aplicar, nesta ordem, `20261015180000_restore_sla_policy_and_first_response_deadline.sql` (revisada nesta entrega) e `20261015193000_independent_client_promise.sql`, antes de publicar. A segunda migration separa SLA oficial de entrega (`policy_delivery_due`) e compromisso do CS (`due_date`), preserva primeira previsão e registra revisões e justificativas. Não reinventa alinhamentos de registros legados. Regras oficiais não são alteradas. Notificações de aprovação e técnica não são arquivadas por recálculo de SLA.


### Administração configurável (15/10/2026)

Aplique `20261015210000_admin_controls.sql` antes de publicar o frontend. Não altera valores de SLA, categorias persistidas ou etapas de negócio. `workspace_presentation` separa rascunho de versão publicada com controle de concorrência e histórico. A prévia é uma opção da sessão administrativa; colaboradores só recebem a versão publicada. Renomear/ordenar modifica a apresentação, nunca a ação do banco. Funis personalizados são visões filtradas dos mesmos registros, não novos estados nem automações.

Administração tem abas Equipe e acessos, CRM e linguagem, Produtos e planos, Prazos e SLA, Avançado. Migração fica em Avançado; notificações no sino. Concierge vem após Tarefas. Testes ficam visíveis apenas a administradores, também por RLS, histórico e casos técnicos. A prévia de configuração não é um ambiente isolado de código/produção: para simular dados, use registros marcados como teste.

Liderança usa papel CS mais delegações separadas (`member_access`): visualizar indicadores operacionais, cadastrar CS, promover/remover líderes. Não concede BI financeiro, aprovação/publicação, conta administrativa nem repasse de delegações. Criar conta passa pelo servidor e a provisionamento validado no banco. Só administrador grava delegações. Promoção não ativa automaticamente permissões; o administrador as define. Atalhos visíveis organizam navegação; não são fronteira de confidencialidade entre colegas da carteira compartilhada. Nenhuma delegação é atribuída automaticamente nesta migration.

## Demandas gerais do sistema (16/10/2026)

CRM → Nova demanda → Sistema geral · Ikaros registra trabalho interno com `scope=system` e `client_id=NULL`, atribuído ao criador. Não cria cliente fictício nem reaproveita registros importados sem vínculo. A origem não pode ser alterada após o cadastro. O filtro de origem separa trabalho de cliente e trabalho geral, e o BI identifica a origem.

Demandas gerais seguem os prazos de solução/encaminhamento e entrega da categoria. Primeira resposta, validação do cliente e aviso ao cliente não se aplicam. O prazo planejado individual continua separado do SLA oficial, com motivo e histórico ao reagendar. Aprovação, publicação, anexos e observações usam a mesma fila protegida. Concluir exige solução; quando existe solicitação de aprovação, exige publicação confirmada.

Tarefas podem ser vinculadas à demanda geral, sem cliente, e aparecem no card e no calendário. O lembrete é enviado a quem agendou a tarefa. Demandas reais gerais entram nos indicadores operacionais, sem inflar a carteira ou vincular risco a um cliente. Testes continuam privados ao administrador.

Aplicar `20261016143000_general_system_demands.sql` antes de publicar a interface. A migration não altera regras de SLA nem cria demandas, tarefas ou clientes reais.
