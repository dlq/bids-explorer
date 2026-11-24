import type { EdfHeader } from './edf';

export interface RecordingWindowRequest {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly channels: readonly number[];
}
export interface RecordingWindowPlan extends RecordingWindowRequest {
  readonly endSeconds: number;
  readonly offset: number;
  readonly bytes: number;
  readonly firstRecord: number;
}
export interface RecordingTrace {
  readonly index: number;
  readonly label: string;
  readonly unit: string;
  readonly samplingFrequency: number;
  readonly sampleCount: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly points: readonly Readonly<{ timeSeconds: number; value: number }>[];
}
export interface RecordingWindow {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly bytes: number;
  readonly channels: readonly RecordingTrace[];
}
export interface RecordingViewSnapshot {
  readonly token: string;
  readonly filename: string;
  readonly title: string;
  readonly context: string;
  readonly source: string;
  readonly canInspect: boolean;
  readonly header: EdfHeader;
}
