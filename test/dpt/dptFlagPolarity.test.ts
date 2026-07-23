// Wire-level regression tests for DPT flag polarity — pinned to fixed bytes, not
// just round-trip (round-trip only proves self-consistency, which is why the
// original inverted polarities slipped through).
//
// Spec: The KNX Standard v3.0.0 — 03_07_02 Datapoint Types v02.02.01
//   §3.20 DPT_DateTime            (byte[6] flags, byte[7] CLQ)
//   §3.48 DPT_Tariff_ActiveEnergy (byte[5] validity: b0=Tariff, b1=Energy; 0=valid)

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { getDpt } from '../../src/dpt';

const bytes = (v: unknown) => (v as { value: Buffer }).value;

describe('DPT 19.001 flag polarity (03_07_02 §3.20)', () => {
  const c = getDpt('19.001');
  // 2021-06-15 10:30:00 Tue; byte6 flags, byte7 CLQ.
  const base = [121, 0x06, 0x0f, (2 << 5) | 10, 30, 0];

  it('NWD=0 decodes as working-day field VALID; NWD=1 as NOT valid', () => {
    const wdValid = c.decode({ kind: 'bytes', value: Buffer.from([...base, 0x40, 0x00]) }) as any;
    assert.equal(wdValid.workingDay, true); // WD bit6
    assert.equal(wdValid.workingDayValid, true); // NWD bit5 = 0
    const wdInvalid = c.decode({ kind: 'bytes', value: Buffer.from([...base, 0x20, 0x00]) }) as any;
    assert.equal(wdInvalid.workingDayValid, false); // NWD bit5 = 1
  });

  it('CLQ=1 decodes as synchronised (external sync present); CLQ=0 as unsynchronised', () => {
    const sync = c.decode({ kind: 'bytes', value: Buffer.from([...base, 0x00, 0x80]) }) as any;
    assert.equal(sync.clockQuality, 'synchronised');
    const local = c.decode({ kind: 'bytes', value: Buffer.from([...base, 0x00, 0x00]) }) as any;
    assert.equal(local.clockQuality, 'unsynchronised');
  });

  it('encodes CLQ/NWD onto the correct wire bits', () => {
    const dt = { year: 2021, month: 6, day: 15, hour: 10, minutes: 30, seconds: 0 };
    // synchronised -> CLQ bit set on byte[7]
    assert.equal(bytes(c.encode({ ...dt, clockQuality: 'synchronised' }))[7] & 0x80, 0x80);
    assert.equal(bytes(c.encode({ ...dt, clockQuality: 'unsynchronised' }))[7] & 0x80, 0x00);
    // workingDayValid:false -> NWD bit set on byte[6]; default -> clear (valid)
    assert.equal(bytes(c.encode({ ...dt, workingDayValid: false }))[6] & 0x20, 0x20);
    assert.equal(bytes(c.encode(dt))[6] & 0x20, 0x00);
  });
});

describe('DPT 235.001 validity polarity (03_07_02 §3.48)', () => {
  const c = getDpt('235.001');
  const mk = (validity: number) => Buffer.from([0, 0, 0x05, 0xdc, 2, validity]); // 1500 Wh, tariff 2

  it('validity byte: b0=Tariff, b1=Energy, 0=valid / 1=not valid', () => {
    // [validity, energyValid, tariffValid]
    for (const [v, eV, tV] of [
      [0x00, true, true],
      [0x01, true, false], // b0 (tariff) not valid
      [0x02, false, true], // b1 (energy) not valid
      [0x03, false, false],
    ] as const) {
      const d = c.decode({ kind: 'bytes', value: mk(v) }) as any;
      assert.equal(d.energyValid, eV, `validity 0x0${v} energyValid`);
      assert.equal(d.tariffValid, tV, `validity 0x0${v} tariffValid`);
    }
  });

  it('encodes "not valid" onto the correct bit; default is valid (0x00)', () => {
    const base = { energy: 1500, tariff: 2 };
    assert.equal(bytes(c.encode(base))[5], 0x00); // both valid
    assert.equal(bytes(c.encode({ ...base, energyValid: false }))[5], 0x02); // b1
    assert.equal(bytes(c.encode({ ...base, tariffValid: false }))[5], 0x01); // b0
    assert.equal(bytes(c.encode({ ...base, energyValid: false, tariffValid: false }))[5], 0x03);
  });
});
