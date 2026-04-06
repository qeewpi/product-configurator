"use client";

import * as THREE from "three";
import { exportTo3MF } from "three-3mf-exporter";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  SVGLoader,
  type SVGResultPaths,
} from "three/examples/jsm/loaders/SVGLoader.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  getCaseModelAssetPath,
  prepareCaseModel,
  type PreparedCaseModel,
} from "@/lib/case-models";
import type {
  ArtworkStyle,
  CaseModelId,
  DesignConfig,
  ExportQuality,
  LogoBackgroundMode,
} from "@/types/design";
import {
  getArtworkBounds,
  getContinuousPanelArtworkSlices,
  type LidPanelGeometry,
} from "@/lib/deck-case-artwork";
import { FILAMENT_PALETTE } from "@/lib/filaments";
import { traceRasterBlobToSvg } from "@/lib/raster-trace-client";
import {
  createTraceImageData,
  resolveBackgroundMode,
  type ResolvedLogoBackgroundMode,
} from "@/lib/logo-background";
import { isRasterLogo } from "@/lib/logo-svg-preview";

const EMBOSS_HEIGHT = 0.6;
const EMBOSS_WELD_DEPTH = 0.12;
// Keep flat artwork thick enough to survive common 0.2mm slicing without
// losing thin counters or interior separations in letters and line art.
const FLAT_ARTWORK_DEPTH = 0.4;

const MAX_EXPORT_COLORS = 8;
const LINE_ART_MIN_ALPHA = 16;

const EXPORT_COLOR_PALETTE = FILAMENT_PALETTE.slice(0, MAX_EXPORT_COLORS).map(
  (filament) => new THREE.Color(filament.hex)
);

type ExportProfile = {
  curveSegments: number;
  traceScale: number;
  maxTraceDimension: number;
  simplifyRatio: number;
  minSimplifyVertexCount: number;
  minPathPixelArea: number;
  minPathWorldSize: number;
};

type ExportPart = {
  color: THREE.ColorRepresentation;
  geometry: THREE.BufferGeometry;
  name: string;
};

type ShapeCandidate = {
  bounds: THREE.Box2;
  color: THREE.ColorRepresentation;
  points: THREE.Vector2[];
  shape: THREE.Shape;
};

type HoleCandidate = {
  bounds: THREE.Box2;
  path: THREE.Path;
  center: THREE.Vector2;
};

function getArtworkDepth(style: ArtworkStyle) {
  return style === "emboss"
    ? EMBOSS_HEIGHT + EMBOSS_WELD_DEPTH
    : FLAT_ARTWORK_DEPTH;
}

function getArtworkBaseZ(panel: LidPanelGeometry, style: ArtworkStyle) {
  return style === "emboss"
    ? panel.exportSurfaceZ - EMBOSS_WELD_DEPTH
    : panel.exportSurfaceZ - FLAT_ARTWORK_DEPTH;
}

const EXPORT_PROFILES: Record<ExportQuality, ExportProfile> = {
  fast: {
    curveSegments: 6,
    traceScale: 1.5,
    maxTraceDimension: 1024,
    simplifyRatio: 0.4,
    minSimplifyVertexCount: 180,
    minPathPixelArea: 24,
    minPathWorldSize: 0.15,
  },
  balanced: {
    curveSegments: 8,
    traceScale: 3,
    maxTraceDimension: 1536,
    simplifyRatio: 0.2,
    minSimplifyVertexCount: 256,
    minPathPixelArea: 12,
    minPathWorldSize: 0.1,
  },
  detailed: {
    curveSegments: 16,
    traceScale: 5,
    maxTraceDimension: 3072,
    simplifyRatio: 0,
    minSimplifyVertexCount: 1000000,
    minPathPixelArea: 32,
    minPathWorldSize: 0.15,
  },
};

const preparedModelPromises = new Map<
  CaseModelId,
  Promise<PreparedCaseModel>
