export type ExportQuality = "fast" | "balanced" | "detailed";
export type ArtworkStyle = "flat" | "emboss";

export interface LogoConfig {
  dataUrl: string | null;
  vectorSvg: string | null;
  originalFileName: string | null;
  aspectRatio: number;
  position: { x: number; y: number };
  scale: number;
}

export interface DesignConfig {
  id?: string;
  panelColors: [string, string, string];
  bottomColor: string;
  exportQuality: ExportQuality;
  artworkStyle: ArtworkStyle;
  logo: LogoConfig;
  createdAt?: string;
  updatedAt?: string;
}
