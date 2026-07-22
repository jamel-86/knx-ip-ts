// Regression test for the unhandled-rejection leak in src/io/serialQueue.ts.
//
// Background: the original `next.finally(() => this._depth -= 1)` created an
// orphan promise (separate from the `next` the caller catches). Because finally
// re-emits the rejection, a rejected queued task leaked an unhandledRejection
// and crashed the process under default Node — even though the caller had
// caught its own promise. The fix folds the depth decrement into the single
// guarded chain.
//
// The leak is a process-global event, so we run the queue in an isolated child
// (the repro harness) and assert its exit code. Isolation keeps node:test's own
// unhandled-rejection tracking out of it.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repro = join(here, '_serialQueueLeakRepro.ts');

function runRepro(mode: 'real' | 'fixed'): { status: number | null; stderr: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', repro, mode], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return { status: r.status, stderr: r.stderr };
}

describe('SerialQueue: rejected queued task does not leak an unhandledRejection', () => {
  it('the REAL SerialQueue (src/io/serialQueue.ts) does not leak when a well-behaved caller catches its own promise', () => {
    const { status, stderr } = runRepro('real');
    assert.equal(status, 0, `expected no leak (exit 0); got ${status}\nchild stderr:\n${stderr}`);
    assert.match(stderr, /no leak/);
  });

  it('control: a queue that decrements depth inside the returned chain does NOT leak', () => {
    const { status, stderr } = runRepro('fixed');
    assert.equal(status, 0, `expected no leak (exit 0); got ${status}\nchild stderr:\n${stderr}`);
    assert.match(stderr, /no leak/);
  });
});
