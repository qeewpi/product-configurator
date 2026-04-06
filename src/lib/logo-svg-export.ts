import * as THREE from "three";
import {
  SVGLoader,
  type SVGResultPaths,
} from "three/examples/jsm/loaders/SVGLoader.js";
import type { LogoSourceKind, TraceStyle } from "@/types/design";

export type SvgBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type LogoSvgRenderOptions = {
  color: string | null;
  preserveWhite?: boolean;
  affectStroke?: boolean;
  sourceKind: LogoSourceKind;
  traceStyle?: TraceStyle | null;
};

export function shouldApplyLogoColor(options: {
  color: string | null;
  sourceKind: LogoSourceKind;
  traceStyle?: TraceStyle | null;
}) {
  if (!options.color?.trim()) {
    return false;
  }

  if (options.sourceKind === "svg") {
    return true;
  }

  if (options.sourceKind === "raster") {
    return options.traceStyle === "lineart";
  }

  return false;
}

function stripInlineBackgroundStyles(svg: string) {
  return svg.replace(/background:\s*[^;"]+;?/gi, "");
}

function ensureSvgNamespace(root: Element) {
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
}

function parseSvgDimensions(root: Element): SvgBounds | null {
  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const [minX, minY, width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));

    if ([minX, minY, width, height].every((value) => Number.isFinite(value))) {
      return {
        minX,
        minY,
        width: Math.max(1, width),
        height: Math.max(1, height),
        maxX: minX + Math.max(1, width),
        maxY: minY + Math.max(1, height),
      };
    }
  }

  const width = Number.parseFloat(root.getAttribute("width") ?? "0");
  const height = Number.parseFloat(root.getAttribute("height") ?? "0");

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return {
      minX: 0,
      minY: 0,
      width: Math.max(1, width),
      height: Math.max(1, height),
      maxX: Math.max(1, width),
      maxY: Math.max(1, height),
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

function getColorSelectorList(preserveWhite: boolean) {
  const selectors = [
    "path",
    "polygon",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
  ];

  if (!preserveWhite) {
    return selectors;
  }

  return selectors.map(
    (selector) =>
      `${selector}:not([fill="none"]):not([fill="#FFFFFF"]):not([fill="#ffffff"])`
  );
}

function injectColorTransform(
  svg: string,
  color: string,
  options: Pick<LogoSvgRenderOptions, "preserveWhite" | "affectStroke">
) {
  const safeColor = color.trim();
  if (!safeColor) {
    return svg;
  }

  const selectors = getColorSelectorList(Boolean(options.preserveWhite));
  const declarations = [
    `fill: ${safeColor} !important;`,
    options.affectStroke === false ? "" : `stroke: ${safeColor} !important;`,
  ]
    .filter(Boolean)
    .join(" ");

  const styleInjection = `<style>${selectors
    .map((selector) => `${selector} { ${declarations} }`)
    .join("\n")}</style>`;

  return svg.replace(/<svg[^>]*>/i, (match) => `${match}${styleInjection}`);
}

export function applyLogoSvgColorTransform(
  svg: string,
  options: LogoSvgRenderOptions
) {
  let nextSvg = stripInlineBackgroundStyles(svg);

  if (options.color && shouldApplyLogoColor(options)) {
    nextSvg = injectColorTransform(nextSvg, options.color, options);
  }

  return nextSvg;
}

export function prepareSvgForRendering(
  svg: string,
  options: LogoSvgRenderOptions
) {
  const transformedSvg = applyLogoSvgColorTransform(svg, options);
  const document = new DOMParser().parseFromString(
    transformedSvg,
    "image/svg+xml"
  );
  const root = document.documentElement;
  ensureSvgNamespace(root);
  ensureSvgDimensions(root);
  return new XMLSerializer().serializeToString(document);
}

export function getSvgViewBox(svg: string): SvgBounds {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  return (
    parseSvgDimensions(root) ?? {
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
      width: 1,
      height: 1,
    }
  );
}

export function shouldSkipSvgPath(path: SVGResultPaths): boolean {
  const style = path.userData?.style;
  if (style) {
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }

    if (style.fill === "none") return true;
    if (style.fillOpacity === 0 || style.opacity === 0) return true;
  }

  return false;
}

function getPointsBounds(points: THREE.Vector2[]) {
  const min = new THREE.Vector2(Infinity, Infinity);
  const max = new THREE.Vector2(-Infinity, -Infinity);

  for (const point of points) {
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
  }

  if (
    !Number.isFinite(min.x) ||
    !Number.isFinite(min.y) ||
    !Number.isFinite(max.x) ||
    !Number.isFinite(max.y)
  ) {
    return null;
  }

  return {
    minX: min.x,
    minY: min.y,
    maxX: max.x,
    maxY: max.y,
    width: max.x - min.x,
    height: max.y - min.y,
  } satisfies SvgBounds;
}

export function getSvgPaintedBounds(
  svgData: { paths: SVGResultPaths[] },
  curveSegments: number
) {
  let paintedBounds: SvgBounds | null = null;

  for (const path of svgData.paths) {
    if (shouldSkipSvgPath(path)) {
      continue;
    }

    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const points = shape.getPoints(Math.max(1, curveSegments * 2));
      const bounds = getPointsBounds(points);
      if (!bounds) {
        continue;
      }

      if (!paintedBounds) {
        paintedBounds = { ...bounds };
        continue;
      }

      paintedBounds.minX = Math.min(paintedBounds.minX, bounds.minX);
      paintedBounds.minY = Math.min(paintedBounds.minY, bounds.minY);
      paintedBounds.maxX = Math.max(paintedBounds.maxX, bounds.maxX);
      paintedBounds.maxY = Math.max(paintedBounds.maxY, bounds.maxY);
      paintedBounds.width = paintedBounds.maxX - paintedBounds.minX;
      paintedBounds.height = paintedBounds.maxY - paintedBounds.minY;
    }
  }

  return paintedBounds;
}
