"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import ColorPanel from "./controls/ColorPanel";
import LogoUpload from "./controls/LogoUpload";
import LogoPlacementControls from "./controls/LogoPlacementControls";
import LogoAppearanceControls from "./controls/LogoAppearanceControls";
import TraceControls from "./controls/TraceControls";
import MaterialIcon from "./MaterialIcon";
import SidebarModeToggle, {
  type SidebarMode,
} from "./controls/SidebarModeToggle";
import SvgPreviewPanel from "./controls/SvgPreviewPanel";
import ShareModal from "./controls/ShareModal";
import { CASE_MODEL_OPTIONS } from "@/lib/model-catalog";
import { useDesignStore } from "@/lib/store";
import { exportDesignAsStl } from "@/lib/stl-export";
import { useLogoTracePreview, type TracePreviewState } from "@/lib/logo-trace";
import type { ExportQuality } from "@/types/design";

const Scene = dynamic(() => import("./viewer/Scene"), { ssr: false });

function parseSidebarMode(value: string | null): SidebarMode | null {
  return value === "configure" || value === "svgPreview" ? value : null;
}

const EXPORT_QUALITY_OPTIONS: Array<{
  value: ExportQuality;
  label: string;
  description: string;
}> = [
  {
    value: "fast",
    label: "Fast",
    description: "Smallest STL and quickest export",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Recommended mix of detail and file size",
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Closest to the old high-detail export, with larger STL files",
  },
];

function ConfigureSidebarContent() {
  const model = useDesignStore((state) => state.model);
  const setModel = useDesignStore((state) => state.setModel);

  return (
    <div
      id="configure-panel"
      role="tabpanel"
      aria-labelledby="configure-tab"
      aria-label="Configure"
      hidden={false}
      className="space-y-6"
    >
      <section className="space-y-4">
        <div className="space-y-1">
          <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
            Model
          </label>
          <p className="text-xs text-outline">
            Choose which case body to customize and export.
          </p>
        </div>

        <div className="space-y-2">
          {CASE_MODEL_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 border border-surface-container-highest px-4 py-3 transition-colors hover:bg-surface-container-low"
            >
              <input
                type="radio"
                name="case-model"
                value={option.id}
                checked={model === option.id}
                onChange={() => setModel(option.id)}
                className="industrial-radio"
              />
              <span className="text-sm font-medium leading-none text-on-surface">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <ColorPanel key={model} />
      </section>

      <section className="space-y-6">
        <LogoUpload />
        <LogoPlacementControls />
        <LogoAppearanceControls />
      </section>
    </div>
  );
}

function SvgPreviewSidebarContent({
  tracePreview,
  isActive,
}: {
  tracePreview: TracePreviewState;
  isActive: boolean;
}) {
  const exportQuality = useDesignStore((state) => state.exportQuality);
  const setExportQuality = useDesignStore((state) => state.setExportQuality);

  return (
    <div
      id="svgPreview-panel"
      role="tabpanel"
      aria-labelledby="svgPreview-tab"
      aria-label="SVG Preview"
      hidden={!isActive}
      className="space-y-6"
    >
      <SvgPreviewPanel tracePreview={tracePreview} />
      <TraceControls />

      <section className="space-y-4">
        <div className="space-y-1">
          <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
            3MF Export Quality
          </label>
          <p className="text-xs text-outline">
            Lower quality exports faster and keeps the file size smaller.
          </p>
        </div>

        <div className="space-y-2">
          {EXPORT_QUALITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 border border-surface-container-highest px-4 py-3 transition-colors hover:bg-surface-container-low"
            >
              <input
                type="radio"
                name="export-quality"
                value={option.value}
                checked={exportQuality === option.value}
                onChange={() => setExportQuality(option.value)}
                className="industrial-radio mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-on-surface">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-outline">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Configurator() {
  const searchParams = useSearchParams();
  const [showShare, setShowShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    parseSidebarMode(searchParams.get("sidebarMode")) ?? "configure"
  );
  const serialize = useDesignStore((state) => state.serialize);
  const tracePreview = useLogoTracePreview();

  useEffect(() => {
    const captureSidebarMode = parseSidebarMode(searchParams.get("sidebarMode"));
    if (captureSidebarMode) {
      setSidebarMode(captureSidebarMode);
    }
  }, [searchParams]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = serialize();
      const response = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const { id } = await response.json();
        useDesignStore.setState({ id });
        setShowShare(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExportStl = async () => {
    setExporting(true);
    setExportError(null);

    try {
      await exportDesignAsStl(serialize());
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Failed to export STL"
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Canvas area */}
      <div className="canvas-grid relative min-h-0 flex-1 bg-surface-container-low">
        <Scene />

        {/* Tool panel overlay */}
        <div className="absolute left-6 top-6 flex flex-col border border-surface-container-highest bg-white">
          <button
            type="button"
            title="Pan"
            className="flex h-11 w-11 items-center justify-center border-b border-surface-container-highest hover:bg-surface-container-low"
          >
            <MaterialIcon name="pan_tool" className="h-[19px] w-[19px]" />
          </button>
          <button
            type="button"
            title="Reset view"
            className="flex h-11 w-11 items-center justify-center border-b border-surface-container-highest hover:bg-surface-container-low"
          >
            <MaterialIcon name="restart_alt" className="h-[19px] w-[19px]" />
          </button>
          <button
            type="button"
            title="Help"
            className="flex h-11 w-11 items-center justify-center hover:bg-surface-container-low"
          >
            <MaterialIcon name="help" className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="flex w-96 flex-col border-l border-surface-container-highest bg-white">
        {/* Static header */}
        <div className="border-b border-surface-container-highest bg-white p-6">
          <h1 className="font-headline text-xl font-extrabold leading-tight text-on-surface">
            Customize your Deck Case
          </h1>
          <p className="mt-1 text-sm font-medium text-outline">
            Pick your colors and add your artwork
          </p>
        </div>

        {/* Segmented tabs — edge-to-edge, no side padding */}
        <div className="border-b border-surface-container-highest">
          <SidebarModeToggle value={sidebarMode} onChange={setSidebarMode} />
        </div>

        {/* Scrollable content */}
        <div className="custom-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto p-6">
          <div className={sidebarMode === "configure" ? "block" : "hidden"}>
            <ConfigureSidebarContent />
          </div>
          <div className={sidebarMode === "svgPreview" ? "block" : "hidden"}>
            <SvgPreviewSidebarContent
              tracePreview={tracePreview}
              isActive={sidebarMode === "svgPreview"}
            />
          </div>

          <div className="pb-6" />
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 border-t border-surface-container-highest bg-white p-6">
          {exportError ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {exportError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || exporting}
            className="flex h-11 w-full items-center justify-center bg-surface-container-low px-4 text-sm font-semibold text-on-surface uppercase transition-none hover:bg-surface-container-high disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save My Design"}
          </button>

          <button
            type="button"
            onClick={handleExportStl}
            disabled={saving || exporting}
            className="flex h-11 w-full items-center justify-center gap-2 bg-black px-4 text-sm font-bold text-white uppercase transition-none hover:bg-neutral-800 disabled:opacity-50"
          >
            <MaterialIcon name="rocket_launch" className="h-4 w-4" />
            <span className="leading-none">
              {exporting ? "Exporting..." : "Export 3MF"}
            </span>
          </button>
        </div>
      </aside>

      {showShare ? <ShareModal onClose={() => setShowShare(false)} /> : null}
    </div>
  );
}
