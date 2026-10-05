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

O Ikaros Vision é a fonte operacional, por determinação do usuário. O Notion é histórico e origem de importação incremental, sem sobrescrever edições nativas. Administradores acessam o BI global e administram contas e carteiras; CS acessa apenas clientes e registros da carteira atual, com RLS. Atribuição exige CS ativo. Eventos e encerramentos devem usar RPC auditada, com controle de versão. Não misture testes com métricas reais.

Antes de enviar alterações execute `npm run check` e os testes de navegador quando afetar navegação, dados ou acesso. Use o package-lock e npm. Preserve commits publicados e a branch sincronizada do Lovable.
