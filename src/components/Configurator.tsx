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
      <section>
        <div>
          <h2 className="text-lg font-bold text-zinc-900">
            Customize Your Deck Case
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pick colors, place your logo, and tune the export.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Model
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Choose which case body to customize and export.
          </p>
        </div>

        <div className="space-y-2">
          {CASE_MODEL_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 px-3 py-3 transition-colors hover:border-zinc-300"
            >
              <input
                type="radio"
                name="case-model"
                value={option.id}
                checked={model === option.id}
                onChange={() => setModel(option.id)}
                className="mt-1 h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-900">
                  {option.label}
                </span>
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

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
            3MF Export Quality
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Lower quality exports faster and keeps the file size smaller.
          </p>
        </div>

        <div className="space-y-2">
          {EXPORT_QUALITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 px-3 py-3 transition-colors hover:border-zinc-300"
            >
              <input
                type="radio"
                name="export-quality"
                value={option.value}
                checked={exportQuality === option.value}
                onChange={() => setExportQuality(option.value)}
                className="mt-1 h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-900">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
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
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-h-[400px] flex-1 bg-zinc-100 lg:min-h-0">
        <Scene />
      </div>

      <div className="flex w-full flex-col border-l border-zinc-200 bg-white lg:w-[360px]">
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white p-4">
          <SidebarModeToggle value={sidebarMode} onChange={setSidebarMode} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-5 pb-6">
            <div className={sidebarMode === "configure" ? "block" : "hidden"}>
              <ConfigureSidebarContent />
            </div>
            <div className={sidebarMode === "svgPreview" ? "block" : "hidden"}>
              <SvgPreviewSidebarContent
                tracePreview={tracePreview}
                isActive={sidebarMode === "svgPreview"}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-200 bg-white/95 p-5 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="space-y-3">
            {exportError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {exportError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleExportStl}
              disabled={saving || exporting}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {exporting ? "Exporting STL..." : "Export STL"}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || exporting}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save My Design"}
            </button>
          </div>
        </div>
      </div>

      {showShare ? <ShareModal onClose={() => setShowShare(false)} /> : null}
    </div>
  );
}
