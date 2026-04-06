"use client";

import { useDesignStore } from "@/lib/store";

const LOGO_VERTICAL_CENTER_OFFSET = -40;

export default function LogoPlacementControls() {
  const logo = useDesignStore((state) => state.logo);
  const setLogo = useDesignStore((state) => state.setLogo);

  if (!logo.dataUrl && !logo.vectorSvg) {
    return null;
  }

  const displayedVertical = logo.position.y - LOGO_VERTICAL_CENTER_OFFSET;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
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
          onChange={(event) =>
            setLogo({
              position: {
                ...logo.position,
                x: Number.parseFloat(event.target.value),
              },
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
          onChange={(event) =>
            setLogo({
              position: {
                ...logo.position,
                y:
                  LOGO_VERTICAL_CENTER_OFFSET +
                  Number.parseFloat(event.target.value),
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
          onChange={(event) =>
            setLogo({ scale: Number.parseFloat(event.target.value) })
          }
          className="w-full accent-zinc-700"
        />
      </div>
    </div>
  );
}

