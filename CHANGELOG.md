## 2026-10-29 — Prazos de demandas e projetos na agenda

- Operação → Tarefas: faixa "Prazos" na semana e dias sublinhados no mini calendário onde há prazo de demanda ou de projeto.
- Clicar no dia abre a Agenda do dia, com as abas Demandas de clientes e Time e projetos (projetos, etapas e demandas internas); cada item abre a demanda ou o projeto.
- Datas lidas dos próprios registros (entrega combinada ou SLA de entrega da demanda; início, entrega e etapas do projeto), sem cópia nem migration. Canceladas fora; testes só com Mostrar testes.

## 2026-10-28 — Projetos para a equipe técnica

- A equipe técnica passa a ver Projetos no menu, ao lado da fila encaminhada e das notificações: lê todos os projetos, cria, comenta, anexa, pode ser responsável por projeto ou etapa e recebe os avisos de projeto.
- Regras de gerência inalteradas: administrador, quem criou ou o responsável gerenciam; responsável pela etapa conclui a própria etapa e move o projeto só entre situações abertas. Contas inativas continuam fora.
- Demandas, carteira, CRM, BI e administração seguem fechados para a equipe técnica.
- Migration `20261028140000_team_projects_technical.sql`: helper único `team_project_member` usado em políticas, funções, anexos e avisos de projeto; nenhuma linha de dado alterada.

## 2026-10-28 — Redefinir senha pelo administrador

- Administração → Equipe: botão Redefinir senha em cada usuário (CS, administrador ou equipe técnica), com confirmação da nova senha e aviso quando a conta está inativa.
- A senha vai direto ao Supabase Auth depois de validar o administrador; não é gravada nem registrada. O histórico guarda quem redefiniu e quando. Senha recusada pelo servidor (fraca ou vazada) mostra o motivo.
- Sem migration; nenhuma conta, papel ou permissão alterada pela publicação.

## 2026-10-27 — Equipe → Projetos

- Nova área Equipe → Projetos para administradores e CS: quadro por situação (Ideias, Planejado, Em andamento, Em revisão, Concluído; Cancelado sob demanda), busca, filtro por pessoa e faixa "Pedem atenção".
- Projeto com título, contexto, responsável, prioridade, início e prazo de entrega; etapas desenhadas por quem cria, com responsável e prazo próprios, reordenáveis, e farol de prazo por projeto e por etapa.
- Conversa e linha do tempo por projeto: mensagens, anexos privados (imagem, PDF, Word, Excel, vídeo, áudio) e gravação de áudio pelo navegador, junto com os eventos do projeto, com autor e horário.
- Regras no banco: gerência por administrador, criador ou responsável; responsável pela etapa conclui a própria etapa; concluir exige etapas concluídas; cancelar exige motivo; controle de versão e registro de cada ação. Avisos aos envolvidos e link direto da página de notificações.
- Migration aditiva `20261027120000_team_projects.sql`; nenhuma demanda, cliente, SLA ou permissão existente alterada. Equipe técnica sem acesso.

## 2026-10-27 — Conclusão com confirmação do cliente

- O responsável pela demanda conclui sem precisar do administrador quando o cliente confirma que está funcionando: botão Concluir com confirmação do cliente no card, com solução aplicada e registro de como o cliente confirmou.
- Vale com entrega aguardando validação, encaminhada à equipe técnica, com ajustes pedidos ou sem publicação registrada; a entrega sai das filas como "confirmada pelo cliente" e o administrador recebe aviso.
- Histórico registra a confirmação e o estado anterior da entrega. Demandas internas e demandas de outra pessoa seguem as regras anteriores.
- Migration aditiva `20261027150000_client_confirmed_completion.sql`.

## 2026-10-26 — Transferência de demandas com aprovação

- Colaborador responsável solicita transferência da própria demanda (destino CS ativo e motivo); a demanda segue com ele até a decisão, com pendência visível e cancelamento enquanto pendente.
- Administrador e líderes com a nova delegação Gerenciar transferências de demandas (concedida só pelo administrador) aprovam, recusam com motivo e transferem direto.
- Fila de solicitações no CRM, histórico com solicitante, decisor, origem, destino, data e motivo, e notificações internas.
- Só o responsável muda; etapa, SLA, entrega, validação e anexos são preservados, inclusive com validação travada.
- Liberar demanda para a equipe passa a ser exclusivo de quem gerencia transferências; assumir demanda sem responsável continua igual.
- Prazos SLA (início, 1ª resposta, solução, entrega) preservados na transferência, assumir e liberar, mesmo após mudança da política da categoria (migração 0005).
- Migrações aditivas 0003/0004/0005; nenhuma demanda, papel ou delegação existente alterada.

## 2026-10-19 — Kanban com rolagem no topo e contadores

- Barra horizontal fixa no topo do quadro, sincronizada com toque/trackpad e setas; disponível sem descer a coluna mais longa.
- Contadores no canto superior dos cards: próximo SLA pendente, prazo do cliente (ou planejamento interno) e retorno técnico, separados.
- Tempo restante/atraso atualizado a cada 30 segundos; conclusão encerra a contagem e mantém o resultado. Datas finais e risco oficial vêm das regras vigentes, sem alterar SLA.
- Interface conserva carteira, validação, arraste, permissões e identidade visual. Nenhuma migration ou alteração de dados reais.

