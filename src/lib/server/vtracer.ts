import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { ExportQuality } from "@/types/design";

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
  colormode: "color" | "bw";
  corner_threshold: number;
  filter_speckle: number;
  hierarchical?: "stacked" | "cutout";
  layer_difference?: number;
  length_threshold: number;
  mode: "spline";
  path_precision: number;
  splice_threshold: number;
};

const TRACE_OPTIONS_BY_QUALITY: Record<ExportQuality, TraceOptions> = {
  fast: {
    colormode: "color",
    hierarchical: "cutout",
    mode: "spline",
    filter_speckle: 12,
    color_precision: 6,
    layer_difference: 24,
    corner_threshold: 80,
    length_threshold: 6,
    splice_threshold: 60,
    path_precision: 2,
  },
  balanced: {
    colormode: "color",
    hierarchical: "cutout",
    mode: "spline",
    filter_speckle: 6,
    color_precision: 6,
    layer_difference: 16,
    corner_threshold: 70,
    length_threshold: 3,
    splice_threshold: 45,
    path_precision: 3,
  },
  detailed: {
    colormode: "color",
    hierarchical: "cutout",
    mode: "spline",
    filter_speckle: 4,
    color_precision: 6,
    layer_difference: 16,
    corner_threshold: 60,
    length_threshold: 2,
    splice_threshold: 35,
    path_precision: 5,
  },
};

const LINE_ART_TRACE_OPTIONS: Record<ExportQuality, TraceOptions> = {
  fast: {
    colormode: "bw",
    mode: "spline",
    filter_speckle: 12,
    corner_threshold: 90,
    length_threshold: 8,
    splice_threshold: 60,
    path_precision: 2,
  },
  balanced: {
    colormode: "bw",
    mode: "spline",
    filter_speckle: 8,
    corner_threshold: 80,
    length_threshold: 5,
    splice_threshold: 50,
    path_precision: 3,
  },
  detailed: {
    colormode: "bw",
    mode: "spline",
    filter_speckle: 4,
    corner_threshold: 72,
    length_threshold: 3,
    splice_threshold: 40,
    path_precision: 5,
  },
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

function getTraceOptions(
  quality: ExportQuality,
  style: "default" | "lineart"
) {
  if (style === "lineart") {
    return LINE_ART_TRACE_OPTIONS[quality] ?? LINE_ART_TRACE_OPTIONS.balanced;
  }

  return TRACE_OPTIONS_BY_QUALITY[quality] ?? TRACE_OPTIONS_BY_QUALITY.balanced;
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
  quality: ExportQuality,
  style: "default" | "lineart"
) {
  let lastError: unknown;

  for (const command of PYTHON_COMMAND_CANDIDATES) {
    try {
      await execFile(
        command,
        [
          "-c",
          PYTHON_SCRIPT,
          JSON.stringify(getTraceOptions(quality, style)),
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
  quality: ExportQuality;
  style?: "default" | "lineart";
}) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "product-configurator-vtracer-"));
  const inputPath = join(
    tempDirectory,
    `source${getInputExtension(options.fileName, options.mimeType)}`
  );
  const outputPath = join(tempDirectory, "output.svg");

  try {
    await writeFile(inputPath, options.buffer);
    await runVtracer(
      inputPath,
      outputPath,
      options.quality,
      options.style ?? "default"
    );
    return await readFile(outputPath, "utf8");
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
