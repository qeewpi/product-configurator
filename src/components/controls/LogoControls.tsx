"use client";

import { useDesignStore } from "@/lib/store";
import { FILAMENT_PALETTE } from "@/lib/filaments";
import type { ArtworkStyle, LogoBackgroundMode } from "@/types/design";

const LOGO_VERTICAL_CENTER_OFFSET = -40;
const BACKGROUND_MODE_OPTIONS: Array<{
  value: LogoBackgroundMode;
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "white", label: "White BG" },
  { value: "black", label: "Black BG" },
  { value: "none", label: "Keep Background" },
];

export default function LogoControls() {
  const logo = useDesignStore((s) => s.logo);
  const artworkStyle = useDesignStore((s) => s.artworkStyle);
  const setLogo = useDesignStore((s) => s.setLogo);
  const setArtworkStyle = useDesignStore((s) => s.setArtworkStyle);
  const displayedVertical = logo.position.y - LOGO_VERTICAL_CENTER_OFFSET;

  if (!logo.dataUrl) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
        Logo Position
      </h3>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs text-zinc-500">
          <span>Horizontal</span>
          <span>{logo.position.x.toFixed(0)}</span>
        </label>
        <input
          type="range"
          min={-60}
          max={60}
          step={1}
          value={logo.position.x}
          onChange={(e) =>
            setLogo({
              position: { ...logo.position, x: parseFloat(e.target.value) },
            })
          }
          className="w-full accent-zinc-700"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs text-zinc-500">
          <span>Vertical</span>
          <span>{displayedVertical.toFixed(0)}</span>
        </label>
        <input
          type="range"
          min={-60}
          max={60}
          step={1}
          value={displayedVertical}
          onChange={(e) =>
            setLogo({
              position: {
                ...logo.position,
                y:
                  LOGO_VERTICAL_CENTER_OFFSET +
                  parseFloat(e.target.value),
              },
            })
          }
          className="w-full accent-zinc-700"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs text-zinc-500">
          <span>Size</span>
          <span>{(logo.scale * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={logo.scale}
          onChange={(e) =>
            setLogo({ scale: parseFloat(e.target.value) })
          }
          className="w-full accent-zinc-700"
        />
      </div>

      {logo.rasterSourceDataUrl ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
              Background Removal
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Choose which solid backdrop should be treated like a keyed
              background.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {BACKGROUND_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLogo({ backgroundMode: option.value })}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  logo.backgroundMode === option.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
            Logo Color
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Choose a filament color for the logo graphics.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {FILAMENT_PALETTE.map((filament) => (
            <button
              key={filament.hex}
              type="button"
              onClick={() => setLogo({ color: filament.hex })}
              title={filament.name}
              className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
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
          <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
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
