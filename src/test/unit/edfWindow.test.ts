import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEdfHeader, type EdfHeader } from '../../core/edf';
import { planEdfWindow, decodeEdfWindow } from '../../core/edfWindow';
import { edfFixture, edfRecordingFixture } from '../edfFixture';

const signal = () => new AbortController().signal;
const header = () => parseEdfHeader(edfFixture('EDF+C'), signal());
const request = { startSeconds: 0, durationSeconds: 10, channels: [0, 1] };

void test('calibrates mixed-rate channels and retains extrema in bounded time-ordered envelopes', async () => {
  const h = header(),
    data = edfRecordingFixture(),
    before = Buffer.from(data),
    plan = planEdfWindow(h, request);
  assert.equal(plan.offset, 1024);
  assert.equal(plan.bytes, 6200);
  const result = await decodeEdfWindow(
    h,
    plan,
    data.subarray(plan.offset, plan.offset + plan.bytes),
    signal(),
  );
  assert.equal(result.channels.length, 2);
  const [eeg, ecg] = result.channels;
  assert.equal(eeg.sampleCount, 2000);
  assert.equal(ecg.sampleCount, 1000);
  assert.equal(eeg.unit, 'uV');
  assert.equal(ecg.unit, 'mV');
  assert.equal(eeg.minimum, -100);
  assert.equal(eeg.maximum, 100);
  assert.ok(eeg.points.length <= 2048);
  assert.equal(ecg.points.length, 1000);
  assert.equal(ecg.minimum, ecg.maximum);
  assert.ok(ecg.minimum > 0 && ecg.minimum < 0.00002);
  assert.ok(
    eeg.points.every(
      (p, index) => index === 0 || p.timeSeconds > eeg.points[index - 1].timeSeconds,
    ),
  );
  assert.ok(eeg.points.every((p) => p.timeSeconds >= 0 && p.timeSeconds < 10));
  assert.deepEqual(data, before);
  const selected = planEdfWindow(h, {
    startSeconds: 2.005,
    durationSeconds: 0.02,
    channels: [1, 0],
  });
  const small = await decodeEdfWindow(
    h,
    selected,
    data.subarray(selected.offset, selected.offset + selected.bytes),
    signal(),
  );
  assert.equal(small.channels[0].index, 1);
  assert.deepEqual(
    small.channels[0].points.map((p) => p.timeSeconds),
    [2.01, 2.02],
  );
  const last = planEdfWindow(h, { startSeconds: 19, durationSeconds: 10, channels: [0] });
  assert.equal(last.endSeconds, 20);
  const inverted: EdfHeader = {
    ...h,
    signals: [
      { ...h.signals[0], physicalMinimum: 100, physicalMaximum: -100 },
      ...h.signals.slice(1),
    ],
  };
  const negative = await decodeEdfWindow(
    inverted,
    plan,
    data.subarray(plan.offset, plan.offset + plan.bytes),
    signal(),
  );
  assert.equal(negative.channels[0].points[0].value, 100);
});

