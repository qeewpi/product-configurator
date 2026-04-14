"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  createDefaultLogoConfig,
  useDesignStore,
} from "@/lib/store";
import { useActiveLogo } from "@/lib/use-active-logo";
import {
  createLogoPreviewBlobUrl,
  resolveLogoSourceKind,
} from "@/lib/logo-svg-preview";
import { prepareLogoUpload, type RasterQualityNotice } from "@/lib/logo-upload";

function LogoThumbnail({
  logo,
  isActive,
  onSelect,
  onRemove,
}: {
  logo: { id: string; dataUrl: string | null; vectorSvg: string | null; originalFileName: string | null; color: string | null; sourceKind: ReturnType<typeof resolveLogoSourceKind>; traceSettings: { style: "color" | "lineart" } };
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const previewUrl = useMemo(() => {
    if (logo.vectorSvg) {
      return createLogoPreviewBlobUrl(logo.vectorSvg, {
        color: logo.color,
        sourceKind: logo.sourceKind,
        traceStyle: logo.traceSettings.style,
      });
    }
    return logo.dataUrl;
  }, [logo.vectorSvg, logo.dataUrl, logo.color, logo.sourceKind, logo.traceSettings.style]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isActive}
        className={`flex h-14 w-14 items-center justify-center border-2 bg-white transition-colors ${
          isActive
            ? "border-black"
            : "border-surface-container-highest hover:border-outline-variant"
        }`}
      >
        {previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl}
            alt={logo.originalFileName ?? "Logo"}
            className="h-10 w-10 object-contain"
            draggable={false}
          />
        ) : (
          <MaterialIcon name="image" className="h-5 w-5 text-outline-variant" />
        )}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center bg-black text-white group-hover:flex"
        aria-label="Remove image"
      >
        <MaterialIcon name="close" className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function LogoSelector() {
  const logos = useDesignStore((s) => s.logos);
  const activeLogoId = useDesignStore((s) => s.activeLogoId);
  const setActiveLogoId = useDesignStore((s) => s.setActiveLogoId);
  const removeLogo = useDesignStore((s) => s.removeLogo);
  const addLogo = useDesignStore((s) => s.addLogo);
  const { logo: activeLogo } = useActiveLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [rasterQualityNotice, setRasterQualityNotice] =
    useState<RasterQualityNotice | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setRasterQualityNotice(null);
      setIsConverting(true);

      try {
        const prepared = await prepareLogoUpload(file, activeLogo);
        setRasterQualityNotice(prepared.rasterQualityNotice);
        addLogo(createDefaultLogoConfig(prepared.patch));
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
    [activeLogo, addLogo]
  );

  return (
    <div className="space-y-2">
      <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
        Images
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-14 min-w-[3.5rem] items-center justify-center gap-2 border-2 border-dashed border-surface-container-highest bg-surface-container-low px-4 text-[13px] font-bold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          <MaterialIcon name="add" className="h-4 w-4" />
          <span>Add Image</span>
        </button>

        {logos.map((logo) => (
          <LogoThumbnail
            key={logo.id}
            logo={logo}
            isActive={logo.id === activeLogoId}
            onSelect={() => setActiveLogoId(logo.id)}
            onRemove={() => removeLogo(logo.id)}
          />
        ))}
      </div>

      {isConverting ? (
        <p className="text-[13px] text-outline">Preparing upload...</p>
      ) : null}

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
