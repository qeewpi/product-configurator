import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { TraceSettings } from "@/types/design";
import {
  getTraceSettingsPresetDefaults,
  normalizeTraceSettings,
} from "@/lib/trace-settings";

const execFile = promisify(execFileCallback);

const PYTHON_SCRIPT = [
  "import json",
  "import sys",
  "import vtracer",
  "options = json.loads(sys.argv[1])",
  "kwargs = {key: value for key, value in options.items() if value is not None}",
  "vtracer.convert_image_to_svg_py(sys.argv[2], sys.argv[3], **kwargs)",
].join("\n");

const PYTHON_COMMAND_CANDIDATES = [
  process.env.VTRACER_PYTHON,
  "py",
  "python3",
  "python",
].filter((value): value is string => Boolean(value));

type TraceOptions = {
  color_precision?: number;
  colormode: "color" | "binary";
  corner_threshold: number;
  filter_speckle: number;
  hierarchical?: "stacked" | "cutout";
  layer_difference?: number;
  length_threshold: number;
  mode: "none" | "polygon" | "spline";
  path_precision: number;
  splice_threshold: number;
};

function getInputExtension(fileName?: string, mimeType?: string) {
  const fileExtension = extname(fileName ?? "").toLowerCase();
  if (fileExtension) {
    return fileExtension;
  }

  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return ".png";
  }
}

function getExecutionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unknown vtracer error";
  }

  const errorWithExtras = error as Error & {
    code?: string | number;
    stderr?: string;
    stdout?: string;
  };

  if (errorWithExtras.code === "ENOENT") {
    return "Python with the vtracer package is not available to the app runtime";
  }

  return (
    errorWithExtras.stderr?.trim() ||
    errorWithExtras.stdout?.trim() ||
    error.message
  );
}

async function runVtracer(
  inputPath: string,
  outputPath: string,
  traceSettings: TraceSettings
) {
  const normalized = normalizeTraceSettings(traceSettings);
  const defaults = getTraceSettingsPresetDefaults(
    normalized.style,
    normalized.preset === "custom" ? "balanced" : normalized.preset
  );
  const resolvedSettings = {
    ...defaults,
    ...normalized,
  };
  const traceOptions: TraceOptions = {
    colormode: normalized.style === "lineart" ? "binary" : "color",
    hierarchical: normalized.style === "lineart" ? undefined : resolvedSettings.hierarchical,
    mode: resolvedSettings.curveMode === "pixel" ? "none" : resolvedSettings.curveMode,
    filter_speckle: resolvedSettings.filterSpeckle,
    corner_threshold: resolvedSettings.cornerThreshold,
    length_threshold: resolvedSettings.lengthThreshold,
    splice_threshold: resolvedSettings.spliceThreshold,
    path_precision: resolvedSettings.pathPrecision,
  };

  if (normalized.style === "color") {
    traceOptions.color_precision = resolvedSettings.colorPrecision;
    traceOptions.layer_difference = resolvedSettings.layerDifference;
  }

  let lastError: unknown;

  for (const command of PYTHON_COMMAND_CANDIDATES) {
    try {
      await execFile(
        command,
        [
          "-c",
          PYTHON_SCRIPT,
          JSON.stringify(traceOptions),
          inputPath,
          outputPath,
        ],
        {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(getExecutionErrorMessage(lastError));
}

export async function traceRasterBufferToSvg(options: {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  traceSettings: TraceSettings;
}) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "product-configurator-vtracer-"));
  const inputPath = join(
    tempDirectory,
    `source${getInputExtension(options.fileName, options.mimeType)}`
  );
  const outputPath = join(tempDirectory, "output.svg");

  try {
    await writeFile(inputPath, options.buffer);
    await runVtracer(inputPath, outputPath, options.traceSettings);
    return await readFile(outputPath, "utf8");
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
