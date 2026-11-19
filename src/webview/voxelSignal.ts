export interface SignalTiming {
  step?: number;
  offset?: number;
  starts?: readonly number[];
  source?: string;
  units?: string;
}

export interface VoxelSignal {
  voxel: readonly number[];
  total: number;
  frames: number[];
  x: number[];
  values: (number | null)[];
  axis: string;
  units: string;
  pending: boolean;
}

/** Frame indices are zero based internally and one based on the plot. */
export function signalTime(frame: number, timing: SignalTiming): number {
  return timing.starts?.[frame] ?? (timing.offset ?? 0) + frame * (timing.step ?? 1);
}

export async function readVoxelSignal(
  voxel: readonly number[],
  total: number,
  available: number,
  read: (frame: number) => number,
  timing: SignalTiming,
  cancelled: () => boolean,
): Promise<VoxelSignal | undefined> {
  const count = Math.min(available, 4096);
  const signal: VoxelSignal = {
    voxel,
    total,
    frames: [],
    x: [],
    values: [],
    axis: timing.source ? 'Time (s) · ' + timing.source : 'Volume',
    units: timing.units ?? 'Image value (units not recorded)',
    pending: available < total,
  };
  for (let i = 0; i < count; i++) {
    if (i % 256 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return;
    }
    const frame = count === 1 ? 0 : Math.round((i * (available - 1)) / (count - 1));
    const value = read(frame);
    signal.frames.push(frame + 1);
    signal.x.push(timing.source ? signalTime(frame, timing) : frame + 1);
    signal.values.push(Number.isFinite(value) ? value : null);
  }
  return signal;
}
