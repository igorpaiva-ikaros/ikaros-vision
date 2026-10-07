import type { OperationTab, Entity, RecordRow } from "./types";
export const AREA_GUIDE: Record<OperationTab, { label: string; description: string }> = {
  clients: {
    label: "Carteira",
    description:
      "Encontre seu cliente, confira o contato e crie o atendimento a partir dele. A carteira é compartilhada; cada atendimento tem seu próprio responsável.",
  },
  demands: {
    label: "Demandas",
    description:
      "Organize dúvidas, suporte, bugs e melhorias. Registre a primeira resposta, acompanhe o SLA e conclua após informar a solução ao cliente.",
  },
  onboardings: {
    label: "Onboarding",
    description:
      "Implante o ERP: dados, cadastro, configurações, migração e treinamento. Os prazos começam quando todas as informações forem recebidas.",
  },
  upgrades: {
    label: "Upgrades",
    description:
      "Acompanhe a necessidade de mudar de plano, apresente a proposta e registre o aceite e a efetivação para conferir a comissão.",
  },
  interactions: {
    label: "Conversas e decisões",
    description:
      "Registre decisões e próximos passos de conversas relevantes. Use a agenda para lembrar o retorno; não é necessário copiar todo o atendimento.",
  },
  changelog: {
    label: "Histórico de entregas",
    description:
      "Registre o que foi entregue ou corrigido, a versão e o resultado dos testes. Vincule à demanda para manter o histórico da entrega.",
  },
  tasks: {
    label: "Tarefas",
    description:
      "Agende retornos, ligações, reuniões, treinamentos e validações. Horários de São Paulo; lembretes internos chegam ao responsável pela tarefa.",
  },
};
export const STAGE_GUIDE: Record<string, string> = {
  "1. Recepção e apresentação":
    "Recepcione o cliente, apresente a plataforma e crie o grupo de suporte.",
  "Aguardando aprovação": "Gestão revisa mudança, contexto e testes.",
  "Aprovada para publicação": "Aguarde a publicação do lote aprovado.",
  "Publicada / avisar cliente": "Valide a entrega e avise o cliente antes de concluir.",
  Nova: "Demanda recebida. Confira o relato e responda ao cliente.",
  "Em triagem": "Entenda o problema, classifique e defina o próximo passo.",
  "Aguardando informação": "Solicite os dados que faltam e agende um retorno.",
  "Em execução": "Execute o atendimento ou acompanhe a correção.",
  "Aguardando validação": "Confira os testes e peça a validação da entrega.",
  "Encaminhada para desenvolvimento": "Acompanhe a equipe técnica e combine o prazo de entrega.",
  Publicada: "A entrega está disponível. Informe e valide com o cliente.",
  "Aguardando cliente": "Aguarde o retorno e mantenha uma tarefa de acompanhamento.",
  Bloqueada: "Registre o impedimento e acione quem pode desbloquear.",
  Concluída: "Solução registrada e cliente informado. Atendimento encerrado.",
  Cancelada: "Atendimento encerrado com o motivo registrado.",
  "Não iniciado": "Receba os dados necessários para começar a implantação.",
  "Em andamento": "Avance nas etapas de produção e acompanhe o prazo.",
  "Em validação": "Valide a implantação com o cliente antes de concluir.",
  Bloqueado: "Resolva o impedimento e agende o acompanhamento.",
  Concluído: "Implantação concluída e entregue ao cliente.",
  "Oportunidade identificada": "Entenda por que o cliente precisa de um plano maior.",
  "Em conversa": "Confirme a necessidade e apresente os benefícios do plano.",
  "Proposta apresentada": "Apresente o valor e acompanhe a decisão.",
  Aceito: "Aceite registrado. Acompanhe a ativação do novo plano.",
  Efetivado: "Novo plano ativado; confira a comissão prevista e devida.",
  Perdido: "O cliente não avançou com a proposta. Registre o contexto.",
  "2. Dados recebidos": "Confira se todas as informações para implantar estão completas.",
  "3. Cadastro": "Cadastre empresa, equipe e informações iniciais do cliente.",
  "4. Configuração": "Configure acessos, regras e funis necessários à operação.",
  "5. Migração": "Importe e confira os dados de clientes e vendas.",
  "6. Conexão WhatsApp": "Conecte e teste o canal de atendimento contratado.",
  "7. Configuração da IA": "Configure a IA quando contratada e valide as respostas.",
  "8. Treinamento": "Treine os usuários no fluxo que irão executar.",
  "9. Validação": "Confira a operação com o cliente e ajuste as pendências.",
  "10. Conclusão": "Confirme a entrega completa e encerre o onboarding.",
};
export function isClosed(row: RecordRow) {
  return (
    !!(row.completed_at || row.canceled_at || row.effective_at || row.lost_at) ||
    ["Concluída", "Cancelada", "Concluído", "Efetivado", "Perdido"].includes(row.stage ?? "")
  );
}
export function stageAction(kind: Entity, stage: string, production = false): string {
  if (kind === "demands")
    return (
      (
        {
          Concluída: "complete",
          Cancelada: "cancel",
          "Encaminhada para desenvolvimento": "forward",
          Publicada: "publish",
        } as Record<string, string>
      )[stage] ?? "move"
    );
  if (kind === "onboardings")
    return stage === "Concluído" || stage === "10. Conclusão"
      ? "complete"
      : production
        ? "step"
        : "move";
  if (kind === "upgrades")
    return (
      ({ Aceito: "accept", Efetivado: "effective", Perdido: "lost" } as Record<string, string>)[
        stage
      ] ?? "move"
    );
  return "move";
}
