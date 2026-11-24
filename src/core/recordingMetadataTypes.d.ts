import type { TableSnapshot } from './tableTypes';

export type RecordingTableKind = 'channels' | 'events';
export type RecordingTableChoices = Partial<Record<RecordingTableKind, string>>;
export interface RecordingTableCandidate {
  readonly uri: string;
  readonly relativePath: string;
  readonly archive?: { readonly sourceUri: string };
}
export interface RecordingTable<Candidate = RecordingTableCandidate> {
  readonly status: 'resolved' | 'absent' | 'ambiguous' | 'unknown' | 'unreadable';
  readonly candidates: readonly Candidate[];
  readonly selected?: number;
  readonly table?: TableSnapshot;
  readonly message: string;
  readonly channelRows?: readonly ChannelMetadata[];
  readonly events?: readonly RecordingEvent[];
}
export type RecordingMetadata<Candidate = RecordingTableCandidate> = Readonly<
  Record<RecordingTableKind, RecordingTable<Candidate>>
>;
export interface ChannelMetadata {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}
export interface RecordingEvent {
  readonly line: number;
  readonly values: readonly string[];
  readonly onset?: number;
  readonly duration?: number;
  readonly label: string;
}
