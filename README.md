# Ikaros Vision — BI Customer Success

Painel executivo para Pedro Manhães. O Notion permanece como espaço de trabalho do CS; o BI lê demandas e clientes e permite cadastrar clientes com responsável de CS obrigatório. Projeto Lovable: https://lovable.dev/projects/aee205d0-22a2-4cb7-965e-0a2310bb7b8f

## Estado desta entrega

Código corrigido manualmente após esgotamento dos créditos do Lovable. A versão local inclui shell/navegação, demonstração identificada, filtros, detalhes, carteira, equipe, autenticação e leitura server-side. O projeto está sincronizado com `igorpaiva-ikaros/ikaros-vision` na branch `main`. O acesso aos dados permanece restrito às contas internas autorizadas.

A conexão Notion App + chat foi vinculada ao projeto. O acesso do ChatGPT não se transfere automaticamente ao BI. A validação de leitura das duas bases é independente do vínculo. Nenhum cliente de produção foi importado do ERP. Dados da demonstração são sintéticos.

## Executar e verificar

Requer Node.js 22.16 ou superior.

```sh
npm ci
npm run dev
npm run check
```

Todas as rotas exigem login antes de mostrar o shell ou a demonstração. Depois de autenticar uma conta autorizada, o estado inicial informa a conexão pendente, se houver; clique em Explorar demonstração para dados sintéticos. Copie `.env.example` para `.env` somente para configurar acesso real. Não envie `.env` ao GitHub.

Para testes de navegador:

```sh
npx playwright install chromium
npm run test:e2e
```

## Conectar ao Notion

Opção Lovable: em Connectors, escolha Notion do tipo **app + chat**, autorize a Central de Operações e compartilhe as bases Demandas e Clientes. Vincule a conexão a este projeto. A integração MCP de contexto não substitui a conexão utilizada pelo app.

Opção portável: configure `NOTION_TOKEN` apenas no servidor, usando integração interna do Notion com leitura das duas bases e capacidade de inserir conteúdo em Clientes. O token nunca usa prefixo `VITE_`. Os IDs e nomes das propriedades estão em `src/lib/notion/config.ts`.

Há paginação, retry para limites/erros transitórios nas leituras, consulta defensiva e nomes de pessoas. Escritas de criação não são repetidas automaticamente. Atualização é manual pela tela Integração. Não há webhook nem atualização automática: estas funcionalidades precisam de implementação/configuração posterior. Uma falha preserva o último snapshot e registra seu estado desatualizado.

## Acesso interno e banco

Lovable Cloud já foi provisionado na geração original. A migração `drizzle/migrations/0000_ikaros_access_and_snapshot.sql` descreve tabelas/RLS do **BI separado**, não do ERP. Para ambiente novo, aplique essa migração uma vez pelo administrador. Não a reaplique no banco existente.

Configure URL e chave publicável do Supabase no cliente e servidor. A chave de serviço fica exclusivamente no servidor. Todos os usuários autorizados têm as mesmas telas e ações do BI. Pedro Manhães e Igor Paiva estão liberados como `admin`. A tabela `user_roles` é uma lista de autorização interna: login sem liberação não lê snapshots nem sincroniza. O papel legado `viewer` também é aceito como acesso interno pelas regras existentes; não há filtro de conteúdo por colaborador. Não há autocadastro na interface ou senha padrão. Desative signup público no provedor e provisione usuários pelo administrador. O primeiro administrador deve ser cadastrado/liberado pelo console do backend, com identidade verificada. O BI não concede papéis por e-mail, domínio ou metadados do usuário.

RLS protege snapshots e papéis; funções verificam sessão e autorização antes da leitura. O frontend apaga consultas e o modo de demonstração ao sair. URLs diretas redirecionam para `/auth` sem montar o painel. Sessão e autorização são verificadas também pelo servidor; esconder a tela não substitui RLS. Não use o Supabase do ERP para este BI sem um projeto específico de integração.

## GitHub e continuidade sem créditos

