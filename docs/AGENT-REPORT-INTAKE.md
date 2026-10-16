# Recebimento de relatórios de atendimento

O agente recebe o relato e os arquivos, confere os fatos e prepara um JSON validado por `src/lib/workspace/agent-report.ts`. O usuário pode continuar enviando texto, PDF/TXT e os anexos disponíveis; não precisa preencher JSON. O contrato de repasse em `AGENT-REPORT-CONTRACT.txt` continua sendo a fonte das evidências. O envelope operacional abaixo é a normalização desse repasse, não uma segunda carteira.

## Instalação e acesso

Aplicar **no banco do Vision** `supabase/migrations/20261016200000_agent_report_intake.sql`, depois das migrations existentes e antes de publicar a interface. Validar publicação e o fluxo real antes de anunciar automação disponível. O script local, os testes ou o envio de código não aplicam a migration e não publicam o aplicativo.

Use a sessão de um administrador ou CS ativo, por meio de `VISION_ACCESS_TOKEN` configurado em segredo pessoal seguro, destinado exclusivamente ao backend do Vision. Não há token padrão, leitura anônima, conta técnica com acesso à carteira nem uso de service role pelo importador. Sessões expiradas devem ser renovadas pelo mecanismo autorizado; a implementação não cria uma credencial permanente nem guarda refresh tokens no Git. A configuração do fluxo é reutilizável; a autorização de acesso continua sendo requisito.

`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` são os valores públicos do backend do Vision, já presentes na configuração do projeto. `VISION_APP_URL` deve ser o endereço HTTPS publicado comprovado, para gerar o link absoluto. Sem ele, a resposta contém apenas o caminho real do card, nunca um domínio inventado. Credenciais são lidas do ambiente, não de argumentos de shell, relatórios ou arquivos de resultado.

## Envelope operacional

`version` é `ikaros-vision-agent-report-v1`; a implementação valida campos desconhecidos, formatos, tamanhos e datas. Campos sem comprovação permanecem `null`. Os campos são:

