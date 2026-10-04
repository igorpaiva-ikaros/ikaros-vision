# Validação da entrega manual

Validações executadas na cópia local do código, não no site publicado:

- `npm run typecheck`: passou, mantendo strict, noUncheckedIndexedAccess e exactOptionalPropertyTypes.
- `npm test`: 13 testes em 4 arquivos passaram.
- `npm run build`: cliente e servidor compilaram; `npm run check` terminou com código 0.
- Smoke test HTTP/SSR: as sete rotas retornaram 200 com o shell do BI presente, em servidor local sem credenciais. Isso não substitui teste visual/interativo em navegador.
- Bundle público não contém chave de serviço, gateway do Notion ou cliente da API Notion. Credenciais reais não foram fornecidas nem incluídas no pacote.

Os testes verificam calendário São Paulo, períodos, conclusões por data e status, backlog fora do período, status ausentes, filtros combinados, ordenação, teste na demanda ou no cliente, SLA desconhecido, paginação da API Notion simulada, mapeamento e contatos. O teste de componente usa a tabela real: busca vazia, limpeza e abertura do painel de detalhes com descrição e contato.

Limites desta validação:

- A leitura do Notion foi testada com respostas simuladas. Não houve sincronização ponta a ponta, pois a conexão runtime não está vinculada ao projeto. A conexão OAuth App + chat Igor.P's Notion existe, mas tem zero projetos; o agente Lovable recusou vínculo por ausência de créditos.
- Não foi feita validação de login com usuário real nem concessão de papéis no backend.
- Os testes de navegador em `e2e/` estão preparados, mas não foram executados: a instalação do Chromium retornou arquivos de download inválidos neste ambiente. Não afirmar que passaram.
- Validação manual em navegador na prévia Lovable: proteção de dados sem sessão, entrada na demonstração, mudança de 7 dias para mês, navegação para Demandas, busca DEMO-64 (1 de 62), painel de detalhe com descrição e contato e retorno à visão geral. Esses checks não substituem o Playwright automatizado, que permanece não executado.
- Código enviado à main de igorpaiva-ikaros/ikaros-vision no commit 5dd181ecd487445929abef51dda250f894b6b977. Lovable confirmou o mesmo latest_commit_sha. Workflow Verificar BI no GitHub concluído com sucesso (run 37160262206).
- A prévia autenticada do Lovable abriu e foi verificada visualmente. Publicação não realizada: revisão automática exige autorização explícita para URL pública.
- Inspeção do backend do projeto: zero usuários, zero papéis e zero snapshots; cadastro de acesso interno e sincronização real ainda pendentes.
- A base real de clientes do ERP ainda não foi importada. A demonstração não contém clientes reais.

## Reforma visual IKAROS

Aplicados paleta escura/coral/marfim, Instrument Serif/Geist/Geist Mono locais, logo original adaptada ao fundo escuro, títulos e cards. `npm run check` passou com 13 testes, strict typecheck e build após a alteração. Lovable confirmou sincronização do commit a9b3f67814149c5174c64d292b1735b65bcd1a7e. A nova versão não foi inspecionada visualmente no navegador hospedado: o auth-bridge do Lovable informou restrição de sign-in neste navegador. A captura do MCP é anterior à alteração e não comprova o novo tema.


## Login obrigatório e diagnóstico Notion — 2026-10-03 (São Paulo)

- Contas Pedro e Igor provisionadas no backend do BI, sem senhas em código. Pedro passou de viewer para admin, igual a Igor; ambas têm acesso completo ao aplicativo.
- AppShell bloqueia montagem das telas e navegação sem sessão, redireciona todas as rotas para /auth e espera autorização antes de abrir o painel. A tela /auth não usa sidebar/header. Nenhum cadastro público é oferecido.
- A demonstração exige a mesma sessão e autorização. Estado armazenado no navegador não contorna a proteção. Logout limpa cache, inclusão de testes e modo demo.
- Testes de componentes cobrem URLs diretas, autorização e igualdade de telas; testes do provider cobrem bypass por demo e limpeza de sessão. Testes Notion cobrem credenciais incompletas e erro 404 sem exposição do corpo do provedor.
- Diagnóstico inicial observado no Lovable: Conexões do projeto vazio. Banco de snapshots vazio. A conexão existente no workspace não estava vinculada ao projeto. O agente Lovable vinculou std_01m41x8rz8e6tv0y7d96zf1dqw e confirmou provisionamento dos segredos gerenciados, sem expor seus valores. Vínculo não é comprovação de leitura bem-sucedida.
- O agente também acrescentou useBiOptional e tornou RefreshButton tolerante à ausência do provider. Essa alteração foi preservada no código manual.
- O MCP de consultas ao banco atingiu o limite do plano gratuito durante a verificação posterior; não confundir esse limite de ferramenta com erro do aplicativo.

- `npm run check` passou: strict typecheck, 28 testes em 6 arquivos e build cliente/servidor. Testes automatizados de navegador foram atualizados para login obrigatório; execução hospedada ainda pendente.
- Diagnóstico de leitura pelo conector do Lovable: GET das duas data sources retornou HTTP 200 com esquemas esperados. Gateway, headers e versão 2025-09-03 conferidos. POST query e fetchDataset completo ainda não foram executados no diagnóstico; não afirmar sincronização de registros concluída.
