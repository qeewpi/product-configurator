import type { CaseModelId } from "@/types/design";

export type ModelColorSection =
  | {
      key: string;
      label: string;
      region: 0 | 1 | 2;
      type: "panel";
    }
  | {
      key: string;
      label: string;
      region: "bottom";
      type: "bottom";
    };

export type CaseModelDefinition = {
  id: CaseModelId;
  label: string;
  assetPaths: string[];
  colorSections: ModelColorSection[];
};

export const CASE_MODELS: Record<CaseModelId, CaseModelDefinition> = {
  "compact-3-lid": {
    id: "compact-3-lid",
    label: "Compact 3-Lid",
    assetPaths: ["/models/compact-3-lid.stl"],
    colorSections: [
      { key: "panel-0", label: "Left Panel", region: 0, type: "panel" },
      { key: "panel-1", label: "Center Panel", region: 1, type: "panel" },
      { key: "panel-2", label: "Right Panel", region: 2, type: "panel" },
      { key: "bottom", label: "Bottom Tray", region: "bottom", type: "bottom" },
    ],
  },
  rugged: {
    id: "rugged",
    label: "Rugged",
    assetPaths: ["/models/rugged-lid.stl", "/models/rugged-with-bottom.stl"],
    colorSections: [
      { key: "lid", label: "Lid", region: 0, type: "panel" },
      { key: "bottom", label: "Bottom", region: "bottom", type: "bottom" },
    ],
  },
};

export const CASE_MODEL_OPTIONS = Object.values(CASE_MODELS);
