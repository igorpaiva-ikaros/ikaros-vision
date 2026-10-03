# Ikaros Vision — BI Customer Success

Painel executivo para Pedro Manhães. O Notion permanece como espaço de trabalho do CS; o BI apenas lê demandas e clientes. Projeto Lovable: https://lovable.dev/projects/aee205d0-22a2-4cb7-965e-0a2310bb7b8f

## Estado desta entrega

Código corrigido manualmente após esgotamento dos créditos do Lovable. A versão local inclui shell/navegação, demonstração identificada, filtros, detalhes, carteira, equipe, autenticação e leitura server-side. O código deste pacote ainda precisa ser enviado ao repositório **efetivamente vinculado** ao projeto. Não foi publicado e não está sincronizado com o editor do Lovable.

Notion runtime ainda não conectado: o acesso do ChatGPT não se transfere automaticamente ao BI. Nenhum cliente de produção foi importado do ERP. Dados da demonstração são sintéticos.

## Executar e verificar

Requer Node.js 22.16 ou superior.

```sh
npm ci
npm run dev
npm run check
```

A demonstração funciona sem credenciais. O estado inicial informa a configuração pendente; clique em Explorar demonstração. Copie `.env.example` para `.env` somente para configurar acesso real. Não envie `.env` ao GitHub.

Para testes de navegador:

```sh
npx playwright install chromium
npm run test:e2e
```

## Conectar ao Notion

Opção Lovable: em Connectors, escolha Notion do tipo **app + chat**, autorize a Central de Operações e compartilhe as bases Demandas e Clientes. Vincule a conexão a este projeto. A integração MCP de contexto não substitui a conexão utilizada pelo app.

Opção portável: configure `NOTION_TOKEN` apenas no servidor, usando integração interna do Notion com leitura das duas bases. O token nunca usa prefixo `VITE_`. Os IDs e nomes das propriedades estão em `src/lib/notion/config.ts`.

Há paginação, retry para limites/erros transitórios, consulta defensiva e nomes de pessoas. Atualização é manual pela tela Integração. Não há webhook nem atualização automática: estas funcionalidades precisam de implementação/configuração posterior. Uma falha preserva o último snapshot e registra seu estado desatualizado.

## Acesso interno e banco

Lovable Cloud já foi provisionado na geração original. A migração `drizzle/migrations/0000_ikaros_access_and_snapshot.sql` descreve tabelas/RLS do **BI separado**, não do ERP. Para ambiente novo, aplique essa migração uma vez pelo administrador. Não a reaplique no banco existente.

Configure URL e chave publicável do Supabase no cliente e servidor. A chave de serviço fica exclusivamente no servidor. Contas precisam de papel `admin` ou `viewer` em `user_roles`; login sem papel não lê snapshots nem sincroniza. Não há autocadastro na interface ou senha padrão. Desative signup público no provedor e provisione usuários pelo administrador. O primeiro administrador deve ser cadastrado/liberado pelo console do backend, com identidade verificada. O BI não concede papéis por e-mail, domínio ou metadados do usuário.

RLS protege snapshots e papéis; funções verificam sessão e autorização antes da leitura. O frontend apaga consultas ao sair. Não use o Supabase do ERP para este BI sem um projeto específico de integração.

## GitHub e continuidade sem créditos

A vinculação conta GitHub–Lovable e a criação/sincronização do repositório são passos diferentes. No projeto abra Settings → GitHub → Connect project/Export to GitHub, selecione o proprietário correto e permita ao Lovable criar o repositório privado. Depois autorize o novo repositório no app GitHub do ChatGPT.

Não crie um repositório isolado esperando importá-lo automaticamente: a sincronização deve ser estabelecida no próprio Lovable. Quando houver vínculo confirmado, importe **estes arquivos** na branch sincronizada (sem `.env`, `node_modules` ou `.output`), usando commits normais. Preserve a história já criada pelo Lovable; não use force push ou rebase de commits publicados. Rode `npm run check` antes de enviar.

Use npm com o `package-lock.json` desta entrega; o lockfile bun original foi removido para evitar duas fontes de dependências. O desenvolvimento e os testes locais não exigem créditos Lovable; hospedagem, infraestrutura e serviços externos seguem seus próprios limites. O build atual usa o preset Cloudflare do Lovable. Para publicar por outro provedor, ajuste o preset de Nitro e configure as variáveis nesse provedor.

## Definições de métricas

- Entradas: Data de entrada dentro do período, no fuso America/Sao_Paulo.
- Concluídas: status Concluída e Data de conclusão dentro do período. Publicada, encaminhada e cancelada não são conclusões.
- Backlog: status conhecido diferente de Concluída/Cancelada, independente do período. Status ausentes são informados separadamente.
- Bloqueadas/encaminhadas: estoque atual de cada status.
- SLA atrasado: informação explícita de atraso do Notion; estado não reconhecido é desconhecido. Cobertura informa quantos itens do backlog têm dados reconhecidos.
- Testes: excluídos quando a demanda **ou seu cliente** tem Registro de teste; inclusão é explícita.
- Equipe: atribuição atual, volume e carga, sem score de qualidade. Não há histórico de responsáveis; métricas não reconstituem responsáveis passados.

Primeira resposta (4h úteis) e solução/encaminhamento (1 dia útil, seg–sex 08–18 São Paulo) são regras do treinamento. Percentuais de cumprimento e tempo por etapa ficam indisponíveis sem timestamps/histórico próprios. Fórmulas do Notion não foram auditadas nesta entrega.

Veja Ajuda no app para tutorial e glossário. A carteira representa empresas assinantes do Ikaros, não os leads dos seus clientes. ID ERP é chave externa para futura importação, ainda não implementada.
