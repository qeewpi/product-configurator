"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import MaterialIcon, { type MaterialIconName } from "@/components/MaterialIcon";

export type SidebarMode = "configure" | "svgPreview";

const MODES: Array<{
  value: SidebarMode;
  label: string;
  icon: MaterialIconName;
}> = [
  { value: "configure", label: "Configure", icon: "tune" },
  { value: "svgPreview", label: "Export", icon: "file_download" },
];

export default function SidebarModeToggle({
  value,
  onChange,
}: {
  value: SidebarMode;
  onChange: (mode: SidebarMode) => void;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = MODES.findIndex((mode) => mode.value === value);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % MODES.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + MODES.length) % MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = MODES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    onChange(MODES[nextIndex].value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className="flex h-11"
      role="tablist"
      aria-label="Sidebar mode"
      onKeyDown={handleKeyDown}
    >
      {MODES.map((mode, index) => {
        const isSelected = mode.value === value;

        return (
          <button
            key={mode.value}
            ref={(button) => {
              buttonRefs.current[index] = button;
            }}
            type="button"
            role="tab"
            id={`${mode.value}-tab`}
            aria-selected={isSelected}
            aria-controls={`${mode.value}-panel`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(mode.value)}
            className={`flex flex-1 items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] transition-none ${
              isSelected
                ? "border-b-2 border-black bg-white text-black"
                : "bg-surface-container-low text-neutral-400 hover:bg-white"
            }`}
          >
            <MaterialIcon name={mode.icon} className="h-[14px] w-[14px] shrink-0" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