## 2026-10-15 — Administração, liderança e personalização

## 2026-10-16 — Demandas gerais do Ikaros
- Origem Sistema geral no CRM, sem cliente fictício, com responsabilidade individual, filtro e identificação no BI.
- Agenda, lembretes, anexos e fila de validação funcionam também sem cliente.
- SLA de solução e entrega preservado; primeira resposta e comunicação ao cliente não se aplicam ao trabalho interno.
- Corrigida a seleção de clientes da agenda para carteira compartilhada.
- Lockfile npm alinhado à versão 2.26.5 já usada pelo Lovable.
- Concierge após Tarefas; Mostrar testes exclusivo de administradores, com isolamento dos registros no banco.
- Administração organizada por assunto, CRM no grupo Operação e relatórios no grupo Gestão.
- Nomes de categorias/funis/etapas e ordem visual editáveis; rascunho privado, prévia e publicação explícita.
- Funis de visualização por categorias e etapas, preservando cards, histórico e SLA.
- Delegação de indicadores operacionais, criação de CS e promoção de líderes; sem poderes de administrador.
- Validação de configurações, controle de versão, auditoria e testes de autorização.


## 2026-10-15 — Concierge, categorias e dois compromissos de prazo

- Concierge com busca, áreas, etapas, exemplos por categoria e ajuda contextual acessível.
- Categoria com significado único, filtro horizontal combinado com responsável/busca e comparação de entradas no BI.
- Primeira resposta independente da previsão. SLA oficial e prazo combinado medidos separadamente; revisões preservam primeiro prazo e justificativa no histórico.
- Recálculo preserva avisos de aprovação e técnico e alertas de SLA cujo prazo continua válido.
- Substitui a exigência de prazo antes da primeira resposta proposta inicialmente na PR #3.

## 2026-10-15 — SLA por categoria e prazo na 1ª resposta

- Corrige regressão de 07/10: a `20261007080100_shared_portfolio` recriou o gatilho das demandas com 4 horas úteis e próxima data útil fixas, ignorando Administração → SLA por categoria e o prazo automático de entrega. A migration `20261015180000` volta a calcular os prazos pela regra salva da categoria; registros encerrados conservam os prazos com que foram atendidos. As regras salvas não são alteradas.
- Na aplicação da migration, demandas abertas com prazos divergentes da regra salva são alinhadas uma única vez e seus avisos antigos arquivados; a checagem de 5 minutos recria os avisos com os prazos corretos.
- Nova demanda sem categoria padrão: Classificação passa a ser obrigatória (antes vinha "Suporte" preenchido). Complexidade (Pequena · CS executa / Complexa · setor técnico) e Prazo de entrega combinado ficam visíveis no card, que também mostra "Entrega até".
- Regra inicial de primeira resposta substituída pela definição acima: acolhimento e compromisso de entrega separados.
- Verificação: migration, recálculo e regra da 1ª resposta conferidos em PostgreSQL 16 local com a cadeia do teste de coordenação, incluindo base simulada com demandas abertas, encerradas e avisos. Novos testes de banco, interface e navegador; TypeScript, testes e build pelo CI Verificar BI do PR (ambiente desta alteração sem acesso ao registro npm).

## 2026-10-07 — Validação pelo pipeline

- Barra de etapas clicáveis no card, com percurso registrado e etapas visitadas.
- Clique ou arraste para Aguardando validação envia contexto salvo ao administrador e bloqueia a demanda até decisão.
- Administrador valida e confirma publicação com referência do deploy realizado; o card avança para Publicada. Solicitar ajustes devolve para execução.
- Publicação não executa deploy nem conclui automaticamente o atendimento: o CS ainda deve informar o cliente.
- Sem alterações dos prazos de SLA ou da carteira. Verificação: 109 testes de unidade/banco e 13 testes de navegador.

## Coordenação CS, técnica e aprovação — 2026-10-07

- Carteira compartilhada entre CS, com assunção/liberação auditada por atendimento; removida distribuição por cliente. Responsáveis e comissões existentes preservados.
- Recepção e apresentação antes da coleta/implantação, com mapeamento das etapas existentes e manutenção dos prazos contratuais.
- Encaminhamento no mesmo card para Equipe técnica, conta técnica com acesso limitado, próximo retorno/previsão, comunicação interna e evidências privadas.
- Fila de aprovação com contexto/testes/PR, seguida de confirmação manual do deploy real e pendência de aviso ao cliente. Aprovação não publica; publicação não conclui atendimento.
- Receptor assinado/idempotente de aquisição da assinatura Ikaros. Ainda sem produtor CRM e configuração em produção; vendas dos clientes do ERP não são fonte autorizada.
- Playbook de repasse factual com datas/evidências/estados separados e lacunas explícitas. Nenhum relatório histórico foi importado nesta alteração.
- Verificação local: TypeScript, 105 testes unitários/SQL/segurança e build; 11 testes Playwright com fixtures (incluem comunicação, anexo e menu técnico). Storage hospedado, cron, webhook comercial e produção requerem homologação depois da revisão. Sem alteração de SLA. Publicação no Vision autorizada diretamente por Igor em 07/10/2026, PR #1 integrado; banco atualizado e deploy solicitado.
