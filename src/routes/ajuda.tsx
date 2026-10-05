import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, Section } from "@/components/bi/primitives";
export const Route = createFileRoute("/ajuda")({
  head: () => ({ meta: [{ title: "Ajuda — Ikaros Vision" }] }),
  component: () => (
    <>
      <PageTitle title="Ajuda" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Carteira e produção">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Abra Minha carteira e encontre o cliente pelo nome ou código.</li>
            <li>Crie o registro no cliente. O responsável é preenchido automaticamente.</li>
            <li>Abra o card para editar, salvar e registrar as ações realizadas.</li>
            <li>
              Use o seletor do card para mover o Kanban. Conclusão, aceite e efetivação têm botões
              próprios.
            </li>
            <li>
              Registre interações quando houver decisão ou próxima ação importante. Use changelog
              para registrar a entrega técnica.
            </li>
          </ol>
        </Section>
        <Section title="Prazos">
          <ul className="space-y-2 text-sm">
            <li>Segunda a sexta, 9h às 18h, São Paulo; feriados nacionais não contam.</li>
            <li>Primeira resposta: 4 horas úteis. Solução ou encaminhamento: 1 dia útil.</li>
            <li>
              Onboarding: marco em 5 dias e limite de 15 dias úteis após o recebimento das
              informações completas.
            </li>
            <li>
              Pequenas melhorias: preferencialmente no mesmo dia útil. Desenvolvimento complexo
              segue prazo combinado com a equipe técnica.
            </li>
            <li>
              Aguardando cliente e bloqueios não suspendem o SLA automaticamente. Alertas internos
              são gerados a cada 5 minutos para CS e administradores.
            </li>
            <li>O atraso sinaliza o risco do cliente, preservando a etapa real do trabalho.</li>
          </ul>
        </Section>
        <Section title="Gestão e comissões">
          <p className="text-sm">
            O administrador cria contas, distribui clientes e vê todos os indicadores. O CS acessa
            somente a carteira atribuída. A distribuição transfere também os registros vinculados.
          </p>
          <p className="mt-3 text-sm">
            Para o contrato de Igor, a comissão é uma única mensalidade integral do novo plano, após
            aceite e efetivação. A nova mensalidade contratada determina o valor. Novos
            colaboradores começam sem essa regra; o administrador deve habilitá-la conforme o
            contrato.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Feather: R$ 697; Wing: R$ 1.197; Sun: R$ 2.197 como referências. NF até o último dia
            útil do mês; pagamento previsto dia 10 do mês seguinte. O Vision calcula previsões, sem
            movimentar dinheiro.
          </p>
        </Section>
        <Section title="Relatório e registros de teste">
          <p className="text-sm">
            Relatório mensal até o 5º dia útil do mês seguinte. O filtro Mostrar testes permite
            conferir os cadastros fictícios importados. Testes ficam fora das métricas e
            notificações por padrão.
          </p>
          <p className="mt-3 text-sm">
            Registros antigos sem cliente ou responsável ficam na fila de vínculos do administrador,
            até a confirmação da carteira correta.
          </p>
        </Section>
      </div>
    </>
  ),
});
