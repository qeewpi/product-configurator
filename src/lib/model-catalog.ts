import type { CaseModelId } from "@/types/design";

export type CaseModelDefinition = {
  id: CaseModelId;
  label: string;
  assetPath: string;
  lidSectionCount: 1 | 3;
  clipCount: 2 | 3;
};

export const CASE_MODELS: Record<CaseModelId, CaseModelDefinition> = {
  "compact-3-lid": {
    id: "compact-3-lid",
    label: "Compact 3-Lid",
    assetPath: "/models/compact-3-lid-full.stl",
    lidSectionCount: 3,
    clipCount: 3,
  },
  rugged: {
    id: "rugged",
    label: "Rugged",
    assetPath: "/models/rugged-full.stl",
    lidSectionCount: 1,
    clipCount: 2,
  },
};

export const CASE_MODEL_OPTIONS = Object.values(CASE_MODELS);
