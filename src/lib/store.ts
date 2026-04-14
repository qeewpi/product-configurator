import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  ArtworkStyle,
  CaseModelId,
  DesignConfig,
  ExportQuality,
  LogoConfig,
  ViewerMode,
  ViewerPartKey,
  ViewerVisibleParts,
} from "@/types/design";
import {
  DEFAULT_TRACE_PRESET,
  DEFAULT_TRACE_STYLE,
  getDefaultTraceSettings,
  normalizeTraceSettings,
} from "@/lib/trace-settings";
import { resolveLogoSourceKind } from "@/lib/logo-svg-preview";

const MAX_LOGOS = 8;
const LOGO_VERTICAL_CENTER_OFFSET = -40;
const DEFAULT_VISIBLE_PARTS: ViewerVisibleParts = {
  "top-lid": true,
  "bottom-tray": true,
  clips: true,
};

export function createDefaultLogoConfig(
  overrides?: Partial<LogoConfig>
): LogoConfig {
  return {
    id: nanoid(8),
    dataUrl: null,
    rasterSourceDataUrl: null,
    vectorSvg: null,
    originalFileName: null,
    sourceKind: null,
    traceSettings: getDefaultTraceSettings(DEFAULT_TRACE_STYLE, DEFAULT_TRACE_PRESET),
    aspectRatio: 1,
    backgroundMode: "auto",
    processedBackgroundMode: null,
    position: { x: 0, y: LOGO_VERTICAL_CENTER_OFFSET },
    scale: 1,
    color: null,
    ...overrides,
  };
}

function normalizeLogoConfig(raw: Partial<LogoConfig>): LogoConfig {
  return {
    id: raw.id || nanoid(8),
    dataUrl: raw.dataUrl ?? null,
    rasterSourceDataUrl: raw.rasterSourceDataUrl ?? null,
    vectorSvg: raw.vectorSvg ?? null,
    originalFileName: raw.originalFileName ?? null,
    sourceKind: resolveLogoSourceKind({
      sourceKind: raw.sourceKind ?? null,
      originalFileName: raw.originalFileName ?? null,
      rasterSourceDataUrl: raw.rasterSourceDataUrl ?? null,
      vectorSvg: raw.vectorSvg ?? null,
    }),
    traceSettings: normalizeTraceSettings(raw.traceSettings),
    aspectRatio: raw.aspectRatio ?? 1,
    backgroundMode: raw.backgroundMode ?? "auto",
    processedBackgroundMode: raw.processedBackgroundMode ?? null,
    position: raw.position ?? { x: 0, y: LOGO_VERTICAL_CENTER_OFFSET },
    scale: raw.scale ?? 1,
    color: raw.color ?? null,
  };
}

interface DesignStore extends DesignConfig {
  viewerMode: ViewerMode;
  visibleParts: ViewerVisibleParts;
  activeLogoId: string | null;

  setModel: (model: CaseModelId) => void;
  setRegionColor: (index: 0 | 1 | 2, color: string) => void;
  setBottomColor: (color: string) => void;
  setClipsColor: (color: string) => void;
  setExportQuality: (quality: ExportQuality) => void;
  setArtworkStyle: (style: ArtworkStyle) => void;
  setViewerMode: (mode: ViewerMode) => void;
  setViewerPartVisible: (part: ViewerPartKey, visible: boolean) => void;

  addLogo: (logo: LogoConfig) => void;
  updateLogo: (id: string, patch: Partial<LogoConfig>) => void;
  removeLogo: (id: string) => void;
  setActiveLogoId: (id: string | null) => void;

  // Transition shim — delegates to logos[0] for unchanged consumers
  setLogo: (logo: Partial<LogoConfig>) => void;
  clearLogo: () => void;

  serialize: () => DesignConfig;
  hydrate: (config: DesignConfig & { logo?: Partial<LogoConfig> }) => void;
  reset: () => void;
}

const DEFAULT_STATE: DesignConfig = {
  model: "compact-3-lid",
  panelColors: ["#DC2626", "#2563EB", "#16A34A"],
  bottomColor: "#1A1A1A",
  clipsColor: "#1A1A1A",
  exportQuality: "detailed",
  artworkStyle: "flat",
  logos: [],
};

