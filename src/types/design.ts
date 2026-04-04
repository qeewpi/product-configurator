export type ExportQuality = "fast" | "balanced" | "detailed";
export type ArtworkStyle = "flat" | "emboss";
export type CaseModelId = "compact-3-lid" | "rugged";
export type LogoBackgroundMode = "auto" | "white" | "black" | "none";

export interface LogoConfig {
  dataUrl: string | null;
  rasterSourceDataUrl: string | null;
  vectorSvg: string | null;
  originalFileName: string | null;
  aspectRatio: number;
  backgroundMode: LogoBackgroundMode;
  processedBackgroundMode: LogoBackgroundMode | null;
  position: { x: number; y: number };
  scale: number;
  color: string | null;
}

export interface DesignConfig {
  id?: string;
  model: CaseModelId;
  panelColors: [string, string, string];
  bottomColor: string;
  exportQuality: ExportQuality;
  artworkStyle: ArtworkStyle;
  logo: LogoConfig;
  createdAt?: string;
  updatedAt?: string;
}
