import type RNFS from 'react-native-fs';
import {
  InstalledModelArtifact,
  ModelArtifactDownload,
  ModelArtifactSpec,
  ModelArtifactStore,
  MODEL_ARTIFACT_MAX_BYTES_EXCLUSIVE,
} from '../../core/parser/ai/ModelCatalog';

export type { InstalledModelArtifact, ModelArtifactDownload, ModelArtifactSpec } from '../../core/parser/ai/ModelCatalog';

/** Product limit is strictly below 100 MB (decimal bytes). */
export const MAX_MODEL_SIZE_BYTES = MODEL_ARTIFACT_MAX_BYTES_EXCLUSIVE;
type ArtifactFileSystem = Pick<typeof RNFS,
  'DocumentDirectoryPath' | 'mkdir' | 'exists' | 'hash' | 'stat' | 'unlink' | 'downloadFile' | 'stopDownload' | 'moveFile'>;

/** Downloads only catalog-described artifacts into app-private storage. */
export class ModelArtifactManager implements ModelArtifactStore {
  private fileSystem?: ArtifactFileSystem;

  constructor(
    private readonly allowedHosts: ReadonlySet<string>,
    fs?: ArtifactFileSystem,
  ) {
    this.fileSystem = fs;
  }

  private get fs(): ArtifactFileSystem {
    if (!this.fileSystem) {
      // Avoid loading React Native's native event emitter while importing app composition
      // in tests or non-device tooling. The package loads only on actual artifact operations.
      const loaded = require('react-native-fs') as { default?: ArtifactFileSystem } & ArtifactFileSystem;
      this.fileSystem = loaded.default || loaded;
    }
    return this.fileSystem;
  }

  install(spec: ModelArtifactSpec, onProgress?: (ratio: number) => void): ModelArtifactDownload {
    let cancelled = false;
    let activeJobId: number | null = null;
    const modelDirectory = `${this.fs.DocumentDirectoryPath}/models`;
    const finalPath = `${modelDirectory}/${spec.id}-${spec.version}-${spec.fileName}`;
    const temporaryPath = `${finalPath}.download`;

    const promise = (async (): Promise<InstalledModelArtifact> => {
      this.validateSpec(spec);
      await this.fs.mkdir(modelDirectory);

      // A verified copy of this exact version can be reused without network access.
      const installed = await this.getInstalled(spec);
      if (installed) return installed;
      if (cancelled) throw new Error('Model download cancelled');
      if (await this.fs.exists(temporaryPath)) await this.fs.unlink(temporaryPath);

      const download = this.fs.downloadFile({
        fromUrl: spec.url,
        toFile: temporaryPath,
        begin: result => {
          activeJobId = result.jobId;
          if (result.contentLength > spec.sizeBytes) this.fs.stopDownload(result.jobId);
        },
        progress: result => {
          if (result.bytesWritten > spec.sizeBytes) {
            this.fs.stopDownload(result.jobId);
            return;
          }
          onProgress?.(Math.min(1, result.bytesWritten / spec.sizeBytes));
        },
      });
      activeJobId = download.jobId;

      try {
        const result = await download.promise;
        if (cancelled) throw new Error('Model download cancelled');
        const stat = await this.fs.stat(temporaryPath);
        if (result.statusCode < 200 || result.statusCode >= 300 || Number(stat.size) !== spec.sizeBytes) {
          throw new Error('Downloaded model size or HTTP status did not match catalog metadata');
        }
        const digest = await this.fs.hash(temporaryPath, 'sha256');
        if (digest.toLowerCase() !== spec.sha256.toLowerCase()) {
          throw new Error('Downloaded model digest did not match catalog metadata');
        }
        if (cancelled) throw new Error('Model download cancelled');
        await this.fs.moveFile(temporaryPath, finalPath);
        return { ...spec, path: finalPath };
      } catch (error) {
        if (await this.fs.exists(temporaryPath)) await this.fs.unlink(temporaryPath);
        throw error;
      } finally {
        activeJobId = null;
      }
    })();

    return {
      promise,
      cancel: () => {
        cancelled = true;
        if (activeJobId !== null) this.fs.stopDownload(activeJobId);
      },
    };
  }

  async remove(artifact: InstalledModelArtifact): Promise<void> {
    const expectedPath = `${this.fs.DocumentDirectoryPath}/models/${artifact.id}-${artifact.version}-${artifact.fileName}`;
    if (artifact.path !== expectedPath) throw new Error('Refusing to remove a file outside the model directory');
    if (await this.fs.exists(artifact.path)) await this.fs.unlink(artifact.path);
  }

  /** Checks the installed file's expected size without hashing it on every catalog refresh. */
  async hasArtifact(spec: ModelArtifactSpec): Promise<boolean> {
    this.validateSpec(spec);
    const path = `${this.fs.DocumentDirectoryPath}/models/${spec.id}-${spec.version}-${spec.fileName}`;
    if (!(await this.fs.exists(path))) return false;
    const stat = await this.fs.stat(path);
    if (Number(stat.size) !== spec.sizeBytes) {
      await this.fs.unlink(path);
      return false;
    }
    return true;
  }

  /** Returns a matching app-private artifact, deleting stale or corrupt copies. */
  async getInstalled(spec: ModelArtifactSpec): Promise<InstalledModelArtifact | null> {
    this.validateSpec(spec);
    const path = `${this.fs.DocumentDirectoryPath}/models/${spec.id}-${spec.version}-${spec.fileName}`;
    if (!(await this.fs.exists(path))) return null;

    const [digest, stat] = await Promise.all([
      this.fs.hash(path, 'sha256'),
      this.fs.stat(path),
    ]);
    if (digest.toLowerCase() !== spec.sha256.toLowerCase() || Number(stat.size) !== spec.sizeBytes) {
      await this.fs.unlink(path);
      return null;
    }
    return { ...spec, path };
  }

  private validateSpec(spec: ModelArtifactSpec): void {
    let parsed: URL;
    try {
      parsed = new URL(spec.url);
    } catch {
      throw new Error('Model source URL is invalid');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !this.allowedHosts.has(parsed.hostname)) {
      throw new Error('Model source is not an allowlisted HTTPS host');
    }
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(spec.id) || !/^[a-zA-Z0-9._-]{1,40}$/.test(spec.version) ||
        !/^[a-zA-Z0-9._-]{1,100}$/.test(spec.fileName)) throw new Error('Model metadata contains an unsafe path segment');
    if (!/^[a-fA-F0-9]{64}$/.test(spec.sha256) || !Number.isSafeInteger(spec.sizeBytes) ||
        spec.sizeBytes <= 0 || spec.sizeBytes >= MAX_MODEL_SIZE_BYTES) {
      throw new Error('Model size must be below 100 MB and include a valid SHA-256 digest');
    }
  }
}
