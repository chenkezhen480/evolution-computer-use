import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const renameAttempts = 10;
const transientRename = new Set(['EPERM', 'EBUSY', 'EACCES']);
function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/**
 * Writes through a temporary file and a rename, so a crash never leaves half a file. On Windows a reader, indexer or
 * antivirus can briefly lock the target, so a rename that fails with EPERM/EBUSY/EACCES is retried with a short backoff.
 */
export function durableWrite(file: string, text: string, rename: (from: string, to: string) => void = renameSync): void {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = openSync(temporary, 'w');
    try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    for (let attempt = 1; ; attempt++) {
      try { rename(temporary, file); break; } catch (error) {
        if (attempt >= renameAttempts || !transientRename.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
        sleepSync(Math.min(100, 10 * 2 ** (attempt - 1)));
      }
    }
  } catch (error) { rmSync(temporary, { force: true }); throw error; }
}
