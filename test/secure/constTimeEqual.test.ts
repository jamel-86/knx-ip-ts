import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { constantTimeEquals } from '../../src/secure/crypto';

// The provable property of the guarded auth-tag helper isn't its timing (a
// timing side-channel can't be asserted deterministically) — it's the boolean
// contract: equal→true, same-length-diff→false, different-length→false WITHOUT
// throwing. The last case is the one a raw crypto.timingSafeEqual gets wrong
// (it throws on length mismatch), which would turn a drop-on-mismatch MAC check
// into an exception.
describe('constantTimeEquals — guarded auth-tag comparison', () => {
  it('returns true for bytewise-equal buffers', () => {
    const a = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    assert.equal(constantTimeEquals(a, Buffer.from(a)), true);
  });

  it('returns false (no throw) for same-length, differing buffers', () => {
    const a = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const b = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
    let threw = false;
    let res = true;
    try {
      res = constantTimeEquals(a, b);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'must not throw on a same-length mismatch');
    assert.equal(res, false);
  });

  it('returns false (no throw) for different-length buffers', () => {
    const a = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const b = Buffer.from('00', 'hex');
    let threw = false;
    let res = true;
    try {
      res = constantTimeEquals(a, b);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'length mismatch must NOT throw (raw timingSafeEqual does)');
    assert.equal(res, false);
  });
});
