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
