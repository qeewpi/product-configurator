import type { LogoConfig, LogoSourceKind } from "@/types/design";

type SvgDimensions = {
  width: number;
  height: number;
};

function stripInlineBackgroundStyles(svg: string) {
  return svg.replace(/background:\s*[^;"]+;?/gi, "");
}

function injectPreviewColor(svg: string, color: string) {
  const safeColor = color.trim();
  if (!safeColor) {
    return svg;
  }

  const styleInjection = `<style>
    path:not([fill="none"]),
    polygon:not([fill="none"]),
    rect:not([fill="none"]),
    circle:not([fill="none"]),
    ellipse:not([fill="none"]),
    line:not([fill="none"]),
    polyline:not([fill="none"]) {
      fill: ${safeColor} !important;
      stroke: ${safeColor} !important;
    }
  </style>`;
  return svg.replace(/<svg[^>]*>/i, (match) => `${match}${styleInjection}`);
}

function ensureSvgNamespace(root: Element) {
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
}

function parseSvgDimensions(root: Element): SvgDimensions | null {
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

  return null;
}

function ensureSvgDimensions(root: Element) {
  const dimensions = parseSvgDimensions(root);

  if (!dimensions) {
    root.setAttribute("width", "300");
    root.setAttribute("height", "150");
    return;
  }

  if (!root.getAttribute("width")) {
    root.setAttribute("width", `${dimensions.width}`);
  }

  if (!root.getAttribute("height")) {
    root.setAttribute("height", `${dimensions.height}`);
  }
}

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
  }
) {
  let nextSvg = stripInlineBackgroundStyles(svg);

  if (options.color) {
    nextSvg = injectPreviewColor(nextSvg, options.color);
  }

  const document = new DOMParser().parseFromString(nextSvg, "image/svg+xml");
  const root = document.documentElement;
  ensureSvgNamespace(root);
  ensureSvgDimensions(root);

  return new XMLSerializer().serializeToString(document);
}

export function createLogoPreviewBlobUrl(
  svg: string,
  options: {
    color?: string | null;
    sourceKind: LogoSourceKind;
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
  const dimensions = parseSvgDimensions(root);

  return dimensions ?? { width: 300, height: 150 };
}
