"use client";

import * as THREE from "three";
import ImageTracer from "imagetracerjs";
import { exportTo3MF } from "three-3mf-exporter";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  SVGLoader,
  type SVGResultPaths,
} from "three/examples/jsm/loaders/SVGLoader.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getCaseModelAssetPaths, prepareCaseModel } from "@/lib/case-models";
import type {
  ArtworkStyle,
  CaseModelId,
  DesignConfig,
  ExportQuality,
} from "@/types/design";
import {
  getArtworkBounds,
  getContinuousPanelArtworkSlices,
  type LidPanelGeometry,
  type TopLidBounds,
} from "@/lib/deck-case-artwork";
import { FILAMENT_PALETTE } from "@/lib/filaments";

const EXPORT_FILENAME = "deck-case-design.3mf";

const EMBOSS_HEIGHT = 0.6;
const EMBOSS_WELD_DEPTH = 0.12;
// Keep flat artwork thick enough to survive common 0.2mm slicing without
// losing thin counters or interior separations in letters and line art.
const FLAT_ARTWORK_DEPTH = 0.4;

const MAX_EXPORT_COLORS = 8;
const LINE_ART_MIN_ALPHA = 16;
const BACKGROUND_LUMINANCE_THRESHOLD = 242;
const BACKGROUND_CHROMA_THRESHOLD = 28;
const LINE_ART_TRACE_OPTIONS = {
  ltres: 0.15,
  qtres: 0.2,
  pathomit: 1,
  rightangleenhance: false,
  colorsampling: 2,
  numberofcolors: 12,
  mincolorratio: 0.001,
  colorquantcycles: 2,
  layering: 0,
  strokewidth: 0,
  linefilter: false,
  roundcoords: 2,
  scale: 1,
  blurradius: 0,
  blurdelta: 20,
} satisfies Parameters<typeof ImageTracer.imagedataToSVG>[1];

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
  traceOptions: Parameters<typeof ImageTracer.imagedataToSVG>[1];
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
    traceScale: 1.25,
    maxTraceDimension: 768,
    simplifyRatio: 0.55,
    minSimplifyVertexCount: 180,
    minPathPixelArea: 64,
    minPathWorldSize: 0.28,
    traceOptions: {
      ltres: 0.7,
      qtres: 0.7,
      pathomit: 16,
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 8,
      mincolorratio: 0.006,
      colorquantcycles: 2,
      layering: 0,
      strokewidth: 0,
      linefilter: true,
      roundcoords: 1,
      scale: 1,
      blurradius: 1,
      blurdelta: 18,
    },
  },
  balanced: {
    curveSegments: 8,
    traceScale: 2,
    maxTraceDimension: 1024,
    simplifyRatio: 0.35,
    minSimplifyVertexCount: 256,
    minPathPixelArea: 36,
    minPathWorldSize: 0.18,
    traceOptions: {
      ltres: 0.5,
      qtres: 0.45,
      pathomit: 8,
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 12,
      mincolorratio: 0.003,
      colorquantcycles: 2,
      layering: 0,
      strokewidth: 0,
      linefilter: true,
      roundcoords: 1,
      scale: 1,
      blurradius: 1,
      blurdelta: 16,
    },
  },
  detailed: {
    curveSegments: 16,
    traceScale: 5,
    maxTraceDimension: 3072,
    simplifyRatio: 0,
    minSimplifyVertexCount: 1000000,
    minPathPixelArea: 8,
    minPathWorldSize: 0.08,
    traceOptions: {
      ltres: 0.2,
      qtres: 0.25,
      pathomit: 2,
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 24,
      mincolorratio: 0.001,
      colorquantcycles: 4,
      layering: 0,
      strokewidth: 0,
      linefilter: false,
      roundcoords: 2,
      scale: 1,
      blurradius: 0,
      blurdelta: 16,
    },
  },
};

