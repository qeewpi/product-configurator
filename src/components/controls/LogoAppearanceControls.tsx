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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Logo Color
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Choose the display color for the traced SVG. Direct SVG uploads and vtracer output both follow this swatch.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {FILAMENT_PALETTE.map((filament) => (
            <button
              key={filament.hex}
              type="button"
              onClick={() => setLogo({ color: filament.hex })}
              title={filament.name}
              className={`aspect-square w-full rounded-lg border-2 transition-all hover:scale-110 ${
                logo.color === filament.hex
                  ? "border-zinc-900 ring-2 ring-zinc-400"
                  : "border-zinc-200"
              }`}
              style={{ backgroundColor: filament.hex }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Artwork Style
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
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
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                artworkStyle === option.value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
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
