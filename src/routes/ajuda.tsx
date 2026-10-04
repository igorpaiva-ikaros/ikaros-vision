import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, Section } from "@/components/bi/primitives";
import { SLA_RULES, UNAVAILABLE_SLA_METRICS } from "@/lib/domain/sla";

export const Route = createFileRoute("/ajuda")({
  head: () => ({
    meta: [
      { title: "Ajuda e glossário — Ikaros BI CS" },
      { name: "description", content: "Tutorial de uso e glossário das métricas do BI de CS." },
      { property: "og:title", content: "Ajuda — Ikaros BI CS" },
      { property: "og:description", content: "Tutorial de uso e glossário das métricas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const GLOSSARY: [string, string][] = [
  ["Entradas no período", "Demandas cuja Data de entrada (fuso São Paulo) cai no período."],
  ["Concluídas no período", "Demandas com status Concluída cuja Data de conclusão cai no período. Publicada não conta como concluída."],
  ["Backlog atual", "Todas as demandas com status diferente de Concluída e Cancelada, independente do período."],
  ["Bloqueadas", "Demandas com status Bloqueada agora."],
  ["Encaminhadas para dev", "Status Encaminhada para desenvolvimento. Encaminhar não é resolver; o CS continua acompanhando."],
  ["SLA em atraso", "Backlog com 'SLA vencido?' marcado ou fórmula de status indicando atraso. Cobertura = quantas têm dados de SLA."],
  ["Registros de teste", "Demanda ou cliente com 'Registro de teste'. Excluídos por padrão; use 'Incluir testes'."],
  ["Sem informação", "O campo está vazio ou não existe na base. Nada é estimado."],
];

function Page() {
  return (
    <>
      <PageTitle title="Ajuda e glossário" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Como usar">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Entre com sua conta interna autorizada. Todos os usuários liberados têm acesso completo às mesmas telas e métricas.</li>
            <li>Escolha o período no topo: hoje, 7 dias, mês ou personalizado.</li>
            <li>Na Visão geral veja os indicadores; em Demandas filtre, busque, ordene e clique para abrir o detalhe.</li>
            <li>Em Integração, use "Atualizar agora" para ler o Notion novamente.</li>
            <li>Em Clientes → Novo cliente, informe empresa, contato e responsável de CS. O cadastro só é enviado ao Notion depois de escolher o responsável.</li>
            <li>O código do cliente é gerado no Notion. Para cadastros fictícios, marque Cadastro de teste; eles ficam fora dos indicadores por padrão.</li>
            <li>Sem conexão, use "Explorar demonstração" — sempre sinalizada com faixa âmbar.</li>
          </ol>
        </Section>
        <Section title="Regras de SLA (treinamento)">
          <ul className="space-y-1 text-sm">
            <li>1ª resposta: {SLA_RULES.firstResponseBusinessHours} horas úteis</li>
            <li>Solução ou encaminhamento: {SLA_RULES.resolutionOrForwardBusinessDays} dia útil</li>
            <li>Janela: {SLA_RULES.businessWindow}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Prazos e estados vêm das fórmulas "útil" do Notion; a origem é indicada, sem garantia de auditoria.</p>
          <h3 className="mt-4 text-sm font-semibold">Métricas indisponíveis</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {UNAVAILABLE_SLA_METRICS.map((m) => <li key={m.name}><b>{m.name}:</b> {m.reason}</li>)}
          </ul>
        </Section>
        <Section title="Glossário" className="lg:col-span-2">
          <dl className="grid gap-3 sm:grid-cols-2">
            {GLOSSARY.map(([k, v]) => <div key={k}><dt className="text-sm font-semibold">{k}</dt><dd className="text-sm text-muted-foreground">{v}</dd></div>)}
          </dl>
        </Section>
      </div>
    </>
  );
}
