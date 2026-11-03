/** Portable model shared by the Node host and the webview. No dataset writes or coordinate inference. */
export const MAX_GRADIENT_VOLUMES = 10000;
export interface GradientVolume {
  readonly index: number;
  readonly b: number;
  readonly vector: readonly [number, number, number];
  readonly raw: readonly [string, string, string, string];
  readonly norm: number;
}
export interface GradientTable {
  readonly volumes: readonly GradientVolume[];
}
export interface BValueGroup {
  readonly id: number;
  readonly lowB: boolean;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
  readonly count: number;
}
export interface GradientGrouping {
  readonly groups: readonly BValueGroup[];
  readonly groupByVolume: readonly number[];
  readonly lowBIndices: readonly number[];
  readonly plottedIndices: readonly number[];
  readonly zeroDirectionIndices: readonly number[];
}

function tokens(text: string): string[] {
  return text.trim() ? text.trim().split(/\s+/) : [];
}
function number(token: string, location: string): number {
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token) ||
    !Number.isFinite(Number(token))
  ) {
    throw new Error(`Cannot preview a non-finite or non-numeric value at ${location}.`);
  }
  return Number(token);
}

export function parseGradients(bval: string, bvec: string): GradientTable {
  const b = tokens(bval);
  if (!b.length || b.length > MAX_GRADIENT_VOLUMES)
    throw new Error(`Preview requires 1–${MAX_GRADIENT_VOLUMES} b-values.`);
  const rows = bvec
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (rows.length !== 3)
    throw new Error('Preview requires the FSL b-vector format: three rows (x, y, z).');
  const vectors = rows.map(tokens);
  if (vectors.some((row) => row.length !== b.length))
    throw new Error(
      'The b-value count and all three b-vector row lengths must agree for this preview.',
    );
  const volumes = b.map((value, index): GradientVolume => {
    const raw = [value, vectors[0][index], vectors[1][index], vectors[2][index]] as const;
    const weight = number(value, `b-value, volume ${index + 1}`);
    if (weight < 0) throw new Error(`Cannot preview a negative b-value at volume ${index + 1}.`);
    const vector = [
      number(raw[1], `x, volume ${index + 1}`),
      number(raw[2], `y, volume ${index + 1}`),
      number(raw[3], `z, volume ${index + 1}`),
    ] as const;
    const norm = Math.hypot(...vector);
    if (!Number.isFinite(norm))
      throw new Error(`Vector magnitude cannot be represented at volume ${index + 1}.`);
    return Object.freeze({ index, b: weight, vector, raw, norm });
  });
  return Object.freeze({ volumes: Object.freeze(volumes) });
}

/** Display bins only: high-b groups span at most tolerance from their smallest b-value. */
export function groupGradients(
  table: GradientTable,
  lowBThreshold = 50,
  tolerance = 50,
): GradientGrouping {
  if (![lowBThreshold, tolerance].every((value) => Number.isFinite(value) && value >= 0))
    throw new Error('Display thresholds must be finite and nonnegative.');
  const bins: GradientVolume[][] = [[]];
  const sorted = [...table.volumes].sort((a, b) => a.b - b.b);
  for (const volume of sorted) {
    if (volume.b <= lowBThreshold) {
      bins[0].push(volume);
      continue;
    }
    const current = bins[bins.length - 1];
    if (bins.length === 1 || volume.b - current[0].b > tolerance) bins.push([volume]);
    else current.push(volume);
  }
  const groupByVolume: number[] = [];
  const groups = bins.map((bin, id): BValueGroup => {
    for (const volume of bin) groupByVolume[volume.index] = id;
    return {
      id,
      lowB: id === 0,
      minimum: bin[0]?.b ?? null,
      maximum: bin.at(-1)?.b ?? null,
      mean: bin.length ? bin.reduce((mean, v, i) => mean + (v.b - mean) / (i + 1), 0) : null,
      count: bin.length,
    };
  });
  return {
    groups,
    groupByVolume,
    lowBIndices: bins[0].map((v) => v.index),
    plottedIndices: table.volumes
      .filter((v) => v.b > lowBThreshold && v.norm > 0)
      .map((v) => v.index),
    zeroDirectionIndices: table.volumes
      .filter((v) => v.b > lowBThreshold && v.norm === 0)
      .map((v) => v.index),
  };
}

/** Unit-length presentation in raw b-vector axes; never an anatomical transformation. */
export function rotateDirection(
  vector: readonly number[],
  yaw: number,
  pitch: number,
): readonly [number, number, number] | undefined {
  const norm = Math.hypot(...vector);
  if (norm === 0) return undefined;
  const [x, y, z] = vector.map((value) => value / norm);
  const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
  const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [
    rx,
    y * Math.cos(pitch) - rz * Math.sin(pitch),
    y * Math.sin(pitch) + rz * Math.cos(pitch),
  ];
}
