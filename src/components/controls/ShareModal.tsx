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
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="text-lg font-bold text-zinc-900">Design Saved!</h3>
        <p className="text-sm text-zinc-600">
          Share this link to view or edit your design:
        </p>

        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-700 select-all"
          />
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
