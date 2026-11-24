import type { RecordingEvent } from './recordingMetadataTypes';

export function eventNumber(token: string): number | undefined {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token) &&
    Number.isFinite(Number(token))
    ? Number(token)
    : undefined;
}

export function eventsInWindow(
  events: readonly RecordingEvent[],
  start: number,
  end: number,
): readonly RecordingEvent[] {
  return events.filter(
    (event) =>
      event.onset !== undefined &&
      (event.duration === undefined
        ? event.onset >= start && event.onset < end
        : event.duration >= 0 && event.onset < end && event.onset + event.duration >= start),
  );
}
