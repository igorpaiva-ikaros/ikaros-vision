# Coordenação da operação CS

## Fluxo de venda e recepção

Confirmar uma aquisição da assinatura Ikaros no CRM comercial da própria Ikaros → receptor autenticado → carteira compartilhada e onboarding não atribuído → CS assume → recepção e apresentação → dados recebidos → cadastro, configuração, migração e demais etapas existentes.

Não enviar vendas de consórcios/seguros dos clientes do ERP para essa integração. Não confundir o ID do contato no CRM com o ID da empresa/tenant do ERP. O primeiro identifica `sales_customer_ref`; `erpCompanyId` só deve ser enviado quando conhecido e comprovado. O plano fica vazio quando não comprovado; o cadastro manual seleciona o catálogo existente.

Receptor implementado, produtor comercial ainda NÃO conectado. Confirmar qual CRM comercial está em uso, a empresa de origem e o evento que representa assinatura efetivamente adquirida. Não confiar apenas em uma mudança genérica de etapa. O produtor deve usar uma outbox gravada na mesma transação da confirmação, enviar após commit, retentar com o mesmo saleId e payload, guardar recibo e encaminhar falhas para revisão. Revisões de payload da mesma venda geram conflito em vez de alterar dados silenciosamente.

### Contrato do receptor

POST `/api/sales`, JSON até 32 KiB, cabeçalhos `x-ikaros-timestamp` (epoch segundos) e `x-ikaros-signature` (hex HMAC-SHA256 do timestamp + "." + corpo bruto). Janela de 5 minutos; retentativas geram novo timestamp e assinatura, mantendo saleId e conteúdo. Repetições devolvem os mesmos IDs. Não enviar segredo ao navegador.

Configuração exclusivamente no servidor: `IKAROS_SALES_WEBHOOK_SECRET` (mínimo 32 caracteres aleatórios), `IKAROS_SALES_COMPANY_ID` (origem comercial autorizada), além das variáveis Supabase server-only já existentes no projeto. Não colocar em VITE_ ou Git. Payload:

```json
{
  "event": "ikaros.sale.confirmed",
  "sourceCompanyId": "ID da empresa comercial Ikaros",
  "saleId": "ID estável da venda",
  "customerId": "ID estável do cliente no CRM comercial",
  "companyName": "Nome real da empresa adquirente",
  "confirmedAt": "2026-10-07T12:00:00-03:00"
}
```

Campos opcionais, só quando comprovados: erpCompanyId (UUID), contactName, email, phone. Identidade é sourceCompanyId + customerId; recibo é sourceCompanyId + saleId. O campo confirmedAt é preservado no histórico, não substitui data de recebimento dos dados para o SLA de implantação. O receptor não inventa contato, plano, responsável ou data de primeira resposta.

## Carteira e responsabilidade

Todos os CS ativos leem e cadastram clientes na mesma carteira. `clients.owner_id` é legado e fica nulo; cadastros de clientes não distribuem carteira. Registros novos feitos por CS pertencem ao criador; registros comerciais/admin sem responsável aguardam assunção. `claim_record` usa lock + versão e auditoria; dois CS não podem assumir o mesmo registro. CS edita/move apenas registro próprio, liberando-o quando precisar repassar. Administrador acompanha e pode intervir. Responsáveis de registros existentes e snapshots de comissão são preservados. Tarefas agendadas notificam quem as criou, sem depender de dono de carteira.

## Equipe técnica e previsões

Encaminhar pelo card da demanda existente. A fila Equipe técnica mostra outra perspectiva da mesma demanda, sem duplicar atendimento. Exige contexto/impacto e data do próximo retorno. Conta technical criada pela administração acessa somente casos encaminhados, nome/código da empresa, descrição, responsável CS, anexos e conversa desse caso. Não lê carteira completa, dados de contato, BI ou finanças. Os membros técnicos compartilham a fila encaminhada; primeiro técnico que atualiza assume o caso.

Recebida → Em análise → Em desenvolvimento → Bloqueada ou Pronta para validação. Durante desenvolvimento a previsão de entrega é obrigatória. Se uma previsão já informada mudar/remover, exigir justificativa; bloqueio também exige motivo. Pronta para validação exige resultado e testes. Próximo retorno é compromisso de atualização, não promessa de entrega. Sem prazo técnico confirmado mostrar "A confirmar", comunicar ao cliente o próximo retorno e só prometer entrega confirmada.

Mensagens têm autor e horário gerados pelo servidor. Anexos são privados, até 50 MB, com escopo por demanda e URL de download de 60 segundos. Metadados só registrados após conferir objeto, uploader, tamanho e MIME. Objeto registrado não pode ser apagado pelo mecanismo de limpeza de upload órfão. Acesso privado não substitui antivírus: análise de conteúdo não implementada. Para contexto sensível, revisar evidências antes de encaminhar a terceiros.

Previsão/retorno próximo do vencimento (limiar atual de risco) ou vencido gera alerta adicional e risco visual do cliente. As regras contratuais atuais de SLA NÃO mudam. A migration agenda verificação a cada 5 minutos somente quando pg_cron existe; verificar job em homologação. Sem extensão é necessário agendamento server-side da RPC service-only delivery_deadline_tick. Realtime, quando a publicação Supabase existe, invalida consultas; polling de 15s é fallback das filas/contexto.

## Aprovação, publicação e comunicação

CS responsável → Enviar para aprovação (resumo, testes, URL GitHub de PR/commit) → Pedro/admin aprova ou pede ajustes com motivo → Aprovadas para o lote → deploy real ao final do dia → admin registra referência de publicação → Publicada / avisar cliente → CS valida, registra solução, avisa cliente → conclui.

Aprovar e registrar publicação são eventos do Vision; não executam merge nem deploy. Não foi criada integração que detecte GitHub Actions automaticamente. O admin confere PR/commit e registra o resultado real. Cada card tem empresa, contexto, link e evidências. O lote pode ser publicado uma vez e sua referência registrada em cada demanda correspondente. Não prometer entrega só porque o código está pronto. Mudança sem deploy não é atendimento concluído; atendimento publicado sem comunicação permanece aberto.

## Implantação coordenada

Esta alteração deve ser revisada em branch/PR e só publicada após aprovação do Pedro. Não aplicar migrations de produção isoladamente com frontend antigo: alteração de carteira e etapas é compatível com a nova UI, não com as suposições da UI anterior.

1. Backup e homologação com contas admin, dois CS e technical; nenhum cliente real em fixtures.
2. Aplicar migrations em ordem 20261007080000 a 20261007080500; a adição do enum technical deve ser commitada antes do arquivo seguinte. Não juntar todas em uma transação única.
3. Conferir RLS, bucket privado, realtime e cron; executar testes de homologação com upload/download real. A suíte local simula Storage e não prova bucket hospedado ou notificações de produção.
4. Publicar aplicação no lote aprovado; observar fluxos existentes e migração das etapas de onboarding. Preservar SLA/configurações e dados.
5. Ativar integração comercial somente depois de produtor, origem autorizada, segredo server-only, retentativas e teste real acordados.

Relatórios históricos ainda não recebidos. Importação histórica precisa validar cliente/identidade/proveniência e tratar timestamps desconhecidos explicitamente; não usar criação comum para inventar data original de recebimento ou retrospectivamente cumprir SLA. O playbook separado define esses dados.
