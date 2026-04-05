import * as THREE from "three";

type GeometryAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export type ConnectedComponent = {
  faceIndices: number[];
  faceCount: number;
  centroid: THREE.Vector3;
  bounds: THREE.Box3;
  extentX: number;
  extentY: number;
  extentZ: number;
  maxExtent: number;
  footprintArea: number;
};

function getVertexKey(position: GeometryAttribute, index: number) {
  return `${position.getX(index).toFixed(6)},${position
    .getY(index)
    .toFixed(6)},${position.getZ(index).toFixed(6)}`;
}

function buildConnectedComponents(
  position: GeometryAttribute,
  faceCount: number
): ConnectedComponent[] {
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
  const components: ConnectedComponent[] = [];

  for (let startFace = 0; startFace < faceCount; startFace++) {
    if (visited[startFace]) continue;

    const stack = [startFace];
    visited[startFace] = 1;

    const faceIndices: number[] = [];
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

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
      const centroidZ =
        (position.getZ(baseIdx) +
          position.getZ(baseIdx + 1) +
          position.getZ(baseIdx + 2)) /
        3;
      sumX += centroidX;
      sumY += centroidY;
      sumZ += centroidZ;

      for (let vertexOffset = 0; vertexOffset < 3; vertexOffset++) {
        const vertexIndex = baseIdx + vertexOffset;
        min.x = Math.min(min.x, position.getX(vertexIndex));
        min.y = Math.min(min.y, position.getY(vertexIndex));
        min.z = Math.min(min.z, position.getZ(vertexIndex));
        max.x = Math.max(max.x, position.getX(vertexIndex));
        max.y = Math.max(max.y, position.getY(vertexIndex));
        max.z = Math.max(max.z, position.getZ(vertexIndex));
      }

      for (const neighbor of adjacency[faceIndex]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    const bounds = new THREE.Box3(min, max);
    const extentX = max.x - min.x;
    const extentY = max.y - min.y;
    const extentZ = max.z - min.z;

    components.push({
      faceIndices,
      faceCount: faceIndices.length,
      centroid: new THREE.Vector3(
        sumX / faceIndices.length,
        sumY / faceIndices.length,
        sumZ / faceIndices.length
      ),
      bounds,
      extentX,
      extentY,
      extentZ,
      maxExtent: Math.max(extentX, extentY, extentZ),
      footprintArea: extentX * extentY,
    });
  }

  return components;
}

export function getConnectedComponents(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const faceCount = position.count / 3;
  return buildConnectedComponents(position, faceCount);
}

export function extractComponentGeometry(
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
    componentGeometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(newNormals, 3)
    );
  } else {
    componentGeometry.computeVertexNormals();
  }

  componentGeometry.computeBoundingBox();
  componentGeometry.computeBoundingSphere();
  return componentGeometry;
}

export { getConnectedComponents as getFaceComponents };
export { extractComponentGeometry as extractFaceComponentGeometry };
