import type {
  TraceCurveMode,
  TraceHierarchicalMode,
  TracePreset,
  TraceSettings,
  TraceStyle,
} from "@/types/design";

type TraceNumericDefaults = Omit<
  TraceSettings,
  "style" | "preset" | "hierarchical" | "curveMode"
>;

export const DEFAULT_TRACE_STYLE: TraceStyle = "color";
export const DEFAULT_TRACE_PRESET: Exclude<TracePreset, "custom"> = "balanced";
export const DEFAULT_TRACE_HIERARCHICAL: TraceHierarchicalMode = "cutout";
export const DEFAULT_TRACE_CURVE_MODE: TraceCurveMode = "spline";

export const TRACE_PRESET_DEFAULTS: Record<
  TraceStyle,
  Record<Exclude<TracePreset, "custom">, TraceNumericDefaults>
> = {
  color: {
    quick: {
      filterSpeckle: 12,
      cornerThreshold: 80,
      lengthThreshold: 6,
      spliceThreshold: 60,
      pathPrecision: 2,
      colorPrecision: 6,
      layerDifference: 24,
    },
    balanced: {
      filterSpeckle: 6,
      cornerThreshold: 70,
      lengthThreshold: 3,
      spliceThreshold: 45,
      pathPrecision: 3,
      colorPrecision: 6,
      layerDifference: 16,
    },
    detailed: {
      filterSpeckle: 4,
      cornerThreshold: 60,
      lengthThreshold: 2,
      spliceThreshold: 35,
      pathPrecision: 5,
      colorPrecision: 6,
      layerDifference: 16,
    },
  },
  lineart: {
    quick: {
      filterSpeckle: 12,
      cornerThreshold: 90,
      lengthThreshold: 8,
      spliceThreshold: 60,
      pathPrecision: 2,
      colorPrecision: 6,
      layerDifference: 16,
    },
    balanced: {
      filterSpeckle: 8,
      cornerThreshold: 80,
      lengthThreshold: 5,
      spliceThreshold: 50,
      pathPrecision: 3,
      colorPrecision: 6,
      layerDifference: 16,
    },
    detailed: {
      filterSpeckle: 4,
      cornerThreshold: 72,
      lengthThreshold: 3,
      spliceThreshold: 40,
      pathPrecision: 5,
      colorPrecision: 6,
      layerDifference: 16,
    },
  },
};

const TRACE_NUMERIC_LIMITS: Record<
  keyof TraceNumericDefaults,
  { min: number; max: number }
> = {
  filterSpeckle: { min: 0, max: 24 },
  cornerThreshold: { min: 0, max: 180 },
  lengthThreshold: { min: 0, max: 24 },
  spliceThreshold: { min: 0, max: 120 },
  pathPrecision: { min: 0, max: 10 },
  colorPrecision: { min: 0, max: 12 },
  layerDifference: { min: 0, max: 64 },
};

function clampInteger(value: number | null | undefined, min: number, max: number) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value as number)));
}

function getTraceNumericDefaults(
  style: TraceStyle,
  preset: Exclude<TracePreset, "custom">
): TraceNumericDefaults {
  return TRACE_PRESET_DEFAULTS[style][preset];
}

export function getDefaultTraceSettings(
  style: TraceStyle = DEFAULT_TRACE_STYLE,
  preset: Exclude<TracePreset, "custom"> = DEFAULT_TRACE_PRESET
): TraceSettings {
  return {
    style,
    preset,
    hierarchical: DEFAULT_TRACE_HIERARCHICAL,
    curveMode: DEFAULT_TRACE_CURVE_MODE,
    ...getTraceNumericDefaults(style, preset),
  };
}

