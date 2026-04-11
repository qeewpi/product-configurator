import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describeLidPanelGeometry, getTopLidBounds } from "@/lib/deck-case-artwork";
import { CASE_MODELS } from "@/lib/model-catalog";
import {
  extractComponentGeometry,
  getConnectedComponents,
} from "@/lib/stl-regions";
import type { CaseModelId } from "@/types/design";
import type { LidPanelGeometry, TopLidBounds } from "@/lib/deck-case-artwork";

export type PreparedCaseModel = {
  lidSections: LidPanelGeometry[];
  lidPanelGeometries: LidPanelGeometry[];
  bottomGeometry: THREE.BufferGeometry;
  clipsGeometry: THREE.BufferGeometry | null;
  topLidBounds: TopLidBounds;
  assembledBounds: THREE.Box3;
  regionGeometry: THREE.BufferGeometry;
};

function isSignificantComponent(component: {
  faceCount: number;
  maxExtent: number;
}) {
  return component.faceCount >= 100 && component.maxExtent >= 1;
}

function computeAssemblyBounds(geometries: THREE.BufferGeometry[]) {
  const bounds = new THREE.Box3();

  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      bounds.union(geometry.boundingBox);
    }
  }

  return bounds;
}

function centerGeometries(geometries: THREE.BufferGeometry[]) {
  const bounds = computeAssemblyBounds(geometries);
  const center = new THREE.Vector3();
  bounds.getCenter(center);

  for (const geometry of geometries) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  const centeredBounds = computeAssemblyBounds(geometries);
  return centeredBounds;
}

function compareRemainingComponents(
  a: { footprintArea: number; faceCount: number },
  b: { footprintArea: number; faceCount: number }
) {
  if (b.footprintArea !== a.footprintArea) {
    return b.footprintArea - a.footprintArea;
  }

  return b.faceCount - a.faceCount;
}

function createRuggedLidGeometry(geometry: THREE.BufferGeometry) {
  const smoothedGeometry = mergeVertices(geometry, 1e-6);
  smoothedGeometry.computeVertexNormals();
  smoothedGeometry.normalizeNormals();
  const nextGeometry = smoothedGeometry.toNonIndexed();
  nextGeometry.computeBoundingBox();
  nextGeometry.computeBoundingSphere();
  geometry.dispose();
  smoothedGeometry.dispose();
  return nextGeometry;
}

export function prepareCaseModel(
  model: CaseModelId,
  geometry: THREE.BufferGeometry
): PreparedCaseModel {
  const definition = CASE_MODELS[model];
  const components = getConnectedComponents(geometry);
  const significantComponents = components.filter(isSignificantComponent);
  const expectedBodyComponentCount = definition.clipCount + 1;

  if (significantComponents.length < definition.lidSectionCount + 1) {
    throw new Error(
      `Expected at least ${definition.lidSectionCount + 1} significant components for ${definition.label}, found ${significantComponents.length}`
    );
  }

  const lidComponents = [...significantComponents]
    .sort((a, b) => b.centroid.z - a.centroid.z)
    .slice(0, definition.lidSectionCount)
    .sort((a, b) => a.centroid.x - b.centroid.x);

  const remainingComponents = significantComponents.filter(
    (component) => !lidComponents.includes(component)
  );

  if (remainingComponents.length === 0) {
    throw new Error(`Expected remaining parts for ${definition.label}`);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    remainingComponents.length !== expectedBodyComponentCount
  ) {
    console.warn("[case-models] Unexpected remaining component count", {
      model,
      expectedBodyComponentCount,
      remainingComponentCount: remainingComponents.length,
    });
  }

  const bottomComponent = [...remainingComponents].sort(
    compareRemainingComponents
  )[0];
  const clipComponents = remainingComponents.filter(
    (component) => component !== bottomComponent
  );

  const lidGeometries = lidComponents.map((component) => {
    const extractedGeometry = extractComponentGeometry(
      geometry,
      component.faceIndices
    );

    return model === "rugged"
      ? createRuggedLidGeometry(extractedGeometry)
      : extractedGeometry;
  });
  const bottomGeometry = extractComponentGeometry(
    geometry,
    bottomComponent.faceIndices
  );
  const clipGeometries = clipComponents.map((component) =>
    extractComponentGeometry(geometry, component.faceIndices)
  );

  const clipsGeometry =
    clipGeometries.length > 0
      ? mergeGeometries(clipGeometries, false)
      : null;

  if (clipGeometries.length > 0 && !clipsGeometry) {
    throw new Error(`Failed to merge clips for ${definition.label}`);
  }

  const allGeometries = [
    ...lidGeometries,
    bottomGeometry,
    ...(clipsGeometry ? [clipsGeometry] : []),
  ];
  const assembledBounds = centerGeometries(allGeometries);
  const regionGeometry = mergeGeometries(
    allGeometries.map((geometry) => geometry.clone()),
    false
  );

  if (!regionGeometry) {
    throw new Error(`Failed to assemble region geometry for ${definition.label}`);
  }

  const lidSections = lidGeometries.map((lidGeometry) =>
    describeLidPanelGeometry(lidGeometry)
  );

  return {
    lidSections,
    lidPanelGeometries: lidSections,
    bottomGeometry,
    clipsGeometry,
    topLidBounds: getTopLidBounds(lidSections),
    assembledBounds,
    regionGeometry,
  };
}

export function getCaseModelAssetPath(model: CaseModelId) {
  return CASE_MODELS[model].assetPath;
}
