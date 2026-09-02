/**
 * fineTuningProvider.ts
 *
 * Interface desacoplada para provedores de fine-tuning.
 *
 * Nenhuma implementação concreta é fornecida aqui de propósito — esta é
 * a infraestrutura de PREPARAÇÃO de dados (dataset builder), não de
 * treinamento. Conectar um provedor real (OpenAI, Google, Together etc.)
 * é um passo futuro e separado (ver TrainingJobService, ainda não
 * implementado — item 12/13 do briefing original).
 *
 * Qualquer provedor futuro implementa esta interface sem alterar
 * fineTuningService.ts.
 */

export interface FineTuningFormattedExample {
  // Formato genérico chat-style (input/output), compatível com a maioria
  // dos provedores de fine-tuning de LLM via mapeamento simples.
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export interface FineTuningDatasetExportResult {
  format: "jsonl";
  content: string;       // conteúdo já serializado, pronto para salvar em arquivo
  exampleCount: number;
}

export interface FineTuningProvider {
  /** Nome do provedor, ex: "openai", "google-vertex", "together" */
  readonly name: string;

  /** Converte um exemplo interno do MecProAI no formato esperado pelo provedor. */
  formatExample(input: {
    taskType: string;
    inputContext: unknown;
    output: string;
  }): FineTuningFormattedExample;

  /**
   * Envio de job de treinamento — opcional, implementado apenas quando o
   * TrainingJobService for construído (fase 2, fora do escopo atual).
   */
  submitTrainingJob?(params: {
    datasetContent: string;
    baseModel: string;
  }): Promise<{ jobId: string }>;

  getJobStatus?(jobId: string): Promise<{ status: string; detail?: unknown }>;
}

/**
 * Provedor default, genérico, usado apenas para gerar um JSONL legível
 * e auditável antes de qualquer integração real existir. NÃO envia nada
 * para fora do MecProAI.
 */
export const genericChatProvider: FineTuningProvider = {
  name: "generic-chat-format",
  formatExample({ taskType, inputContext, output }) {
    return {
      messages: [
        {
          role: "system",
          content: `Você é o motor de geração de campanhas do MecProAI. Tarefa: ${taskType}.`,
        },
        {
          role: "user",
          content: typeof inputContext === "string" ? inputContext : JSON.stringify(inputContext),
        },
        {
          role: "assistant",
          content: output,
        },
      ],
    };
  },
};
