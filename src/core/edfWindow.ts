import { setImmediate } from 'node:timers/promises';
import type { EdfHeader } from './edf';
import type { RecordingTrace, RecordingWindow, RecordingWindowPlan } from './recordingTypes';

/** Validate untrusted UI requests against the host-held header before doing IO. */
export function planEdfWindow(header: EdfHeader, input: unknown): RecordingWindowPlan {
  if (header.format === 'EDF+D')
    throw new Error('Discontinuous EDF+ needs decoded gap timing before waveform viewing.');
  if (!header.recordCount || header.recordedSeconds === undefined)
    throw new Error('Waveform viewing requires a known, positive record count.');
  if (!input || typeof input !== 'object') throw new Error('Choose a signal window.');
  const { startSeconds, durationSeconds, channels } = input as Record<string, unknown>;
  if (
    typeof startSeconds !== 'number' ||
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    startSeconds >= header.recordedSeconds ||
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 30
  )
    throw new Error(
      'Choose a start within the recording and a duration greater than 0, up to 30 seconds.',
    );
  if (
    !Array.isArray(channels) ||
    !channels.length ||
    channels.length > 8 ||
    new Set(channels).size !== channels.length ||
    channels.some(
      (index: unknown) =>
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= header.signals.length ||
        header.signals[index].annotations,
    )
  )
    throw new Error('Select 1–8 distinct signal channels; annotation storage is not a waveform.');
  const endSeconds = Math.min(header.recordedSeconds, startSeconds + durationSeconds);
  let firstRecord = Math.floor(startSeconds / header.recordSeconds);
  let lastRecord = Math.min(header.recordCount, Math.ceil(endSeconds / header.recordSeconds));
  let samples = 0;
  for (const index of channels as number[]) {
    const rate = header.signals[index].samplingFrequency;
    const first = Math.ceil(startSeconds * rate),
      last = Math.min(
        header.recordCount * header.signals[index].samplesPerRecord,
        Math.ceil(endSeconds * rate),
      );
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last <= first)
      throw new Error('This window has no safely addressable samples for a selected channel.');
    // Fractional record durations can round differently through division and sample-rate
    // multiplication. Cover the actual selected sample indices before bounding the read.
    firstRecord = Math.min(firstRecord, Math.floor(first / header.signals[index].samplesPerRecord));
    lastRecord = Math.max(lastRecord, Math.ceil(last / header.signals[index].samplesPerRecord));
    samples += last - first;
  }
  const offset = header.headerBytes + firstRecord * header.recordBytes;
  const bytes = (lastRecord - firstRecord) * header.recordBytes;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(bytes) ||
    !Number.isSafeInteger(offset + bytes) ||
    bytes < 1 ||
    bytes > 16 * 1024 ** 2
  )
    throw new Error(
      'Signal window exceeds the 16 MiB record-read budget; choose a shorter window.',
    );
  if (samples > 1_000_000) throw new Error('Signal window exceeds one million selected samples.');
  return {
    startSeconds,
    durationSeconds,
    endSeconds,
    firstRecord,
    offset,
    bytes,
    channels: [...(channels as number[])],
  };
}

/** Calibrate the selected samples and preserve bucket extrema, with cooperative cancellation. */
export async function decodeEdfWindow(
  header: EdfHeader,
  plan: RecordingWindowPlan,
  data: Buffer,
  signal: AbortSignal,
): Promise<RecordingWindow> {
  signal.throwIfAborted();
  if (data.length !== plan.bytes) throw new Error('Truncated recording window.');
  const channels: RecordingTrace[] = [];
  let checked = 0;
  for (const index of plan.channels) {
    const channel = header.signals[index];
    const gain =
      (channel.physicalMaximum - channel.physicalMinimum) /
      (channel.digitalMaximum - channel.digitalMinimum);
    if (!Number.isFinite(gain)) throw new Error('Signal calibration exceeds numeric limits.');
    const channelOffset = header.signals
      .slice(0, index)
      .reduce((sum, row) => sum + 2 * row.samplesPerRecord, 0);
    const first = Math.ceil(plan.startSeconds * channel.samplingFrequency);
    const count =
      Math.min(
        header.recordCount! * channel.samplesPerRecord,
        Math.ceil(plan.endSeconds * channel.samplingFrequency),
      ) - first;
    const buckets = Math.min(count, 1024);
    const points: { timeSeconds: number; value: number }[] = [];
    let minimum = Infinity,
      maximum = -Infinity;
    for (let bucket = 0; bucket < buckets; bucket++) {
      const begin = Math.floor((bucket * count) / buckets),
        end = Math.floor(((bucket + 1) * count) / buckets);
      let low = Infinity,
        high = -Infinity,
        lowIndex = 0,
        highIndex = 0;
      for (let sample = begin; sample < end; sample++) {
        if (++checked % 8192 === 0) {
          await setImmediate();
          signal.throwIfAborted();
        }
        const absolute = first + sample;
        const record = Math.floor(absolute / channel.samplesPerRecord) - plan.firstRecord;
        const position =
          record * header.recordBytes + channelOffset + 2 * (absolute % channel.samplesPerRecord);
        const raw = data.readInt16LE(position);
        const value = channel.physicalMinimum + (raw - channel.digitalMinimum) * gain;
        if (!Number.isFinite(value)) throw new Error('Signal value exceeds numeric limits.');
        if (value < low) {
          low = value;
          lowIndex = sample;
        }
        if (value > high) {
          high = value;
          highIndex = sample;
        }
      }
      minimum = Math.min(minimum, low);
      maximum = Math.max(maximum, high);
      const extrema =
        lowIndex === highIndex
          ? [[lowIndex, low]]
          : lowIndex < highIndex
            ? [
                [lowIndex, low],
                [highIndex, high],
              ]
            : [
                [highIndex, high],
                [lowIndex, low],
              ];
      for (const [sample, value] of extrema)
        points.push({ timeSeconds: (first + sample) / channel.samplingFrequency, value });
    }
    channels.push({
      index,
      label: channel.label,
      unit: channel.unit,
      samplingFrequency: channel.samplingFrequency,
      sampleCount: count,
      minimum,
      maximum,
      points,
    });
  }
  signal.throwIfAborted();
  return {
    startSeconds: plan.startSeconds,
    endSeconds: plan.endSeconds,
    bytes: plan.bytes,
    channels,
  };
}