>();

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function getPreparedModel(model: CaseModelId) {
  const existingPreparedModel = preparedModelPromises.get(model);
  if (existingPreparedModel) {
    return existingPreparedModel;
  }

  const preparedModelPromise = (async () => {
    const response = await fetch(getCaseModelAssetPath(model));
    if (!response.ok) {
      throw new Error("Failed to load base STL model");
    }

    const arrayBuffer = await response.arrayBuffer();
    const geometry = new STLLoader().parse(arrayBuffer);
    return prepareCaseModel(model, geometry);
  })()
    .catch((error) => {
      preparedModelPromises.delete(model);
      throw error;
    });

  preparedModelPromises.set(model, preparedModelPromise);
  return preparedModelPromise;
}

function normalizeGeometryForMerge(geometry: THREE.BufferGeometry) {
  const normalized = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  normalized.deleteAttribute("uv");
  normalized.deleteAttribute("color");
  normalized.computeVertexNormals();
  normalized.computeBoundingBox();
  normalized.computeBoundingSphere();
  return normalized;
}

function setHighQualitySmoothing(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
) {
  context.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in context) {
    context.imageSmoothingQuality = "high";
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to encode trace image"));
    }, "image/png");
  });
}


async function createEmbossGeometries(config: DesignConfig) {
  const { lidPanelGeometries, topLidBounds } = await getPreparedModel(config.model);
  const artworkBounds = getArtworkBounds(config.logo, topLidBounds);

  // Prefer the pre-traced vectorSvg for all logos (SVG uploads and color-traced PNGs).
  // This avoids expensive re-tracing during export.
  if (config.logo.vectorSvg) {
    // For raster-sourced logos (PNGs), don't override colors — let the
    // natural multicolor from vtracer traces come through.
    // Only apply logoColor for direct SVG uploads (monochrome vectors).
    const vectorGeometries = await createPanelSplitSvgEmbossGeometries(
      config.logo.vectorSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle,
      config.logo.backgroundMode,
      config.logo.color,
      config.logo.traceSettings
    );

    if (vectorGeometries.length > 0) {
      return vectorGeometries;
    }
  }

  // Fallback: re-trace from raster source if vectorSvg didn't produce geometry
  if (isRasterLogo(config.logo)) {
    const rasterSource = config.logo.rasterSourceDataUrl ?? config.logo.dataUrl;
    if (!rasterSource) {
      return [];
    }

    const image = await loadImage(rasterSource);
    const backgroundCanvas = document.createElement("canvas");
    backgroundCanvas.width = image.naturalWidth;
    backgroundCanvas.height = image.naturalHeight;
    const backgroundContext = backgroundCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    let resolvedBackgroundMode: ResolvedLogoBackgroundMode = "none";

    if (backgroundContext) {
      backgroundContext.drawImage(image, 0, 0);
      resolvedBackgroundMode = resolveBackgroundMode(
        backgroundContext.getImageData(
          0,
          0,
          backgroundCanvas.width,
          backgroundCanvas.height
        ),
        config.logo.backgroundMode
      );
    }

    const fallbackGeometries = await createRasterVectorEmbossGeometries(
      image,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle,
      resolvedBackgroundMode,
      config.logo.traceSettings
    );

    if (fallbackGeometries.length > 0) {
      return fallbackGeometries;
    }
  }

  return [];
}

function getSvgViewBox(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  const viewBox = root.getAttribute("viewBox");

  if (viewBox) {
    const [minX, minY, width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));

    if ([minX, minY, width, height].every((value) => Number.isFinite(value))) {
      return { minX, minY, width, height };
    }
  }

  const width = Number.parseFloat(root.getAttribute("width") ?? "0");
  const height = Number.parseFloat(root.getAttribute("height") ?? "0");
  return { minX: 0, minY: 0, width: width || 1, height: height || 1 };
}

function getExportProfile(quality: ExportQuality) {
  return EXPORT_PROFILES[quality] ?? EXPORT_PROFILES.balanced;
}

