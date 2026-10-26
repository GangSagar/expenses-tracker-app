export type LocalModelRuntime = 'llama_cpp' | 'onnx_runtime';
export type LocalModelTask = 'message_intent' | 'message_classification' | 'structured_extraction';
export type LocalModelTaskSlot = 'intent' | 'category' | 'extraction';
export type LocalModelFormat = 'gguf' | 'onnx';
export const MODEL_ARTIFACT_MAX_BYTES_EXCLUSIVE = 100_000_000;

export interface ModelArtifactSpec {
  id: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  fileName: string;
}

export interface InstalledModelArtifact extends ModelArtifactSpec {
  path: string;
}

export interface ModelArtifactDownload {
  promise: Promise<InstalledModelArtifact>;
  cancel(): void;
}

export interface ModelArtifactStore {
  install(spec: ModelArtifactSpec, onProgress?: (ratio: number) => void): ModelArtifactDownload;
  hasArtifact(spec: ModelArtifactSpec): Promise<boolean>;
  getInstalled(spec: ModelArtifactSpec): Promise<InstalledModelArtifact | null>;
  remove(artifact: InstalledModelArtifact): Promise<void>;
}

/** Public, non-secret metadata used to show and install one published model artifact. */
export interface LocalModelCatalogEntry extends ModelArtifactSpec {
  displayName: string;
  description: string;
  publisher: string;
  license: string;
  baseModel: string;
  task: LocalModelTask;
  format: LocalModelFormat;
  runtime: LocalModelRuntime;
  supportedPlatforms: Array<'android' | 'ios'>;
  fineTuned: boolean;
}

export interface ModelLibraryEntry extends LocalModelCatalogEntry {
  installed: boolean;
  active: boolean;
  assignedSlot: LocalModelTaskSlot | null;
}

export function modelTaskSlot(task: LocalModelTask): LocalModelTaskSlot {
  switch (task) {
    case 'message_intent': return 'intent';
    case 'message_classification': return 'category';
    case 'structured_extraction': return 'extraction';
  }
}

export function modelArtifactKey(reference: { id: string; version: string }): string {
  return `${reference.id}@${reference.version}`;
}
