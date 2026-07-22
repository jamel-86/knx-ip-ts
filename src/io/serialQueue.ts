// Tiny serial queue: runs at most one task at a time, in submit order.
// Used by TunnelClient to serialise sendCemi() calls — the sequence counter
// and 1-second ACK window mean the gateway can only handle one in flight.

export class SerialQueue {
  private _tail: Promise<unknown> = Promise.resolve();
  private _depth = 0;

  /** Run `task` after all currently queued tasks. Returns its result. */
  run<T>(task: () => Promise<T>): Promise<T> {
    this._depth += 1;
    const next = this._tail.then(task, task);
    // Decrement + guard the chain in ONE derived promise. The rejection handler
    // swallows the error so the chain stays fulfilled for the next queued task
    // (the per-call result still rejects normally — we return `next`). Do NOT
    // use a separate `next.finally(...)`: that creates an orphan promise which
    // re-emits the rejection unhandled and crashes the process under default Node.
    this._tail = next.then(
      () => {
        this._depth -= 1;
      },
      () => {
        this._depth -= 1;
      },
    );
    return next;
  }

  /** Number of tasks currently queued or running. */
  get depth(): number {
    return this._depth;
  }
}
