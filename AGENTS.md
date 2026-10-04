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

O Notion é a fonte operacional. O BI lê demandas e clientes e permite cadastro manual de clientes, autorizado pelo usuário, com responsável de CS obrigatório e escrita apenas no servidor autenticado. Não misture demonstração com dados reais. Exclua registros de teste na demanda ou no cliente por padrão. Documente alterações de métricas no tutorial e README.

Antes de enviar alterações execute `npm run check` e os testes de navegador quando afetar navegação, dados ou acesso. Use o package-lock e npm. Preserve commits publicados e a branch sincronizada do Lovable.