export const useDesignStore = create<DesignStore>((set, get) => ({
  ...DEFAULT_STATE,
  viewerMode: "assembled",
  visibleParts: DEFAULT_VISIBLE_PARTS,
  activeLogoId: null,

  setModel: (model) => set({ model }),

  setRegionColor: (index, color) =>
    set((state) => {
      const panelColors = [...state.panelColors] as [string, string, string];
      panelColors[index] = color;
      return { panelColors };
    }),

  setBottomColor: (color) => set({ bottomColor: color }),

  setClipsColor: (color) => set({ clipsColor: color }),

  setExportQuality: (exportQuality) => set({ exportQuality }),

  setArtworkStyle: (artworkStyle) => set({ artworkStyle }),

  setViewerMode: (viewerMode) =>
    set(() => ({
      viewerMode,
      visibleParts:
        viewerMode === "isolated" ? get().visibleParts : DEFAULT_VISIBLE_PARTS,
    })),

  setViewerPartVisible: (part, visible) =>
    set((state) => {
      if (state.visibleParts[part] === visible) {
        return state;
      }

      if (visible) {
        return {
          visibleParts: {
            ...state.visibleParts,
            [part]: true,
          },
        };
      }

      const nextVisibleParts = {
        ...state.visibleParts,
        [part]: false,
      };
      const visibleCount = Object.values(nextVisibleParts).filter(Boolean).length;

      if (visibleCount === 0) {
        return state;
      }

      return {
        visibleParts: nextVisibleParts,
      };
    }),

  // --- Multi-logo methods ---

  addLogo: (logo) =>
    set((state) => {
      if (state.logos.length >= MAX_LOGOS) return state;
      return {
        logos: [...state.logos, logo],
        activeLogoId: logo.id,
      };
    }),

  updateLogo: (id, patch) =>
    set((state) => ({
      logos: state.logos.map((l) =>
        l.id === id ? { ...l, ...patch } : l
      ),
    })),

  removeLogo: (id) =>
    set((state) => {
      const next = state.logos.filter((l) => l.id !== id);
      let nextActiveId = state.activeLogoId;
      if (nextActiveId === id) {
        nextActiveId = next.length > 0 ? next[next.length - 1].id : null;
      }
      return { logos: next, activeLogoId: nextActiveId };
    }),

  setActiveLogoId: (id) => set({ activeLogoId: id }),

  // --- Transition shim (targets logos[0] for old consumers) ---

  setLogo: (patch) =>
    set((state) => {
      if (state.logos.length === 0) {
        const newLogo = createDefaultLogoConfig(patch);
        return { logos: [newLogo], activeLogoId: newLogo.id };
      }
      const targetId = state.activeLogoId ?? state.logos[0].id;
      return {
        logos: state.logos.map((l) =>
          l.id === targetId ? { ...l, ...patch } : l
        ),
        activeLogoId: state.activeLogoId ?? targetId,
      };
    }),

  clearLogo: () =>
    set((state) => {
      if (state.logos.length === 0) return state;
      const targetId = state.activeLogoId ?? state.logos[0].id;
      const next = state.logos.filter((l) => l.id !== targetId);
      const nextActiveId = next.length > 0 ? next[next.length - 1].id : null;
      return { logos: next, activeLogoId: nextActiveId };
    }),

  serialize: () => {
    const {
      model,
      panelColors,
      bottomColor,
      clipsColor,
      exportQuality,
      artworkStyle,
      logos,
      id,
      createdAt,
      updatedAt,
    } = get();
    return {
      model,
      panelColors,
      bottomColor,
      clipsColor,
      exportQuality,
      artworkStyle,
      logos,
      id,
      createdAt,
      updatedAt,
    };
  },

  hydrate: (config) =>
    set((state) => {
      // Backward compat: old single-logo format
      let logos: LogoConfig[] = [];
      if (config.logos && config.logos.length > 0) {
        logos = config.logos.map((l) => normalizeLogoConfig(l));
      } else if (config.logo) {
        const legacy = config.logo;
        if (legacy.dataUrl || legacy.vectorSvg) {
          logos = [normalizeLogoConfig(legacy)];
        }
      }
      const rest = { ...config } as typeof config & { logo?: Partial<LogoConfig> };
      delete rest.logo;

      return {
        ...rest,
        logos,
        clipsColor:
          config.clipsColor ?? config.bottomColor ?? state.bottomColor,
        model: config.model ?? state.model,
        exportQuality: config.exportQuality ?? state.exportQuality,
        artworkStyle: config.artworkStyle ?? state.artworkStyle,
        activeLogoId: logos.length > 0 ? logos[0].id : null,
      };
    }),

  reset: () =>
    set({
      ...DEFAULT_STATE,
      viewerMode: "assembled",
      visibleParts: DEFAULT_VISIBLE_PARTS,
      activeLogoId: null,
    }),
}));
