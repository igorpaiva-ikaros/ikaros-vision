# Ikaros Vision

Crie um projeto novo chamado "Ikaros — BI Customer Success", um BI executivo em português brasileiro para Pedro Manhães, CEO. Não modifique o outro projeto de treinamento. Construa interface completa, elegante e funcional, React/TypeScript, gráficos, filtros, tabelas, detalhe de demanda, integração real com Notion através de backend seguro e documentação para manutenção independente via GitHub. Não publique dados privados.

Contexto: Ikaros é ERP SaaS para corretoras de consórcios e seguros. Notion é espaço operacional do CS, BI é visão do gestor. Clientes são empresas assinantes do ERP (companies), não os leads/clients finais dessas empresas. Nenhuma base real do ERP foi importada ainda. CS acompanha demandas mesmo encaminhadas ao desenvolvimento; publicação não equivale a conclusão, que envolve comunicação/validação do cliente.

Fonte Notion existente, somente LEITURA pelo BI, não criar nem editar bases:
Demandas data source dec12f4c-bcf8-493f-b3ad-c5485dd251e7, database cb4d461d78c74db2a53db7f8d4442a0a.
Clientes data source 19835596-775d-48a6-9939-c8235bd82e84, database a25ea8bb5d3d49219fda5abc5ec2f86f.
Central https://app.notion.com/p/c300e02bc54547be8b1afef36701e241
Propriedades Demandas exatas: Título (title), ID da demanda (unique_id), Cliente (relation para Clientes), Responsável (people), Data de entrada (created_time), Data de conclusão (date), Data de publicação (date), Prazo final (date), Prioridade (Baixa/Normal/Alta/Crítica), Classificação (Dúvida/Suporte/Bug/Pequena melhoria/Demanda complexa/Configuração/Onboarding/Upgrade), Canal de origem, Tipo técnico (Pequena/Complexa), Complexidade, Descrição do problema, Contexto, Impacto, Solução aplicada, Testes executados, Resultado dos testes, Cliente informado? (checkbox), Cliente validou? (checkbox), Registro de teste (checkbox). Status: Nova, Em triagem, Aguardando informação, Em execução, Aguardando validação, Encaminhada para desenvolvimento, Publicada, Aguardando cliente, Bloqueada, Concluída, Cancelada. SLA: Status SLA útil (auto) (formula), Prazo final efetivo (útil) (formula), Prazo 1ª resposta útil (auto) (formula), Prazo solução útil (auto) (formula), Status do SLA (select), SLA vencido? checkbox. Preserve origem da informação e mostre "Sem informação" para ausentes; não invente precisão.
Clientes: obter nome da propriedade title pelo schema, Empresa, ID ERP, Slug ERP, Contato principal, E-mail da empresa, Telefone da empresa, E-mail do contato, Telefone do contato, WhatsApp do contato, Segmentos ERP, Plano contratado, Status do cliente, Responsável principal, Registro de teste. ID ERP chave externa para futura importação; não implementar importação fictícia.

UI: identidade sóbria azul-marinho, branco e acentos âmbar, marca textual Ikaros sem inventar logo. Sidebar Visão geral, Demandas, Clientes, Equipe, Integração. Cabeçalho CEO Pedro Manhães, intervalo hoje/7 dias/mês/período personalizado, timezone America/Sao_Paulo. Cards entradas no período, concluídas no período (data de conclusão), backlog atual (todos exceto Concluída/Cancelada, independente do intervalo), bloqueadas, encaminhadas para dev, SLA em atraso com cobertura de dados. Gráficos entradas versus conclusões por dia, distribuição por status/classificação, demandas por responsável e cliente. Sem falsa comparação percentual quando período anterior ausente. Filtros cliente, responsável, classificação, status, prioridade; limpar, busca, ordenação. Tabela clicável abrindo painel detalhe com descrição, cliente e contatos, datas, responsável, SLA e link "Abrir no Notion". Clientes mostra carteira/contact links mailto e WhatsApp só se URL válida, sem enviar mensagens. Equipe mostra volume e backlog com legenda, sem chamar volume de score de qualidade.
Testes excluídos por padrão: Registro de teste em demanda OU cliente. Toggle "Incluir testes" explícito. Modo demonstração separado visível, com dados sintéticos coerentes, nunca disfarçados de produção. Default sem conexão: estado honesto "Notion não conectado", opção explícita "Explorar demonstração". Sem números sintéticos no modo real e sem fabricar cliente real. Não copiar dados confidenciais no bundle ou em arquivos públicos.
Integração: implementar cliente Notion server-side com secret NOTION_TOKEN no backend, nunca VITE/public/browser/localStorage. API oficial atual data_sources query com paginação, types robustos, rate limit/retry, busca relations e people sem N+1 descontrolado, schema defensivo. Se token/infra não configurados, retornar estado not_configured. Implementar autenticação e autorização de acesso interno antes de exibir qualquer dado real, endpoints privados, não signup público irrestrito ou credenciais padrão. Use backend disponível apropriado e liste a configuração pendente honestamente. Não assumir MCP do Notion do ChatGPT como acesso runtime do site.
Sincronização inicial por leitura e atualização manual funcional autenticada; se implementar webhook, validar assinatura oficial e não expor endpoint que aceita payload sem verificação. Não prometer webhook funcionando sem configurar assinatura/secret. Mostrar última sincronização bem sucedida e erro, preservar snapshot anterior indicando desatualizado em falha.
SLA: regras de treinamento primeira resposta 4 horas úteis, solução OU encaminhamento 1 dia útil, janela seg-sex 08-18 São Paulo; não confundir encaminhar com resolver tecnicamente. Não inferir SLA cumprido sem timestamps reais de primeira resposta/encaminhamento. Mostrar essas métricas como indisponíveis se os campos não existem. Não calcular tempo por etapa sem histórico. Fórmulas Notion útil podem fornecer prazos/estado, documentar sua origem sem garantir auditoria já feita.

Entrega: código funcional com componentes/serviços separados, .env.example sem secrets, README sobre rodar local, testes/build e conexão Notion e GitHub via Settings > GitHub para manter sync e continuar sem créditos Lovable. Não fingir que GitHub está vinculado se depende OAuth do usuário. Inclua tutorial de uso e glossário de métricas no app e docs. Execute build e testes significativos de filtros/períodos/conclusões/backlog/exclusão testes e estados conexão. Preserve arquitetura portável, nada de tokens hardcoded. Antes de encerrar relate exatamente o que foi implementado e quais configurações não foram possíveis sem autenticação.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aee205d0-22a2-4cb7-965e-0a2310bb7b8f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
