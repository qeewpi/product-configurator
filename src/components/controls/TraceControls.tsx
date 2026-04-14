"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import { FILAMENT_PALETTE } from "@/lib/filaments";
import { useDesignStore } from "@/lib/store";
import { useActiveLogo } from "@/lib/use-active-logo";
import {
  getDefaultTraceSettings,
  isTraceSettingsPresetMatch,
} from "@/lib/trace-settings";
import { resolveLogoSourceKind } from "@/lib/logo-svg-preview";
import type {
  TraceCurveMode,
  TraceHierarchicalMode,
  TracePreset,
  TraceSettings,
  TraceStyle,
} from "@/types/design";

const BACKGROUND_MODE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "white", label: "White BG" },
  { value: "black", label: "Black BG" },
  { value: "none", label: "Keep Background" },
] as const;

const TRACE_STYLE_OPTIONS: Array<{ value: TraceStyle; label: string }> = [
  { value: "color", label: "Color" },
  { value: "lineart", label: "B/W" },
];

const HIERARCHICAL_OPTIONS: Array<{
  value: TraceHierarchicalMode;
  label: string;
}> = [
  { value: "cutout", label: "Cutout" },
  { value: "stacked", label: "Stacked" },
];

const CURVE_MODE_OPTIONS: Array<{ value: TraceCurveMode; label: string }> = [
  { value: "pixel", label: "Pixel" },
  { value: "polygon", label: "Polygon" },
  { value: "spline", label: "Spline" },
];

