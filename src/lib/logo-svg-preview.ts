import type { LogoConfig, LogoSourceKind, TraceStyle } from "@/types/design";
import { prepareSvgForRendering } from "@/lib/logo-svg-export";

type SvgDimensions = {
  width: number;
  height: number;
};

export function resolveLogoSourceKind(logo: Pick<
  LogoConfig,
  "sourceKind" | "originalFileName" | "rasterSourceDataUrl" | "vectorSvg"
>): LogoSourceKind {
  if (logo.sourceKind === "svg" || logo.sourceKind === "raster") {
    return logo.sourceKind;
  }

  const fileName = logo.originalFileName?.toLowerCase() ?? "";
  if (fileName.endsWith(".svg")) {
    return "svg";
  }

  if (logo.rasterSourceDataUrl) {
    return "raster";
  }

  if (logo.vectorSvg) {
    return fileName.endsWith(".svg") ? "svg" : "raster";
  }

  return null;
}

export function isDirectSvgLogo(logo: Pick<
  LogoConfig,
  "sourceKind" | "originalFileName" | "rasterSourceDataUrl" | "vectorSvg"
>) {
  return resolveLogoSourceKind(logo) === "svg";
}

export function isRasterLogo(logo: Pick<
  LogoConfig,
  "sourceKind" | "originalFileName" | "rasterSourceDataUrl" | "vectorSvg"
>) {
  return resolveLogoSourceKind(logo) === "raster";
}

export function buildLogoPreviewSvgMarkup(
  svg: string,
  options: {
    color?: string | null;
    sourceKind: LogoSourceKind;
    traceStyle?: TraceStyle | null;
  }
) {
  return prepareSvgForRendering(svg, {
    color: options.color ?? null,
    preserveWhite: false,
    affectStroke: true,
    sourceKind: options.sourceKind,
    traceStyle: options.traceStyle ?? null,
  });
}

export function createLogoPreviewBlobUrl(
  svg: string,
  options: {
    color?: string | null;
    sourceKind: LogoSourceKind;
    traceStyle?: TraceStyle | null;
  }
) {
  const markup = buildLogoPreviewSvgMarkup(svg, options);
  return URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" })
  );
}

export function getSvgPreviewDimensions(svg: string): SvgDimensions {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  const viewBox = root.getAttribute("viewBox");

  if (viewBox) {
    const [minX, minY, width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));

    if ([minX, minY, width, height].every((value) => Number.isFinite(value))) {
      return {
        width: Math.max(1, width),
        height: Math.max(1, height),
      };
    }
  }

  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  return { width: 300, height: 150 };
}
