"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Configurator from "@/components/Configurator";
import { useDesignStore } from "@/lib/store";

export default function DesignPage() {
  const params = useParams();
  const id = params.id as string;
  const hydrate = useDesignStore((s) => s.hydrate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDesign() {
      try {
        const res = await fetch(`/api/designs?id=${id}`);
        if (!res.ok) {
          setError("Design not found");
          return;
        }
        const config = await res.json();
        hydrate(config);
      } catch {
        setError("Failed to load design");
      } finally {
        setLoading(false);
      }
    }
    loadDesign();
  }, [id, hydrate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-zinc-500">Loading your design...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 gap-4">
        <p className="text-zinc-500">{error}</p>
        <a href="/" className="text-sm text-zinc-700 underline">
          Create a new design
        </a>
      </div>
    );
  }

  return (
    <main className="h-screen">
      <Configurator />
    </main>
  );
}
