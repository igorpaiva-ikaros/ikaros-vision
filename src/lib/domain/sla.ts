// Contract policy. Deadline statuses are read from Notion. The BI mapper does
// not yet read the newly added event timestamps for compliance percentages.

export const SLA_RULES = {
  firstResponseBusinessHours: 4,
  resolutionOrForwardBusinessDays: 1,
  businessWindow: "Segunda a sexta, 09h–18h (America/Sao_Paulo), exceto feriados nacionais",
} as const;

export const UNAVAILABLE_SLA_METRICS = [
  {
    name: "Cumprimento da 1ª resposta",
    reason: "O BI ainda não lê o novo campo Primeira resposta em para calcular esta métrica.",
  },
  {
    name: "Cumprimento de solução/encaminhamento",
    reason:
      "O BI ainda não lê o novo campo Encaminhado em para calcular esta métrica.",
  },
  {
    name: "Tempo por etapa",
    reason: "Não há histórico de mudanças de status disponível na leitura atual.",
  },
] as const;
