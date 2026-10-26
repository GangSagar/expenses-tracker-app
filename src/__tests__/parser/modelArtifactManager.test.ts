jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { DocumentDirectoryPath: '/app-private' },
}));

import { MAX_MODEL_SIZE_BYTES, ModelArtifactManager } from '../../infrastructure/ai/ModelArtifactManager';

const digest = 'a'.repeat(64);
const spec = {
  id: 'fixture',
  version: '1.0',
  url: 'https://models.example.test/fixture.gguf',
  sha256: digest,
  sizeBytes: 12,
  fileName: 'fixture.gguf',
};

function createFileSystem(hashValue = digest) {
  const files = new Set<string>();
  const fs = {
    DocumentDirectoryPath: '/app-private',
    mkdir: jest.fn(async () => undefined),
    exists: jest.fn(async (path: string) => files.has(path)),
    hash: jest.fn(async () => hashValue),
    stat: jest.fn(async () => ({ size: 12 })),
    unlink: jest.fn(async (path: string) => { files.delete(path); }),
    moveFile: jest.fn(async (from: string, to: string) => { files.delete(from); files.add(to); }),
    stopDownload: jest.fn(),
    downloadFile: jest.fn((options: { toFile: string }) => {
      files.add(options.toFile);
      return { jobId: 7, promise: Promise.resolve({ statusCode: 200 }) };
    }),
  };
  return { fs, files };
}

describe('ModelArtifactManager', () => {
  it('verifies size and digest before atomically promoting an app-private file', async () => {
    const { fs, files } = createFileSystem();
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);
    const installed = await manager.install(spec).promise;

    expect(installed.path).toBe('/app-private/models/fixture-1.0-fixture.gguf');
    expect(files.has(installed.path)).toBe(true);
    expect(fs.moveFile).toHaveBeenCalledWith(expect.stringMatching(/\.download$/), installed.path);
  });

  it('deletes a partial file when digest verification fails', async () => {
    const { fs, files } = createFileSystem('b'.repeat(64));
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);

    await expect(manager.install(spec).promise).rejects.toThrow('digest');
    expect([...files]).toHaveLength(0);
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.download$/));
    expect(fs.moveFile).not.toHaveBeenCalled();
  });

  it('rejects non-allowlisted or non-HTTPS sources before downloading', async () => {
    const { fs } = createFileSystem();
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);

    await expect(manager.install({ ...spec, url: 'http://evil.example/fixture.gguf' }).promise)
      .rejects.toThrow('allowlisted HTTPS');
    expect(fs.downloadFile).not.toHaveBeenCalled();
  });

  it('rejects artifacts at or above the strict 100 MB limit before downloading', async () => {
    const { fs } = createFileSystem();
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);

    await expect(manager.install({ ...spec, sizeBytes: MAX_MODEL_SIZE_BYTES }).promise)
      .rejects.toThrow('below 100 MB');
    expect(fs.downloadFile).not.toHaveBeenCalled();
  });

  it('reuses only a size- and digest-verified installed artifact', async () => {
    const { fs, files } = createFileSystem();
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);
    const installed = await manager.install(spec).promise;

    await expect(manager.getInstalled(spec)).resolves.toEqual(installed);
    expect(files.size).toBe(1);
    expect(fs.downloadFile).toHaveBeenCalledTimes(1);
  });

  it('cancels before starting a download', async () => {
    const { fs } = createFileSystem();
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);
    const operation = manager.install(spec);
    operation.cancel();

    await expect(operation.promise).rejects.toThrow('cancelled');
    expect(fs.downloadFile).not.toHaveBeenCalled();
  });

  it('stops an active native download and removes its temporary file', async () => {
    let rejectDownload: ((error: Error) => void) | undefined;
    const { fs, files } = createFileSystem();
    fs.downloadFile.mockImplementation((options: { toFile: string }) => {
      files.add(options.toFile);
      return {
        jobId: 17,
        promise: new Promise((_resolve, reject) => { rejectDownload = reject; }),
      };
    });
    const manager = new ModelArtifactManager(new Set(['models.example.test']), fs as never);
    const operation = manager.install(spec);
    await new Promise(resolve => setImmediate(resolve));
    operation.cancel();
    rejectDownload?.(new Error('native download stopped'));

    await expect(operation.promise).rejects.toThrow('native download stopped');
    expect(fs.stopDownload).toHaveBeenCalledWith(17);
    expect([...files]).toHaveLength(0);
  });
});
