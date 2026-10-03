# Ikaros — BI Customer Success

BI executivo em português (Brasil) para Pedro Manhães (CEO), lendo as bases de Demandas e Clientes do Notion em modo somente leitura. Nada no Notion é criado ou alterado.

## Estado das conexões (honesto, hoje)

- **Notion: não conectado.** Não existe nenhuma conexão Notion neste workspace, então o app nasce no estado "Notion não conectado". Para conectar, use este link: https://lovable.dev/connectors/notion/connect?workspace=f340e9804b025b1017d2 — depois eu vinculo a conexão ao projeto e os dados reais passam a carregar. As bases também precisam estar compartilhadas com a integração Notion.
- **Acesso interno (login): precisa do Lovable Cloud**, que eu habilito nesta etapa. Sem login válido nenhum dado real é exibido — não haverá cadastro público aberto nem senha padrão.
- **GitHub: depende de você.** A vinculação é feita por você em Settings > GitHub (autorização na sua conta); eu não consigo fazer isso e não vou dizer que está feito.

## O que será construído

**Identidade:** azul-marinho, branco e acentos âmbar; marca textual "Ikaros" (sem logo inventado). Fuso America/Sao_Paulo.

**Navegação (sidebar):** Visão geral, Demandas, Clientes, Equipe, Integração, Ajuda (tutorial + glossário).

**Cabeçalho:** "Pedro Manhães — CEO", seletor de período (hoje / 7 dias / mês / personalizado), alternância "Incluir testes" e selo visível quando em Demonstração.

**Visão geral:** cards de entradas no período, concluídas no período (por Data de conclusão), backlog atual (tudo exceto Concluída/Cancelada, fora do período), bloqueadas, encaminhadas para desenvolvimento e SLA em atraso com indicação de cobertura de dados. Gráficos: entradas x conclusões por dia, distribuição por status e por classificação, demandas por responsável e por cliente. Sem comparação percentual quando não há período anterior comparável.

**Demandas:** filtros (cliente, responsável, classificação, status, prioridade), busca, ordenação, limpar filtros; tabela clicável que abre painel de detalhe com descrição/contexto/impacto, solução e testes, cliente e contatos, todas as datas, responsável, bloco de SLA e botão "Abrir no Notion". Campos ausentes aparecem como "Sem informação".

**Clientes:** carteira por cliente com plano, status, segmentos, responsável, volume de demandas e contatos; mailto e link de WhatsApp só quando o dado formar URL válida. Nenhuma mensagem é enviada.

**Equipe:** volume e backlog por responsável, com legenda explicando que é carga de trabalho, não qualidade.

**Integração:** estado da conexão, última sincronização bem-sucedida, último erro, botão de atualização manual (autenticado). Em falha, o último snapshot continua visível marcado como desatualizado.

**Testes e demonstração:** demandas marcadas como "Registro de teste" (na demanda ou no cliente) ficam fora por padrão. O modo demonstração é separado e sempre identificado, com dados sintéticos coerentes — nunca misturado ao modo real.

**SLA:** regras de treinamento (1ª resposta 4h úteis; solução ou encaminhamento 1 dia útil; seg–sex 08–18 São Paulo) documentadas no app. Métricas que dependem de timestamps inexistentes aparecem como "indisponível" em vez de estimadas. Encaminhar não é tratado como resolver. Prazos vindos das fórmulas do Notion são exibidos com a origem indicada, sem afirmar auditoria.

## Detalhes técnicos

- Leitura do Notion só no servidor, via server functions do TanStack Start; o token nunca vai para o navegador (sem `VITE_`, sem localStorage).
- `POST /v1/data_sources/{id}/query` (Notion-Version 2025-09-03) com paginação completa, retry com respeito a rate limit, parsing defensivo de propriedades, e resolução de relations/people em lote (sem N+1).
- Sem conexão ou sem token: as funções retornam `{ status: "not_configured" }` e a UI mostra o estado honesto.
- Login obrigatório (Lovable Cloud) antes de qualquer dado real; rotas de dados protegidas por sessão verificada no servidor. Modo demonstração acessível sem dados reais.
- Snapshot da última leitura bem-sucedida guardado no banco para o aviso "desatualizado".
- Sem webhook nesta entrega (exigiria segredo de assinatura configurado); documentado como opcional futuro.
- Camadas separadas: `notion/` (client, schema, mapeamento), `*.functions.ts` (acesso autenticado), `features/` (componentes), `demo/` (dados sintéticos).
- `.env.example` sem segredos; README com como rodar local, build, testes, conexão Notion e sync via GitHub.
- Testes (vitest) de filtros, períodos, contagem de concluídas, backlog, exclusão de registros de teste e estados de conexão. Build executado ao final.

## Fora do escopo

Nenhuma escrita no Notion, nenhuma importação do ERP (o ID ERP fica apenas como chave externa), nenhum dado confidencial no código ou em arquivos públicos.
