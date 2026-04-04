export interface Filament {
  name: string;
  hex: string;
}

export const FILAMENT_PALETTE: Filament[] = [
  { name: "White", hex: "#FFFFFF" },
  { name: "Black", hex: "#1A1A1A" },
  { name: "Red", hex: "#DC2626" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Green", hex: "#16A34A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Purple", hex: "#9333EA" },
];

export function getClosestFilamentColor(r: number, g: number, b: number): string {
  let closest = FILAMENT_PALETTE[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const filament of FILAMENT_PALETTE) {
    const hex = filament.hex.replace(/^#/, "");
    const fr = parseInt(hex.substring(0, 2), 16);
    const fg = parseInt(hex.substring(2, 4), 16);
    const fb = parseInt(hex.substring(4, 6), 16);

    const dr = r - fr;
    const dg = g - fg;
    const db = b - fb;
    const distance = dr * dr + dg * dg + db * db;

    if (distance < minDistance) {
      minDistance = distance;
      closest = filament;
    }
  }

  return closest.hex;
}
