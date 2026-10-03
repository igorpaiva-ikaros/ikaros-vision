// Synthetic demo data. Deterministic, obviously fictitious names, always
// flagged source:"demo". Never mixed with real data.
import type { Client, Dataset, Demand } from "../domain/types";
import { CLASSIFICATIONS, PRIORITIES } from "../domain/types";
import { addDays, todayKey } from "../domain/period";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const TEAM = [
  { id: "demo-u1", name: "Analista Demo 1" },
  { id: "demo-u2", name: "Analista Demo 2" },
  { id: "demo-u3", name: "Analista Demo 3" },
];

const CLIENT_NAMES = [
  "Corretora Exemplo Alfa",
  "Corretora Exemplo Beta",
  "Consórcios Fictícios Gama",
  "Seguros Demonstração Delta",
  "Corretora Modelo Épsilon",
  "Consórcio Ilustrativo Zeta",
];

export function buildDemoDataset(now: Date = new Date()): Dataset {
  const r = rng(42);
  const pick = <T,>(arr: readonly T[]) => { if (!arr.length) throw new Error("Empty demo options"); return arr[Math.floor(r() * arr.length)]!; };
  const today = todayKey(now);

  const clients: Client[] = CLIENT_NAMES.map((name, i) => ({
    id: `demo-c${i + 1}`,
    notionUrl: null,
    name: `${name} (demo)`,
    empresa: name,
    idErp: `DEMO-${100 + i}`,
    slugErp: `demo-${i + 1}`,
    contatoPrincipal: `Contato Demo ${i + 1}`,
    emailEmpresa: `contato@exemplo${i + 1}.example`,
    telefoneEmpresa: null,
    emailContato: i % 3 === 2 ? null : `pessoa${i + 1}@exemplo${i + 1}.example`,
    telefoneContato: null,
    whatsappContato: null, // no fake phone numbers, even in demo
    segmentos: i % 2 ? ["Consórcio"] : ["Seguros", "Consórcio"],
    plano: pick(["Feather", "Wing", "Sun"]),
    status: i === 5 ? "Em onboarding" : "Ativo",
    responsaveis: [TEAM[i % TEAM.length]!],
    isTest: false,
  }));
  clients.push({
    ...clients[0]!,
    id: "demo-ctest",
    name: "Cliente de teste interno (demo)",
    empresa: "Teste",
    idErp: null,
    isTest: true,
  });

  const openStatuses = [
    "Nova", "Em triagem", "Aguardando informação", "Em execução", "Aguardando validação",
    "Encaminhada para desenvolvimento", "Publicada", "Aguardando cliente", "Bloqueada",
  ];
  const demands: Demand[] = [];
  for (let i = 0; i < 64; i++) {
    const created = addDays(today, -Math.floor(r() * 40));
    const closed = r() < 0.45;
    const status = closed ? (r() < 0.9 ? "Concluída" : "Cancelada") : pick(openStatuses);
    const completed =
      status === "Concluída" ? addDays(created, Math.floor(r() * 5)) : null;
    const client = i === 7 ? clients[clients.length - 1]! : clients[i % CLIENT_NAMES.length]!;
    const hasSla = r() < 0.8;
    const overdue = hasSla && !closed && r() < 0.25;
    demands.push({
      id: `demo-d${i + 1}`,
      notionUrl: null,
      title: `Demanda demonstrativa ${i + 1} — ${pick(["ajuste de relatório", "erro na emissão", "dúvida de cadastro", "configuração de comissão", "onboarding de equipe"])}`,
      demandCode: `DEMO-${i + 1}`,
      clientIds: [client.id],
      responsaveis: r() < 0.08 ? [] : [pick(TEAM)],
      createdAt: `${created}T${String(8 + Math.floor(r() * 10)).padStart(2, "0")}:15:00-03:00`,
      completedAt: completed && completed > today ? today : completed,
      publishedAt: status === "Publicada" ? addDays(created, 2) : null,
      dueDate: addDays(created, 3),
      priority: pick(PRIORITIES),
      classification: pick(CLASSIFICATIONS),
      channel: pick(["WhatsApp", "E-mail", "Reunião", null]),
      technicalType: pick(["Pequena", "Complexa", null]),
      complexity: null,
      description: "Texto sintético de demonstração. Não representa nenhum cliente real.",
      context: null,
      impact: pick(["Baixo", "Médio", "Alto", null]),
      solution: closed ? "Solução fictícia registrada para demonstração." : null,
      testsRun: null,
      testResult: null,
      clientInformed: closed ? true : r() < 0.3,
      clientValidated: status === "Concluída" ? r() < 0.85 : false,
      isTest: i === 11,
      status,
      sla: {
        statusUtil: hasSla ? (overdue ? "Vencido" : closed ? "Encerrado" : "No prazo") : null,
        prazoFinalEfetivo: hasSla ? addDays(created, 1) : null,
        prazoPrimeiraResposta: hasSla ? `${created}T12:00:00-03:00` : null,
        prazoSolucao: hasSla ? addDays(created, 1) : null,
        statusSla: null,
        vencido: hasSla ? overdue : null,
      },
    });
  }
  return { source: "demo", fetchedAt: now.toISOString(), demands, clients, schemaWarnings: [] };
}

