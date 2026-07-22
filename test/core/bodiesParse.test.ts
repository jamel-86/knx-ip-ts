import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConnectResponse } from '../../src/core/bodies/connectResponse';
import { SessionAuthenticate } from '../../src/core/bodies/sessionAuthenticate';
import { CRD } from '../../src/core/cri';
import { CouldNotParseKNXIP } from '../../src/core/errors';
import { HPAI } from '../../src/core/hpai';
import { ErrorCode } from '../../src/core/serviceTypes';

// Real KNXnet/IP servers (Gira / Weinzierl / MDT) include HPAI + CRD in a
// CONNECT_RESPONSE even when the status is non-zero. The parser must not drop
// those trailing bytes (silent data loss + a spurious second-frame parse on the
// leftover).
describe('ConnectResponse.fromKnx — error responses still carry HPAI+CRD', () => {
  it('parses HPAI + CRD of a non-zero-status CONNECT_RESPONSE and consumes the whole body', () => {
    const STATUS = 0x23 as ErrorCode; // E_DATA_CONNECTION — any non-zero status
    const frame = Buffer.concat([
      Buffer.from([0x07, STATUS]),
      HPAI.routeBack().toKnx(), // 8 bytes
      new CRD({ individualAddress: '1.1.10' }).toKnx(),
    ]);
    const { body, bytesRead } = ConnectResponse.fromKnx(frame);
    assert.equal(bytesRead, frame.length, 'must consume the whole body, not just the 2 status bytes');
    assert.equal(body.communicationChannelId, 0x07);
    assert.equal(body.statusCode, STATUS);
    assert.ok(body.dataEndpoint instanceof HPAI, 'HPAI must be parsed, not defaulted');
    assert.ok(body.crd instanceof CRD, 'CRD must be parsed, not defaulted');
  });
});

// A malformed SESSION_AUTHENTICATE with an out-of-range user id must surface as
// the parser error callers catch (CouldNotParseKNXIP), not leak a RangeError
// from the constructor.
describe('SessionAuthenticate.fromKnx — bad wire data', () => {
  it('throws CouldNotParseKNXIP (not RangeError) for an out-of-range user id', () => {
    const raw = Buffer.concat([Buffer.from([0x00, 0x00]), Buffer.alloc(16)]); // reserved + userId=0 + 16B MAC
    assert.throws(() => SessionAuthenticate.fromKnx(raw), CouldNotParseKNXIP);
  });
});
