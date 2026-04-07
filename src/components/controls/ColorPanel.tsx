"use client";

import { useState } from "react";
import { CASE_MODELS } from "@/lib/model-catalog";
import { useDesignStore } from "@/lib/store";
import { FILAMENT_PALETTE } from "@/lib/filaments";

type ColorSection =
  | {
      key: string;
      label: string;
      kind: "panel";
      panelIndex: 0 | 1 | 2;
    }
  | {
      key: string;
      label: string;
      kind: "bottom";
    }
  | {
      key: string;
      label: string;
      kind: "clips";
    };

function buildColorSections(model: keyof typeof CASE_MODELS) {
  const definition = CASE_MODELS[model];
  const lidLabels =
    definition.lidSectionCount === 3
      ? ["Left Lid", "Center Lid", "Right Lid"]
      : ["Top Lid"];

  const sections: ColorSection[] = lidLabels.map((label, index) => ({
    key: `panel-${index}`,
    label,
    kind: "panel",
    panelIndex: index as 0 | 1 | 2,
  }));

  sections.push({
    key: "bottom",
    label: "Bottom Tray",
    kind: "bottom",
  });

  sections.push({
    key: "clips",
    label: "Clips",
    kind: "clips",
  });

  return sections;
}

export default function ColorPanel() {
  const model = useDesignStore((s) => s.model);
  const panelColors = useDesignStore((s) => s.panelColors);
  const bottomColor = useDesignStore((s) => s.bottomColor);
  const clipsColor = useDesignStore((s) => s.clipsColor);
  const setRegionColor = useDesignStore((s) => s.setRegionColor);
  const setBottomColor = useDesignStore((s) => s.setBottomColor);
  const setClipsColor = useDesignStore((s) => s.setClipsColor);
  const sections = buildColorSections(model);
  const [expanded, setExpanded] = useState<string | null>(sections[0]?.key ?? null);

  const getColor = (section: ColorSection) => {
    if (section.kind === "bottom") {
      return bottomColor;
    }

    if (section.kind === "clips") {
      return clipsColor;
    }

    return panelColors[section.panelIndex];
  };

  const handleColorSelect = (section: ColorSection, hex: string) => {
    if (section.kind === "bottom") {
      setBottomColor(hex);
      return;
    }

    if (section.kind === "clips") {
      setClipsColor(hex);
      return;
    }

    setRegionColor(section.panelIndex, hex);
  };

  return (
    <div className="space-y-4">
      <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
        Colors
      </label>

      <div className="space-y-2">
        {sections.map((section) => {
          const isOpen = expanded === section.key;
          const currentColor = getColor(section);

          return (
            <div
              key={section.key}
              className="overflow-hidden border border-slate-200"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : section.key)}
                className="flex h-11 w-full items-center justify-between px-4 py-3 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-5 w-5 shrink-0 border border-slate-200"
                    style={{ backgroundColor: currentColor }}
                  />
                  <span className="text-sm font-medium text-slate-900">
                    {section.label}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {isOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-wrap gap-2 p-4 pt-0">
                  {FILAMENT_PALETTE.map((filament) => (
                    <button
                      key={filament.hex}
                      type="button"
                      onClick={() => handleColorSelect(section, filament.hex)}
                      title={filament.name}
                      className={`h-5 w-5 border transition-all hover:scale-110 ${
                        currentColor === filament.hex
                          ? "border-slate-900"
                          : "border-slate-200"
                      }`}
                      style={{ backgroundColor: filament.hex }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