const preparedModelPromises = new Map<
  CaseModelId,
  Promise<{
    regionGeometry: THREE.BufferGeometry;
    lidPanelGeometries: LidPanelGeometry[];
    topLidBounds: TopLidBounds;
  }>
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

  const preparedModelPromise = Promise.all(
    getCaseModelAssetPaths(model).map(async (assetPath) => {
      const response = await fetch(assetPath);
      if (!response.ok) {
        throw new Error("Failed to load base STL model");
      }

      const arrayBuffer = await response.arrayBuffer();
      return new STLLoader().parse(arrayBuffer);
    })
  )
    .then((geometries) => prepareCaseModel(model, geometries))
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


async function createEmbossGeometries(config: DesignConfig) {
  const { lidPanelGeometries, topLidBounds } = await getPreparedModel(config.model);
  const artworkBounds = getArtworkBounds(config.logo, topLidBounds);

  if (isSvgLogo(config) && config.logo.vectorSvg) {
    const directGeometries = await createPanelSplitSvgEmbossGeometries(
      config.logo.vectorSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle
    );

    if (directGeometries.length > 0) {
      return directGeometries;
    }
  }

  if (config.logo.dataUrl && !isSvgLogo(config)) {
    const image = await loadImage(config.logo.dataUrl);
    const fallbackGeometries = await createRasterVectorEmbossGeometries(
      image,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle
    );

    if (fallbackGeometries.length > 0) {
      return fallbackGeometries;
    }

    const tracedSvg = createRasterSourceVectorSvg(image, config.exportQuality);
    const vectorGeometries = await createPanelSplitSvgEmbossGeometries(
      tracedSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle
    );

    if (vectorGeometries.length > 0) {
      return vectorGeometries;
    }
  }

  if (config.logo.vectorSvg) {
    const vectorGeometries = await createPanelSplitSvgEmbossGeometries(
      config.logo.vectorSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality,
      config.artworkStyle
    );

    if (vectorGeometries.length > 0) {
      return vectorGeometries;
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

function sanitizeTracedSvg(svg: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;

  for (const element of Array.from(root.querySelectorAll("*"))) {
    const isHidden =
      element.getAttribute("fill-opacity") === "0" ||
      element.getAttribute("opacity") === "0" ||
      (element.getAttribute("fill") === "none" &&
        element.getAttribute("stroke") === "none");

    if (isHidden) {
      element.remove();
    }
  }

  return new XMLSerializer().serializeToString(document);
}

function createLineArtTraceImageData(imageData: ImageData) {
  const output = new ImageData(imageData.width, imageData.height);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3];
    if (alpha < LINE_ART_MIN_ALPHA) {
      output.data[i] = 255;
      output.data[i + 1] = 255;
      output.data[i + 2] = 255;
      output.data[i + 3] = 255;
      continue;
    }

    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const isNearWhiteBackground =
      luminance >= BACKGROUND_LUMINANCE_THRESHOLD &&
      chroma <= BACKGROUND_CHROMA_THRESHOLD;

    output.data[i] = isNearWhiteBackground ? 255 : r;
    output.data[i + 1] = isNearWhiteBackground ? 255 : g;
    output.data[i + 2] = isNearWhiteBackground ? 255 : b;
    output.data[i + 3] = 255;
  }

  return output;
}

function getExportProfile(quality: ExportQuality) {
  return EXPORT_PROFILES[quality] ?? EXPORT_PROFILES.balanced;
}

function traceImageDataToSvg(imageData: ImageData, profile: ExportProfile) {
  const svg = ImageTracer.imagedataToSVG(createLineArtTraceImageData(imageData), {
    ...LINE_ART_TRACE_OPTIONS,
    ...profile.traceOptions,
  });

  return sanitizeTracedSvg(svg);
}

function createRasterSourceVectorSvg(
  image: HTMLImageElement,
  quality: ExportQuality
) {
  const profile = getExportProfile(quality);
  const traceScale = Math.min(
    profile.traceScale,
    profile.maxTraceDimension / Math.max(image.naturalWidth, image.naturalHeight, 1)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * traceScale));
  const height = Math.max(1, Math.round(image.naturalHeight * traceScale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Failed to prepare vector trace source");
  }

  setHighQualitySmoothing(context);
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return traceImageDataToSvg(context.getImageData(0, 0, width, height), profile);
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
    const welded = mergeVertices(normalized, 1e-4);
    normalized.dispose();
    welded.computeVertexNormals();

    if (!validateExportGeometry(welded)) {
      welded.dispose();
      continue;
    }

    mergedParts.push({
      color,
      geometry: welded,
      name: "emboss_merged",
    });
  }

  return mergedParts;
}

