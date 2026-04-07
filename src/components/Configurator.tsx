"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ColorPanel from "./controls/ColorPanel";
import LogoUpload from "./controls/LogoUpload";
import LogoPlacementControls from "./controls/LogoPlacementControls";
import LogoAppearanceControls from "./controls/LogoAppearanceControls";
import TraceControls from "./controls/TraceControls";
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
  const exportQuality = useDesignStore((state) => state.exportQuality);
  const setExportQuality = useDesignStore((state) => state.setExportQuality);

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
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
            Model
          </label>
          <p className="text-xs text-slate-500">
            Choose which case body to customize and export.
          </p>
        </div>

        <div className="space-y-2">
          {CASE_MODEL_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 border border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <input
                type="radio"
                name="case-model"
                value={option.id}
                checked={model === option.id}
                onChange={() => setModel(option.id)}
                className="industrial-radio"
              />
              <span className="text-sm font-medium leading-none text-slate-900">
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

      <section className="space-y-4">
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">
            3MF Export Quality
          </label>
          <p className="text-xs text-slate-500">
            Lower quality exports faster and keeps the file size smaller.
          </p>
        </div>

        <div className="space-y-2">
          {EXPORT_QUALITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 border border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50"
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
                <span className="block text-sm font-medium text-slate-900">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
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

function SvgPreviewSidebarContent({
  tracePreview,
  isActive,
}: {
  tracePreview: TracePreviewState;
  isActive: boolean;
}) {
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
    </div>
  );
}

export default function Configurator() {
  const [showShare, setShowShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("configure");
  const serialize = useDesignStore((state) => state.serialize);
  const tracePreview = useLogoTracePreview();

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
      <div className="canvas-grid relative min-h-0 flex-1 bg-slate-50">
        <Scene />
      </div>

      {/* Sidebar */}
      <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
        {/* Static header */}
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-headline text-xl font-extrabold leading-tight text-slate-900">
              Customize your Deck Case
            </h1>
            <p className="text-sm font-medium text-slate-500">
              Pick your colors and add your artwork
            </p>
          </div>

          <SidebarModeToggle value={sidebarMode} onChange={setSidebarMode} />
        </div>

        {/* Scrollable content */}
        <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
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
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-6">
          {exportError ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {exportError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || exporting}
            className="flex h-11 w-full items-center justify-center bg-slate-100 px-4 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-200 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save My Design"}
          </button>

          <button
            type="button"
            onClick={handleExportStl}
            disabled={saving || exporting}
            className="flex h-11 w-full items-center justify-center gap-2 bg-black px-4 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-base">rocket_launch</span>
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
