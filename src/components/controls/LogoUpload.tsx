"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { computeOtsuThreshold, extractInkColor } from "@/lib/logo-background";
import { getDefaultTraceSettings } from "@/lib/trace-settings";
import { getClosestFilamentColor } from "@/lib/filaments";
import {
  createLogoPreviewBlobUrl,
  resolveLogoSourceKind,
} from "@/lib/logo-svg-preview";
import { processRasterSourceDataUrl } from "@/lib/logo-trace";
import { useDesignStore } from "@/lib/store";

const RECOMMENDED_MIN_SOURCE_DIMENSION = 1000;
const AUTO_UPSCALE_MIN_SOURCE_DIMENSION = 600;

type RasterQualityNotice = {
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

export default function LogoUpload() {
  const setLogo = useDesignStore((state) => state.setLogo);
  const clearLogo = useDesignStore((state) => state.clearLogo);
  const logo = useDesignStore((state) => state.logo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [rasterQualityNotice, setRasterQualityNotice] =
    useState<RasterQualityNotice | null>(null);
  const sourceKind = resolveLogoSourceKind(logo);
  const uploadPreviewUrl = useMemo(() => {
    if (!logo.vectorSvg) {
      return logo.dataUrl;
    }

    return createLogoPreviewBlobUrl(logo.vectorSvg, {
      color: logo.color,
      sourceKind,
    });
  }, [logo.color, logo.dataUrl, logo.vectorSvg, sourceKind]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      const isSvg = file.type === "image/svg+xml" || file.name.endsWith(".svg");

      setRasterQualityNotice(null);
      setIsConverting(true);

      try {
        if (isSvg) {
          const dataUrl = await readFileAsDataUrl(file);
          let vectorSvg = await readFileAsText(file);

          vectorSvg = vectorSvg.replace(/background:\s*[^;"]+;?/gi, "");

          setLogo({
            dataUrl,
            rasterSourceDataUrl: null,
            vectorSvg,
            sourceKind: "svg",
            traceSettings: getDefaultTraceSettings(),
            aspectRatio: await getImageAspectRatio(dataUrl),
            backgroundMode: "auto",
            processedBackgroundMode: null,
            originalFileName: file.name,
          });
          return;
        }

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

        setRasterQualityNotice(
          createRasterQualityNotice(
            image.naturalWidth,
            image.naturalHeight,
            file.type || "image/png"
          )
        );

        const processed = await processRasterSourceDataUrl(
          rasterSourceDataUrl,
          logo.backgroundMode,
          logo.traceSettings
        );

        if (
          logo.backgroundMode === "auto" &&
          processed.resolvedBackgroundMode === "none"
        ) {
          setRasterQualityNotice((currentNotice) =>
            currentNotice?.severity === "warning"
              ? currentNotice
              : {
                  severity: "info",
                  message:
                    "Auto kept the background because it was not confident enough to remove it safely.",
                }
          );
        }

        setLogo({
          dataUrl: processed.previewDataUrl,
          rasterSourceDataUrl,
          vectorSvg: null,
          sourceKind: "raster",
          traceSettings: getDefaultTraceSettings(),
          aspectRatio: await getImageAspectRatio(processed.previewDataUrl),
          backgroundMode: logo.backgroundMode,
          processedBackgroundMode: logo.backgroundMode,
          originalFileName: file.name,
          color: detectedColor,
        });
      } catch (error) {
        setRasterQualityNotice({
          severity: "warning",
          message:
            error instanceof Error
              ? error.message
              : "Failed to prepare the uploaded image.",
        });
      } finally {
        setIsConverting(false);
      }
    },
    [logo.backgroundMode, logo.traceSettings, setLogo]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
        Logo / Image
      </h3>

      {!logo.dataUrl && !logo.vectorSvg ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 p-6 text-center transition-colors hover:border-zinc-400"
        >
          {isConverting ? (
            <p className="text-sm text-zinc-500">Preparing image...</p>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-600">
                Drop an image here or click to upload
              </p>
              <p className="mt-1 text-xs text-zinc-400">SVG, PNG, or JPG</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-zinc-50 p-3">
            {uploadPreviewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={uploadPreviewUrl}
                alt="Logo preview"
                className="h-12 w-12 rounded border border-zinc-200 bg-white object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded border border-zinc-200 bg-white text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                SVG
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-700">
                {logo.originalFileName ?? "Untitled logo"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRasterQualityNotice(null);
                clearLogo();
              }}
              className="text-xs text-zinc-400 transition-colors hover:text-red-500"
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

          {isConverting ? (
            <p className="text-xs text-zinc-500">Preparing upload...</p>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
