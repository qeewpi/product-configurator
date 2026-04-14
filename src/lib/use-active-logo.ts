"use client";

import { useCallback } from "react";
import { useDesignStore } from "@/lib/store";
import type { LogoConfig } from "@/types/design";

export function useActiveLogo() {
  const logo = useDesignStore((s) => {
    if (s.activeLogoId) {
      return s.logos.find((l) => l.id === s.activeLogoId) ?? null;
    }

    return s.logos[0] ?? null;
  });
  const updateLogo = useDesignStore((s) => s.updateLogo);
  const logoId = logo?.id ?? null;

  const setActiveLogo = useCallback(
    (patch: Partial<LogoConfig>) => {
      if (logoId) updateLogo(logoId, patch);
    },
    [logoId, updateLogo]
  );

  return { logo, setActiveLogo };
}
