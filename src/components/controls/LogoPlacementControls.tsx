"use client";

import { useActiveLogo } from "@/lib/use-active-logo";

const LOGO_VERTICAL_CENTER_OFFSET = -40;

export default function LogoPlacementControls() {
  const { logo, setActiveLogo } = useActiveLogo();

  if (!logo || (!logo.dataUrl && !logo.vectorSvg)) {
    return null;
  }

  const displayedVertical = logo.position.y - LOGO_VERTICAL_CENTER_OFFSET;
  const sliderClassName =
    "block h-1 w-full cursor-pointer appearance-none accent-black bg-surface-container-highest";

  return (
    <div className="space-y-4">
      <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
        Logo Position
      </label>

      <div className="space-y-2 pb-2 last:pb-0">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-extrabold uppercase text-neutral-600">
            Horizontal
          </span>
          <span className="tabular-nums text-[13px] font-bold text-black">
            {logo.position.x.toFixed(0)}
          </span>
        </label>
        <div className="py-2">
          <input
            type="range"
            min={-60}
            max={60}
            step={1}
            value={logo.position.x}
            onChange={(event) =>
              setActiveLogo({
                position: {
                  ...logo.position,
                  x: Number.parseFloat(event.target.value),
                },
              })
            }
            className={sliderClassName}
          />
        </div>
      </div>

      <div className="space-y-2 pb-2 last:pb-0">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-extrabold uppercase text-neutral-600">
            Vertical
          </span>
          <span className="tabular-nums text-[13px] font-bold text-black">
            {displayedVertical.toFixed(0)}
          </span>
        </label>
        <div className="py-2">
          <input
            type="range"
            min={-60}
            max={60}
            step={1}
            value={displayedVertical}
            onChange={(event) =>
              setActiveLogo({
                position: {
                  ...logo.position,
                  y:
                    LOGO_VERTICAL_CENTER_OFFSET +
                    Number.parseFloat(event.target.value),
                },
              })
            }
            className={sliderClassName}
          />
        </div>
      </div>

      <div className="space-y-2 pb-0">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-extrabold uppercase text-neutral-600">
            Size
          </span>
          <span className="tabular-nums text-[13px] font-bold text-black">
            {(logo.scale * 100).toFixed(0)}%
          </span>
        </label>
        <div className="py-2">
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={logo.scale}
            onChange={(event) =>
              setActiveLogo({ scale: Number.parseFloat(event.target.value) })
            }
            className={sliderClassName}
          />
        </div>
      </div>
    </div>
  );
}
