import assert from 'node:assert/strict';
import test from 'node:test';
import { createQueue } from '../src/shared/queue.ts';

test('a queue can name its own timeout', async () => {
  const queue = createQueue('浏览器', { limit: 2, timeoutMs: 20, timeoutMessage: '浏览器操作超时' });
  await assert.rejects(queue.run(cancelled => cancelled), /^Error: 浏览器操作超时$/);
  const plain = createQueue('桌面', { limit: 2, timeoutMs: 20 });
  await assert.rejects(plain.run(cancelled => cancelled), /^Error: 桌面操作超时$/);
});

test('a stopped queue refuses new work and cancels what runs', async () => {
  const queue = createQueue('浏览器', { limit: 2, timeoutMs: 10_000 });
  const running = queue.run(cancelled => cancelled);
  queue.stop();
  await assert.rejects(running, /^Error: 浏览器已停止$/);
  await assert.rejects(queue.run(async () => 1), /^Error: 浏览器已停止$/);
});

test('a full queue refuses more', async () => {
  const queue = createQueue('浏览器', { limit: 1, timeoutMs: 10_000 });
  let release!: () => void;
  const first = queue.run(() => new Promise<void>(resolve => { release = resolve; }));
  await assert.rejects(queue.run(async () => 1), /排队的操作太多了/);
  release(); await first;
});
