import RNFS from 'react-native-fs';

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

const MAX_MODEL_SIZE_BYTES = 1024 * 1024 * 1024;
type ArtifactFileSystem = Pick<typeof RNFS,
  'DocumentDirectoryPath' | 'mkdir' | 'exists' | 'hash' | 'stat' | 'unlink' | 'downloadFile' | 'stopDownload' | 'moveFile'>;

/** Downloads only catalog-described artifacts into app-private storage. */
export class ModelArtifactManager {
  constructor(
    private readonly allowedHosts: ReadonlySet<string>,
    private readonly fs: ArtifactFileSystem = RNFS,
  ) {}

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
      if (await this.fs.exists(finalPath)) {
        const existing = await this.fs.hash(finalPath, 'sha256');
        const stat = await this.fs.stat(finalPath);
        if (existing.toLowerCase() === spec.sha256.toLowerCase() && Number(stat.size) === spec.sizeBytes) {
          return { ...spec, path: finalPath };
        }
        await this.fs.unlink(finalPath);
      }
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
        spec.sizeBytes <= 0 || spec.sizeBytes > MAX_MODEL_SIZE_BYTES) throw new Error('Model size or digest metadata is invalid');
  }
}
