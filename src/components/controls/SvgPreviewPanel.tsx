"use client";

import { useEffect, useMemo, useState } from "react";
import { useDesignStore } from "@/lib/store";
import {
  createLogoPreviewBlobUrl,
  getSvgPreviewDimensions,
  resolveLogoSourceKind,
} from "@/lib/logo-svg-preview";
import type { TracePreviewState } from "@/lib/logo-trace";
import type { LogoConfig } from "@/types/design";

type ZoomLevel = "fit" | "100" | "200";

function SourceBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-medium ${
        tone === "accent"
          ? "bg-black text-white"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}

function PreviewArtwork({
  logo,
  sourceKind,
  tracePreview,
}: {
  logo: LogoConfig;
  sourceKind: ReturnType<typeof resolveLogoSourceKind>;
  tracePreview: TracePreviewState;
}) {
  const [zoom, setZoom] = useState<ZoomLevel>("fit");
  const previewUrl = useMemo(() => {
    if (!logo.vectorSvg) {
      return null;
    }

    return createLogoPreviewBlobUrl(logo.vectorSvg, {
      color: logo.color,
      sourceKind,
      traceStyle: logo.traceSettings.style,
    });
  }, [logo.color, logo.traceSettings.style, logo.vectorSvg, sourceKind]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const previewDimensions = useMemo(() => {
    if (!logo.vectorSvg) {
      return { width: 300, height: 150 };
    }

    return getSvgPreviewDimensions(logo.vectorSvg);
  }, [logo.vectorSvg]);

  const zoomedDimensions =
    zoom === "fit"
      ? null
      : {
          width:
            Math.max(previewDimensions.width, 1) * (zoom === "200" ? 2 : 1),
          height:
            Math.max(previewDimensions.height, 1) * (zoom === "200" ? 2 : 1),
        };

  const previewFrameClasses =
    "relative overflow-hidden border border-slate-200 bg-white";
  const frameStyle = {
    backgroundImage:
      "linear-gradient(45deg, rgba(228, 228, 231, 0.95) 25%, transparent 25%, transparent 75%, rgba(228, 228, 231, 0.95) 75%, rgba(228, 228, 231, 0.95)), linear-gradient(45deg, rgba(228, 228, 231, 0.95) 25%, transparent 25%, transparent 75%, rgba(228, 228, 231, 0.95) 75%, rgba(228, 228, 231, 0.95))",
    backgroundPosition: "0 0, 10px 10px",
    backgroundSize: "20px 20px",
  } as const;

  return (
    <div className={previewFrameClasses} style={frameStyle}>
      <div className="flex min-h-[320px] items-center justify-center p-4">
        {tracePreview.status === "loading" && !logo.vectorSvg ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 animate-spin border-4 border-slate-200 border-t-black" />
            <div>
              <p className="text-sm font-medium text-slate-700">
                Updating SVG preview...
              </p>
              <p className="mt-1 text-xs text-slate-500">
                The traced SVG will appear here once the new pass finishes.
              </p>
            </div>
          </div>
        ) : logo.vectorSvg && previewUrl ? (
          <div className="relative flex min-h-[280px] w-full items-center justify-center overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Traced SVG preview"
              className="block max-w-none select-none"
              style={
                zoom === "fit"
                  ? {
                      maxWidth: "100%",
                      maxHeight: "100%",
                    }
                  : zoomedDimensions ?? undefined
              }
              draggable={false}
            />

            {tracePreview.status === "loading" ? (
              <div className="absolute inset-0 flex items-start justify-end p-3">
                <div className="border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600 backdrop-blur">
                  Updating SVG preview...
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-slate-100 text-slate-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M4 4h16v16H4z" />
                <path d="M8 14l3-3 3 3 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {tracePreview.status === "error"
                  ? "Preview update failed"
                  : "Waiting for SVG preview"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tracePreview.status === "error"
                  ? "Fix the trace settings or upload a new source to continue."
                  : "The traced SVG will appear here after the first pass."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p
            className="truncate text-sm font-medium text-slate-900"
            title={logo.originalFileName ?? "Untitled logo"}
          >
            {logo.originalFileName ?? "Untitled logo"}
          </p>
          <p className="text-xs text-slate-500">
            {sourceKind === "svg"
              ? "SVG source"
              : sourceKind === "raster"
                ? "Raster source"
                : "Unknown source"}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <SourceBadge
            label={logo.traceSettings.style === "lineart" ? "B/W" : "Color"}
            tone="accent"
          />
          {sourceKind === "svg" ? (
            <SourceBadge label="Direct SVG" />
          ) : (
            <SourceBadge label="Trace Preview" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <span>Zoom</span>
        <div
          className="grid border border-slate-200 bg-slate-100 p-0.5"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
        >
          {(
            [
              { value: "fit", label: "Fit" },
              { value: "100", label: "100%" },
              { value: "200", label: "200%" },
            ] as Array<{ value: ZoomLevel; label: string }>
          ).map((option) => {
            const isSelected = zoom === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setZoom(option.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? "bg-white text-slate-900"
                    : "text-slate-500 hover:bg-slate-200/50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SvgPreviewPanel({
  tracePreview,
}: {
  tracePreview: TracePreviewState;
}) {
  const logo = useDesignStore((state) => state.logo);
  const sourceKind = resolveLogoSourceKind(logo);
  const hasUploadedLogo = Boolean(logo.dataUrl || logo.vectorSvg);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
          SVG Preview
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Inspect the traced SVG here before exporting.
        </p>
      </div>

      {!hasUploadedLogo ? (
        <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            Upload a logo to preview the traced SVG.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Raster uploads can be tuned here. SVG uploads preview directly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <PreviewArtwork
            key={logo.vectorSvg ?? logo.dataUrl ?? "empty"}
            logo={logo}
            sourceKind={sourceKind}
            tracePreview={tracePreview}
          />

          {tracePreview.error ? (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {tracePreview.error}
            </div>
          ) : null}

          {sourceKind === "svg" ? (
            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Uploaded SVGs are previewed directly and do not need tracing.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
