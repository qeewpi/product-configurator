import * as THREE from "three";
import type { LogoConfig } from "@/types/design";

export interface LidPanelGeometry {
  geometry: THREE.BufferGeometry;
  bounds: THREE.Box3;
  center: THREE.Vector3;
  outerFaceZ: number;
  exportSurfaceZ: number;
  width: number;
  height: number;
}

export interface TopLidBounds {
  center: THREE.Vector3;
  maxY: number;
}

export interface ArtworkBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PanelArtworkSlice {
  panel: LidPanelGeometry;
  overlapMinX: number;
  overlapMaxX: number;
  overlapMinY: number;
  overlapMaxY: number;
  overlapWidth: number;
  overlapHeight: number;
  sourceX: number;
  sourceY: number;
  sourceCropWidth: number;
  sourceCropHeight: number;
}

const LOGO_WORLD_HEIGHT = 30;
const PANEL_SURFACE_OFFSET = 0.2;

export function describeLidPanelGeometry(geometry: THREE.BufferGeometry) {
  const panelGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  panelGeometry.computeBoundingBox();
  panelGeometry.computeBoundingSphere();
  const bounds = panelGeometry.boundingBox!;
  const center = new THREE.Vector3();
  bounds.getCenter(center);

  return {
    geometry: panelGeometry,
    bounds,
    center,
    outerFaceZ: bounds.max.z + PANEL_SURFACE_OFFSET,
    exportSurfaceZ: bounds.max.z,
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
  } satisfies LidPanelGeometry;
}

export function getTopLidBounds(lidPanelGeometries: LidPanelGeometry[]): TopLidBounds {
  const topLidBox = new THREE.Box3();
  for (const panel of lidPanelGeometries) {
    topLidBox.union(panel.bounds);
  }

  const topLidCenter = new THREE.Vector3();
  topLidBox.getCenter(topLidCenter);

  return {
    center: topLidCenter,
    maxY: topLidBox.max.y,
  } satisfies TopLidBounds;
}

export function getArtworkBounds(logo: LogoConfig, topLidBounds: TopLidBounds) {
  const height = LOGO_WORLD_HEIGHT * logo.scale;
  const aspectRatio = logo.aspectRatio || 1;
  const width = height * aspectRatio;

  const centerX = topLidBounds.center.x + logo.position.x;
  const centerY = topLidBounds.maxY + logo.position.y;

  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: centerY - height / 2,
    maxY: centerY + height / 2,
    width,
    height,
  } satisfies ArtworkBounds;
}

export function getPanelArtworkSlices(
  lidPanelGeometries: LidPanelGeometry[],
  artworkBounds: ArtworkBounds,
  sourceWidth: number,
  sourceHeight: number
) {
  if (
    !artworkBounds.width ||
    !artworkBounds.height ||
    !sourceWidth ||
    !sourceHeight
  ) {
    return [];
  }

  return lidPanelGeometries
    .map((panel) => {
      const overlapMinX = Math.max(panel.bounds.min.x, artworkBounds.minX);
      const overlapMaxX = Math.min(panel.bounds.max.x, artworkBounds.maxX);
      const overlapMinY = Math.max(panel.bounds.min.y, artworkBounds.minY);
      const overlapMaxY = Math.min(panel.bounds.max.y, artworkBounds.maxY);

      if (overlapMinX >= overlapMaxX || overlapMinY >= overlapMaxY) {
        return null;
      }

      return {
        panel,
        overlapMinX,
        overlapMaxX,
        overlapMinY,
        overlapMaxY,
        overlapWidth: overlapMaxX - overlapMinX,
        overlapHeight: overlapMaxY - overlapMinY,
        sourceX:
          ((overlapMinX - artworkBounds.minX) / artworkBounds.width) * sourceWidth,
        sourceY:
          ((artworkBounds.maxY - overlapMaxY) / artworkBounds.height) *
          sourceHeight,
        sourceCropWidth:
          ((overlapMaxX - overlapMinX) / artworkBounds.width) * sourceWidth,
        sourceCropHeight:
          ((overlapMaxY - overlapMinY) / artworkBounds.height) * sourceHeight,
      } satisfies PanelArtworkSlice;
    })
    .filter((slice): slice is PanelArtworkSlice => slice !== null);
}

export function getContinuousPanelArtworkSlices(
  lidPanelGeometries: LidPanelGeometry[],
  artworkBounds: ArtworkBounds,
  sourceWidth: number,
  sourceHeight: number
) {
  const slices = getPanelArtworkSlices(
    lidPanelGeometries,
    artworkBounds,
    sourceWidth,
    sourceHeight
  ).sort((a, b) => a.overlapMinX - b.overlapMinX);

  if (slices.length <= 1) {
    return slices;
  }

  const leftMargin = Math.max(0, slices[0].overlapMinX - artworkBounds.minX);
  const rightMargin = Math.max(
    0,
    artworkBounds.maxX - slices[slices.length - 1].overlapMaxX
  );
  const printableWidth = slices.reduce(
    (sum, slice) => sum + slice.overlapWidth,
    0
  );
  const collapsedArtworkWidth = Math.max(
    leftMargin + printableWidth + rightMargin,
    Number.EPSILON
  );

  let printableOffset = leftMargin;

  return slices.map((slice) => {
    const continuousSlice = {
      ...slice,
      sourceX: (printableOffset / collapsedArtworkWidth) * sourceWidth,
      sourceCropWidth: (slice.overlapWidth / collapsedArtworkWidth) * sourceWidth,
    } satisfies PanelArtworkSlice;

    printableOffset += slice.overlapWidth;
    return continuousSlice;
  });
}
