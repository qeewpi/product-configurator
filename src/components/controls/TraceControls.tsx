"use client";

import { useState } from "react";
import { useDesignStore } from "@/lib/store";
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
  | "layerDifference";

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
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
          {label}
        </h4>
      </div>
      <div
        className="grid rounded-full bg-zinc-100 p-1"
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
              className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
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
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <label className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-700">
        <span>{slider.label}</span>
        <span className="tabular-nums text-zinc-500">{value}</span>
      </label>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
        className="w-full accent-zinc-700"
      />
      <p className="text-xs text-zinc-500">{slider.description}</p>
    </div>
  );
}

export default function TraceControls() {
  const logo = useDesignStore((state) => state.logo);
  const setLogo = useDesignStore((state) => state.setLogo);
  const sourceKind = resolveLogoSourceKind(logo);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const hasLogo = Boolean(logo.dataUrl || logo.vectorSvg);
  const shouldShowRasterControls = sourceKind === "raster";

  if (!hasLogo) {
    return null;
  }

  const handleStyleChange = (style: TraceStyle) => {
    const nextPreset = (
      logo.traceSettings.preset === "custom"
        ? "balanced"
        : logo.traceSettings.preset
    ) as Exclude<TracePreset, "custom">;
    setLogo({
      traceSettings: {
        ...getDefaultTraceSettings(style, nextPreset),
        style,
        preset: nextPreset,
      },
    });
  };

  const handlePresetChange = (preset: Exclude<TracePreset, "custom">) => {
    setLogo({
      traceSettings: {
        ...getDefaultTraceSettings(logo.traceSettings.style, preset),
        style: logo.traceSettings.style,
        preset,
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

    setLogo({
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

    setLogo({
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

    setLogo({
      traceSettings: {
        ...nextSettings,
        preset: presetMatches ? nextSettings.preset : "custom",
      },
    });
  };

  return (
    <div className="space-y-4">
      {shouldShowRasterControls ? (
        <>
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
                Background Removal
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Choose the border-connected backdrop family to remove. Auto
                only removes it when the border evidence is strong enough.
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                Trace Preset
              </h4>
              {logo.traceSettings.preset === "custom" ? (
                <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white">
                  Custom
                </span>
              ) : null}
            </div>
            <div
              className="grid rounded-full bg-zinc-100 p-1"
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
                    className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-600 hover:text-zinc-900"
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
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <span>Advanced</span>
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${
                    advancedOpen ? "rotate-180" : ""
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
              </div>
            </summary>

            <div className="space-y-3 px-4 pb-4">
              <SegmentedButtonGroup
                label="Curve Fitting"
                items={CURVE_MODE_OPTIONS}
                value={logo.traceSettings.curveMode}
                onChange={handleCurveModeChange}
              />

              {TRACE_SLIDERS.filter((slider) =>
                logo.traceSettings.style === "lineart"
                  ? slider.field !== "colorPrecision" &&
                    slider.field !== "layerDifference"
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
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Uploaded SVGs are previewed directly. Tracing controls are only needed
          for raster uploads.
        </div>
      )}
    </div>
  );
}