async function traceImageDataToSvg(
  imageData: ImageData,
  backgroundMode: ResolvedLogoBackgroundMode,
  traceSettings: DesignConfig["logo"]["traceSettings"]
) {
  const tracedSource = createTraceImageData(
    imageData,
    backgroundMode,
    traceSettings.style === "lineart" ? "bw" : "color",
    { minForegroundAlpha: LINE_ART_MIN_ALPHA, edgeSoftness: 0.08 }
  );
  const canvas = document.createElement("canvas");
  canvas.width = tracedSource.imageData.width;
  canvas.height = tracedSource.imageData.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to prepare vector trace source");
  }

  context.putImageData(tracedSource.imageData, 0, 0);
  const svg = await traceRasterBlobToSvg(await canvasToBlob(canvas), {
    fileName: "trace-source.png",
    traceSettings,
  });

  return {
    svg,
    shouldFilterBackground: tracedSource.shouldFilterBackground,
  };
}

function maybeSimplifyGeometry(
  geometry: THREE.BufferGeometry,
  profile: ExportProfile
) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const vertexCount = nonIndexed.getAttribute("position")?.count ?? 0;

  if (vertexCount < profile.minSimplifyVertexCount) {
    return normalizeGeometryForMerge(nonIndexed);
  }

  const removeCount = Math.floor(vertexCount * profile.simplifyRatio);
  if (removeCount <= 0 || vertexCount - removeCount < 12) {
    return normalizeGeometryForMerge(nonIndexed);
  }

  try {
    const simplified = new SimplifyModifier().modify(nonIndexed, removeCount);
    return normalizeGeometryForMerge(simplified);
  } catch {
    return normalizeGeometryForMerge(nonIndexed);
  }
}

function isFiniteBox(box: THREE.Box3) {
  return (
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
}

function validateExportGeometry(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) {
    return false;
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || !isFiniteBox(bounds)) {
    return false;
  }

  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const depth = bounds.max.z - bounds.min.z;

  return (
    width > Number.EPSILON &&
    height > Number.EPSILON &&
    depth > Number.EPSILON
  );
}

function collectMergedEmbossParts(parts: ExportPart[]) {
  const geometriesByColor = new Map<number, THREE.BufferGeometry[]>();

  for (const part of parts) {
    if (!validateExportGeometry(part.geometry)) {
      part.geometry.dispose();
      continue;
    }

    const color = new THREE.Color(part.color).getHex();
    const bucket = geometriesByColor.get(color);
    if (bucket) {
      bucket.push(part.geometry);
    } else {
      geometriesByColor.set(color, [part.geometry]);
    }
  }

  const mergedParts: ExportPart[] = [];

  for (const [color, geometries] of geometriesByColor) {
    const mergedGeometry =
      geometries.length === 1
        ? geometries[0].clone()
        : mergeGeometries(geometries, false);

    for (const geometry of geometries) {
      geometry.dispose();
    }

    if (!mergedGeometry) {
      continue;
    }

    const normalized = normalizeGeometryForMerge(mergedGeometry);
    mergedGeometry.dispose();

    if (!validateExportGeometry(normalized)) {
      normalized.dispose();
      continue;
    }

    mergedParts.push({
      color,
      geometry: normalized,
      name: "artwork",
    });
  }

  return mergedParts;
}

