import * as THREE from "three";

const TOP_LID_PART_COUNT = 3;
type GeometryAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export type FaceComponent = {
  faceIndices: number[];
  centroidX: number;
  centroidY: number;
};

function getVertexKey(position: GeometryAttribute, index: number) {
  return `${position.getX(index).toFixed(6)},${position
    .getY(index)
    .toFixed(6)},${position.getZ(index).toFixed(6)}`;
}

function buildFaceComponents(
  position: GeometryAttribute,
  faceCount: number
): FaceComponent[] {
  const vertexToFaces = new Map<string, number[]>();

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const baseIdx = faceIndex * 3;
    for (let vertexOffset = 0; vertexOffset < 3; vertexOffset++) {
      const vertexIndex = baseIdx + vertexOffset;
      const key = getVertexKey(position, vertexIndex);
      const faces = vertexToFaces.get(key);
      if (faces) {
        faces.push(faceIndex);
      } else {
        vertexToFaces.set(key, [faceIndex]);
      }
    }
  }

  const adjacency = Array.from({ length: faceCount }, () => new Set<number>());
  for (const faces of vertexToFaces.values()) {
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        adjacency[faces[i]].add(faces[j]);
        adjacency[faces[j]].add(faces[i]);
      }
    }
  }

  const visited = new Uint8Array(faceCount);
  const components: FaceComponent[] = [];

  for (let startFace = 0; startFace < faceCount; startFace++) {
    if (visited[startFace]) continue;

    const stack = [startFace];
    visited[startFace] = 1;

    const faceIndices: number[] = [];
    let sumX = 0;
    let sumY = 0;

    while (stack.length > 0) {
      const faceIndex = stack.pop()!;
      faceIndices.push(faceIndex);

      const baseIdx = faceIndex * 3;
      const centroidX =
        (position.getX(baseIdx) +
          position.getX(baseIdx + 1) +
          position.getX(baseIdx + 2)) /
        3;
      const centroidY =
        (position.getY(baseIdx) +
          position.getY(baseIdx + 1) +
          position.getY(baseIdx + 2)) /
        3;
      sumX += centroidX;
      sumY += centroidY;

      for (const neighbor of adjacency[faceIndex]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    components.push({
      faceIndices,
      centroidX: sumX / faceIndices.length,
      centroidY: sumY / faceIndices.length,
    });
  }

  return components;
}

export function getFaceComponents(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const faceCount = position.count / 3;
  return buildFaceComponents(position, faceCount);
}

function getFaceRegions(position: GeometryAttribute, faceCount: number) {
  const components = buildFaceComponents(position, faceCount);

  if (components.length < TOP_LID_PART_COUNT + 1) {
    throw new Error(
      `Expected at least ${TOP_LID_PART_COUNT + 1} model parts, found ${
        components.length
      }`
    );
  }

  const topLidComponents = [...components]
    .sort((a, b) => b.centroidY - a.centroidY)
    .slice(0, TOP_LID_PART_COUNT)
    .sort((a, b) => a.centroidX - b.centroidX);

  const componentToRegion = new Map<FaceComponent, number>();
  for (const [region, component] of topLidComponents.entries()) {
    componentToRegion.set(component, region);
  }

  for (const component of components) {
    if (!componentToRegion.has(component)) {
      componentToRegion.set(component, 3);
    }
  }

  const regions = new Array<number>(faceCount);
  for (const component of components) {
    const region = componentToRegion.get(component)!;
    for (const faceIndex of component.faceIndices) {
      regions[faceIndex] = region;
    }
  }

  return regions;
}

export function prepareRegionGeometry(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const faceCount = position.count / 3;
  const faceRegionsByIndex = getFaceRegions(position, faceCount);

  // Classify each face
  const faceRegions: { region: number; faceIndex: number }[] = [];
  for (let i = 0; i < faceCount; i++) {
    faceRegions.push({
      region: faceRegionsByIndex[i],
      faceIndex: i,
    });
  }

  // Sort faces by region so they're contiguous
  faceRegions.sort((a, b) => a.region - b.region);

  // Build new reordered buffers
  const newPositions = new Float32Array(position.count * 3);
  const newNormals = new Float32Array(normal.count * 3);

  for (let i = 0; i < faceRegions.length; i++) {
    const srcBase = faceRegions[i].faceIndex * 3;
    const dstBase = i * 3;

    for (let v = 0; v < 3; v++) {
      const srcIdx = srcBase + v;
      const dstIdx = dstBase + v;
      newPositions[dstIdx * 3] = position.getX(srcIdx);
      newPositions[dstIdx * 3 + 1] = position.getY(srcIdx);
      newPositions[dstIdx * 3 + 2] = position.getZ(srcIdx);
      newNormals[dstIdx * 3] = normal.getX(srcIdx);
      newNormals[dstIdx * 3 + 1] = normal.getY(srcIdx);
      newNormals[dstIdx * 3 + 2] = normal.getZ(srcIdx);
    }
  }

  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(newPositions, 3)
  );
  newGeometry.setAttribute("normal", new THREE.BufferAttribute(newNormals, 3));

  // Add groups for multi-material rendering (4 groups: 3 lid panels + 1 bottom)
  let currentRegion = faceRegions[0].region;
  let groupStart = 0;

  for (let i = 1; i <= faceRegions.length; i++) {
    const region = i < faceRegions.length ? faceRegions[i].region : -1;
    if (region !== currentRegion) {
      newGeometry.addGroup(
        groupStart * 3,
        (i - groupStart) * 3,
        currentRegion
      );
      groupStart = i;
      currentRegion = region;
    }
  }

  newGeometry.computeBoundingBox();
  newGeometry.computeBoundingSphere();

  return newGeometry;
}

export function extractFaceComponentGeometry(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const newPositions = new Float32Array(faceIndices.length * 9);
  const newNormals = normal ? new Float32Array(faceIndices.length * 9) : null;

  faceIndices.forEach((faceIndex, componentIndex) => {
    const srcBase = faceIndex * 3;
    const dstBase = componentIndex * 9;

    for (let vertexOffset = 0; vertexOffset < 3; vertexOffset++) {
      const srcIndex = srcBase + vertexOffset;
      const dstIndex = dstBase + vertexOffset * 3;
      newPositions[dstIndex] = position.getX(srcIndex);
      newPositions[dstIndex + 1] = position.getY(srcIndex);
      newPositions[dstIndex + 2] = position.getZ(srcIndex);

      if (newNormals) {
        newNormals[dstIndex] = normal!.getX(srcIndex);
        newNormals[dstIndex + 1] = normal!.getY(srcIndex);
        newNormals[dstIndex + 2] = normal!.getZ(srcIndex);
      }
    }
  });

  const componentGeometry = new THREE.BufferGeometry();
  componentGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(newPositions, 3)
  );

  if (newNormals) {
    componentGeometry.setAttribute("normal", new THREE.BufferAttribute(newNormals, 3));
  } else {
    componentGeometry.computeVertexNormals();
  }

  componentGeometry.computeBoundingBox();
  componentGeometry.computeBoundingSphere();
  return componentGeometry;
}
