"use client";

import { CASE_MODELS } from "@/lib/model-catalog";
import { useDesignStore } from "@/lib/store";
import type { ViewerMode, ViewerPartKey } from "@/types/design";

const VIEWER_MODE_OPTIONS: Array<{
  value: ViewerMode;
  label: string;
  description: string;
}> = [
  {
    value: "assembled",
    label: "Assembled",
    description: "Preview the full deck case in its assembled layout.",
  },
  {
    value: "flat-lay",
    label: "Flat-lay",
    description: "Spread the Top Lid, Bottom Tray, and Clips into a laid-out view.",
  },
  {
    value: "isolated",
    label: "Isolated",
    description: "Inspect selected parts with a more focused separated layout.",
  },
];

const PART_OPTIONS: Array<{
  value: ViewerPartKey;
  label: string;
}> = [
  { value: "top-lid", label: "Top Lid" },
  { value: "bottom-tray", label: "Bottom Tray" },
  { value: "clips", label: "Clips" },
];

export default function ViewerModeControls() {
  const model = useDesignStore((state) => state.model);
  const viewerMode = useDesignStore((state) => state.viewerMode);
  const visibleParts = useDesignStore((state) => state.visibleParts);
  const setViewerMode = useDesignStore((state) => state.setViewerMode);
  const setViewerPartVisible = useDesignStore(
    (state) => state.setViewerPartVisible
  );

  const availableParts: ViewerPartKey[] = ["top-lid", "bottom-tray"];
  if (CASE_MODELS[model].clipCount > 0) {
    availableParts.push("clips");
  }

  const enabledVisibleCount = availableParts.filter((part) => visibleParts[part])
    .length;
  const showPartToggles = viewerMode === "isolated";

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <label className="text-[14px] font-bold uppercase tracking-[0.1em] text-on-surface">
          View Mode
        </label>
        <p className="text-xs text-outline">
          Change how the deck case parts are arranged in the viewer.
        </p>
      </div>

      <div className="space-y-2">
        {VIEWER_MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 border border-surface-container-highest px-4 py-3 transition-colors hover:bg-surface-container-low"
          >
            <input
              type="radio"
              name="viewer-mode"
              value={option.value}
              checked={viewerMode === option.value}
              onChange={() => setViewerMode(option.value)}
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

      {showPartToggles ? (
        <section className="space-y-3 border border-surface-container-highest bg-surface-container-low/40 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">
              Visible Parts
            </p>
            <p className="mt-1 text-xs text-outline">
              Turn parts on to compare them in a focused isolated stack. At
              least one part must remain enabled.
            </p>
          </div>

          <div className="space-y-2">
            {PART_OPTIONS.map((part) => {
              const isAvailable = availableParts.includes(part.value);
              const isChecked = visibleParts[part.value];
              const isLastVisible =
                isChecked && enabledVisibleCount === 1 && isAvailable;

              return (
                <label
                  key={part.value}
                  className={`flex items-center justify-between gap-3 border px-3 py-2 text-sm ${
                    isAvailable
                      ? "cursor-pointer border-surface-container-highest bg-white text-on-surface"
                      : "cursor-not-allowed border-surface-container-highest/60 bg-surface-container-low text-outline"
                  }`}
                >
                  <span className="font-medium">{part.label}</span>
                  <input
                    type="checkbox"
                    checked={isAvailable && isChecked}
                    disabled={!isAvailable || isLastVisible}
                    onChange={(event) =>
                      setViewerPartVisible(part.value, event.target.checked)
                    }
                    className="h-4 w-4 accent-black"
                  />
                </label>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
