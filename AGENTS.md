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

Relatórios de atendimento enviados pelo usuário seguem `docs/AGENT-REPORT-CONTRACT.txt` e `docs/AGENT-REPORT-INTAKE.md`. O agente prepara os fatos e anexos disponíveis fora do Git, consulta cliente e duplicidade e usa `scripts/agent-reports.mjs` com sessão autorizada. Reenvios usam a mesma identidade externa; atualizações complementam o histórico sem substituir movimentos manuais. Não inventar datas/horários, aceite, deploy ou anexos ausentes. A entrada exige a migration do recebimento aplicada e o aplicativo publicado; arquivos preparados ou testes locais não comprovam registro real. Se faltarem sessão, rede ou publicação, concluir o trabalho independente e informar o bloqueio exato, sem usar service role como alternativa.
