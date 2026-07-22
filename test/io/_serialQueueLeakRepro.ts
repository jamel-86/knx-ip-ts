// Repro harness for the SerialQueue unhandled-rejection leak.
//
// NOT named *.test.ts on purpose: the project runner (scripts/run-tests.mjs)
// only walks *.test.ts, and node:test would itself fail on the unhandled
// rejection we are deliberately provoking. Instead this runs as a standalone
// entry (via `node --import tsx`) and reports the outcome through its EXIT CODE:
//   42 = an unhandledRejection leaked
//    0 = no leak
//
// The parent test (serialQueueUnhandled.test.ts) spawns this and asserts.
//
// mode 'real'  -> the ACTUAL, unmodified src/io/serialQueue.ts
// mode 'fixed' -> a control queue that decrements depth inside the continuation
//                 instead of spawning an unguarded derived promise.

import { SerialQueue } from '../../src/io/serialQueue';

const mode = process.argv[2] ?? 'real';

let leaked: unknown = null;
// Registering a listener also stops Node's default "crash on unhandled
// rejection" so we can report a clean, explicit exit code instead.
process.on('unhandledRejection', (reason) => {
  leaked = reason;
});

// Control implementation: identical queueing semantics, but depth is
// decremented inside the SAME promise chain that is returned/guarded — no
// second, unhandled promise is ever created.
class FixedQueue {
  private _tail: Promise<unknown> = Promise.resolve();
  private _depth = 0;
  run<T>(task: () => Promise<T>): Promise<T> {
    this._depth += 1;
    const next = this._tail.then(task, task).finally(() => {
      this._depth -= 1;
    });
    this._tail = next.catch(() => undefined);
    return next;
  }
  get depth(): number {
    return this._depth;
  }
}

async function main(): Promise<void> {
  const q: { run<T>(t: () => Promise<T>): Promise<T> } =
    mode === 'fixed' ? new FixedQueue() : new SerialQueue();

  // Use the queue exactly the way TunnelClient.sendCemi() does: submit a task,
  // await the returned promise, and handle its rejection. This is a WELL-BEHAVED
  // caller — it does not ignore the promise it was handed.
  try {
    await q.run(async () => {
      throw new Error('send failed (simulated TUNNELLING_ACK exhaustion)');
    });
  } catch {
    // Caller handled its own promise, as sendCemi's callers are expected to.
  }

  // Let the microtask checkpoint run so any unhandledRejection can surface.
  await new Promise((r) => setTimeout(r, 25));

  if (leaked) {
    console.error(`LEAKED unhandledRejection: ${(leaked as Error).message}`);
    process.exit(42);
  }
  console.error('no leak');
  process.exit(0);
}

void main();