const TRACE_PRESET_OPTIONS: Array<{
  value: Exclude<TracePreset, "custom">;
  label: string;
}> = [
  { value: "quick", label: "Quick" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

type TraceSliderField =
  | "filterSpeckle"
  | "cornerThreshold"
  | "lengthThreshold"
  | "spliceThreshold"
  | "pathPrecision"
  | "colorPrecision"
  | "layerDifference"
  | "maxColors";

type SliderConfig = {
  field: TraceSliderField;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
};

const TRACE_SLIDERS: SliderConfig[] = [
  {
    field: "filterSpeckle",
    label: "Filter Speckle",
    min: 0,
    max: 24,
    step: 1,
    description: "Remove tiny noise before tracing.",
  },
  {
    field: "cornerThreshold",
    label: "Corner Threshold",
    min: 0,
    max: 180,
    step: 1,
    description: "Higher values preserve sharper corners.",
  },
  {
    field: "lengthThreshold",
    label: "Segment Length",
    min: 0,
    max: 24,
    step: 1,
    description: "Drop short path segments when cleaning the trace.",
  },
  {
    field: "spliceThreshold",
    label: "Splice Threshold",
    min: 0,
    max: 120,
    step: 1,
    description: "Join nearby segments into smoother paths.",
  },
  {
    field: "pathPrecision",
    label: "Path Precision",
    min: 0,
    max: 10,
    step: 1,
    description: "Higher values preserve more node detail.",
  },
  {
    field: "colorPrecision",
    label: "Color Precision",
    min: 0,
    max: 12,
    step: 1,
    description: "Only used for color traces.",
  },
  {
    field: "layerDifference",
    label: "Layer Difference",
    min: 0,
    max: 64,
    step: 1,
    description: "Only used for color traces.",
  },
  {
    field: "maxColors",
    label: "Max Colors",
    min: 2,
    max: 12,
    step: 1,
    description: "Reduce nearby shades before tracing.",
  },
];

function updateTraceSettings(
  current: TraceSettings,
  next: Partial<TraceSettings>
) {
  return {
    ...current,
    ...next,
  };
}

function SelectDropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border border-surface-container-highest bg-white px-3 py-2 text-sm font-medium text-on-surface transition-none"
      >
        <span>{selected?.label}</span>
        <MaterialIcon
          name={open ? "expand_less" : "expand_more"}
          className="h-[18px] w-[18px] text-outline"
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-10 border border-surface-container-highest border-t-0 bg-white"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-sm font-medium transition-none ${
                  isSelected
                    ? "bg-black text-white"
                    : "text-on-surface hover:bg-surface-container-high"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SegmentedButtonGroup<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-extrabold uppercase text-neutral-600">
        {label}
      </h4>
      <div
        className="grid gap-0.5 bg-surface-container-low p-0.5"
        role="radiogroup"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const isSelected = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(item.value)}
              tabIndex={isSelected ? 0 : -1}
              className={`px-3 py-2 text-[13px] font-bold uppercase transition-none ${
                isSelected
                  ? "bg-black text-white"
                  : "text-neutral-500 hover:bg-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderRow({
  slider,
  value,
  onChange,
}: {
  slider: SliderConfig;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-2 pb-2 last:pb-0">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-extrabold uppercase text-neutral-600">
          {slider.label}
        </span>
        <span className="tabular-nums text-[13px] font-bold text-black">{value}</span>
      </label>
      <div className="py-2">
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          onChange={(event) => onChange(Number.parseFloat(event.target.value))}
          className="block h-1 w-full cursor-pointer appearance-none accent-black bg-surface-container-highest"
        />
      </div>
    </div>
  );
}

export default function TraceControls() {
  const searchParams = useSearchParams();
  const { logo, setActiveLogo } = useActiveLogo();
  const panelColors = useDesignStore((state) => state.panelColors);
  const bottomColor = useDesignStore((state) => state.bottomColor);
  const clipsColor = useDesignStore((state) => state.clipsColor);
  const sourceKind = logo ? resolveLogoSourceKind(logo) : null;
  const [advancedOpen, setAdvancedOpen] = useState(
    searchParams.get("traceAdvanced") === "open"
  );

  const hasLogo = logo && (logo.dataUrl || logo.vectorSvg);
  const shouldShowRasterControls = sourceKind === "raster";

  if (!hasLogo || !logo) {
    return null;
  }

  const handleStyleChange = (style: TraceStyle) => {
    const nextPreset = (
      logo.traceSettings.preset === "custom"
        ? "balanced"
        : logo.traceSettings.preset
    ) as Exclude<TracePreset, "custom">;
    setActiveLogo({
      traceSettings: {
        ...getDefaultTraceSettings(style, nextPreset),
        style,
        preset: nextPreset,
        paletteColors: logo.traceSettings.paletteColors,
      },
    });
  };

  const handlePresetChange = (preset: Exclude<TracePreset, "custom">) => {
    setActiveLogo({
      traceSettings: {
        ...getDefaultTraceSettings(logo.traceSettings.style, preset),
        style: logo.traceSettings.style,
        preset,
        paletteColors: logo.traceSettings.paletteColors,
      },
    });
  };

  const handleSliderChange = (field: TraceSliderField, value: number) => {
    const nextSettings = updateTraceSettings(logo.traceSettings, {
      [field]: value,
    } as Partial<TraceSettings>);

    const presetMatches =
      nextSettings.preset !== "custom" &&
      isTraceSettingsPresetMatch(
        {
          ...nextSettings,
          preset: nextSettings.preset,
        },
        nextSettings.style,
        nextSettings.preset
      );

    setActiveLogo({
      traceSettings: {
        ...nextSettings,
        preset: presetMatches ? nextSettings.preset : "custom",
      },
    });
  };

  const handleHierarchicalChange = (hierarchical: TraceHierarchicalMode) => {
    const nextSettings = updateTraceSettings(logo.traceSettings, { hierarchical });
    const presetMatches =
      nextSettings.preset !== "custom" &&
      isTraceSettingsPresetMatch(
        {
          ...nextSettings,
          preset: nextSettings.preset,
        },
        nextSettings.style,
        nextSettings.preset
      );

    setActiveLogo({
      traceSettings: {
        ...nextSettings,
        preset: presetMatches ? nextSettings.preset : "custom",
      },
    });
  };

  const handleCurveModeChange = (curveMode: TraceCurveMode) => {
    const nextSettings = updateTraceSettings(logo.traceSettings, { curveMode });
    const presetMatches =
      nextSettings.preset !== "custom" &&
      isTraceSettingsPresetMatch(
        {
          ...nextSettings,
          preset: nextSettings.preset,
        },
        nextSettings.style,
        nextSettings.preset
      );

    setActiveLogo({
      traceSettings: {
        ...nextSettings,
        preset: presetMatches ? nextSettings.preset : "custom",
      },
    });
  };

  const updatePaletteColors = (paletteColors: string[]) => {
    setActiveLogo({
      traceSettings: {
        ...logo.traceSettings,
        paletteColors,
        preset: "custom",
      },
    });
  };

  const handlePaletteToggle = (hex: string) => {
    const paletteColors = logo.traceSettings.paletteColors.includes(hex)
      ? logo.traceSettings.paletteColors.filter((color) => color !== hex)
      : [...logo.traceSettings.paletteColors, hex];

    updatePaletteColors(paletteColors);
  };

  const handleUseCurrentDesignColors = () => {
    const paletteColors = Array.from(
      new Set([
        ...panelColors,
        bottomColor,
        clipsColor,
        ...(logo.color ? [logo.color] : []),
      ])
    );

    updatePaletteColors(paletteColors);
  };

  const handleClearPaletteColors = () => {
    updatePaletteColors([]);
  };

  return (
    <div className="space-y-6">
      {shouldShowRasterControls ? (
        <>
          <div className="space-y-2">
            <div>
              <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
                Background Removal
              </label>
              <p className="mt-1 text-[14px] text-outline">
                Choose the border-connected backdrop family to remove. Auto
                only removes it when the border evidence is strong enough.
              </p>
            </div>

            <SelectDropdown
              options={BACKGROUND_MODE_OPTIONS}
              value={logo.backgroundMode}
              onChange={(value) => setActiveLogo({ backgroundMode: value })}
            />
          </div>

          <SegmentedButtonGroup
            label="Clustering"
            items={TRACE_STYLE_OPTIONS}
            value={logo.traceSettings.style}
            onChange={handleStyleChange}
          />

          {logo.traceSettings.style === "color" ? (
            <SegmentedButtonGroup
              label="Layering"
              items={HIERARCHICAL_OPTIONS}
              value={logo.traceSettings.hierarchical}
              onChange={handleHierarchicalChange}
            />
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[13px] font-extrabold uppercase text-neutral-600">
                Trace Preset
              </h4>
              {logo.traceSettings.preset === "custom" ? (
                <span className="bg-black px-2 py-1 text-[12px] font-bold uppercase text-white">
                  Custom
                </span>
              ) : null}
            </div>
            <div
              className="grid gap-0.5 bg-surface-container-low p-0.5"
              role="radiogroup"
              aria-label="Trace Preset"
              style={{
                gridTemplateColumns: `repeat(${TRACE_PRESET_OPTIONS.length}, minmax(0, 1fr))`,
              }}
            >
              {TRACE_PRESET_OPTIONS.map((item) => {
                const isSelected = logo.traceSettings.preset === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handlePresetChange(item.value)}
                    tabIndex={isSelected ? 0 : -1}
                    className={`px-3 py-2 text-[13px] font-bold uppercase transition-none ${
                      isSelected
                        ? "bg-black text-white"
                        : "text-neutral-500 hover:bg-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <details
            open={advancedOpen}
            onToggle={(event) =>
              setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)
            }
            className="overflow-hidden border-t border-surface-container-low pt-4"
          >
            <summary className="cursor-pointer list-none text-sm font-medium text-on-surface-variant">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-extrabold uppercase text-neutral-600">
                  Advanced
                </span>
                <MaterialIcon
                  name={advancedOpen ? "expand_less" : "expand_more"}
                  className="h-6 w-6 text-outline-variant"
                />
              </div>
            </summary>

            <div className="space-y-4 pt-4">
              <SegmentedButtonGroup
                label="Curve Fitting"
                items={CURVE_MODE_OPTIONS}
                value={logo.traceSettings.curveMode}
                onChange={handleCurveModeChange}
              />

              {logo.traceSettings.style === "color" ? (
                <div className="space-y-2 border border-surface-container-highest bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[13px] font-extrabold uppercase text-neutral-600">
                      Palette Colors
                    </label>
                    <span className="text-[13px] text-outline">
                      Optional exact swatches
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FILAMENT_PALETTE.map((filament) => {
                      const isSelected = logo.traceSettings.paletteColors.includes(
                        filament.hex
                      );

                      return (
                        <button
                          key={filament.hex}
                          type="button"
                          onClick={() => handlePaletteToggle(filament.hex)}
                      title={filament.name}
                          className={`h-5 w-5 border transition-all hover:scale-105 ${
                            isSelected
                              ? "border-on-surface"
                              : "border-surface-container-highest"
                          }`}
                          style={{ backgroundColor: filament.hex }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentDesignColors}
                      className="border border-surface-container-highest bg-white px-3 py-1.5 text-[13px] font-bold uppercase text-neutral-600 transition-colors hover:border-outline-variant hover:text-on-surface"
                    >
                      Use Current Design Colors
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPaletteColors}
                      className="border border-surface-container-highest bg-white px-3 py-1.5 text-[13px] font-bold uppercase text-neutral-600 transition-colors hover:border-outline-variant hover:text-on-surface"
                    >
                      Auto Palette
                    </button>
                  </div>
                  {logo.traceSettings.paletteColors.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {logo.traceSettings.paletteColors.map((color) => {
                        const filament =
                          FILAMENT_PALETTE.find((item) => item.hex === color) ?? null;

                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => handlePaletteToggle(color)}
                            className="inline-flex items-center gap-2 border border-surface-container-highest bg-surface-container-low px-2.5 py-1 text-[13px] font-bold uppercase text-neutral-600"
                          >
                            <span
                              className="h-3 w-3 border border-outline-variant"
                              style={{ backgroundColor: color }}
                            />
                            {filament?.name ?? color}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="text-[14px] text-outline">
                    Pick exact swatches to force the trace into a fixed palette,
                    or leave this empty to let Max Colors auto-pick the palette.
                  </p>
                </div>
              ) : null}

              {TRACE_SLIDERS.filter((slider) =>
                logo.traceSettings.style === "lineart"
                  ? slider.field !== "colorPrecision" &&
                    slider.field !== "layerDifference" &&
                    slider.field !== "maxColors"
                  : true
              ).filter((slider) =>
                logo.traceSettings.curveMode === "pixel"
                  ? slider.field !== "pathPrecision" &&
                    slider.field !== "cornerThreshold" &&
                    slider.field !== "lengthThreshold" &&
                    slider.field !== "spliceThreshold"
                  : true
              ).map((slider) => (
                <SliderRow
                  key={slider.field}
                  slider={slider}
                  value={logo.traceSettings[slider.field]}
                  onChange={(value) => handleSliderChange(slider.field, value)}
                />
              ))}
            </div>
          </details>
        </>
      ) : (
        <div className="border border-surface-container-highest bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Uploaded SVGs are previewed directly. Tracing controls are only needed
          for raster uploads.
        </div>
      )}
    </div>
  );
}
