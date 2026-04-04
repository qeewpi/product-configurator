import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {
  LidPanelGeometry,
  TopLidBounds,
} from "@/lib/deck-case-artwork";
import { prepareDeckCaseGeometry } from "@/lib/deck-case-artwork";
import { CASE_MODELS } from "@/lib/model-catalog";
import {
  extractFaceComponentGeometry,
  getFaceComponents,
} from "@/lib/stl-regions";
import type { CaseModelId } from "@/types/design";

export type PreparedCaseModel = {
  regionGeometry: THREE.BufferGeometry;
  lidPanelGeometries: LidPanelGeometry[];
  topLidBounds: TopLidBounds;
};

function describePanelGeometry(geometry: THREE.BufferGeometry): LidPanelGeometry {
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
    outerFaceZ: bounds.max.z + 0.2,
    exportSurfaceZ: bounds.max.z,
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
  };
}

function getTopLidBounds(lidPanelGeometries: LidPanelGeometry[]): TopLidBounds {
  const topLidBox = new THREE.Box3();
  for (const panel of lidPanelGeometries) {
    topLidBox.union(panel.bounds);
  }

  const topLidCenter = new THREE.Vector3();
  topLidBox.getCenter(topLidCenter);

  return {
    center: topLidCenter,
    maxY: topLidBox.max.y,
  };
}

function normalizeForComposite(geometry: THREE.BufferGeometry, materialIndex: number) {
  const normalized = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  normalized.computeVertexNormals();
  normalized.clearGroups();
  normalized.addGroup(0, normalized.getAttribute("position").count, materialIndex);
  return normalized;
}

function centerPlacedGeometries(geometries: THREE.BufferGeometry[]) {
  const bounds = new THREE.Box3();
  const geometryBounds = new THREE.Box3();

  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    geometryBounds.copy(geometry.boundingBox!);
    bounds.union(geometryBounds);
  }

  const center = new THREE.Vector3();
  bounds.getCenter(center);

  for (const geometry of geometries) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
}

function prepareRuggedModel(
  ruggedLidGeometry: THREE.BufferGeometry,
  ruggedCombinedGeometry: THREE.BufferGeometry
): PreparedCaseModel {
  const ruggedComponents = getFaceComponents(ruggedCombinedGeometry).sort(
    (a, b) => b.centroidY - a.centroidY
  );

  if (ruggedComponents.length < 2) {
    throw new Error("Expected rugged model to contain separate lid and bottom parts");
  }

  const topReferenceGeometry = extractFaceComponentGeometry(
    ruggedCombinedGeometry,
    ruggedComponents[0].faceIndices
  );
  const bottomGeometry = extractFaceComponentGeometry(
    ruggedCombinedGeometry,
    ruggedComponents[1].faceIndices
  );
  const lidGeometry = ruggedLidGeometry.clone();

  topReferenceGeometry.computeBoundingBox();
  lidGeometry.computeBoundingBox();

  const topReferenceCenter = new THREE.Vector3();
  topReferenceGeometry.boundingBox!.getCenter(topReferenceCenter);
  const lidCenter = new THREE.Vector3();
  lidGeometry.boundingBox!.getCenter(lidCenter);

  lidGeometry.translate(
    topReferenceCenter.x - lidCenter.x,
    topReferenceCenter.y - lidCenter.y,
    topReferenceCenter.z - lidCenter.z
  );

  centerPlacedGeometries([lidGeometry, bottomGeometry]);

  const regionGeometry = mergeGeometries(
    [normalizeForComposite(lidGeometry, 0), normalizeForComposite(bottomGeometry, 1)],
    true
  );

  if (!regionGeometry) {
    throw new Error("Failed to compose rugged model geometry");
  }

  const lidPanelGeometry = describePanelGeometry(lidGeometry);

  topReferenceGeometry.dispose();
  bottomGeometry.dispose();
  lidGeometry.dispose();

  return {
    regionGeometry,
    lidPanelGeometries: [lidPanelGeometry],
    topLidBounds: getTopLidBounds([lidPanelGeometry]),
  };
}

export function prepareCaseModel(
  model: CaseModelId,
  geometries: THREE.BufferGeometry[]
): PreparedCaseModel {
  if (model === "compact-3-lid") {
    const [compactGeometry] = geometries;
    if (!compactGeometry) {
      throw new Error("Missing compact model geometry");
    }
    return prepareDeckCaseGeometry(compactGeometry);
  }

  const [ruggedLidGeometry, ruggedCombinedGeometry] = geometries;
  if (!ruggedLidGeometry || !ruggedCombinedGeometry) {
    throw new Error("Missing rugged model geometry");
  }

  return prepareRuggedModel(ruggedLidGeometry, ruggedCombinedGeometry);
}

export function getCaseModelAssetPaths(model: CaseModelId) {
  return CASE_MODELS[model].assetPaths;
}
