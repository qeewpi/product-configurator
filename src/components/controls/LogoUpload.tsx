"use client";

import NextImage from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeLogoArtworkImageData,
  computeOtsuThreshold,
  extractInkColor,
} from "@/lib/logo-background";
import { traceRasterDataUrlToSvg } from "@/lib/raster-trace-client";
import { getClosestFilamentColor } from "@/lib/filaments";
import { useDesignStore } from "@/lib/store";
import type { LogoBackgroundMode } from "@/types/design";

const RECOMMENDED_MIN_SOURCE_DIMENSION = 1000;
const AUTO_UPSCALE_MIN_SOURCE_DIMENSION = 600;
const AUTO_UPSCALE_TARGET_DIMENSION = 1024;

type RasterQualityNotice = {
  didUpscale: boolean;
  message: string;
  severity: "warning" | "info";
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
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

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function createTraceFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") + ".png";
}

function setHighQualitySmoothing(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
  context.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in context) {
    context.imageSmoothingQuality = "high";
  }
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
      didUpscale: true,
      severity: "warning",
      message: isJpeg
        ? "Low-resolution JPG detected. We upscaled it before tracing, but a larger PNG or SVG will give cleaner results."
        : "Low-resolution image detected. We upscaled it before tracing, but a larger PNG or SVG will give cleaner results.",
    };
  }

  if (isJpeg) {
    return {
      didUpscale: false,
      severity: "warning",
      message:
        "JPG logos often trace with rough edges. PNG with transparency or SVG will usually look cleaner.",
    };
  }

  if (shortestSide < RECOMMENDED_MIN_SOURCE_DIMENSION) {
    return {
      didUpscale: false,
      severity: "info",
      message:
        "This image is on the small side for tracing. A larger PNG or SVG will usually produce cleaner artwork.",
    };
  }

  return null;
}

async function processRasterDataUrl(
  dataUrl: string,
  backgroundMode: LogoBackgroundMode
) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return { previewDataUrl: dataUrl, traceDataUrl: dataUrl };
  }

  context.drawImage(image, 0, 0);
  const sourceImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const normalized = normalizeLogoArtworkImageData(
    sourceImageData,
    backgroundMode
  );
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });

  if (!outputContext) {
    return { previewDataUrl: dataUrl, traceDataUrl: dataUrl };
  }

  outputContext.putImageData(normalized.imageData, 0, 0);

  const shortestSide = Math.min(canvas.width, canvas.height);
  if (shortestSide >= AUTO_UPSCALE_MIN_SOURCE_DIMENSION) {
    const resultDataUrl = outputCanvas.toDataURL("image/png");
    return {
      previewDataUrl: resultDataUrl,
      traceDataUrl: resultDataUrl,
    };
  }

  const upscaleRatio = AUTO_UPSCALE_TARGET_DIMENSION / Math.max(shortestSide, 1);
  const upscaledCanvas = document.createElement("canvas");
  upscaledCanvas.width = Math.max(
    1,
    Math.round(outputCanvas.width * upscaleRatio)
  );
  upscaledCanvas.height = Math.max(
    1,
    Math.round(outputCanvas.height * upscaleRatio)
  );
  const upscaledContext = upscaledCanvas.getContext("2d");

  if (!upscaledContext) {
    const resultDataUrl = outputCanvas.toDataURL("image/png");
    return {
      previewDataUrl: resultDataUrl,
      traceDataUrl: resultDataUrl,
    };
  }

  setHighQualitySmoothing(upscaledContext);
  upscaledContext.clearRect(
    0,
    0,
    upscaledCanvas.width,
    upscaledCanvas.height
  );
  upscaledContext.drawImage(
    outputCanvas,
    0,
    0,
    upscaledCanvas.width,
    upscaledCanvas.height
  );

  const resultDataUrl = upscaledCanvas.toDataURL("image/png");
  return {
    previewDataUrl: resultDataUrl,
    traceDataUrl: resultDataUrl,
  };
}