A vinculação conta GitHub–Lovable e a criação/sincronização do repositório são passos diferentes. No projeto abra Settings → GitHub → Connect project/Export to GitHub, selecione o proprietário correto e permita ao Lovable criar o repositório privado. Depois autorize o novo repositório no app GitHub do ChatGPT.

Não crie um repositório isolado esperando importá-lo automaticamente: a sincronização deve ser estabelecida no próprio Lovable. Quando houver vínculo confirmado, importe **estes arquivos** na branch sincronizada (sem `.env`, `node_modules` ou `.output`), usando commits normais. Preserve a história já criada pelo Lovable; não use force push ou rebase de commits publicados. Rode `npm run check` antes de enviar.

Use npm com o `package-lock.json` desta entrega; o lockfile bun original foi removido para evitar duas fontes de dependências. O desenvolvimento e os testes locais não exigem créditos Lovable; hospedagem, infraestrutura e serviços externos seguem seus próprios limites. O build atual usa o preset Cloudflare do Lovable. Para publicar por outro provedor, ajuste o preset de Nitro e configure as variáveis nesse provedor.

## Definições de métricas

- Entradas: Data de entrada dentro do período, no fuso America/Sao_Paulo.
- Concluídas: status Concluída e Data de conclusão dentro do período. Publicada, encaminhada e cancelada não são conclusões.
- Backlog: status conhecido diferente de Concluída/Cancelada, independente do período. Status ausentes são informados separadamente.
- Bloqueadas/encaminhadas: estoque atual de cada status.
- SLA atrasado: a fórmula atual do Notion tem prioridade sobre marcações manuais antigas. Campos manuais só são usados quando a fórmula está ausente; estado não reconhecido permanece desconhecido. Cobertura informa quantos itens do backlog têm dados reconhecidos.
- Testes: excluídos quando a demanda **ou seu cliente** tem Registro de teste; inclusão é explícita.
- Equipe: atribuição atual, volume e carga, sem score de qualidade. Não há histórico de responsáveis; métricas não reconstituem responsáveis passados.

Primeira resposta (4h úteis) e solução/encaminhamento (1 dia útil, seg–sex 08–18 São Paulo) são regras do treinamento. Percentuais de cumprimento e tempo por etapa ficam indisponíveis sem timestamps/histórico próprios. Fórmulas do Notion não foram auditadas nesta entrega.

Veja Ajuda no app para tutorial e glossário. A carteira representa empresas assinantes do Ikaros, não os leads dos seus clientes. ID ERP é chave externa para futura importação, ainda não implementada.

## Identidade visual IKAROS

Tema escuro inspirado na apresentação fornecida: fundo #070c16, superfícies #101823, texto marfim #f4f0e6 e coral #fd7849 da logo. Instrument Serif nos títulos e números, Geist nos controles e textos, Geist Mono nos rótulos. Fontes WOFF hospedadas no projeto com licenças OFL em public/brand/fonts, sem dependência de Google Fonts. A logo original está em public/brand; BrandLogo mantém a composição e apresenta o nome em marfim para contraste no fundo escuro.


## Cadastro de clientes pelo BI

Em Clientes → Novo cliente, preencha nome da empresa, contato principal, e-mail ou telefone, segmento, plano opcional e observações. Selecione um responsável de CS antes de enviar. Todos os usuários internos autorizados têm a mesma ação. Sem sessão ou papel interno, o servidor recusa o cadastro. No modo de demonstração, o botão não aparece.

O servidor confere os campos, o esquema do Notion e o colaborador antes de criar a página. A lista de colaboradores de CS está em `CS_TEAM`, em `src/lib/notion/config.ts`, e seus IDs são validados no Notion; para expandir a equipe, inclua o ID Notion do colaborador após conceder acesso ao espaço. Não confunda o ID de usuário do Notion com o da conta do BI.

O Notion gera o código CLI existente. ID ERP fica vazio até o cliente ser identificado na futura importação. O cadastro entra com Status Ativo e Responsável principal selecionado. Não altera o ERP nem cria demandas. Marque Cadastro de teste para homologação; testes ficam fora dos indicadores por padrão.

