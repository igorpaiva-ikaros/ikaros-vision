// Stable persisted values keep existing category SLA policies and historical records intact.
export const CATEGORIES = [
  {
    value: "Dúvida",
    label: "Dúvida / orientação",
    description:
      "O recurso já existe e o cliente precisa aprender a usá-lo. Oriente com um passo a passo.",
    example: "Mostrar como filtrar vendas ou cadastrar um vendedor.",
  },
  {
    value: "Bug",
    label: "Bug",
    description:
      "Uma função existente apresenta erro ou resultado incorreto. Reúna evidências e investigue a causa.",
    example: "O lead não salva ou uma informação desaparece ao editar.",
  },
  {
    value: "Pequena melhoria",
    label: "Pequena melhoria",
    description:
      "Alteração limitada no produto para melhorar uma função. Exige mudar o sistema, além de configurar recursos existentes.",
    example: "Adicionar um filtro ou ajustar a exibição de um campo.",
  },
  {
    value: "Demanda complexa",
    label: "Demanda complexa",
    description:
      "Desenvolvimento ou mudança que exige avaliação técnica aprofundada. Encaminhe pelo card com contexto e próximo retorno.",
    example:
      "Uma nova integração ou mudança ampla nas regras financeiras. A categoria não encaminha automaticamente.",
  },
  {
    value: "Configuração",
    label: "Implantação / configuração",
    description:
      "O CS prepara a operação usando recursos que já existem: cadastros, migração de dados, permissões, regras e funis.",
    example:
      "Configurar o funil pelo cliente ou importar uma base. Se exigir criar um recurso, classifique como melhoria ou desenvolvimento.",
  },
  {
    value: "Onboarding",
    label: "Onboarding",
    description:
      "Solicitação ligada à entrada e capacitação do novo cliente. O processo completo deve ser acompanhado no funil Onboarding.",
    example:
      "Agendar a apresentação inicial ou orientar a equipe na implantação. Evite duplicar a mesma atividade nos dois funis.",
  },
  {
    value: "Upgrade",
    label: "Upgrade",
    description:
      "Solicitação de evolução do plano ou dos produtos contratados. A negociação completa fica no funil Upgrades.",
    example:
      "Cliente precisa ampliar seu plano. Registre proposta, aceite e ativação no funil próprio.",
  },
] as const;
export function categoryKey(value: string | null | undefined): string {
  return value === "Suporte" ? "Dúvida" : value || "Sem categoria";
}
export function categoryInfo(value: string | null | undefined) {
  return CATEGORIES.find((c) => c.value === categoryKey(value));
}
export function categoryLabel(value: string | null | undefined) {
  return categoryInfo(value)?.label ?? value ?? "Sem categoria";
}
export function categoryCounts<T>(rows: T[], get: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>(CATEGORIES.map((c) => [c.value, 0]));
  for (const row of rows) {
    const key = categoryKey(get(row));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, value]) => ({ key, name: categoryLabel(key), value }));
}
