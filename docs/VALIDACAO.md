# Validação da entrega manual

Validações executadas na cópia local do código, não no site publicado:

- `npm run typecheck`: passou, mantendo strict, noUncheckedIndexedAccess e exactOptionalPropertyTypes.
- `npm test`: 13 testes em 4 arquivos passaram.
- `npm run build`: cliente e servidor compilaram; `npm run check` terminou com código 0.
- Smoke test HTTP/SSR: as sete rotas retornaram 200 com o shell do BI presente, em servidor local sem credenciais. Isso não substitui teste visual/interativo em navegador.
- Bundle público não contém chave de serviço, gateway do Notion ou cliente da API Notion. Credenciais reais não foram fornecidas nem incluídas no pacote.

Os testes verificam calendário São Paulo, períodos, conclusões por data e status, backlog fora do período, status ausentes, filtros combinados, ordenação, teste na demanda ou no cliente, SLA desconhecido, paginação da API Notion simulada, mapeamento e contatos. O teste de componente usa a tabela real: busca vazia, limpeza e abertura do painel de detalhes com descrição e contato.

Limites desta validação:

- A leitura do Notion foi testada com respostas simuladas. Não houve sincronização ponta a ponta, pois a conexão runtime não está configurada.
- Não foi feita validação de login com usuário real nem concessão de papéis no backend.
- Os testes de navegador em `e2e/` estão preparados, mas não foram executados: a instalação do Chromium retornou arquivos de download inválidos neste ambiente. Não afirmar que passaram.
- Não foi feita validação visual em navegador real.
- Não houve publicação, criação de repositório, envio ao GitHub ou sincronização com o Lovable. O pacote é a cópia corrigida para a próxima etapa.
- A base real de clientes do ERP ainda não foi importada. A demonstração não contém clientes reais.
