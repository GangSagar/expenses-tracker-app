import { RetryQueue } from '../utils/RetryQueue';

// Helper: make a synchronous processor that returns a fixed id
const makeProcessor = (returnValue: number | null) =>
  jest.fn((_item: number) => returnValue);

describe('RetryQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper to run timers and microtasks until completion
  const runTimersToCompletion = async () => {
    for (let i = 0; i < 10; i++) {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    }
  };

  it('starts empty and reports size zero', () => {
    const queue = new RetryQueue<number>();
    expect(queue.size).toBe(0);
  });

  it('increments size after enqueue', () => {
    const queue = new RetryQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    expect(queue.size).toBe(2);
  });

  it('flush resolves immediately when queue is empty', async () => {
    const queue = new RetryQueue<number>();
    const processor = makeProcessor(1);

    const flushed = queue.flush(processor);
    await runTimersToCompletion();
    const count = await flushed;

    expect(count).toBe(0);
    expect(processor).not.toHaveBeenCalled();
  });

  it('flush processes a single item successfully on the first attempt', async () => {
    const queue = new RetryQueue<number>();
    queue.enqueue(42);
    const processor = makeProcessor(10);

    const flushed = queue.flush(processor);
    await runTimersToCompletion();
    const count = await flushed;

    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledWith(42);
    expect(count).toBe(1);
    expect(queue.size).toBe(0);
  });

  it('flush retries an item that fails on the first attempt', async () => {
    const queue = new RetryQueue<number>();
    queue.enqueue(99);

    // Fail first call, succeed on second
    const processor = jest
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(5);

    const flushed = queue.flush(processor);
    await runTimersToCompletion();
    const count = await flushed;

    expect(processor).toHaveBeenCalledTimes(2);
    expect(count).toBe(1);
  });

  it('discards an item after all retry attempts are exhausted', async () => {
    const queue = new RetryQueue<number>();
    queue.enqueue(7);

    const processor = makeProcessor(null); // always fails

    const flushed = queue.flush(processor);
    await runTimersToCompletion();
    const count = await flushed;

    // 3 attempts (MAX_ATTEMPTS = 3) all failed → item discarded, flush returns 0
    expect(processor).toHaveBeenCalledTimes(3);
    expect(count).toBe(0);
    expect(queue.size).toBe(0);
  });

  it('clears all pending items without processing them', () => {
    const queue = new RetryQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.clear();
    expect(queue.size).toBe(0);
  });

  it('flush processes multiple items and counts only successful ones', async () => {
    // First item succeeds, second fails all retries, third succeeds
    const smartProcessor = jest.fn((item: number) => {
      if (item === 1) return 10;
      if (item === 3) return 30;
      return null; // item 2 always fails
    });

    const queue2 = new RetryQueue<number>();
    queue2.enqueue(1);
    queue2.enqueue(2);
    queue2.enqueue(3);

    const flushed = queue2.flush(smartProcessor);
    await runTimersToCompletion();
    const count = await flushed;

    // item 1: 1 call (success), item 2: 3 calls (all fail), item 3: 1 call (success)
    expect(smartProcessor).toHaveBeenCalledTimes(5);
    expect(count).toBe(2); // items 1 and 3
  });
});
