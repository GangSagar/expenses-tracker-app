import { initLlama, LlamaContext } from 'llama.rn';
import {
  AIExtractionEngine,
  AIInferenceRequest,
  mayRunAIForContext,
  validateAIExtractionProposal,
} from '../../core/parser/ai/AIExtractionProposal';
import { InstalledModelArtifact } from './ModelArtifactManager';

/**
   * Local-only llama.rn adapter. It accepts only an artifact returned by the
   * verified artifact manager; it does not download models or select one.
 */
export class LlamaExtractionEngine implements AIExtractionEngine {
  private context: LlamaContext | null = null;

  constructor(
    private readonly artifact: InstalledModelArtifact,
  ) {}

  async load(): Promise<void> {
    if (!this.context) {
      this.context = await initLlama({
        model: this.artifact.path,
        n_ctx: 2048,
        n_batch: 256,
        n_threads: 2,
        use_mlock: false,
        use_mmap: true,
      });
    }
  }

  async propose(request: AIInferenceRequest): Promise<unknown> {
    if (!mayRunAIForContext(request.context) || !this.context) return null;

    // Raw message content stays in this process and is never logged by this adapter.
    const response = await this.context.completion({
      prompt: [
        'Extract only transaction facts explicitly present in the message.',
        'Return one JSON object with optional amount, currency, transactionType, merchant, category, referenceId, and conflicts array.',
        'amount must be a positive number; transactionType must be debit or credit.',
        'Use null for absent fields. Do not infer missing facts or include explanations.',
        `Merchant hint: ${request.merchantCandidate || 'none'}`,
        `Message: ${request.message}`,
        'JSON:',
      ].join('\n'),
      n_predict: 160,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.text);
    } catch {
      return null;
    }
    if (!raw || typeof raw !== 'object') return null;

    // Model-generated confidence is not calibrated. Keep it at a conservative
    // value so it can never raise the shared transaction decision score.
    const input = raw as Record<string, unknown>;
    const proposal: Record<string, unknown> = { conflicts: input.conflicts ?? [] };
    for (const field of ['amount', 'currency', 'transactionType', 'merchant', 'category', 'referenceId']) {
      const value = input[field];
      if (value !== undefined && value !== null) {
        proposal[field] = { value, confidence: 0.5, source: 'local_model' };
      }
    }
    return validateAIExtractionProposal(proposal, this.artifact.id, this.artifact.version);
  }

  async unload(): Promise<void> {
    if (this.context) {
      const context = this.context;
      this.context = null;
      await context.release();
    }
  }
}
