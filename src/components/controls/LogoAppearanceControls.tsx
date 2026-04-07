"use client";

import { FILAMENT_PALETTE } from "@/lib/filaments";
import { useDesignStore } from "@/lib/store";
import type { ArtworkStyle } from "@/types/design";

export default function LogoAppearanceControls() {
  const logo = useDesignStore((state) => state.logo);
  const artworkStyle = useDesignStore((state) => state.artworkStyle);
  const setLogo = useDesignStore((state) => state.setLogo);
  const setArtworkStyle = useDesignStore((state) => state.setArtworkStyle);

  if (!logo.dataUrl && !logo.vectorSvg) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
            Logo Color
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Choose the display color for the traced SVG. Direct SVG uploads and vtracer output both follow this swatch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILAMENT_PALETTE.map((filament) => (
            <button
              key={filament.hex}
              type="button"
              onClick={() => setLogo({ color: filament.hex })}
              title={filament.name}
              className={`h-5 w-5 border transition-all hover:scale-110 ${
                logo.color === filament.hex
                  ? "border-slate-900"
                  : "border-slate-200"
              }`}
              style={{ backgroundColor: filament.hex }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
            Artwork Style
          </label>
          <p className="mt-1 text-xs text-slate-500">
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
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