function logExportStats(
  config: DesignConfig,
  baseGeometry: THREE.BufferGeometry,
  embossParts: ExportPart[]
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const baseTriangles = (baseGeometry.getAttribute("position")?.count ?? 0) / 3;
  const embossTriangles = embossParts.reduce(
    (sum, part) => sum + (part.geometry.getAttribute("position")?.count ?? 0) / 3,
    0
  );

  console.info("[3MF export]", {
    exportQuality: config.exportQuality,
    artworkStyle: config.artworkStyle,
    hasLogo: Boolean(config.logo.dataUrl || config.logo.vectorSvg),
    meshCount: 1 + embossParts.length,
    baseTriangles,
    embossTriangles,
  });
}

function isSvgLogo(config: DesignConfig) {
  const fileName = config.logo.originalFileName?.toLowerCase() ?? "";
  return fileName.endsWith(".svg");
}

function shouldSkipSvgPath(path: SVGResultPaths): boolean {
  const style = path.userData?.style;
  if (style) {
    if (style.fill === "none") return true;
    if (style.fillOpacity === 0 || style.opacity === 0) return true;
  }
  return false;
}

function isLikelyBackgroundColor(color: THREE.Color) {
  return color.r > 0.94 && color.g > 0.94 && color.b > 0.94;
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
  style: ArtworkStyle
) {
  const renderedImage = await rasterizeSvgToImage(svg, quality);
  return createRasterVectorEmbossGeometries(
    renderedImage,
    artworkBounds,
    lidPanelGeometries,
    quality,
    style
  );
}

async function createRasterVectorEmbossGeometries(
  image: HTMLImageElement,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality,
  style: ArtworkStyle
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

    const tracedSliceSvg = traceImageDataToSvg(
      sliceContext.getImageData(0, 0, sourceWidth, sourceHeight),
      profile
    );
    const loader = new SVGLoader();
    const svgData = loader.parse(tracedSliceSvg);
    const sliceViewBox = getSvgViewBox(tracedSliceSvg);
    const scaleX = slice.overlapWidth / sliceViewBox.width;
    const scaleY = slice.overlapHeight / sliceViewBox.height;
    const baseZ = getArtworkBaseZ(slice.panel, style);
    const shapeCandidates: ShapeCandidate[] = [];
    const holeCandidates: HoleCandidate[] = [];

    for (const path of svgData.paths) {
      if (shouldSkipSvgPath(path)) {
        continue;
      }

      const isBackgroundPath = isLikelyBackgroundColor(path.color);
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
        name: "emboss_raster",
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

export async function exportDesignAsStl(config: DesignConfig) {
  const { regionGeometry } = await getPreparedModel(config.model);
  const baseNormalized = normalizeGeometryForMerge(regionGeometry);
  const baseGeometry = mergeVertices(baseNormalized, 1e-4);
  baseNormalized.dispose();
  baseGeometry.computeVertexNormals();
  const embossParts = collectMergedEmbossParts(await createEmbossGeometries(config));
  logExportStats(config, baseGeometry, embossParts);
  const exportGroup = new THREE.Group();
  exportGroup.name = "deck-case-design";
  const baseMesh = new THREE.Mesh(
    baseGeometry,
    new THREE.MeshStandardMaterial({ color: 0xd9d9d9 })
  );
  baseMesh.name = "base";
  exportGroup.add(baseMesh);

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

  await save3mf(data, EXPORT_FILENAME);
}
