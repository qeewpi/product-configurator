export type ExportQuality = "fast" | "balanced" | "detailed";
export type ArtworkStyle = "flat" | "emboss";
export type CaseModelId = "compact-3-lid" | "rugged";
export type ViewerMode = "assembled" | "flat-lay" | "isolated";
export type ViewerPartKey = "top-lid" | "bottom-tray" | "clips";
export type LogoBackgroundMode = "auto" | "white" | "black" | "none";
export type LogoSourceKind = "raster" | "svg" | null;
export type TraceStyle = "color" | "lineart";
export type TracePreset = "quick" | "balanced" | "detailed" | "custom";
export type TraceHierarchicalMode = "cutout" | "stacked";
export type TraceCurveMode = "pixel" | "polygon" | "spline";

export interface TraceSettings {
  style: TraceStyle;
  preset: TracePreset;
  hierarchical: TraceHierarchicalMode;
  curveMode: TraceCurveMode;
  filterSpeckle: number;
  cornerThreshold: number;
  lengthThreshold: number;
  spliceThreshold: number;
  pathPrecision: number;
  colorPrecision: number;
  layerDifference: number;
  maxColors: number;
  paletteColors: string[];
}

export interface LogoConfig {
  dataUrl: string | null;
  rasterSourceDataUrl: string | null;
  vectorSvg: string | null;
  originalFileName: string | null;
  sourceKind: LogoSourceKind;
  traceSettings: TraceSettings;
  aspectRatio: number;
  backgroundMode: LogoBackgroundMode;
  processedBackgroundMode: LogoBackgroundMode | null;
  position: { x: number; y: number };
  scale: number;
  color: string | null;
}

export interface ViewerVisibleParts {
  "top-lid": boolean;
  "bottom-tray": boolean;
  clips: boolean;
}

export interface DesignConfig {
  id?: string;
  model: CaseModelId;
  panelColors: [string, string, string];
  bottomColor: string;
  clipsColor: string;
  exportQuality: ExportQuality;
  artworkStyle: ArtworkStyle;
  logo: LogoConfig;
  createdAt?: string;
  updatedAt?: string;
}