export function normalizeTraceSettings(
  settings?: Partial<TraceSettings> | null
): TraceSettings {
  const style: TraceStyle = settings?.style === "lineart" ? "lineart" : "color";
  const preset: TracePreset =
    settings?.preset === "quick" ||
    settings?.preset === "balanced" ||
    settings?.preset === "detailed" ||
    settings?.preset === "custom"
      ? settings.preset
      : DEFAULT_TRACE_PRESET;
  const hierarchical: TraceHierarchicalMode =
    settings?.hierarchical === "stacked" ? "stacked" : DEFAULT_TRACE_HIERARCHICAL;
  const curveMode: TraceCurveMode =
    settings?.curveMode === "pixel" ||
    settings?.curveMode === "polygon" ||
    settings?.curveMode === "spline"
      ? settings.curveMode
      : DEFAULT_TRACE_CURVE_MODE;
  const baseDefaults = getTraceNumericDefaults(
    style,
    preset === "custom" ? DEFAULT_TRACE_PRESET : preset
  );

  return {
    style,
    preset,
    hierarchical,
    curveMode,
    filterSpeckle: clampInteger(
      settings?.filterSpeckle ?? baseDefaults.filterSpeckle,
      TRACE_NUMERIC_LIMITS.filterSpeckle.min,
      TRACE_NUMERIC_LIMITS.filterSpeckle.max
    ),
    cornerThreshold: clampInteger(
      settings?.cornerThreshold ?? baseDefaults.cornerThreshold,
      TRACE_NUMERIC_LIMITS.cornerThreshold.min,
      TRACE_NUMERIC_LIMITS.cornerThreshold.max
    ),
    lengthThreshold: clampInteger(
      settings?.lengthThreshold ?? baseDefaults.lengthThreshold,
      TRACE_NUMERIC_LIMITS.lengthThreshold.min,
      TRACE_NUMERIC_LIMITS.lengthThreshold.max
    ),
    spliceThreshold: clampInteger(
      settings?.spliceThreshold ?? baseDefaults.spliceThreshold,
      TRACE_NUMERIC_LIMITS.spliceThreshold.min,
      TRACE_NUMERIC_LIMITS.spliceThreshold.max
    ),
    pathPrecision: clampInteger(
      settings?.pathPrecision ?? baseDefaults.pathPrecision,
      TRACE_NUMERIC_LIMITS.pathPrecision.min,
      TRACE_NUMERIC_LIMITS.pathPrecision.max
    ),
    colorPrecision: clampInteger(
      settings?.colorPrecision ?? baseDefaults.colorPrecision,
      TRACE_NUMERIC_LIMITS.colorPrecision.min,
      TRACE_NUMERIC_LIMITS.colorPrecision.max
    ),
    layerDifference: clampInteger(
      settings?.layerDifference ?? baseDefaults.layerDifference,
      TRACE_NUMERIC_LIMITS.layerDifference.min,
      TRACE_NUMERIC_LIMITS.layerDifference.max
    ),
  };
}

export function getTraceSettingsPresetDefaults(
  style: TraceStyle,
  preset: Exclude<TracePreset, "custom">
) {
  return getTraceNumericDefaults(style, preset);
}

export function isTraceSettingsPresetMatch(
  settings: TraceSettings,
  style: TraceStyle,
  preset: Exclude<TracePreset, "custom">
) {
  if (settings.style !== style) {
    return false;
  }

  const defaults = getTraceNumericDefaults(style, preset);
  return (
    settings.filterSpeckle === defaults.filterSpeckle &&
    settings.cornerThreshold === defaults.cornerThreshold &&
    settings.lengthThreshold === defaults.lengthThreshold &&
    settings.spliceThreshold === defaults.spliceThreshold &&
    settings.hierarchical === DEFAULT_TRACE_HIERARCHICAL &&
    settings.curveMode === DEFAULT_TRACE_CURVE_MODE &&
    settings.pathPrecision === defaults.pathPrecision &&
    settings.colorPrecision === defaults.colorPrecision &&
    settings.layerDifference === defaults.layerDifference
  );
}
