"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cleanLogoArtworkImageData,
  createColorTraceImageData,
  createMonochromeTraceImageData,
} from "@/lib/logo-background";
import {
  applyTraceColorLimit,
  shouldUseHardEdgeTraceScaling,
} from "@/lib/trace-palette";
import { traceRasterDataUrlToSvg } from "@/lib/raster-trace-client";
import { useDesignStore } from "@/lib/store";
import { useActiveLogo } from "@/lib/use-active-logo";
import { resolveLogoSourceKind } from "@/lib/logo-svg-preview";
import type {
  LogoBackgroundMode,
  LogoSourceKind,
  TraceSettings,
} from "@/types/design";

const AUTO_UPSCALE_MIN_SOURCE_DIMENSION = 600;
const AUTO_UPSCALE_TARGET_DIMENSION = 1024;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function createTraceFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") + ".png";
}

function getTraceRenderMode(traceSettings?: Pick<TraceSettings, "style"> | null) {
  return traceSettings?.style === "lineart" ? "bw" : "color";
}

function setHighQualitySmoothing(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
  context.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in context) {
    context.imageSmoothingQuality = "high";
  }
}

async function readImageDataUrlAsCanvas(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Failed to prepare raster image");
  }

  context.drawImage(image, 0, 0);
  const sourceImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, sourceImageData };
}

async function renderImageDataToDataUrl(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  smoothing = true
) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext) {
    throw new Error("Failed to prepare traced raster source");
  }

  sourceContext.putImageData(imageData, 0, 0);

  if (sourceCanvas.width === targetWidth && sourceCanvas.height === targetHeight) {
    return sourceCanvas.toDataURL("image/png");
  }

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetContext = targetCanvas.getContext("2d");

  if (!targetContext) {
    throw new Error("Failed to scale traced raster source");
  }

  if (smoothing) {
    setHighQualitySmoothing(targetContext);
  } else {
    targetContext.imageSmoothingEnabled = false;
  }
  targetContext.clearRect(0, 0, targetWidth, targetHeight);
  targetContext.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return targetCanvas.toDataURL("image/png");
}

export async function processRasterSourceDataUrl(
  dataUrl: string,
  backgroundMode: LogoBackgroundMode,
  traceSettings?: TraceSettings | null
) {
  const { canvas, sourceImageData } = await readImageDataUrlAsCanvas(dataUrl);
  const cleaned = cleanLogoArtworkImageData(sourceImageData, backgroundMode, {
    edgeSoftness: 0.08,
  });
  const previewImageData = createColorTraceImageData(cleaned).imageData;
  const traceRenderMode = getTraceRenderMode(traceSettings);
  const limitedColorImageData = applyTraceColorLimit(previewImageData, traceSettings);
  const useHardEdgeScaling = shouldUseHardEdgeTraceScaling(traceSettings);
  const traceImageData =
    traceRenderMode === "bw"
      ? createMonochromeTraceImageData(cleaned).imageData
      : limitedColorImageData;

  const shortestSide = Math.min(canvas.width, canvas.height);
  const upscaleRatio =
    shortestSide < AUTO_UPSCALE_MIN_SOURCE_DIMENSION
      ? AUTO_UPSCALE_TARGET_DIMENSION / Math.max(shortestSide, 1)
      : 1;
  const targetWidth = Math.max(1, Math.round(canvas.width * upscaleRatio));
  const targetHeight = Math.max(1, Math.round(canvas.height * upscaleRatio));

  return {
    previewDataUrl: await renderImageDataToDataUrl(
      traceRenderMode === "bw" ? previewImageData : limitedColorImageData,
      targetWidth,
      targetHeight,
      !useHardEdgeScaling
    ),
    traceDataUrl: await renderImageDataToDataUrl(
      traceImageData,
      targetWidth,
      targetHeight,
      !useHardEdgeScaling
    ),
    resolvedBackgroundMode: cleaned.resolvedMode,
    shouldFilterBackground: cleaned.shouldFilterBackground,
  };
}

export interface TracePreviewState {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  traceSettings: TraceSettings;
  sourceKind: LogoSourceKind;
}

export function useLogoTracePreview(): TracePreviewState {
  const { logo } = useActiveLogo();
  const updateLogo = useDesignStore((s) => s.updateLogo);
  const [status, setStatus] = useState<TracePreviewState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const completedTraceKeyRef = useRef<string | null>(null);

  const sourceKind = logo ? resolveLogoSourceKind(logo) : null;
  const logoId = logo?.id ?? null;
  const rasterSourceDataUrl = logo?.rasterSourceDataUrl ?? null;
  const backgroundMode = logo?.backgroundMode ?? "auto";
  const traceSettings = logo?.traceSettings ?? null;
  const vectorSvg = logo?.vectorSvg ?? null;
  const originalFileName = logo?.originalFileName ?? null;

  const traceKey = useMemo(() => {
    if (sourceKind !== "raster" || !rasterSourceDataUrl) {
      return null;
    }

    return JSON.stringify({
      logoId,
      source: rasterSourceDataUrl,
      backgroundMode,
      traceSettings,
    });
  }, [backgroundMode, logoId, rasterSourceDataUrl, traceSettings, sourceKind]);

  useEffect(() => {
    if (sourceKind !== "raster" || !rasterSourceDataUrl || !traceKey || !logoId) {
      completedTraceKeyRef.current = null;
      const resetTimer = window.setTimeout(() => {
        setError(null);
        setStatus("idle");
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    if (completedTraceKeyRef.current === traceKey && vectorSvg) {
      const successTimer = window.setTimeout(() => {
        setError(null);
        setStatus("success");
      }, 0);

      return () => {
        window.clearTimeout(successTimer);
      };
    }

    let isCancelled = false;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          setError(null);
          setStatus("loading");

          const processedSource = await processRasterSourceDataUrl(
            rasterSourceDataUrl,
            backgroundMode,
            traceSettings
          );

          const tracedSvg = await traceRasterDataUrlToSvg(
            processedSource.traceDataUrl,
            {
              fileName: createTraceFileName(
                originalFileName ?? "logo.png"
              ),
              traceSettings: traceSettings!,
            }
          );

          if (isCancelled || requestSequenceRef.current !== requestSequence) {
            return;
          }

          const cleanedVectorSvg = tracedSvg.replace(
            /background:\s*[^;"]+;?/gi,
            ""
          );

          updateLogo(logoId, {
            dataUrl: processedSource.previewDataUrl,
            vectorSvg: cleanedVectorSvg,
            processedBackgroundMode: backgroundMode,
          });
          completedTraceKeyRef.current = traceKey;
          setError(null);
          setStatus("success");
        } catch (traceError) {
          if (isCancelled || requestSequenceRef.current !== requestSequence) {
            return;
          }

          setError(
            traceError instanceof Error
              ? traceError.message
              : "Failed to trace SVG preview"
          );
          setStatus("error");
        }
      })();
    }, 280);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    backgroundMode,
    logoId,
    originalFileName,
    rasterSourceDataUrl,
    traceSettings,
    updateLogo,
    vectorSvg,
    sourceKind,
    traceKey,
  ]);

  return {
    status,
    error,
    traceSettings: traceSettings ?? { style: "color" } as TraceSettings,
    sourceKind,
  };
}
