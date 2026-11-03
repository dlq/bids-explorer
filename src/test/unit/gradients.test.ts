import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  parseGradients,
  groupGradients,
  rotateDirection,
  MAX_GRADIENT_VOLUMES,
} from '../../core/gradients';

void test('gradient parsing preserves acquisition order and original numeric tokens', () => {
  const table = parseGradients(' 0 1.0e3 +2000\r\n', '\n-0 2 .0\r\n0 0 -3\n0 0 0\n');
  assert.deepEqual(
    table.volumes.map((v) => [v.index, v.b, v.vector, v.norm]),
    [
      [0, 0, [-0, 0, 0], 0],
      [1, 1000, [2, 0, 0], 2],
      [2, 2000, [0, -3, 0], 3],
    ],
  );
  assert.deepEqual(table.volumes[1].raw, ['1.0e3', '2', '0', '0']);
  assert.ok(Object.isFrozen(table.volumes));
  assert.ok(Object.isFrozen(table.volumes[0]));
});

void test('preview rejects ambiguous shapes and non-representable values with useful errors', () => {
  const valid = '1\n0\n0';
  for (const b of [
    '',
    '   ',
    Array(MAX_GRADIENT_VOLUMES + 1)
      .fill('0')
      .join(' '),
  ])
    assert.throws(() => parseGradients(b, valid), /requires 1–/);
  for (const vec of ['', '1 0 0', '1\n0', '1\n0\n0\n0'])
    assert.throws(() => parseGradients('1000', vec), /three rows/);
  assert.throws(() => parseGradients('0 1000', valid), /lengths must agree/);
  for (const b of ['NaN', 'Infinity', '0x10', '1e999', 'foo'])
    assert.throws(() => parseGradients(b, valid), /non-finite or non-numeric.*b-value/);
  assert.throws(() => parseGradients('-1', valid), /negative b-value/);
  for (const vec of ['NaN\n0\n0', '0\nInfinity\n0', '0\n0\n1e999'])
    assert.throws(() => parseGradients('1000', vec), /non-finite or non-numeric/);
  assert.throws(() => parseGradients('1000', '1.7e308\n1.7e308\n1.7e308'), /magnitude/);
  const count = MAX_GRADIENT_VOLUMES;
  assert.equal(
    parseGradients(
      Array(count).fill('0').join(' '),
      Array(3).fill(Array(count).fill('0').join(' ')).join('\n'),
    ).volumes.length,
    count,
  );
});

void test('display grouping separates low-b, anchors tolerance and preserves volume identity', () => {
  const table = parseGradients('1080 0 1000 1040 50 2000', '1 0 1 1 0 0\n0 0 0 0 0 0\n0 0 0 0 0 0');
  const grouped = groupGradients(table);
  assert.deepEqual(grouped.groupByVolume, [2, 0, 1, 1, 0, 3]);
  assert.deepEqual(
    grouped.groups.map((g) => [g.minimum, g.maximum, g.mean, g.count]),
    [
      [0, 50, 25, 2],
      [1000, 1040, 1020, 2],
      [1080, 1080, 1080, 1],
      [2000, 2000, 2000, 1],
    ],
  );
  assert.deepEqual(grouped.lowBIndices, [1, 4]);
  assert.deepEqual(grouped.plottedIndices, [0, 2, 3]);
  assert.deepEqual(grouped.zeroDirectionIndices, [5]);
  assert.deepEqual(
    table.volumes.map((v) => v.b),
    [1080, 0, 1000, 1040, 50, 2000],
  );
  assert.equal(groupGradients(table, 0, 0).groups.length, 6);
  assert.deepEqual(groupGradients(table, 3000).plottedIndices, []);
  const noLow = groupGradients(parseGradients('1000', '1\n0\n0'));
  assert.deepEqual(noLow.groups[0], {
    id: 0,
    lowB: true,
    minimum: null,
    maximum: null,
    mean: null,
    count: 0,
  });
  for (const [threshold, tolerance] of [
    [-1, 0],
    [0, -1],
    [NaN, 50],
    [0, Infinity],
  ])
    assert.throws(() => groupGradients(table, threshold, tolerance), /thresholds/);
});

void test('sphere projection normalizes only the presentation and rotates raw axes', () => {
  assert.equal(rotateDirection([0, 0, 0], 0, 0), undefined);
  assert.deepEqual(rotateDirection([2, 0, 0], 0, 0), [1, 0, 0]);
  const yaw = rotateDirection([2, 0, 0], Math.PI / 2, 0)!;
  assert.ok(Math.abs(yaw[0]) < 1e-12);
  assert.equal(yaw[2], -1);
  const pitch = rotateDirection([0, 0, 5], 0, Math.PI / 2)!;
  assert.equal(pitch[1], -1);
  assert.ok(Math.abs(pitch[2]) < 1e-12);
});
