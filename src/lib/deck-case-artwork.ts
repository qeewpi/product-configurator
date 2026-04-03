import * as THREE from "three";
import type { LogoConfig } from "@/types/design";
import { prepareRegionGeometry } from "@/lib/stl-regions";

export interface LidPanelGeometry {
  geometry: THREE.BufferGeometry;
  bounds: THREE.Box3;
  center: THREE.Vector3;
  outerFaceZ: number;
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

function getGroupedBounds(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const groups =
    geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: position.count, materialIndex: 0 }];

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const group of groups) {
    const start = group.start;
    const end = group.start + group.count;

    for (let i = start; i < end; i++) {
      min.x = Math.min(min.x, position.getX(i));
      min.y = Math.min(min.y, position.getY(i));
      min.z = Math.min(min.z, position.getZ(i));
      max.x = Math.max(max.x, position.getX(i));
      max.y = Math.max(max.y, position.getY(i));
      max.z = Math.max(max.z, position.getZ(i));
    }
  }

  return new THREE.Box3(min, max);
}

function createGroupedGeometry(
  geometry: THREE.BufferGeometry,
  group: THREE.BufferGeometry["groups"][number]
) {
  const groupedGeometry = geometry.clone();
  groupedGeometry.clearGroups();
  groupedGeometry.addGroup(group.start, group.count, 0);
  groupedGeometry.computeBoundingBox();
  groupedGeometry.computeBoundingSphere();
  return groupedGeometry;
}

export function prepareDeckCaseGeometry(rawGeometry: THREE.BufferGeometry) {
  const geometry = prepareRegionGeometry(rawGeometry);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const modelCenter = new THREE.Vector3();
  box.getCenter(modelCenter);
  geometry.translate(-modelCenter.x, -modelCenter.y, -modelCenter.z);

  const lidPanelGeometries = geometry.groups
    .filter((group) => (group.materialIndex ?? 0) < 3)
    .sort((a, b) => (a.materialIndex ?? 0) - (b.materialIndex ?? 0))
    .map((group) => {
      const panelGeometry = createGroupedGeometry(geometry, group);
      const bounds = getGroupedBounds(panelGeometry);
      const center = new THREE.Vector3();
      bounds.getCenter(center);

      return {
        geometry: panelGeometry,
        bounds,
        center,
        outerFaceZ: bounds.max.z + PANEL_SURFACE_OFFSET,
        width: bounds.max.x - bounds.min.x,
        height: bounds.max.y - bounds.min.y,
      };
    });

  const topLidBox = new THREE.Box3();
  for (const panel of lidPanelGeometries) {
    topLidBox.union(panel.bounds);
  }

  const topLidCenter = new THREE.Vector3();
  topLidBox.getCenter(topLidCenter);

  return {
    regionGeometry: geometry,
    lidPanelGeometries,
    topLidBounds: {
      center: topLidCenter,
      maxY: topLidBox.max.y,
    } satisfies TopLidBounds,
  };
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