export default function LogoUpload() {
  const setLogo = useDesignStore((s) => s.setLogo);
  const clearLogo = useDesignStore((s) => s.clearLogo);
  const logo = useDesignStore((s) => s.logo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [rasterQualityNotice, setRasterQualityNotice] =
    useState<RasterQualityNotice | null>(null);
  const isRasterReprocessing = Boolean(
    logo.rasterSourceDataUrl &&
      logo.processedBackgroundMode !== logo.backgroundMode
  );

  useEffect(() => {
    if (!logo.rasterSourceDataUrl) {
      return;
    }

    if (!isRasterReprocessing) {
      return;
    }

    let isCancelled = false;

    processRasterDataUrl(logo.rasterSourceDataUrl, logo.backgroundMode)
      .then(async ({ previewDataUrl, traceDataUrl }) => {
        let vectorSvg = await traceRasterDataUrlToSvg(traceDataUrl, {
          fileName: createTraceFileName(logo.originalFileName ?? "logo.png"),
          quality: "detailed",
          style: "default",
        });

        if (isCancelled) {
          return;
        }

        // Strip hardcoded background from vtracer output
        vectorSvg = vectorSvg.replace(/background:\s*[^;"]+;?/gi, "");

        setLogo({
          dataUrl: previewDataUrl,
          vectorSvg,
          aspectRatio: await getImageAspectRatio(previewDataUrl),
          processedBackgroundMode: logo.backgroundMode,
        });
      })
      .catch(async () => {
        if (isCancelled) {
          return;
        }

        const fallbackDataUrl = logo.rasterSourceDataUrl;
        if (!fallbackDataUrl) {
          return;
        }

        setLogo({
          dataUrl: fallbackDataUrl,
          vectorSvg: null,
          aspectRatio: await getImageAspectRatio(fallbackDataUrl),
          processedBackgroundMode: logo.backgroundMode,
        });
      })
      .finally(() => {
        if (!isCancelled) {
          setIsConverting(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    isRasterReprocessing,
    logo.backgroundMode,
    logo.originalFileName,
    logo.rasterSourceDataUrl,
    setLogo,
  ]);

  const handleFile = useCallback(
    async (file: File) => {
      const isSvg = file.type === "image/svg+xml" || file.name.endsWith(".svg");

      if (isSvg) {
        setIsConverting(false);
        setRasterQualityNotice(null);
        const dataUrl = await readFileAsDataUrl(file);
        let vectorSvg = await readFileAsText(file);
        
        // Strip hardcoded inline background colors from third-party SVGs
        // so that the web preview maintains transparency.
        vectorSvg = vectorSvg.replace(/background:\s*[^;"]+;?/gi, "");

        setLogo({
          dataUrl,
          rasterSourceDataUrl: dataUrl,
          vectorSvg,
          aspectRatio: await getImageAspectRatio(dataUrl),
          backgroundMode: "auto",
          processedBackgroundMode: "auto",
          originalFileName: file.name,
        });
      } else {
        setIsConverting(true);
        const rasterSourceDataUrl = await readFileAsDataUrl(file);
        const image = await loadImage(rasterSourceDataUrl);
        
        let detectedColor = "#1A1A1A"; 
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const thresh = computeOtsuThreshold(imageData);
          const ink = extractInkColor(imageData, thresh);
          detectedColor = getClosestFilamentColor(ink.r, ink.g, ink.b);
        }

        setRasterQualityNotice(
          createRasterQualityNotice(
            image.naturalWidth,
            image.naturalHeight,
            file.type || "image/png"
          )
        );
        setLogo({
          dataUrl: null,
          rasterSourceDataUrl,
          vectorSvg: null,
          aspectRatio: await getImageAspectRatio(rasterSourceDataUrl),
          backgroundMode: logo.backgroundMode,
          processedBackgroundMode: null,
          originalFileName: file.name,
          color: detectedColor,
        });
      }
    },
    [logo.backgroundMode, setLogo]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
        Logo / Image
      </h3>

      {!logo.dataUrl ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center cursor-pointer hover:border-zinc-400 transition-colors"
        >
          {isConverting ? (
            <p className="text-sm text-zinc-500">Preparing image...</p>
          ) : (
            <>
              <p className="text-sm text-zinc-600 font-medium">
                Drop an image here or click to upload
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                SVG, PNG, or JPG
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
            <NextImage
              src={logo.dataUrl}
              alt="Logo preview"
              width={48}
              height={48}
              unoptimized
              className="w-12 h-12 object-contain bg-white rounded border border-zinc-200"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-700 truncate">
                {logo.originalFileName}
              </p>
            </div>
            <button
              onClick={() => {
                setRasterQualityNotice(null);
                clearLogo();
              }}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
            >
              Remove
            </button>
          </div>
          {rasterQualityNotice ? (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                rasterQualityNotice.severity === "warning"
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-600"
              }`}
            >
              {rasterQualityNotice.message}
            </p>
          ) : null}
          {isRasterReprocessing ? (
            <p className="text-xs text-zinc-500">Reprocessing raster image...</p>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
