import { realTimers, type Timers } from './timers.ts';

/**
 * Requests one at a time: each gets a `cancelled` promise that rejects when it runs out of time or the queue stops,
 * and the queue refuses more than `limit` waiting at once.
 */
export function createQueue(name: string, options: { limit: number; timeoutMs: number; timers?: Timers | undefined; timeoutMessage?: string }) {
  const timers = options.timers ?? realTimers;
  const cancellations = new Set<() => void>();
  let pending: Promise<unknown> = Promise.resolve();
  let stopped = false;
  let queued = 0;
  const stoppedError = () => new Error(`${name}已停止`);
  function run<T>(work: (cancelled: Promise<never>) => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(stoppedError());
    if (queued >= options.limit) return Promise.reject(new Error(`${name}排队的操作太多了`));
    queued++;
    const result = pending.then(async () => {
      if (stopped) throw stoppedError();
      let timer: unknown;
      let cancel!: () => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        cancel = () => reject(stoppedError());
        timer = timers.set(() => reject(new Error(options.timeoutMessage ?? `${name}操作超时`)), options.timeoutMs);
      });
      cancelled.catch(() => {});
      cancellations.add(cancel);
      try { return await work(cancelled); }
      finally { cancellations.delete(cancel); timers.clear(timer); }
    }).finally(() => { queued--; });
    pending = result.catch(() => {});
    return result;
  }
  return {
    run,
    get stopped() { return stopped; },
    stop(): void { stopped = true; for (const cancel of cancellations) cancel(); },
  };
}
