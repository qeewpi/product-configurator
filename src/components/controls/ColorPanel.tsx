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
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
        Colors
      </h3>

      {sections.map((section) => {
        const isOpen = expanded === section.key;
        const currentColor = getColor(section);

        return (
          <div
            key={section.key}
            className="overflow-hidden rounded-xl border border-zinc-200"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : section.key)}
              className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50"
            >
              <div
                className="h-6 w-6 shrink-0 rounded-full border-2 border-zinc-300"
                style={{ backgroundColor: currentColor }}
              />
              <span className="flex-1 text-left text-sm font-medium text-zinc-700">
                {section.label}
              </span>
              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1">
                <div className="grid grid-cols-6 gap-2">
                  {FILAMENT_PALETTE.map((filament) => (
                    <button
                      key={filament.hex}
                      type="button"
                      onClick={() => handleColorSelect(section, filament.hex)}
                      title={filament.name}
                      className={`aspect-square w-full rounded-lg border-2 transition-all hover:scale-110 ${
                        currentColor === filament.hex
                          ? "border-zinc-900 ring-2 ring-zinc-400"
                          : "border-zinc-200"
                      }`}
                      style={{ backgroundColor: filament.hex }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
