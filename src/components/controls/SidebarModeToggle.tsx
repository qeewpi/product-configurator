"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type SidebarMode = "configure" | "svgPreview";

const MODES: Array<{ value: SidebarMode; label: string }> = [
  { value: "configure", label: "Configure" },
  { value: "svgPreview", label: "Export" },
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
      className="flex h-11 overflow-hidden border border-slate-200 bg-slate-100 p-0.5"
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
            className={`flex h-full flex-1 items-center justify-center px-4 text-sm transition-all ${
              isSelected
                ? "bg-white font-semibold text-slate-900"
                : "font-medium text-slate-500 hover:bg-slate-200/50"
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