function getTriangleCount(geometry: THREE.BufferGeometry) {
  const indexCount = geometry.index?.count ?? 0;
  if (indexCount > 0) {
    return indexCount / 3;
  }

  return (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function logExportStats(
  config: DesignConfig,
  baseParts: ExportPart[],
  embossParts: ExportPart[]
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const baseTriangles = baseParts.reduce(
    (sum, part) => sum + getTriangleCount(part.geometry),
    0
  );
  const embossTriangles = embossParts.reduce(
    (sum, part) => sum + getTriangleCount(part.geometry),
    0
  );

  console.info("[3MF export]", {
    exportQuality: config.exportQuality,
    artworkStyle: config.artworkStyle,
    hasLogo: Boolean(config.logo.dataUrl || config.logo.vectorSvg),
    meshCount: baseParts.length + embossParts.length,
    baseTriangles,
    embossTriangles,
  });
}

function shouldSkipSvgPath(path: SVGResultPaths): boolean {
  const style = path.userData?.style;
  if (style) {
    if (style.fill === "none") return true;
    if (style.fillOpacity === 0 || style.opacity === 0) return true;
  }
  return false;
}

function isLikelyBackgroundColor(
  color: THREE.Color,
  shouldFilterBackground: boolean
) {
  return (
    shouldFilterBackground &&
    color.r > 0.94 &&
    color.g > 0.94 &&
    color.b > 0.94
  );
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

  return new THREE.Box2(min, max);
}

function getBoundsCenter(bounds: THREE.Box2) {
  return bounds.getCenter(new THREE.Vector2());
}

function createPathFromSubPath(subPath: THREE.Path) {
  const path = new THREE.Path();
  path.curves = subPath.curves;
  return path;
}

function isPointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function quantizeExportColor(color: THREE.ColorRepresentation) {
  const source = new THREE.Color(color);
  let closest = EXPORT_COLOR_PALETTE[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const paletteColor of EXPORT_COLOR_PALETTE) {
    const dr = source.r - paletteColor.r;
    const dg = source.g - paletteColor.g;
    const db = source.b - paletteColor.b;
    const distance = dr * dr + dg * dg + db * db;

    if (distance < minDistance) {
      minDistance = distance;
      closest = paletteColor;
    }
  }

  return closest.getHex();
}

function serializeSvgWithSize(svg: string, width: number, height: number) {
  const parser = new DOMParser();
  const document = parser.parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  root.setAttribute("width", `${width}`);
  root.setAttribute("height", `${height}`);
  return new XMLSerializer().serializeToString(document);
}

function createSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function rasterizeSvgToImage(svg: string, quality: ExportQuality) {
  const profile = getExportProfile(quality);
  const viewBox = getSvgViewBox(svg);
  const maxSourceDimension = Math.max(viewBox.width, viewBox.height, 1);
  const targetMaxDimension = Math.min(
    4096,
    Math.max(profile.maxTraceDimension, Math.round(maxSourceDimension * 2))
  );
  const scale = targetMaxDimension / maxSourceDimension;
  const width = Math.max(1, Math.round(viewBox.width * scale));
  const height = Math.max(1, Math.round(viewBox.height * scale));
  const sizedSvg = serializeSvgWithSize(svg, width, height);
  return loadImage(createSvgDataUrl(sizedSvg));
}

async function createPanelSplitSvgEmbossGeometries(
  svg: string,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality,
  style: ArtworkStyle,
  backgroundMode: LogoBackgroundMode,
  logoColor: string | null,
  traceSettings: DesignConfig["logo"]["traceSettings"]
) {
  let sourceSvg = svg;
  if (logoColor) {
    const styleInjection = `<style>path:not([fill="#FFFFFF"]):not([fill="#ffffff"]):not([fill="none"]) { fill: ${logoColor} !important; }</style>`;
    sourceSvg = sourceSvg.replace(/<svg[^>]*>/i, (match) => `${match}${styleInjection}`);
  }

  const image = await rasterizeSvgToImage(sourceSvg, quality);
  const backgroundCanvas = document.createElement("canvas");
  backgroundCanvas.width = image.naturalWidth;
  backgroundCanvas.height = image.naturalHeight;
  const backgroundContext = backgroundCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  let resolvedBackgroundMode: ResolvedLogoBackgroundMode = "none";

  if (backgroundContext) {
    backgroundContext.drawImage(image, 0, 0);
    resolvedBackgroundMode = resolveBackgroundMode(
      backgroundContext.getImageData(
        0,
        0,
        backgroundCanvas.width,
        backgroundCanvas.height
      ),
      backgroundMode
    );
  }

  return createRasterVectorEmbossGeometries(
    image,
    artworkBounds,
    lidPanelGeometries,
    quality,
    style,
    resolvedBackgroundMode,
    traceSettings
  );
}

async function createRasterVectorEmbossGeometries(
  image: HTMLImageElement,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality,
  style: ArtworkStyle,
  backgroundMode: ResolvedLogoBackgroundMode,
  traceSettings: DesignConfig["logo"]["traceSettings"]
) {
  const profile = getExportProfile(quality);
  const slices = getContinuousPanelArtworkSlices(
    lidPanelGeometries,
    artworkBounds,
    image.naturalWidth,
    image.naturalHeight
  );
  const geometries: ExportPart[] = [];

  for (const slice of slices) {
    const traceScale = Math.min(
      profile.traceScale,
      profile.maxTraceDimension /
        Math.max(slice.sourceCropWidth, slice.sourceCropHeight, 1)
    );
    const sourceWidth = Math.max(
      1,
      Math.round(slice.sourceCropWidth * traceScale)
    );
    const sourceHeight = Math.max(
      1,
      Math.round(slice.sourceCropHeight * traceScale)
    );
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = sourceWidth;
    sliceCanvas.height = sourceHeight;
    const sliceContext = sliceCanvas.getContext("2d", { willReadFrequently: true });

    if (!sliceContext) {
      continue;
    }

    setHighQualitySmoothing(sliceContext);
    sliceContext.clearRect(0, 0, sourceWidth, sourceHeight);
    sliceContext.drawImage(
      image,
      slice.sourceX,
      slice.sourceY,
      slice.sourceCropWidth,
      slice.sourceCropHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    const tracedSlice = await traceImageDataToSvg(
      sliceContext.getImageData(0, 0, sourceWidth, sourceHeight),
      backgroundMode,
      traceSettings
    );
    const loader = new SVGLoader();
    const svgData = loader.parse(tracedSlice.svg);
    const sliceViewBox = getSvgViewBox(tracedSlice.svg);
    const scaleX = slice.overlapWidth / sliceViewBox.width;
    const scaleY = slice.overlapHeight / sliceViewBox.height;
    const baseZ = getArtworkBaseZ(slice.panel, style);
    const shapeCandidates: ShapeCandidate[] = [];
    const holeCandidates: HoleCandidate[] = [];

    for (const path of svgData.paths) {
      if (shouldSkipSvgPath(path)) {
        continue;
      }

      const isBackgroundPath = isLikelyBackgroundColor(
        path.color,
        tracedSlice.shouldFilterBackground
      );
      const sourcePaths = path.subPaths;

      if (isBackgroundPath) {
        for (const subPath of sourcePaths) {
          const points = subPath.getPoints(profile.curveSegments * 2);
          const bounds = getPointsBounds(points);
          holeCandidates.push({
            bounds,
            center: getBoundsCenter(bounds),
            path: createPathFromSubPath(subPath),
          });
        }
        continue;
      }

      const shapes = SVGLoader.createShapes(path);
      if (shapes.length === 0) continue;

      for (const shape of shapes) {
        const points = shape.getPoints(profile.curveSegments * 2);
        const bounds = getPointsBounds(points);

        if (
          bounds.getSize(new THREE.Vector2()).x *
            bounds.getSize(new THREE.Vector2()).y <
          profile.minPathPixelArea
        ) {
          continue;
        }

        shapeCandidates.push({
          bounds,
          color: quantizeExportColor(path.color),
          points,
          shape,
        });
      }
    }

    for (const hole of holeCandidates) {
      let bestShape: ShapeCandidate | null = null;
      let bestArea = Number.POSITIVE_INFINITY;

      for (const candidate of shapeCandidates) {
        if (!candidate.bounds.containsBox(hole.bounds)) {
          continue;
        }

        if (!isPointInPolygon(hole.center, candidate.points)) {
          continue;
        }

        const size = candidate.bounds.getSize(new THREE.Vector2());
        const area = size.x * size.y;
        if (area < bestArea) {
          bestArea = area;
          bestShape = candidate;
        }
      }

      if (bestShape) {
        bestShape.shape.holes.push(hole.path);
      }
    }

    for (const candidate of shapeCandidates) {
      const geometry = new THREE.ExtrudeGeometry(candidate.shape, {
        depth: getArtworkDepth(style),
        bevelEnabled: false,
        curveSegments: profile.curveSegments,
        steps: 1,
      });

      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const pixelWidth = bounds ? bounds.max.x - bounds.min.x : 0;
      const pixelHeight = bounds ? bounds.max.y - bounds.min.y : 0;

      if (
        pixelWidth * pixelHeight < profile.minPathPixelArea ||
        pixelWidth * scaleX < profile.minPathWorldSize ||
        pixelHeight * scaleY < profile.minPathWorldSize
      ) {
        geometry.dispose();
        continue;
      }

      geometry.deleteAttribute("uv");
      geometry.translate(-sliceViewBox.minX, -sliceViewBox.minY, 0);
      geometry.scale(scaleX, -scaleY, 1);
      geometry.translate(slice.overlapMinX, slice.overlapMaxY, baseZ);
      const simplified = maybeSimplifyGeometry(geometry, profile);
      geometry.dispose();

      if (!validateExportGeometry(simplified)) {
        simplified.dispose();
        continue;
      }

      geometries.push({
        color: candidate.color,
        geometry: simplified,
        name: "artwork",
      });
    }
  }

  return geometries;
}

function downloadModel(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function save3mf(blob: Blob, fileName: string) {
  if ("showSaveFilePicker" in window) {
    type SavePickerWindow = Window & {
      showSaveFilePicker: (options: {
        suggestedName: string;
        types: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };

    try {
      const fileHandle = await (window as SavePickerWindow).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "3MF model",
            accept: { "model/3mf": [".3mf"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
  }

  downloadModel(blob, fileName);
}

function prepareExportPartGeometry(geometry: THREE.BufferGeometry) {
  const normalized = normalizeGeometryForMerge(geometry);

  if (!validateExportGeometry(normalized)) {
    normalized.dispose();
    throw new Error("Prepared export geometry is invalid");
  }

  return normalized;
}

function createBaseExportParts(
  config: DesignConfig,
  preparedModel: PreparedCaseModel
) {
  const lidNames =
    config.model === "compact-3-lid"
      ? (["lid-left", "lid-center", "lid-right"] as const)
      : (["lid"] as const);
  const lidColors =
    config.model === "rugged" ? [config.panelColors[0]] : config.panelColors;

  const parts: ExportPart[] = preparedModel.lidSections.map((lidSection, index) => ({
    color: lidColors[index] ?? lidColors[0],
    geometry: prepareExportPartGeometry(lidSection.geometry),
    name: lidNames[index] ?? `lid-${index}`,
  }));

  parts.push({
    color: config.bottomColor,
    geometry: prepareExportPartGeometry(preparedModel.bottomGeometry),
    name: "bottom-tray",
  });

  if (preparedModel.clipsGeometry) {
    parts.push({
      color: config.clipsColor,
      geometry: prepareExportPartGeometry(preparedModel.clipsGeometry),
      name: "clips",
    });
  }

  return parts;
}

function getExportFileName(model: CaseModelId) {
  return model === "compact-3-lid"
    ? "compact-3-lid-configured.3mf"
    : "rugged-configured.3mf";
}

export async function exportDesignAs3MF(config: DesignConfig) {
  const preparedModel = await getPreparedModel(config.model);
  const baseParts = createBaseExportParts(config, preparedModel);
  const embossParts = collectMergedEmbossParts(
    await createEmbossGeometries(config)
  );
  logExportStats(config, baseParts, embossParts);
  const exportGroup = new THREE.Group();
  exportGroup.name = "deck-case-design";

  for (const part of baseParts) {
    const mesh = new THREE.Mesh(
      part.geometry,
      new THREE.MeshStandardMaterial({ color: part.color })
    );
    mesh.name = part.name;
    exportGroup.add(mesh);
  }

  for (const [index, part] of embossParts.entries()) {
    const mesh = new THREE.Mesh(
      part.geometry,
      new THREE.MeshStandardMaterial({ color: part.color })
    );
    mesh.name = `${part.name}_${index}`;
    exportGroup.add(mesh);
  }

  let data: Blob;
  try {
    data = await exportTo3MF(exportGroup, {
      printer_name: "",
      filament: "",
      printableWidth: 256,
      printableDepth: 256,
      printableHeight: 256,
      seam_position: "back",
      compression: "standard",
    });
  } catch (error) {
    throw new Error(
      `Failed to generate 3MF export: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  await save3mf(data, getExportFileName(config.model));
}

export async function exportDesignAsStl(config: DesignConfig) {
  return exportDesignAs3MF(config);
}
