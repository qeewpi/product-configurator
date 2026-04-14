"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  createLogoPreviewBlobUrl,
  resolveLogoSourceKind,
} from "@/lib/logo-svg-preview";
import { createDefaultLogoConfig, useDesignStore } from "@/lib/store";
import { useActiveLogo } from "@/lib/use-active-logo";
import { prepareLogoUpload, type RasterQualityNotice } from "@/lib/logo-upload";

export default function LogoUpload() {
  const { logo } = useActiveLogo();
  const addLogo = useDesignStore((s) => s.addLogo);
  const removeLogo = useDesignStore((s) => s.removeLogo);
  const updateLogo = useDesignStore((s) => s.updateLogo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [rasterQualityNotice, setRasterQualityNotice] =
    useState<RasterQualityNotice | null>(null);
  const sourceKind = logo ? resolveLogoSourceKind(logo) : null;
  const uploadPreviewUrl = useMemo(() => {
    if (!logo) return null;
    if (!logo.vectorSvg) {
      return logo.dataUrl;
    }

    return createLogoPreviewBlobUrl(logo.vectorSvg, {
      color: logo.color,
      sourceKind: sourceKind,
      traceStyle: logo.traceSettings.style,
    });
  }, [logo, sourceKind]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setRasterQualityNotice(null);
      setIsConverting(true);

      try {
        const prepared = await prepareLogoUpload(file, logo);
        setRasterQualityNotice(prepared.rasterQualityNotice);

        if (logo) {
          updateLogo(logo.id, prepared.patch);
        } else {
          addLogo(createDefaultLogoConfig(prepared.patch));
        }
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
    [addLogo, logo, updateLogo]
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

  const hasImage = logo && (logo.dataUrl || logo.vectorSvg);

  return (
    <div className="space-y-4">
      <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
        Logo / Image
      </label>

      {!hasImage ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="group flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-container-highest p-6 transition-colors hover:bg-surface-container-low"
        >
          {isConverting ? (
            <p className="text-sm text-outline">Preparing image...</p>
          ) : (
            <>
              <MaterialIcon
                name="upload_file"
                className="h-6 w-6 text-outline-variant transition-colors group-hover:text-outline"
              />
              <div className="text-center">
                <span className="text-[13px] font-semibold text-on-surface">
                  Drop image here
                </span>
                <p className="text-[14px] text-outline">
                  or click to browse (SVG/PNG/JPG)
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-surface-container-highest bg-surface-container-low p-3">
            <div className="flex items-center gap-3 overflow-hidden">
              {uploadPreviewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={uploadPreviewUrl}
                  alt="Logo preview"
                  className="h-12 w-12 border border-surface-container-highest bg-white object-contain"
                  draggable={false}
                />
              ) : (
                <MaterialIcon name="image" className="h-[18px] w-[18px] text-outline-variant" />
              )}
              <span className="truncate text-[13px] font-medium text-on-surface-variant">
                {logo.originalFileName ?? "Untitled logo"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setRasterQualityNotice(null);
                removeLogo(logo.id);
              }}
              className="text-[13px] font-bold uppercase tracking-wider text-outline-variant transition-colors hover:text-red-600"
            >
              Remove
            </button>
          </div>

          {rasterQualityNotice ? (
            <div
              className={`p-3 text-[14px] font-medium leading-relaxed ${
                rasterQualityNotice.severity === "warning"
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "border border-surface-container-highest bg-surface-container-low text-on-surface-variant"
              }`}
            >
              {rasterQualityNotice.message}
            </div>
          ) : null}

          {isConverting ? (
            <p className="text-[13px] text-outline">Preparing upload...</p>
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
