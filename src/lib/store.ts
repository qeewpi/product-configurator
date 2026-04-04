import { create } from "zustand";
import type {
  ArtworkStyle,
  DesignConfig,
  ExportQuality,
  LogoConfig,
} from "@/types/design";

const LOGO_VERTICAL_CENTER_OFFSET = -40;

interface DesignStore extends DesignConfig {
  setRegionColor: (index: 0 | 1 | 2, color: string) => void;
  setBottomColor: (color: string) => void;
  setExportQuality: (quality: ExportQuality) => void;
  setArtworkStyle: (style: ArtworkStyle) => void;
  setLogo: (logo: Partial<LogoConfig>) => void;
  clearLogo: () => void;
  serialize: () => DesignConfig;
  hydrate: (config: DesignConfig) => void;
  reset: () => void;
}

const DEFAULT_STATE: DesignConfig = {
  panelColors: ["#DC2626", "#2563EB", "#16A34A"],
  bottomColor: "#1A1A1A",
  exportQuality: "balanced",
  artworkStyle: "flat",
  logo: {
    dataUrl: null,
    vectorSvg: null,
    originalFileName: null,
    aspectRatio: 1,
    position: { x: 0, y: LOGO_VERTICAL_CENTER_OFFSET },
    scale: 1,
  },
};

export const useDesignStore = create<DesignStore>((set, get) => ({
  ...DEFAULT_STATE,

  setRegionColor: (index, color) =>
    set((state) => {
      const panelColors = [...state.panelColors] as [string, string, string];
      panelColors[index] = color;
      return { panelColors };
    }),

  setBottomColor: (color) => set({ bottomColor: color }),

  setExportQuality: (exportQuality) => set({ exportQuality }),

  setArtworkStyle: (artworkStyle) => set({ artworkStyle }),

  setLogo: (logo) =>
    set((state) => ({
      logo: { ...state.logo, ...logo },
    })),

  clearLogo: () =>
    set({
      logo: {
        dataUrl: null,
        vectorSvg: null,
        originalFileName: null,
        aspectRatio: 1,
        position: { x: 0, y: LOGO_VERTICAL_CENTER_OFFSET },
        scale: 1,
      },
    }),

  serialize: () => {
    const {
      panelColors,
      bottomColor,
      exportQuality,
      artworkStyle,
      logo,
      id,
      createdAt,
      updatedAt,
    } = get();
      return {
        panelColors,
        bottomColor,
        exportQuality,
        artworkStyle,
        logo,
        id,
        createdAt,
      updatedAt,
    };
  },

  hydrate: (config) =>
    set((state) => ({
      ...config,
      exportQuality: config.exportQuality ?? state.exportQuality,
      artworkStyle: config.artworkStyle ?? state.artworkStyle,
      logo: {
        ...state.logo,
        ...config.logo,
        vectorSvg: config.logo?.vectorSvg ?? null,
        aspectRatio: config.logo?.aspectRatio ?? 1,
      },
    })),

  reset: () => set({ ...DEFAULT_STATE }),
}));
