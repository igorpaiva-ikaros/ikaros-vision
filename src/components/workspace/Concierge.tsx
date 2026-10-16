import { useBi } from "@/lib/bi-context";
import { displayLabel } from "@/lib/workspace/customization";
import { useState } from "react";
import { CircleHelp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageTitle, Section } from "@/components/bi/primitives";
import { CATEGORIES } from "@/lib/domain/categories";
import { AREA_GUIDE, STAGE_GUIDE } from "@/lib/workspace/guidance";

const FIELD_HELP: Record<string, string> = {
  Nome: "Use um título curto que identifique o pedido ou problema do cliente.",
  Demanda: "Descreva o que acontece, o resultado esperado e o impacto no trabalho do cliente.",
  Classificação:
    "Escolha pela natureza do pedido. Orientar = dúvida; preparar recursos existentes = implantação; mudar o produto = melhoria; corrigir falha = bug.",
  Prioridade:
    "Indique o impacto e a urgência. Prioridade não muda automaticamente o SLA definido para a categoria.",
  Complexidade:
    "Indica a profundidade técnica. Selecionar Complexa não encaminha o card: use a ação da equipe técnica e registre o contexto.",
  "Prazo de entrega combinado (São Paulo)":
    "Previsão comunicada ao cliente. Registre a data e hora em São Paulo; a estimativa do CS não redefine a regra de SLA da empresa.",
  "Solução aplicada": "Explique o que foi feito e o resultado confirmado antes de concluir.",
  Contexto: "Registre cenário, evidências, impacto e passos para reproduzir. Não inclua senhas.",
  "Relatório de atendimento":
    "Envie o relato e os arquivos disponíveis ao agente. Ele confere cliente e duplicidade e registra o mesmo card com histórico e anexos privados, mediante acesso autorizado. Reenviar não cria outra demanda; conclusão exige fatos confirmados. Arquivos ausentes e informações desconhecidas continuam indicados.",
  "Testes realizados": "Informe os cenários verificados e os resultados observados.",
  "Resultado dos testes": "Explique o que passou, falhou e o que ainda depende de validação.",
  Cliente: "Empresa da carteira compartilhada relacionada ao atendimento.",
  Tarefa: "Ação futura: retorno, reunião, treinamento ou validação. Agendar não altera o SLA.",
  "Data e horário": "Momento do compromisso em São Paulo. O lembrete é interno ao Vision.",
  "Link do GitHub (PR ou commit)":
    "Vincule a mudança para a revisão do administrador. Registrar uma aprovação não executa merge ou deploy.",
};
export function fieldHelp(label: string) {
  return (
    FIELD_HELP[label.replace(/\s*\*$/, "")] ??
    "Preencha com as informações reais deste atendimento. Consulte o Concierge para entender o fluxo da área."
  );
}
export function HelpHint({ text, label = "Explicação" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={text}
          className="inline-flex shrink-0 rounded p-1 text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="tooltip"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-xs text-sm"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
const menus = [
  {
    id: "crm",
    title: "CRM",
    description:
      "Espaço de execução: acompanhe demandas, onboarding e upgrades em seus funis. Categoria descreve o tipo de pedido; etapa mostra o avanço do trabalho.",
    children: ["demands", "onboardings", "upgrades"],
  },
  ...(["clients", "tasks", "interactions", "changelog"] as const).map((id) => ({
    id,
    title: AREA_GUIDE[id].label,
    description: AREA_GUIDE[id].description,
    children: [],
  })),
  {
    id: "tecnico",
    title: "Equipe técnica",
    description:
      "Casos encaminhados com contexto, evidências e próximo retorno. O CS acompanha a solução; a equipe técnica atualiza etapa e previsão. Encaminhar não conclui o atendimento.",
    children: [],
  },
  {
    id: "aprovacoes",
    title: "Aprovações e publicações",
    description:
      "Fila do administrador para revisar mudanças, solicitar ajustes e confirmar publicação real. PR aprovada, mudança publicada e cliente informado são marcos distintos.",
    children: [],
  },
  {
    id: "bi",
    title: "Visão geral e indicadores",
    description:
      "O administrador acompanha entradas no período, backlog, categorias, responsáveis e prazos. Backlog é o trabalho aberto agora; entradas consideram a data de recebimento e o período escolhido.",
    children: [],
  },
  {
    id: "clientes",
    title: "Clientes no BI",
    description:
      "Consulte a carteira e a situação dos clientes. A carteira é compartilhada; cada demanda tem um responsável próprio.",
    children: [],
  },
  {
    id: "equipe",
    title: "Equipe",
    description:
      "Acompanhe os atendimentos e resultados por colaborador. A criação de acessos e permissões fica na Administração.",
    children: [],
  },
  {
    id: "administracao",
    title: "Administração",
    description:
      "Administradores configuram equipe e acessos, nomes e funis do CRM, produtos e SLA. Em CRM e linguagem, salve um rascunho, confira a prévia e publique para a equipe. Líderes de CS recebem apenas as permissões que o administrador delegar.",
    children: [],
  },
  {
    id: "integracao",
    title: "Migração",
    description:
      "Área administrativa para importar dados históricos e tratar vínculos pendentes. O Vision é a fonte da operação atual.",
    children: [],
  },
  {
    id: "notificacoes",
    title: "Notificações",
    description:
      "Alertas internos de prazo, tarefas, comentários e aprovação. Abrir um aviso não registra a entrega nem envia mensagem ao WhatsApp.",
    children: [],
  },
];
export const NAV_HELP: Record<string, string> = Object.fromEntries(
  menus.map((m) => [m.title, m.description]),
);
export function Concierge() {
  const { presentation } = useBi();
  const [selected, setSelected] = useState("crm");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("demands");
  const current = menus.find((m) => m.id === selected)!;
  const match = (s: string) =>
    s.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  const stages = Object.entries(STAGE_GUIDE).filter(([s]) =>
    area === "onboardings"
      ? /^\d|Não iniciado|Em andamento|Em validação|Bloqueado|Concluído/.test(s)
      : area === "upgrades"
        ? [
            "Oportunidade identificada",
            "Em conversa",
            "Proposta apresentada",
            "Aceito",
            "Efetivado",
            "Perdido",
          ].includes(s)
        : !/^\d/.test(s) &&
          ![
            "Não iniciado",
            "Em andamento",
            "Em validação",
            "Bloqueado",
            "Concluído",
            "Oportunidade identificada",
            "Em conversa",
            "Proposta apresentada",
            "Aceito",
            "Efetivado",
            "Perdido",
          ].includes(s),
  );
  return (
    <>
      <PageTitle
        title="Concierge"
        subtitle="Entenda cada área, categoria e etapa. Consulte quando precisar, sem sair do seu fluxo."
      />
      <Input
        aria-label="Buscar no Concierge"
        placeholder="Buscar uma área, categoria, campo ou etapa…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-5 max-w-xl"
      />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Áreas do Concierge" className="flex gap-2 overflow-x-auto lg:flex-col">
          {menus.map((m) => (
            <Button
              key={m.id}
              variant={selected === m.id ? "secondary" : "ghost"}
              className="shrink-0 justify-start whitespace-normal text-left"
              aria-pressed={selected === m.id}
              onClick={() => {
                setSelected(m.id);
                setQuery("");
              }}
            >
              {m.title}
            </Button>
          ))}
        </nav>
        <div className="space-y-4">
          {query ? (
            <Section title="Resultados da busca">
              {[
                ...menus.map((m) => ({ title: m.title, text: m.description })),
                ...CATEGORIES.map((c) => ({
                  title: displayLabel(presentation, "category", c.value, c.label),
                  text: c.description + " Exemplo: " + c.example,
                })),
                ...Object.entries(STAGE_GUIDE).map(([title, text]) => ({ title, text })),
                ...Object.entries(FIELD_HELP).map(([title, text]) => ({ title, text })),
              ]
                .filter((x) => match(x.title + " " + x.text))
                .map((x, i) => (
                  <article key={i} className="border-b py-3">
                    <h3 className="font-medium">{x.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{x.text}</p>
                  </article>
                ))}
              <p className="mt-3 text-xs text-muted-foreground">
                Se não encontrou, tente outro termo ou escolha uma área.
              </p>
            </Section>
          ) : (
            <>
              <Section title={current.title}>
                <p className="text-sm text-muted-foreground">{current.description}</p>
              </Section>
              {selected === "crm" && (
                <>
                  <div role="group" aria-label="Áreas do CRM" className="flex gap-2">
                    {current.children.map((id) => (
                      <Button
                        key={id}
                        variant={area === id ? "secondary" : "outline"}
                        onClick={() => setArea(id)}
                      >
                        {displayLabel(
                          presentation,
                          "pipeline",
                          id,
                          AREA_GUIDE[id as keyof typeof AREA_GUIDE].label,
                        )}
                      </Button>
                    ))}
                  </div>
                  <Section
                    title={displayLabel(
                      presentation,
                      "pipeline",
                      area,
                      AREA_GUIDE[area as keyof typeof AREA_GUIDE].label,
                    )}
                  >
                    <p className="text-sm">
                      {AREA_GUIDE[area as keyof typeof AREA_GUIDE].description}
                    </p>
                  </Section>
                  {area === "demands" && (
                    <Section title="Qual categoria escolher?">
                      <div className="grid gap-3 md:grid-cols-2">
                        {CATEGORIES.map((c) => (
                          <article key={c.value} className="rounded-lg border p-4">
                            <h3 className="font-semibold text-sm">
                              {displayLabel(presentation, "category", c.value, c.label)}
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                              Função original: {c.label}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                            <p className="mt-2 text-xs">Exemplo: {c.example}</p>
                          </article>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Registros antigos de Suporte aparecem junto de Dúvida / orientação nos
                        filtros e indicadores. A categoria histórica e sua regra de SLA são
                        preservadas.
                      </p>
                    </Section>
                  )}
                  <Section title="Etapas do funil">
                    <div className="space-y-3">
                      {stages.map(([name, text]) => (
                        <details key={name} className="rounded-lg border p-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            {displayLabel(presentation, area, name)}
                          </summary>
                          <p className="mt-2 text-sm text-muted-foreground">{text}</p>
                        </details>
                      ))}
                    </div>
                  </Section>
                  {area === "demands" && (
                    <Section title="Campos do atendimento">
                      {Object.entries(FIELD_HELP).map(([name, text]) => (
                        <details key={name} className="border-b py-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            {displayLabel(presentation, area, name)}
                          </summary>
                          <p className="mt-2 text-sm text-muted-foreground">{text}</p>
                        </details>
                      ))}
                    </Section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
