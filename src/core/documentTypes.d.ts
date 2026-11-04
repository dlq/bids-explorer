export interface PreviewRecord {
  readonly title: string;
  readonly text: string;
  readonly detail?: string;
}
export interface PreviewDocument {
  readonly title: string;
  readonly subtitle: string;
  readonly notice: string;
  readonly records: readonly PreviewRecord[];
  readonly sources: readonly Readonly<{ uri: string; label: string }>[];
  readonly actions: readonly Readonly<{ id: string; label: string }>[];
}
