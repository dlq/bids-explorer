import type { RecordingTrace } from './recordingTypes';

export interface RecordingDisplayGroup {
  readonly key: string;
  readonly type?: string;
  readonly unit: string;
  readonly shared: boolean;
  readonly extent: number;
  readonly channels: readonly { readonly trace: RecordingTrace; readonly factor: number }[];
}
const voltageUnits = new Map<string, number>([
  ['V', 1e6],
  ['mV', 1e3],
  ['uV', 1],
  ['µV', 1],
  ['μV', 1],
  ['nV', 1e-3],
]);

/** Display grouping/calibration only. Recorded samples, reference and metadata never change. */
export function recordingDisplayGroups(
  traces: readonly RecordingTrace[],
  types: ReadonlyMap<number, string>,
  stacked: boolean,
): readonly RecordingDisplayGroup[] {
  const groups = new Map<
    string,
    {
      type?: string;
      unit: string;
      extent: number;
      channels: { trace: RecordingTrace; factor: number }[];
      shareable: boolean;
    }
  >();
  for (const trace of traces) {
    const type = types.get(trace.index);
    const conversion = type === 'EEG' ? voltageUnits.get(trace.unit) : undefined;
    const compatible =
      stacked &&
      conversion !== undefined &&
      Number.isFinite(trace.minimum * conversion) &&
      Number.isFinite(trace.maximum * conversion);
    const factor = compatible ? conversion : 1;
    const key = compatible ? 'EEG:microvolts' : 'channel:' + trace.index;
    const group = groups.get(key) ?? {
      type,
      unit: compatible ? 'µV' : trace.unit,
      extent: 0,
      channels: [],
      shareable: compatible,
    };
    group.channels.push({ trace, factor });
    group.extent = Math.max(
      group.extent,
      Math.abs(trace.minimum * factor),
      Math.abs(trace.maximum * factor),
    );
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({
    key,
    type: group.type,
    unit: group.unit,
    shared: group.shareable && group.channels.length > 1,
    extent: group.extent || 1,
    channels: group.channels,
  }));
}
