/** Image controls use fixed actions, never executable commands or webview-supplied paths. */
export interface ImageState {
  status: string;
  previewFrames: number;
  loadedFrames: number;
  position: string;
  navigationEnabled: boolean;
  information: readonly { label: string; value: string }[];
  display: {
    layout: string;
    colormap: string;
    minimum: number;
    maximum: number;
    crosshair: boolean;
    frame: number;
  };
}
export interface ImageControl {
  action: 'layout' | 'colormap' | 'window' | 'crosshair' | 'frame' | 'move' | 'reset' | 'cancel';
  value?: unknown;
}
