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
import type { DesignConfig, ExportQuality } from "@/types/design";
import {
  getArtworkBounds,
  getContinuousPanelArtworkSlices,
  getPanelArtworkSlices,
  type LidPanelGeometry,
  type TopLidBounds,
  prepareDeckCaseGeometry,
} from "@/lib/deck-case-artwork";
import { FILAMENT_PALETTE } from "@/lib/filaments";

const MODEL_PATH = "/models/Plain.stl";
const EXPORT_FILENAME = "deck-case-design.3mf";
const MAX_MASK_RESOLUTION = 96;
const MIN_ALPHA_THRESHOLD = 32;
const EMBOSS_HEIGHT = 0.01;
const EMBOSS_FACE_OFFSET = 0.001;
const DEFAULT_EMBOSS_COLOR = 0x222222;
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

let preparedModelPromise: Promise<{
  regionGeometry: THREE.BufferGeometry;
  lidPanelGeometries: LidPanelGeometry[];
  topLidBounds: TopLidBounds;
}> | null = null;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function getPreparedModel() {
  if (!preparedModelPromise) {
    preparedModelPromise = fetch(MODEL_PATH)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load base STL model");
        }

        const arrayBuffer = await response.arrayBuffer();
        const rawGeometry = new STLLoader().parse(arrayBuffer);
        return prepareDeckCaseGeometry(rawGeometry);
      })
      .catch((error) => {
        preparedModelPromise = null;
        throw error;
      });
  }

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

function createEmbossRowGeometry(
  startColumn: number,
  endColumn: number,
  row: number,
  slice: ReturnType<typeof getPanelArtworkSlices>[number],
  columns: number,
  rows: number
) {
  const cellWidth = slice.overlapWidth / columns;
  const cellHeight = slice.overlapHeight / rows;
  const boxWidth = (endColumn - startColumn) * cellWidth;
  const centerX =
    slice.overlapMinX + startColumn * cellWidth + boxWidth / 2;
  const centerY =
    slice.overlapMaxY - row * cellHeight - cellHeight / 2;
  const centerZ = slice.panel.outerFaceZ + EMBOSS_FACE_OFFSET + EMBOSS_HEIGHT / 2;

  const geometry = new THREE.BoxGeometry(boxWidth, cellHeight, EMBOSS_HEIGHT);
  geometry.translate(centerX, centerY, centerZ);
  return normalizeGeometryForMerge(geometry);
}

function createEmbossGeometryFromSlice(
  slice: ReturnType<typeof getPanelArtworkSlices>[number],
  image: HTMLImageElement
) {
  const columns = Math.max(
    1,
    Math.round(
      (slice.sourceCropWidth / image.naturalWidth) * MAX_MASK_RESOLUTION
    )
  );
  const rows = Math.max(
    1,
    Math.round(
      (slice.sourceCropHeight / image.naturalHeight) * MAX_MASK_RESOLUTION
    )
  );

  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to prepare emboss texture");
  }

  context.clearRect(0, 0, columns, rows);
  context.drawImage(
    image,
    slice.sourceX,
    slice.sourceY,
    slice.sourceCropWidth,
    slice.sourceCropHeight,
    0,
    0,
    columns,
    rows
  );

  const imageData = context.getImageData(0, 0, columns, rows);
  const geometries: ExportPart[] = [];

  for (let row = 0; row < rows; row++) {
    let runStart = -1;

    for (let column = 0; column <= columns; column++) {
      const pixelIndex = (row * columns + column) * 4;
      const isOpaque =
        column < columns && imageData.data[pixelIndex + 3] >= MIN_ALPHA_THRESHOLD;

      if (isOpaque && runStart === -1) {
        runStart = column;
      }

      if (!isOpaque && runStart !== -1) {
        geometries.push(
          {
            color: DEFAULT_EMBOSS_COLOR,
            geometry: createEmbossRowGeometry(runStart, column, row, slice, columns, rows),
            name: "emboss_slice",
          }
        );
        runStart = -1;
      }
    }
  }

  return geometries;
}

async function createEmbossGeometries(config: DesignConfig) {
  const { lidPanelGeometries, topLidBounds } = await getPreparedModel();
  const artworkBounds = getArtworkBounds(config.logo, topLidBounds);

  if (isSvgLogo(config) && config.logo.vectorSvg) {
    const directGeometries = await createPanelSplitSvgEmbossGeometries(
      config.logo.vectorSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality
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
      config.exportQuality
    );

    if (fallbackGeometries.length > 0) {
      return fallbackGeometries;
    }

    const tracedSvg = createRasterSourceVectorSvg(image, config.exportQuality);
    const vectorGeometries = await createPanelSplitSvgEmbossGeometries(
      tracedSvg,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality
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
      config.exportQuality
    );

    if (vectorGeometries.length > 0) {
      return vectorGeometries;
    }
  }

  if (!config.logo.dataUrl) {
    return [];
  }

  const image = await loadImage(config.logo.dataUrl);
  const slices = getContinuousPanelArtworkSlices(
    lidPanelGeometries,
    artworkBounds,
    image.naturalWidth,
    image.naturalHeight
  );

  return slices.flatMap((slice) => createEmbossGeometryFromSlice(slice, image));
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
  const c = path.color;
  if (c.r > 0.94 && c.g > 0.94 && c.b > 0.94) return true;
  return false;
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
  quality: ExportQuality
) {
  const renderedImage = await rasterizeSvgToImage(svg, quality);
  return createRasterVectorEmbossGeometries(
    renderedImage,
    artworkBounds,
    lidPanelGeometries,
    quality
  );
}

async function createRasterVectorEmbossGeometries(
  image: HTMLImageElement,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality
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
    const baseZ = slice.panel.outerFaceZ + EMBOSS_FACE_OFFSET;

    for (const path of svgData.paths) {
      if (shouldSkipSvgPath(path)) continue;

      const shapes = SVGLoader.createShapes(path);
      if (shapes.length === 0) continue;

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: EMBOSS_HEIGHT,
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
      geometries.push({
        color: quantizeExportColor(path.color),
        geometry: maybeSimplifyGeometry(geometry, profile),
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
  const { regionGeometry } = await getPreparedModel();
  const baseGeometry = normalizeGeometryForMerge(regionGeometry);
  const embossParts = await createEmbossGeometries(config);
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
