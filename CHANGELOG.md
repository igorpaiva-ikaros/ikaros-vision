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