Aplique `supabase/migrations/20261004091500_client_registrations.sql` no banco do BI (já aplicada no projeto atual). A tabela de controle tem RLS e nenhum acesso para anon/authenticated; apenas o servidor autorizado usa a chave de serviço. Cada envio tem uma reserva única e um marcador `ID do cadastro BI` na base Clientes. Repetições e chamadas simultâneas com o mesmo identificador não criam uma segunda página. Se uma resposta for incerta, o formulário conserva os dados e oferece Confirmar envio; não reenvia a criação automaticamente. Um envio indefinidamente pendente exige conferir o marcador no Notion antes de liberar a reserva, para evitar duplicação.

Depois do cadastro, o servidor tenta atualizar o snapshot. Falha na atualização do BI não desfaz o cliente criado: a mensagem pede Atualizar agora. Importação da carteira real, redistribuição automática e webhooks continuam pendentes.

## Carteiras e páginas no Notion

A base Clientes tem Minha carteira, filtrada por Responsável principal = usuário atual, excluindo Encerrado. Acompanhamento continua consolidado. Código e responsável ficam no cabeçalho; contatos e próxima ação têm destaque. Demandas, Onboarding, Upgrade, Interações e Changelog receberam layouts com identificação e campos operacionais primeiro, campos complementares na lateral.

Pendente de configuração pela interface do Notion: botão Nova demanda no cliente, copiando Cliente e Responsável principal, e remoção do limite de uma demanda no vínculo inverso de Clientes. O conector MCP não oferece esses ajustes. O filtro Minha carteira organiza o trabalho; não restringe o seletor de relações nem substitui permissões.


## Auditoria do contrato CS

Janela de atendimento: segunda a sexta, 09h–18h em Brasília, excluindo feriados nacionais. A primeira resposta tem limite de 4 horas úteis; solução ou encaminhamento, 1 dia útil. O endpoint interno `getNotionWorkflowAudit` permite verificar fórmulas e resultados das bases Demandas, Onboarding e Upgrades, sem retornar credenciais e sem escrever no Notion. Continua exigindo sessão válida e papel interno. A conferência não é controle de ponto.

A Central do Notion foi reduzida à Operação: Clientes, Demandas, Onboarding, Upgrades, Interações e Changelog. Corpos dos cards e modelos não repetem instruções; os dados operacionais permanecem nas propriedades. Guias foi removida por solicitação do usuário.

`scripts/notion-contract-formulas.mjs` mantém expressões reproduzíveis para prazos, calendário nacional, onboarding e comissão. DDL de fórmulas novas deve ser aplicado por dependência: criar uma propriedade antes de criar outra que a referencie. O cálculo usa UTC−3 de Brasília, exclui sábados, domingos e feriados nacionais fixos, e calcula a Sexta-feira Santa a cada ano. Não exclui pontos facultativos. Um dia útil significa a próxima data elegível, no mesmo horário; marcos de onboarding contam dias úteis após a data de recebimento completo, com vencimento às 18h. Melhorias pequenas têm preferência de entrega no mesmo dia, sem transformar essa preferência em um SLA contratual obrigatório. Prazos manuais de entrega são preservados e não prorrogam a primeira resposta ou o encaminhamento. A contagem de horas úteis é limitada a 3660 dias apenas em situações muito antigas.

Campos de ocorrência são fatos: Primeira resposta em, Encaminhado em, Informações completas em e Concluído em não são inferidos retroativamente a partir de status. Botões e automações nativas para registrar esses horários ainda exigem configuração pela interface do Notion. O BI usa snapshots; a fórmula do Notion evolui com o tempo, mas o BI exige Atualizar agora para uma leitura nova. O cálculo de comissão exige regra aplicável ao responsável, mensalidade real do novo plano, aceite e efetivação. O pagamento previsto é uma data informativa; não executa transferências nem emite notas.

Validação no ambiente real com registros fictícios: fim de semana; sexta 09/10/2026 às 17h e feriado 12/10, gerando resposta em 13/10 às 12h; prazo em risco e atrasado; prazos manuais sem deslocamento; marco de 15 dias úteis em 23/10 a partir de dados completos em 01/10; comissão e pagamento previsto por competência. Não foram importados clientes do ERP.
