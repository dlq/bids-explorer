/** Image controls use fixed actions, never executable commands or webview-supplied paths. */
export interface ImageState {
  status: string;
  previewFrames: number;
  loadedFrames: number;
  position: string;
  coordinates?: {
    voxel: readonly number[];
    physical?: readonly number[];
    units?: string;
    transform: string;
  };
  voxelValue?: string;
  positionError?: string;
  navigationEnabled: boolean;
  information: readonly { label: string; value: string }[];
  display: {
    layout: string;
    colormap: string;
    minimum: number;
    maximum: number;
    crosshair: boolean;
    frame: number;
    orientation?: 'neurological' | 'radiological';
  };
}
export interface ImageControl {
  action:
    | 'layout'
    | 'colormap'
    | 'window'
    | 'crosshair'
    | 'frame'
    | 'move'
    | 'position'
    | 'orientation'
    | 'reset'
    | 'cancel';
  value?: unknown;
}
