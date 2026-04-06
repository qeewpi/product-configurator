"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type SidebarMode = "configure" | "svgPreview";

const MODES: Array<{ value: SidebarMode; label: string }> = [
  { value: "configure", label: "Configure" },
  { value: "svgPreview", label: "SVG Preview" },
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
      className="rounded-full border border-zinc-200 bg-zinc-100 p-1"
      role="tablist"
      aria-label="Sidebar mode"
      onKeyDown={handleKeyDown}
    >
      <div className="grid grid-cols-2 gap-1">
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
              className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
