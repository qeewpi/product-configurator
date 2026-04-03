"use client";

import { useState } from "react";
import { useDesignStore } from "@/lib/store";
import { FILAMENT_PALETTE } from "@/lib/filaments";

const SECTIONS = [
  { key: "panel-0", label: "Left Panel", region: 0 as const },
  { key: "panel-1", label: "Center Panel", region: 1 as const },
  { key: "panel-2", label: "Right Panel", region: 2 as const },
  { key: "bottom", label: "Bottom Tray", region: "bottom" as const },
];

export default function ColorPanel() {
  const [expanded, setExpanded] = useState<string | null>("panel-0");

  const panelColors = useDesignStore((s) => s.panelColors);
  const bottomColor = useDesignStore((s) => s.bottomColor);
  const setRegionColor = useDesignStore((s) => s.setRegionColor);
  const setBottomColor = useDesignStore((s) => s.setBottomColor);

  const getColor = (section: (typeof SECTIONS)[number]) =>
    section.region === "bottom" ? bottomColor : panelColors[section.region];

  const handleColorSelect = (
    section: (typeof SECTIONS)[number],
    hex: string
  ) => {
    if (section.region === "bottom") {
      setBottomColor(hex);
    } else {
      setRegionColor(section.region, hex);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
        Colors
      </h3>

      {SECTIONS.map((section) => {
        const isOpen = expanded === section.key;
        const currentColor = getColor(section);

        return (
          <div key={section.key} className="border border-zinc-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : section.key)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full border-2 border-zinc-300 shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="text-sm font-medium text-zinc-700 flex-1 text-left">
                {section.label}
              </span>
              <svg
                className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1">
                <div className="grid grid-cols-6 gap-2">
                  {FILAMENT_PALETTE.map((filament) => (
                    <button
                      key={filament.hex}
                      onClick={() => handleColorSelect(section, filament.hex)}
                      title={filament.name}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
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
