import { computeOtsuThreshold, extractInkColor } from "@/lib/logo-background";
import { getClosestFilamentColor } from "@/lib/filaments";
import { processRasterSourceDataUrl } from "@/lib/logo-trace";
import { getDefaultTraceSettings } from "@/lib/trace-settings";
import type { LogoConfig } from "@/types/design";

export type RasterQualityNotice = {
  message: string;
  severity: "warning" | "info";
};

const RECOMMENDED_MIN_SOURCE_DIMENSION = 1000;
const AUTO_UPSCALE_MIN_SOURCE_DIMENSION = 600;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function getImageAspectRatio(src: string) {
  const image = await loadImage(src);
  return image.naturalWidth > 0 && image.naturalHeight > 0
    ? image.naturalWidth / image.naturalHeight
    : 1;
}

function createRasterQualityNotice(
  width: number,
  height: number,
  mimeType: string
): RasterQualityNotice | null {
  const shortestSide = Math.min(width, height);
  const isJpeg = mimeType === "image/jpeg";

  if (shortestSide < AUTO_UPSCALE_MIN_SOURCE_DIMENSION) {
    return {
      severity: "warning",
      message: isJpeg
        ? "Low-resolution JPG detected. We upscaled it before tracing, but a larger PNG or SVG will give cleaner results."
        : "Low-resolution image detected. We upscaled it before tracing, but a larger PNG or SVG will give cleaner results.",
    };
  }

  if (isJpeg) {
    return {
      severity: "warning",
      message:
        "JPG logos often trace with rough edges. PNG with transparency or SVG will usually look cleaner.",
    };
  }

  if (shortestSide < RECOMMENDED_MIN_SOURCE_DIMENSION) {
    return {
      severity: "info",
      message:
        "This image is on the small side for tracing. A larger PNG or SVG will usually produce cleaner artwork.",
    };
  }

  return null;
}

type UploadSeed = Pick<LogoConfig, "backgroundMode" | "traceSettings"> | null;

export async function prepareLogoUpload(
  file: File,
  seedLogo: UploadSeed = null
): Promise<{
  patch: Partial<LogoConfig>;
  rasterQualityNotice: RasterQualityNotice | null;
}> {
  const isSvg = file.type === "image/svg+xml" || file.name.endsWith(".svg");

  if (isSvg) {
    const dataUrl = await readFileAsDataUrl(file);
    let vectorSvg = await readFileAsText(file);

    vectorSvg = vectorSvg.replace(/background:\s*[^;"]+;?/gi, "");

    return {
      patch: {
        dataUrl,
        rasterSourceDataUrl: null,
        vectorSvg,
        sourceKind: "svg",
        traceSettings: getDefaultTraceSettings(),
        aspectRatio: await getImageAspectRatio(dataUrl),
        backgroundMode: "auto",
        processedBackgroundMode: null,
        originalFileName: file.name,
      },
      rasterQualityNotice: null,
    };
  }

  const backgroundMode = seedLogo?.backgroundMode ?? "auto";
  const traceSettings = seedLogo?.traceSettings ?? getDefaultTraceSettings();
  const rasterSourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rasterSourceDataUrl);

  let detectedColor = "#1A1A1A";
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    512 / Math.max(image.naturalWidth, image.naturalHeight)
  );
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const threshold = computeOtsuThreshold(imageData);
    const ink = extractInkColor(imageData, threshold);
    detectedColor = getClosestFilamentColor(ink.r, ink.g, ink.b);
  }

  const rasterQualityNotice = createRasterQualityNotice(
    image.naturalWidth,
    image.naturalHeight,
    file.type || "image/png"
  );

  const processed = await processRasterSourceDataUrl(
    rasterSourceDataUrl,
    backgroundMode,
    traceSettings
  );

  return {
    patch: {
      dataUrl: processed.previewDataUrl,
      rasterSourceDataUrl,
      vectorSvg: null,
      sourceKind: "raster",
      traceSettings,
      aspectRatio: image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1,
      backgroundMode,
      processedBackgroundMode: backgroundMode,
      originalFileName: file.name,
      color: detectedColor,
    },
    rasterQualityNotice,
  };
}
