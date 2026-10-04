// Training SLA rules. These are documentation of the policy, not computed
// compliance: the Notion base has no real first-response / forwarding
// timestamps, so compliance metrics are reported as unavailable.

export const SLA_RULES = {
  firstResponseBusinessHours: 4,
  resolutionOrForwardBusinessDays: 1,
  businessWindow: "Segunda a sexta, 09h–18h (America/Sao_Paulo), exceto feriados nacionais",
} as const;

export const UNAVAILABLE_SLA_METRICS = [
  {
    name: "Cumprimento da 1ª resposta",
    reason: "Não há campo com o horário real da primeira resposta ao cliente.",
  },
  {
    name: "Cumprimento de solução/encaminhamento",
    reason:
      "Não há campo com o horário real do encaminhamento ao desenvolvimento. Encaminhar não é resolver.",
  },
  {
    name: "Tempo por etapa",
    reason: "Não há histórico de mudanças de status disponível na leitura atual.",
  },
] as const;
