// Contract policy. Native PostgreSQL computes deadlines and event states.
// Legacy demo imports retain their original timestamps.

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
