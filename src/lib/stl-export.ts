"use client";

import * as THREE from "three";
import ImageTracer from "imagetracerjs";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DesignConfig, ExportQuality } from "@/types/design";
import {
  getArtworkBounds,
  getPanelArtworkSlices,
  type LidPanelGeometry,
  type TopLidBounds,
  prepareDeckCaseGeometry,
} from "@/lib/deck-case-artwork";

const MODEL_PATH = "/models/Plain.stl";
const EXPORT_FILENAME = "deck-case-design.stl";
const MAX_MASK_RESOLUTION = 96;
const MIN_ALPHA_THRESHOLD = 32;
const EMBOSS_HEIGHT = 0.01;
const EMBOSS_FACE_OFFSET = 0.001;

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
    curveSegments: 32,
    traceScale: 4,
    maxTraceDimension: 2048,
    simplifyRatio: 0,
    minSimplifyVertexCount: 1000000,
    minPathPixelArea: 0,
    minPathWorldSize: 0,
    traceOptions: {
      ltres: 0.2,
      qtres: 2,
      pathomit: 0,
      rightangleenhance: false,
      colorsampling: 0,
      numberofcolors: 32,
      mincolorratio: 0.0005,
      colorquantcycles: 6,
      layering: 0,
      strokewidth: 0,
      linefilter: true,
      roundcoords: 3,
      scale: 1,
      blurradius: 4,
      blurdelta: 48,
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
  const geometries: THREE.BufferGeometry[] = [];

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
          createEmbossRowGeometry(runStart, column, row, slice, columns, rows)
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

  if (config.logo.dataUrl && !isSvgLogo(config)) {
    const image = await loadImage(config.logo.dataUrl);
    const vectorGeometries = await createRasterVectorEmbossGeometries(
      image,
      artworkBounds,
      lidPanelGeometries,
      config.exportQuality
    );

    if (vectorGeometries.length > 0) {
      return vectorGeometries;
    }
  }

  if (config.logo.vectorSvg) {
    const vectorGeometries = await createVectorEmbossGeometries(
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
  const slices = getPanelArtworkSlices(
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

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
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

function getExportProfile(quality: ExportQuality) {
  return EXPORT_PROFILES[quality] ?? EXPORT_PROFILES.balanced;
}

function traceImageDataToSvg(imageData: ImageData, profile: ExportProfile) {
  const svg = ImageTracer.imagedataToSVG(imageData, profile.traceOptions);

  return sanitizeTracedSvg(svg);
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

async function createVectorEmbossGeometries(
  svg: string,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality
) {
  const profile = getExportProfile(quality);
  const viewBox = getSvgViewBox(svg);
  const slices = getPanelArtworkSlices(
    lidPanelGeometries,
    artworkBounds,
    viewBox.width,
    viewBox.height
  );
  const geometries: THREE.BufferGeometry[] = [];
  const svgImage = await loadImage(svgToDataUrl(svg));
  const traceScale = Math.min(
    profile.traceScale,
    profile.maxTraceDimension / Math.max(viewBox.width, viewBox.height, 1)
  );
  const rasterCanvas = document.createElement("canvas");
  rasterCanvas.width = Math.max(1, Math.round(viewBox.width * traceScale));
  rasterCanvas.height = Math.max(
    1,
    Math.round(viewBox.height * traceScale)
  );
  const rasterContext = rasterCanvas.getContext("2d", { willReadFrequently: true });

  if (!rasterContext) {
    return [];
  }

  rasterContext.clearRect(0, 0, rasterCanvas.width, rasterCanvas.height);
  rasterContext.drawImage(svgImage, 0, 0, rasterCanvas.width, rasterCanvas.height);

  for (const slice of slices) {
    const sourceX = Math.max(0, Math.round(slice.sourceX * traceScale));
    const sourceY = Math.max(0, Math.round(slice.sourceY * traceScale));
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

    sliceContext.clearRect(0, 0, sourceWidth, sourceHeight);
    sliceContext.drawImage(
      rasterCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
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
      geometries.push(maybeSimplifyGeometry(geometry, profile));
    }
  }

  return geometries;
}

async function createRasterVectorEmbossGeometries(
  image: HTMLImageElement,
  artworkBounds: ReturnType<typeof getArtworkBounds>,
  lidPanelGeometries: LidPanelGeometry[],
  quality: ExportQuality
) {
  const profile = getExportProfile(quality);
  const slices = getPanelArtworkSlices(
    lidPanelGeometries,
    artworkBounds,
    image.naturalWidth,
    image.naturalHeight
  );
  const geometries: THREE.BufferGeometry[] = [];

  for (const slice of slices) {
    const sourceWidth = Math.max(1, Math.round(slice.sourceCropWidth));
    const sourceHeight = Math.max(1, Math.round(slice.sourceCropHeight));
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = sourceWidth;
    sliceCanvas.height = sourceHeight;
    const sliceContext = sliceCanvas.getContext("2d", { willReadFrequently: true });

    if (!sliceContext) {
      continue;
    }

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
      geometries.push(maybeSimplifyGeometry(geometry, profile));
    }
  }

  return geometries;
}

function downloadBinaryStl(data: ArrayBuffer | DataView, fileName: string) {
  const source =
    data instanceof DataView
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const blob = new Blob([bytes.buffer], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveBinaryStl(data: ArrayBuffer | DataView, fileName: string) {
  const source =
    data instanceof DataView
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const blob = new Blob([bytes.buffer], { type: "model/stl" });

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
            description: "STL model",
            accept: { "model/stl": [".stl"] },
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

  downloadBinaryStl(data, fileName);
}

export async function exportDesignAsStl(config: DesignConfig) {
  const { regionGeometry } = await getPreparedModel();
  const baseGeometry = normalizeGeometryForMerge(regionGeometry);
  const embossGeometries = await createEmbossGeometries(config);
  const mergedGeometry = mergeGeometries([baseGeometry, ...embossGeometries], false);

  if (!mergedGeometry) {
    throw new Error("Failed to generate STL export geometry");
  }

  const mesh = new THREE.Mesh(mergedGeometry, new THREE.MeshStandardMaterial());
  const scene = new THREE.Scene();
  scene.add(mesh);

  const data = new STLExporter().parse(scene, { binary: true });
  if (!(data instanceof ArrayBuffer) && !(data instanceof DataView)) {
    throw new Error("Failed to encode STL export");
  }

  await saveBinaryStl(data, EXPORT_FILENAME);
}