void test('rejects untrusted requests, unsupported gap timing and unsafe work declarations', () => {
  const h = header();
  for (const bad of [
    undefined,
    null,
    1,
    'window',
    {},
    { ...request, startSeconds: NaN },
    { ...request, startSeconds: -1 },
    { ...request, startSeconds: 20 },
    { ...request, durationSeconds: Infinity },
    { ...request, durationSeconds: 0 },
    { ...request, durationSeconds: 31 },
    { ...request, channels: '0' },
    { ...request, channels: [] },
    { ...request, channels: [0, 0] },
    { ...request, channels: Array(9).fill(0) },
    { ...request, channels: ['0'] },
    { ...request, channels: [0.5] },
    { ...request, channels: [-1] },
    { ...request, channels: [3] },
    { ...request, channels: [2] },
  ])
    assert.throws(() => planEdfWindow(h, bad));
  assert.throws(() => planEdfWindow({ ...h, format: 'EDF+D' }, request), /gap timing/);
  assert.throws(() => planEdfWindow({ ...h, recordCount: undefined }, request), /record count/);
  assert.throws(() => planEdfWindow({ ...h, recordedSeconds: undefined }, request), /record count/);
  assert.throws(
    () => planEdfWindow({ ...h, recordBytes: 16 * 1024 ** 2 }, request),
    /record-read budget/,
  );
  assert.throws(
    () => planEdfWindow({ ...h, headerBytes: Number.MAX_SAFE_INTEGER }, request),
    /record-read budget/,
  );
  assert.throws(
    () =>
      planEdfWindow(
        { ...h, signals: [{ ...h.signals[0], samplingFrequency: 1e20 }, ...h.signals.slice(1)] },
        { ...request, startSeconds: 1 },
      ),
    /safely addressable/,
  );
  assert.throws(
    () => planEdfWindow(h, { startSeconds: 0.0001, durationSeconds: 0.0001, channels: [0] }),
    /no safely/,
  );
  const fast = {
    ...h,
    signals: [
      { ...h.signals[0], samplingFrequency: 100000, samplesPerRecord: 200000 },
      ...h.signals.slice(1),
    ],
  };
  assert.throws(() => planEdfWindow(fast, { ...request, durationSeconds: 20 }), /million/);
});

void test('rejects truncation/calibration overflow and cancels during sample decoding', async () => {
  const h = header(),
    plan = planEdfWindow(h, request),
    data = edfRecordingFixture().subarray(1024, 1024 + plan.bytes);
  await assert.rejects(decodeEdfWindow(h, plan, data.subarray(0, -1), signal()), /Truncated/);
  const extreme = {
    ...h,
    signals: [
      { ...h.signals[0], physicalMinimum: -1e308, physicalMaximum: 1e308 },
      ...h.signals.slice(1),
    ],
  };
  await assert.rejects(decodeEdfWindow(extreme, plan, data, signal()), /calibration/);
  const overflow = {
    ...h,
    signals: [
      {
        ...h.signals[0],
        physicalMinimum: 0,
        physicalMaximum: 1e308,
        digitalMinimum: 0,
        digitalMaximum: 1,
      },
      ...h.signals.slice(1),
    ],
  };
  await assert.rejects(decodeEdfWindow(overflow, plan, data, signal()), /value exceeds/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(decodeEdfWindow(h, plan, data, controller.signal), /abort/i);
  const fast = {
    ...h,
    recordBytes: 40440,
    signals: [
      { ...h.signals[0], samplingFrequency: 10000, samplesPerRecord: 20000 },
      ...h.signals.slice(1),
    ],
  };
  const large = planEdfWindow(fast, request),
    abort = new AbortController();
  const work = decodeEdfWindow(fast, large, Buffer.alloc(large.bytes), abort.signal);
  abort.abort();
  await assert.rejects(work, /abort/i);
});

void test('fractional record durations retain every selected sample within the planned read', async () => {
  const base = header();
  for (const seconds of [0.1, 0.2, 0.3, 0.7]) {
    const h: EdfHeader = {
      ...base,
      recordSeconds: seconds,
      recordedSeconds: 10 * seconds,
      recordBytes: 6,
      signals: [{ ...base.signals[0], samplesPerRecord: 3, samplingFrequency: 3 / seconds }],
    };
    for (const start of [0, seconds, 2 * seconds]) {
      const plan = planEdfWindow(h, {
        startSeconds: start,
        durationSeconds: 7 * seconds,
        channels: [0],
      });
      const result = await decodeEdfWindow(h, plan, Buffer.alloc(plan.bytes), signal());
      assert.ok(result.channels[0].sampleCount > 0);
      assert.ok(
        result.channels[0].points.every(
          (point) => point.timeSeconds >= start && point.timeSeconds < result.endSeconds,
        ),
      );
    }
  }
});
