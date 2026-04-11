"use client";

import { useState } from "react";
import { useDesignStore } from "@/lib/store";

export default function ShareModal({ onClose }: { onClose: () => void }) {
  const id = useDesignStore((s) => s.id);
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/design/${id}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md space-y-4 border border-surface-container-highest bg-white p-6">
        <h3 className="text-lg font-bold text-on-surface">Design Saved!</h3>
        <p className="text-sm text-on-surface-variant">
          Share this link to view or edit your design:
        </p>

        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 select-all border border-surface-container-highest bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant"
          />
          <button
            onClick={handleCopy}
            className="bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-outline transition-colors hover:text-on-surface-variant"
        >
          Close
        </button>
      </div>
    </div>
  );
}
