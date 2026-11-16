export type CutawaySide = 'left' | 'right' | 'anterior' | 'posterior' | 'superior' | 'inferior';

export interface LightboxSettings {
  plane: 'axial' | 'coronal' | 'sagittal';
  first: number;
  last: number;
  step: number;
}

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
  lightbox?: {
    settings: LightboxSettings;
    lastIndex: number;
    count: number;
    error?: string;
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
    volumeMode?: 'full' | 'cutaway';
    cutawayCorner?: readonly [CutawaySide, CutawaySide, CutawaySide];
    orientation?: 'neurological' | 'radiological';
  };
}
export interface ImageControl {
  action:
    | 'layout'
    | 'lightbox'
    | 'colormap'
    | 'window'
    | 'crosshair'
    | 'frame'
    | 'move'
    | 'position'
    | 'orientation'
    | 'volumeMode'
    | 'cutawayCorner'
    | 'reset'
    | 'cancel';
  value?: unknown;
}