| Campo           | Conteúdo comprovado                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external_id`   | Identidade estável da origem/caso, preservada nos próximos relatos; nunca um ID inventado do Vision.                                                                                                                                                                  |
| `client`        | `id`, `code`, `erp_id` ou `null`; `name` exato e `aliases` comprovados.                                                                                                                                                                                               |
| `demand`        | `id` e `version` consultados ou `null`; `title`, classificação persistida, `description`, `context`, `impact`, `solution`, `channel`, `priority`, `received_at`. `create_new` só fica `true` depois de conferir que os casos existentes não tratam do mesmo objetivo. |
| `source`        | `reference`, `agent`, `requester` e `documented_on`; sem datas/nomes presumidos.                                                                                                                                                                                      |
| `completion`    | `confirmed_by_user`, `source`, `at` **ou** `on`, `publication` (`nao_se_aplica` ou `a_confirmar`). Não usar a data do relatório como data de conclusão sem comprovação.                                                                                               |
| `narrative`     | Contexto, pedido, impacto, diagnóstico/hipótese, orientação/solução, evidências, pendências e próxima ação, distinguindo cada um.                                                                                                                                     |
| `missing_files` | Arquivos mencionados mas não disponibilizados.                                                                                                                                                                                                                        |
| `files`         | Inicialmente `[]`; o script deriva nome, MIME, tamanho e SHA-256 dos arquivos realmente fornecidos. Nunca declarar um print ausente como anexo.                                                                                                                       |

O repasse v1 corresponde a `cliente` → `client`, título/classificação/solução → `demand`, cronologia → datas, evidências/origem → `source`/`narrative`. `concluida` no repasse não autoriza preencher marcos desconhecidos. O agente verifica as fontes antes de preencher a confirmação explícita do usuário.

## Executar e conferir

Execute da raiz do checkout. Guarde relatórios reais e seus anexos fora do repositório, em diretório privado; não use dados de cliente como fixture.

```sh
node --experimental-strip-types scripts/agent-reports.mjs validate /caminho/privado/relatorio.json --file /caminho/privado/relatorio.txt
node --experimental-strip-types scripts/agent-reports.mjs inspect /caminho/privado/relatorio.json
node --experimental-strip-types scripts/agent-reports.mjs import /caminho/privado/relatorio.json --file /caminho/privado/relatorio.txt
```

`validate` é local e não grava no Vision. `inspect` exige autenticação e apenas consulta cliente e casos. O agente compara títulos, objetivo e histórico; se já houver o caso, preenche seu ID e versão, em vez de criar uma cópia. Nomes ambíguos ou identificadores conflitantes impedem gravação. Cliente ausente pode ser criado só com nome comprovado, sem inventar plano, contato, ERP ID ou vínculo de responsável da empresa. Em uma demanda nova, o CS autenticado assume o atendimento; criação pelo administrador pode permanecer sem responsável atribuído, como no fluxo nativo.

`import` repete a consulta sob bloqueio transacional e recebe o relatório pela RPC `ingest_agent_report`. A identidade externa liga revisões ao mesmo card; o hash distingue material novo de repetição. O mesmo conteúdo não duplica cliente, demanda, comentário, evento ou arquivo. Um novo relato complementa o histórico. Campos e movimentos manuais do card são preservados; conclusão de um card existente exige alvo/versão explícitos e acesso de responsável ou administrador.

O JSON exato recebido é preservado como `relatorio-estruturado.txt`, formato aceito pelo bucket privado `case-evidence`. Cada arquivo adicional passa pelo fluxo de upload, leitura autenticada com verificação SHA-256 e RPC `register_case_file`. Caminhos derivados do conteúdo tornam retentativas idempotentes; arquivos existentes não são sobrescritos. O importador confere metadados registrados e acesso ao conteúdo. Interrupção deixa o recebimento pendente, retomável com os mesmos dados; não é anunciada como sucesso. A finalização recusa anexos declarados sem objeto/registro correspondentes.

Depois dos anexos, `finalize_agent_report` usa a ação nativa `transition_demand` e seu controle de versão. A conclusão automática nesta entrada é limitada a **Dúvida / orientação**, com solução e confirmação explícita do usuário, sem publicação de software. A confirmação é a fonte da comunicação/entrega registrada; não registra um aceite independente da cliente, validação pelo cliente, aprovação, deploy, primeira resposta ou horários não comprovados. Casos com fila técnica/aprovação/publicação continuam nas ações próprias do card. Esta versão recebe **demandas**; onboarding, upgrade, alterações financeiras, publicação e agenda não são executados implicitamente por um relatório.

Recebimento desconhecido fica `NULL`, sem iniciar SLA pela data da importação. Uma conclusão com apenas o dia usa a representação de precisão já adotada pelo Vision (`source_date_precision`); a hora normalizada interna não é um horário do atendimento. O BI recebe a data sem hora e o histórico mostra dia/horário desconhecido, separado da data real de registro. Para evitar SLA histórico fictício, conclusão com apenas o dia e recebimento com horário conhecido exige conferência, em vez de inferir a duração.

O resultado só é `verified` depois da leitura final do cliente/card, categoria, etapa, responsável, histórico e anexos. Informe código/link, categoria/etapa reais, anexos salvos, arquivos ausentes e pendências. Se não houve acesso, gravação, aplicação da migration ou publicação, registre essa limitação explicitamente. Nenhuma agenda é criada por este fluxo.

## Validação

`npm run check` cobre o esquema real no PGlite: autenticação, permissões, aliases ambíguos, duplicidade, versões, datas, ausência de SLA fictício, anexos, conclusão, reenvio e preservação de edição manual. Os testes usam apenas empresas sintéticas. Testes locais não substituem a leitura do atendimento real após publicação e autorização de acesso.
