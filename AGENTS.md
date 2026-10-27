<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


# Ikaros Vision

Responda em português. Preserve acesso interno e RLS: nenhuma leitura real sem sessão e papel autorizado. Não coloque credenciais em VITE_, bundles públicos, código, testes ou GitHub. Não use o banco do ERP.

O Ikaros Vision é a fonte operacional, por determinação do usuário. O Notion é histórico e origem de importação incremental, sem sobrescrever edições nativas. Administradores acessam o BI global e administram contas e carteiras; CS acessa a carteira compartilhada, com RLS, e assume demandas individualmente. Edição do registro exige CS responsável ou administrador; assunção/liberação usa RPC auditada. Equipe técnica só acessa casos encaminhados, sem BI, finanças ou carteira. Eventos e encerramentos devem usar RPC auditada, com controle de versão. Não misture testes com métricas reais.

Antes de enviar alterações execute `npm run check` e os testes de navegador quando afetar navegação, dados ou acesso. Use o package-lock e npm. Preserve commits publicados e a branch sincronizada do Lovable.

Para mudanças do ERP atendidas pelo CS, publicação em lote depende de aprovação do administrador. Mudanças do próprio Ikaros Vision podem ser publicadas mediante autorização explícita do Igor; não exigir aprovação adicional do Pedro nesses casos. Registrar aprovação ou deploy no Vision não executa publicação nem merge. Não marcar demanda concluída antes de confirmar entrega e cliente informado.

Personalização usa chaves estáveis e rótulos em workspace_presentation; nunca substituir etapas ou classificações persistidas por rótulos. Rascunho é privado ao administrador. Líder permanece role=cs com member_access; não tratar liderança como admin e não expandir is_admin/is_internal para permitir indicadores de equipe. Funis personalizados são visões filtradas; não replicar cards. Atalhos ocultos são organização visual, não isolamento entre colegas. Dados is_test são reservados ao admin no banco.

Demandas gerais usam scope=system e client_id NULL; jamais criar cliente fictício para trabalho interno. Origem imutável, SLA de solução/entrega por categoria preservado, primeira resposta e aviso ao cliente não se aplicam. Agenda sem cliente exige vínculo com uma demanda geral.

Transferência de demandas: o colaborador CS responsável solicita (destino CS ativo e motivo) e a demanda continua com ele até a decisão; administrador ou líder com `member_access.manage_demand_transfers` (concedida só pelo administrador, exige `is_lead`, zerada ao remover a liderança) aprova, recusa com motivo ou transfere direto. Toda troca de responsável de demanda passa pelas RPCs `request_demand_transfer`, `cancel_demand_transfer`, `decide_demand_transfer` e `transfer_demand` (auth.uid(), lock, versão, auditoria em workflow_history); a tabela `demand_transfer_requests` é somente leitura para a API. A transferência troca apenas o responsável (inclusive com validação travada) e não muda etapa, SLA, entrega ou anexos; `guard_operation_row` conserva os quatro prazos SLA (OLD) sempre que `app.transfer` ou `app.assignment` está ativo, para que mudança de política entre a criação e a troca não recalcule prazos. Liberar demanda pela `claim_record` é exclusivo de quem gerencia transferências; assumir demanda sem responsável e onboarding/upgrade seguem as regras anteriores.

Projetos da equipe (`/projetos`): só administradores e CS ativos (`is_operator`) leem; equipe técnica não. Tabelas `team_project*` são somente leitura para a API e toda gravação passa pelas RPCs `save_team_project`, `move_team_project`, `save_team_project_step`, `remove_team_project_step`, `reorder_team_project_steps`, `set_team_project_step_done`, `post_team_project_message` e `register_team_project_file`, com versão do projeto e registro em `team_project_activity`. Gerência = administrador, quem criou ou responsável (`team_project_can_manage`); responsável pela etapa conclui a própria etapa e move só entre situações abertas. Concluir exige etapas concluídas; cancelar exige motivo; projeto encerrado não aceita edição até ser reaberto. Não criar projetos para trabalho de cliente: demanda de cliente continua no CRM.
