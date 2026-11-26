import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { recordingDisplayGroups } from '../../core/recordingDisplay';
import type { RecordingTrace } from '../../core/recordingTypes';
const trace = (
  index: number,
  unit: string,
  maximum: number,
  minimum = -maximum,
): RecordingTrace => ({
  index,
  label: 'Ch' + index,
  unit,
  samplingFrequency: 200,
  sampleCount: 1,
  minimum,
  maximum,
  points: [{ timeSeconds: 0, value: maximum }],
});
void test('compatible EEG channels share a microvolt scale, while mixed and unresolved types stay separate', () => {
  const data = [
    trace(0, 'uV', 50),
    trace(1, 'mV', 0.1),
    trace(2, 'V', 0.00002),
    trace(3, 'nV', 2000),
    trace(4, 'µV', 10),
    trace(5, 'μV', 12),
    trace(6, 'mV', 1),
    trace(7, 'uV', 25),
  ];
  const original = structuredClone(data);
  const types = new Map(data.slice(0, 6).map((t) => [t.index, 'EEG']));
  types.set(6, 'ECG');
  const groups = recordingDisplayGroups(data, types, true);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].unit, 'µV');
  assert.equal(groups[0].shared, true);
  assert.equal(groups[0].extent, 100);
  assert.deepEqual(
    groups[0].channels.map((c) => c.factor),
    [1, 1000, 1e6, 0.001, 1, 1],
  );
  assert.equal(groups[1].type, 'ECG');
  assert.equal(groups[1].unit, 'mV');
  assert.equal(groups[1].shared, false);
  assert.equal(groups[2].type, undefined);
  assert.deepEqual(data, original);
  const separate = recordingDisplayGroups(data, types, false);
  assert.equal(separate.length, 8);
  assert.equal(separate[1].unit, 'mV');
  assert.equal(separate[1].channels[0].factor, 1);
});
void test('unknown units, extreme conversion, empty and flat traces retain bounded source-unit displays', () => {
  const data = [
    trace(0, 'unknown', 2),
    trace(1, 'V', 1e308),
    trace(2, 'uV', 0),
    trace(3, '', 3),
    trace(4, 'uV', 7, 2),
  ];
  const groups = recordingDisplayGroups(data, new Map(data.map((t) => [t.index, 'EEG'])), true);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].unit, 'unknown');
  assert.equal(groups[1].unit, 'V');
  assert.equal(groups[1].channels[0].factor, 1);
  assert.equal(groups[2].extent, 7);
  assert.equal(groups[2].shared, true);
  assert.equal(groups[3].unit, '');
  assert.equal(recordingDisplayGroups([data[2]], new Map(), true)[0].extent, 1);
  assert.deepEqual(recordingDisplayGroups([], new Map(), true), []);
});
