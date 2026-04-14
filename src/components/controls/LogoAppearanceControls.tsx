"use client";

import { useDesignStore } from "@/lib/store";
import { useActiveLogo } from "@/lib/use-active-logo";
import type { ArtworkStyle } from "@/types/design";

export default function LogoAppearanceControls() {
  const { logo } = useActiveLogo();
  const artworkStyle = useDesignStore((state) => state.artworkStyle);
  const setArtworkStyle = useDesignStore((state) => state.setArtworkStyle);

  if (!logo || (!logo.dataUrl && !logo.vectorSvg)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
            Artwork Style
          </label>
          <p className="mt-1 text-xs text-outline">
            Flat keeps the artwork flush. Emboss raises it above the lid.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            { value: "flat", label: "Flat" },
            { value: "emboss", label: "Emboss" },
          ] as Array<{ value: ArtworkStyle; label: string }>).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setArtworkStyle(option.value)}
              className={`border px-3 py-2 text-sm font-medium transition-colors ${
                artworkStyle === option.value
                  ? "border-black bg-black text-white"
                  : "border-surface-container-highest bg-white text-on-surface-variant hover:border-outline-variant"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
