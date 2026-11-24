/** Technical EDF header only: never publish patient identifiers, recording IDs or dates. */
export interface EdfSignal {
  readonly label: string;
  readonly unit: string;
  readonly samplesPerRecord: number;
  readonly samplingFrequency: number;
  readonly physicalMinimum: number;
  readonly physicalMaximum: number;
  readonly digitalMinimum: number;
  readonly digitalMaximum: number;
  readonly annotations: boolean;
}
export interface EdfHeader {
  readonly format: 'EDF' | 'EDF+C' | 'EDF+D';
  readonly headerBytes: number;
  readonly recordBytes: number;
  readonly recordCount?: number;
  readonly recordSeconds: number;
  /** Sum of declared record durations, not elapsed time for discontinuous EDF+D. */
  readonly recordedSeconds?: number;
  readonly signals: readonly EdfSignal[];
}

const maxSignals = 1024;
const maxRecordBytes = 16 * 1024 * 1024;

function text(bytes: Uint8Array, start: number, length: number): string {
  const field = bytes.subarray(start, start + length);
  if (field.some((byte) => byte < 32 || byte > 126))
    throw new Error('EDF technical header fields must contain printable ASCII.');
  return new TextDecoder('ascii').decode(field).trim();
}

function number(bytes: Uint8Array, start: number, length: number): number {
  const token = text(bytes, start, length);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))
    throw new Error('Invalid EDF numeric field.');
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error('Non-finite EDF numeric field.');
  return value;
}

/** Determine the bounded header read from the first 256 bytes, without reading signal data. */
export function edfHeaderBytes(bytes: Uint8Array): number {
  if (bytes.length < 256) throw new Error('Truncated EDF fixed header.');
  if (text(bytes, 0, 8) !== '0') throw new Error('Unsupported EDF version or recording format.');
  const count = number(bytes, 252, 4);
  if (!Number.isInteger(count) || count < 1 || count > maxSignals)
    throw new Error('EDF summary supports 1–1024 signals.');
  const size = number(bytes, 184, 8);
  if (size !== 256 * (count + 1)) throw new Error('Invalid EDF header length.');
  return size;
}

/** Parse bounded technical metadata. This does not check payload integrity or decode samples. */
export function parseEdfHeader(bytes: Uint8Array, signal: AbortSignal): EdfHeader {
  signal.throwIfAborted();
  const headerBytes = edfHeaderBytes(bytes);
  if (bytes.length < headerBytes) throw new Error('Truncated EDF signal header.');
  const count = headerBytes / 256 - 1;
  const reserved = text(bytes, 192, 44);
  if (reserved && !/^EDF\+[CD](?: |$)/.test(reserved))
    throw new Error('Unsupported EDF reserved header format.');
  const format = reserved.startsWith('EDF+D') ? 'EDF+D' : reserved ? 'EDF+C' : 'EDF';
  const records = number(bytes, 236, 8);
  if (!Number.isSafeInteger(records) || records < -1)
    throw new Error('Invalid EDF data record count.');
  const recordSeconds = number(bytes, 244, 8);
  if (recordSeconds <= 0) throw new Error('EDF summary requires positive record duration.');
  const signals: EdfSignal[] = [];
  let recordBytes = 0;
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    // EDF stores each field for all signals before the next field (not channel structs).
    const label = text(bytes, 256 + index * 16, 16);
    const unit = text(bytes, 256 + count * 96 + index * 8, 8);
    const physicalMinimum = number(bytes, 256 + count * 104 + index * 8, 8);
    const physicalMaximum = number(bytes, 256 + count * 112 + index * 8, 8);
    const digitalMinimum = number(bytes, 256 + count * 120 + index * 8, 8);
    const digitalMaximum = number(bytes, 256 + count * 128 + index * 8, 8);
    const samplesPerRecord = number(bytes, 256 + count * 216 + index * 8, 8);
    if (
      !Number.isInteger(samplesPerRecord) ||
      samplesPerRecord < 1 ||
      !Number.isFinite(samplesPerRecord / recordSeconds) ||
      (recordBytes += 2 * samplesPerRecord) > maxRecordBytes
    )
      throw new Error('EDF sample counts exceed the 16 MiB record budget or are invalid.');
    if (
      physicalMinimum === physicalMaximum ||
      !Number.isInteger(digitalMinimum) ||
      !Number.isInteger(digitalMaximum) ||
      digitalMinimum < -32768 ||
      digitalMaximum > 32767 ||
      digitalMinimum >= digitalMaximum
    )
      throw new Error('Invalid EDF signal calibration.');
    signals.push(
      Object.freeze({
        label,
        unit,
        samplesPerRecord,
        samplingFrequency: samplesPerRecord / recordSeconds,
        physicalMinimum,
        physicalMaximum,
        digitalMinimum,
        digitalMaximum,
        annotations: format !== 'EDF' && label === 'EDF Annotations',
      }),
    );
  }
  const recordedSeconds = records * recordSeconds;
  if (!Number.isFinite(recordedSeconds)) throw new Error('EDF duration exceeds numeric limits.');
  return Object.freeze({
    format,
    headerBytes,
    recordBytes,
    ...(records < 0 ? {} : { recordCount: records, recordedSeconds }),
    recordSeconds,
    signals: Object.freeze(signals),
  });
}
