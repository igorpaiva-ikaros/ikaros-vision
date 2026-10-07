
## Coordenação CS, técnica e aprovação — proposta 2026-10-07

- Carteira compartilhada entre CS, com assunção/liberação auditada por atendimento; removida distribuição por cliente. Responsáveis e comissões existentes preservados.
- Recepção e apresentação antes da coleta/implantação, com mapeamento das etapas existentes e manutenção dos prazos contratuais.
- Encaminhamento no mesmo card para Equipe técnica, conta técnica com acesso limitado, próximo retorno/previsão, comunicação interna e evidências privadas.
- Fila de aprovação com contexto/testes/PR, seguida de confirmação manual do deploy real e pendência de aviso ao cliente. Aprovação não publica; publicação não conclui atendimento.
- Receptor assinado/idempotente de aquisição da assinatura Ikaros. Ainda sem produtor CRM e configuração em produção; vendas dos clientes do ERP não são fonte autorizada.
- Playbook de repasse factual com datas/evidências/estados separados e lacunas explícitas. Nenhum relatório histórico foi importado nesta alteração.
- Verificação local: TypeScript, 105 testes unitários/SQL/segurança e build; 11 testes Playwright com fixtures (incluem comunicação, anexo e menu técnico). Storage hospedado, cron, webhook comercial e produção requerem homologação depois da revisão. Sem alteração de SLA e sem deploy nesta entrega.
