import { ExternalLink } from "lucide-react";
import type { Client, Demand } from "@/lib/domain/types";
import { clientName, slaOverdue } from "@/lib/domain/metrics";
import { formatDateTime } from "@/lib/domain/period";
import { mailtoLink, whatsappLink } from "@/lib/domain/contact";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bool, Val } from "./primitives";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
const Txt = ({ v }: { v: string | null }) => <p className="whitespace-pre-wrap text-sm"><Val v={v} /></p>;

export function ContactLinks({ c }: { c: Client }) {
  const mails = [mailtoLink(c.emailContato), mailtoLink(c.emailEmpresa)].filter(Boolean) as string[];
  const wa = whatsappLink(c.whatsappContato);
  if (!mails.length && !wa) return <span className="text-xs italic text-muted-foreground">Sem contato válido</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {mails.map((m) => (
        <a key={m} href={m} className="text-xs text-primary underline underline-offset-2">{m.replace("mailto:", "")}</a>
      ))}
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">WhatsApp</a>}
    </div>
  );
}

export function DemandDetail({
  demand, clients, onClose,
}: { demand: Demand | null; clients: Map<string, Client>; onClose: () => void }) {
  const d = demand;
  const overdue = d ? slaOverdue(d) : null;
  return (
    <Sheet open={!!d} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {d && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{d.demandCode ?? "Sem ID"}</Badge>
                {d.status && <Badge>{d.status}</Badge>}
                {d.isTest && <Badge variant="outline">Registro de teste</Badge>}
              </div>
              <SheetTitle className="font-display text-xl">{d.title ?? "Sem título"}</SheetTitle>
              <SheetDescription>
                {d.classification ?? "Sem classificação"} · Prioridade {d.priority ?? "sem informação"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-8">
              {d.notionUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={d.notionUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Abrir no Notion</a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Registro de demonstração — sem página no Notion.</p>
              )}
              <Block title="Descrição">
                <Txt v={d.description} />
                <dl className="mt-2">
                  <Row k="Contexto" v={<Val v={d.context} />} />
                  <Row k="Impacto" v={<Val v={d.impact} />} />
                  <Row k="Canal de origem" v={<Val v={d.channel} />} />
                  <Row k="Tipo técnico" v={<Val v={d.technicalType} />} />
                  <Row k="Complexidade" v={<Val v={d.complexity} />} />
                </dl>
              </Block>
              <Block title="Cliente">
                {d.clientIds.length === 0 && <Val v={null} />}
                {d.clientIds.map((id) => {
                  const c = clients.get(id);
                  return (
                    <div key={id} className="mb-2 rounded-md bg-secondary/60 p-3">
                      <div className="font-medium">{clientName(c)}</div>
                      {c && (
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <div>Contato: {c.contatoPrincipal ?? "Sem informação"} · Plano: {c.plano ?? "Sem informação"}</div>
                          <ContactLinks c={c} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </Block>
              <Block title="Datas e responsável">
                <dl>
                  <Row k="Responsável" v={<Val v={d.responsaveis.map((p) => p.name ?? "Sem nome").join(", ") || null} />} />
                  <Row k="Entrada" v={formatDateTime(d.createdAt)} />
                  <Row k="Prazo final" v={formatDateTime(d.dueDate)} />
                  <Row k="Publicação" v={formatDateTime(d.publishedAt)} />
                  <Row k="Conclusão" v={formatDateTime(d.completedAt)} />
                  <Row k="Cliente informado?" v={<Bool v={d.clientInformed} />} />
                  <Row k="Cliente validou?" v={<Bool v={d.clientValidated} />} />
                </dl>
                {d.status === "Publicada" && (
                  <p className="mt-2 text-xs text-muted-foreground">Publicada não significa concluída: a conclusão exige comunicação e validação do cliente.</p>
                )}
              </Block>
              <Block title="SLA (fórmulas do Notion)">
                <dl>
                  <Row k="Situação" v={overdue === null ? <Val v={null} /> : overdue ? <span className="font-medium text-destructive">Em atraso</span> : "Sem atraso indicado"} />
                  <Row k="Status SLA útil" v={<Val v={d.sla.statusUtil} />} />
                  <Row k="Status do SLA" v={<Val v={d.sla.statusSla} />} />
                  <Row k="Prazo 1ª resposta" v={formatDateTime(d.sla.prazoPrimeiraResposta)} />
                  <Row k="Prazo solução" v={formatDateTime(d.sla.prazoSolucao)} />
                  <Row k="Prazo final efetivo" v={formatDateTime(d.sla.prazoFinalEfetivo)} />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">Valores lidos das fórmulas/campos da base. O cumprimento real não é calculado por falta de horários de resposta e encaminhamento.</p>
              </Block>
              <Block title="Solução e testes">
                <dl>
                  <Row k="Solução aplicada" v={<Val v={d.solution} />} />
                  <Row k="Testes executados" v={<Val v={d.testsRun} />} />
                  <Row k="Resultado" v={<Val v={d.testResult} />} />
                </dl>
              </Block>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
