import assert from 'node:assert/strict';
import { test } from 'node:test';
import { edfHeaderBytes, parseEdfHeader } from '../../core/edf';

const signal = () => new AbortController().signal;
import { edfFixture as fixture } from '../edfFixture';
function replace(header: Buffer, at: number, width: number, value: string): Buffer {
  const changed = Buffer.from(header);
  changed.fill(32, at, at + width);
  changed.write(value, at);
  return changed;
}

void test('summarizes EDF/EDF+C/EDF+D headers with channel-specific units and sampling', () => {
  for (const format of ['', 'EDF+C', 'EDF+D']) {
    const bytes = fixture(format);
    const before = Buffer.from(bytes);
    assert.equal(edfHeaderBytes(bytes.subarray(0, 256)), 1024);
    const header = parseEdfHeader(bytes, signal());
    assert.equal(header.format, format || 'EDF');
    assert.equal(header.recordedSeconds, 20);
    assert.equal(header.recordCount, 10);
    assert.equal(header.recordBytes, 1240);
    assert.deepEqual(
      header.signals.map((row) => row.samplingFrequency),
      [200, 100, 10],
    );
    assert.deepEqual(
      header.signals.map((row) => row.unit),
      ['uV', 'mV', ''],
    );
    assert.equal(header.signals[2].annotations, !!format);
    assert.equal(header.signals[0].physicalMinimum, -100);
    assert.equal(header.signals[1].digitalMaximum, 32767);
    assert.ok(!JSON.stringify(header).includes('PRIVATE'));
    assert.ok(Object.isFrozen(header) && Object.isFrozen(header.signals[0]));
    assert.deepEqual(bytes, before);
    // No signal bytes are interpreted or required; trailing data cannot change the summary.
    assert.deepEqual(
      parseEdfHeader(Buffer.concat([bytes, Buffer.alloc(200, 255)]), signal()),
      header,
    );
  }
});

void test('preserves unknown duration, duplicate/empty labels and inverted physical calibration', () => {
  let bytes = replace(fixture('EDF+C'), 236, 8, '-1');
  bytes = replace(bytes, 256, 16, 'ECG');
  bytes = replace(bytes, 288, 16, '');
  bytes = replace(bytes, 568, 8, '200'); // physical minimum above maximum is a negative gain
  const header = parseEdfHeader(bytes, signal());
  assert.equal(header.recordCount, undefined);
  assert.equal(header.recordedSeconds, undefined);
  assert.deepEqual(
    header.signals.map((row) => row.label),
    ['ECG', 'ECG', ''],
  );
  assert.equal(header.signals[0].physicalMinimum, 200);
  assert.equal(parseEdfHeader(replace(fixture(), 236, 8, '0'), signal()).recordedSeconds, 0);
});

void test('rejects malformed or excessive declarations before allocating signal work', () => {
  assert.throws(() => edfHeaderBytes(Buffer.alloc(255)), /Truncated/);
  assert.throws(() => parseEdfHeader(fixture().subarray(0, 1023), signal()), /Truncated/);
  const bad: [number, number, string, RegExp][] = [
    [0, 8, 'BDF', /Unsupported/],
    [252, 4, '0', /signals/],
    [252, 4, '1025', /signals/],
    [252, 4, '1.5', /signals/],
    [184, 8, '1000', /length/],
    [184, 8, '', /numeric/],
    [184, 8, '0x400', /numeric/],
    [184, 8, '1e999', /Non-finite/],
    [192, 44, 'EDF+X', /Unsupported/],
    [192, 44, 'EDF+Cbad', /Unsupported/],
    [236, 8, '-2', /record count/],
    [236, 8, '1.5', /record count/],
    [236, 8, '1e20', /record count/],
    [244, 8, '0', /positive/],
    [904, 8, '0', /sample counts/],
    [904, 8, '1.5', /sample counts/],
    [904, 8, '9000000', /record budget/],
    [568, 8, '100', /calibration/],
    [616, 8, '-32769', /calibration/],
    [616, 8, '0.5', /calibration/],
    [640, 8, '32768', /calibration/],
    [640, 8, '1.5', /calibration/],
    [640, 8, '-32768', /calibration/],
    [256, 16, '\u0000', /ASCII/],
    [256, 16, '\u00ff', /ASCII/],
  ];
  for (const [at, width, token, message] of bad)
    assert.throws(
      () => parseEdfHeader(replace(fixture(), at, width, token), signal()),
      message,
      token,
    );
  assert.throws(
    () => parseEdfHeader(replace(fixture(), 244, 8, '1e-320'), signal()),
    /sample counts/,
  );
  assert.throws(
    () => parseEdfHeader(replace(fixture(), 244, 8, '1e308'), signal()),
    /duration exceeds/,
  );
});

void test('honors cancellation without publishing a header', () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => parseEdfHeader(fixture(), controller.signal), /abort/i);
});
