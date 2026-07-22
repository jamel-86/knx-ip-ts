import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConversionError } from '../../src/core/errors';
import { getDpt } from '../../src/dpt';

// DPT 16.000 is ASCII (7-bit). Buffer.from(s, 'ascii') silently MASKS characters
// >127 to their low 7 bits (e.g. "Café" → "Cafi", because é=0xE9 → 0x69='i') with
// no error. That is silent on-wire corruption; the codec must reject it.
describe('DPT 16.000 (ASCII) — reject non-ASCII instead of silently corrupting', () => {
  it('throws ConversionError for a character > 127 ("Café")', () => {
    const codec = getDpt('16.000');
    assert.ok(codec, '16.000 codec must be registered');
    assert.throws(() => codec!.encode('Café'), ConversionError);
  });

  it('control: latin1 (16.001) accepts the same character unchanged', () => {
    const codec = getDpt('16.001');
    assert.ok(codec);
    const out = codec!.encode('Café');
    assert.equal(out.kind, 'bytes');
    assert.equal(out.value.subarray(0, 4).toString('latin1'), 'Café');
  });
});
