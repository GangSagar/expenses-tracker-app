const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

interface QueueEntry<T> {
  item: T;
}

/**
 * RetryQueue — wraps a synchronous operation with up to MAX_ATTEMPTS retries
 * using exponential back-off (1 s → 2 s → 4 s).
 *
 * Designed for DB insert failures: prevents silent data loss when the SQLite
 * connection is temporarily unavailable at app startup.
 */
export class RetryQueue<T> {
  private readonly pending: QueueEntry<T>[] = [];

  enqueue(item: T): void {
    this.pending.push({ item });
  }

  /**
   * Drains the queue, calling `processor` for each item.
   * Items that still fail after MAX_ATTEMPTS are logged and dropped.
   * Returns the number of successfully processed items.
   */
  async flush(processor: (item: T) => number | null): Promise<number> {
    if (this.pending.length === 0) return 0;

    const snapshot = this.pending.splice(0, this.pending.length);
    let successCount = 0;

    for (const entry of snapshot) {
      const id = await this.tryProcess(entry.item, processor);
      if (id !== null) successCount++;
    }

    return successCount;
  }

  private async tryProcess(
    item: T,
    processor: (item: T) => number | null,
  ): Promise<number | null> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise<void>(r =>
          setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)),
        );
      }
      try {
        const id = processor(item);
        if (id !== null && id >= 0) return id;
      } catch (e) {
        console.warn(`[RetryQueue] Attempt ${attempt + 1} failed:`, e);
      }
    }
    console.error('[RetryQueue] All attempts exhausted — item dropped.');
    return null;
  }

  get size(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending.length = 0;
  }
}
