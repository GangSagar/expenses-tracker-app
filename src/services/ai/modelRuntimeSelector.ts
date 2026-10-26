import {
  AIExtractionEngine,
  AIInferenceRequest,
  AIExtractionProposal,
  ProposalField,
  validateAIExtractionProposal,
  mayRunAIForContext,
} from '../../core/parser/ai/AIExtractionProposal';
import {
  LocalModelCatalogEntry,
  LocalModelTaskSlot,
  modelArtifactKey,
  modelTaskSlot,
} from '../../core/parser/ai/ModelCatalog';
import { SettingsService } from '../settings/settingsService';

/** Adapter instances are created only for installed and verified artifacts. */
export interface LocalModelInferenceAdapter extends AIExtractionEngine {
  readonly model: LocalModelCatalogEntry;
}

const TASK_ORDER: LocalModelTaskSlot[] = ['intent', 'category', 'extraction'];
const PROPOSAL_FIELDS: ProposalField[] = [
  'amount', 'currency', 'transactionType', 'merchant', 'category', 'referenceId',
];

/** Routes only explicitly assigned local models, one at a time, through proposal validation. */
export class ModelRuntimeSelector implements AIExtractionEngine {
  private readonly adaptersByKey: Map<string, LocalModelInferenceAdapter>;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: SettingsService,
    adapters: readonly LocalModelInferenceAdapter[] = [],
    private readonly supportedPlatform: 'android' | 'ios' = 'android',
  ) {
    this.adaptersByKey = new Map();
    for (const adapter of adapters) {
      const key = modelArtifactKey(adapter.model);
      if (this.adaptersByKey.has(key)) throw new Error(`Duplicate runtime adapter: ${key}`);
      if (!adapter.model.supportedPlatforms.includes(supportedPlatform)) continue;
      this.adaptersByKey.set(key, adapter);
    }
  }

  propose(request: AIInferenceRequest): Promise<unknown> {
    if (!mayRunAIForContext(request.context)) return Promise.resolve(null);
    const run = this.queue.then(() => this.runSelected(request));
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runSelected(request: AIInferenceRequest): Promise<AIExtractionProposal | null> {
    const assignments = this.settings.getModelLibraryPreferences().assignments;
    let merged: AIExtractionProposal | null = null;

    for (const slot of TASK_ORDER) {
      const reference = assignments[slot];
      if (!reference) continue;
      const key = modelArtifactKey(reference);
      const adapter = this.adaptersByKey.get(key);
      if (!adapter || modelTaskSlot(adapter.model.task) !== slot) continue;

      let raw: unknown;
      try {
        raw = await adapter.propose(request);
      } catch {
        // Local adapter failure is isolated to this slot; parser policy owns fallback.
        continue;
      }
      const candidate = raw && typeof raw === 'object' ? raw as { modelId?: unknown; modelVersion?: unknown } : {};
      const validated = validateAIExtractionProposal(
        raw,
        typeof candidate.modelId === 'string' ? candidate.modelId : adapter.model.id,
        typeof candidate.modelVersion === 'string' ? candidate.modelVersion : adapter.model.version,
      );
      if (validated) merged = mergeProposal(merged, validated);
    }
    return merged;
  }
}

function mergeProposal(
  current: AIExtractionProposal | null,
  next: AIExtractionProposal,
): AIExtractionProposal {
  if (!current) return { ...next, conflicts: [...next.conflicts] };
  const result: AIExtractionProposal = {
    ...current,
    conflicts: [...current.conflicts, ...next.conflicts],
    modelId: 'local-model-pipeline',
    modelVersion: `${current.modelVersion}+${next.modelId}@${next.modelVersion}`.slice(0, 120),
  };
  for (const field of PROPOSAL_FIELDS) {
    const existing = result[field];
    const incoming = next[field];
    if (!incoming) continue;
    if (!existing) {
      (result as unknown as Record<string, unknown>)[field] = incoming;
    } else if (!sameValue(existing.value, incoming.value) && !result.conflicts.includes(field)) {
      result.conflicts.push(field);
    }
  }
  result.conflicts = [...new Set(result.conflicts)];
  return result;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string') return left.trim().toLowerCase() === right.trim().toLowerCase();
  return left === right;
}
