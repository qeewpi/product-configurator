"use client";

export type MaterialIconName =
  | "expand_less"
  | "expand_more"
  | "file_download"
  | "help"
  | "image"
  | "pan_tool"
  | "restart_alt"
  | "rocket_launch"
  | "tune"
  | "upload_file";

const ICON_PATHS: Record<MaterialIconName, string[]> = {
  expand_less: ["M7.41 14.59 12 10l4.59 4.59L18 13.17 12 7.17l-6 6z"],
  expand_more: ["M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"],
  file_download: [
    "M5 20h14v-2H5zm7-18-5.5 5.5 1.41 1.41L11 5.83V16h2V5.83l3.09 3.08 1.41-1.41z",
  ],
  help: [
    "M11 18h2v-2h-2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
    "M12 6a4 4 0 0 0-4 4h2a2 2 0 1 1 2 2c-1.1 0-2 .9-2 2v2h2v-2a2 2 0 0 0 0-4 2 2 0 1 1 2-2z",
  ],
  image: [
    "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2m-2 0H5V5h14z",
    "m8.5 13.5 2.5 3.01L14.5 12l4.5 6H5z",
  ],
  pan_tool: [
    "M23 5.5V4c0-1.1-.9-2-2-2-.54 0-1.04.22-1.41.59L18 4.17V3c0-1.1-.9-2-2-2-.73 0-1.38.39-1.73.97A2 2 0 0 0 11 3v1.17l-.59-.58A2 2 0 0 0 7 5v7.76c0 .53-.21 1.04-.59 1.41l-1.7 1.7A1 1 0 0 0 4 17v1c0 .55.45 1 1 1h9.5c1.11 0 2.17-.44 2.95-1.22l4.93-4.93c.4-.4.62-.94.62-1.5z",
  ],
  restart_alt: [
    "M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-5.65-4H4.26A8 8 0 0 0 12 21c4.42 0 8-3.58 8-8s-3.58-8-8-8",
  ],
  rocket_launch: [
    "M4.5 16.5c-1.33 0-2.5 1.17-2.5 2.5 0 .83.67 1.5 1.5 1.5 1.33 0 2.5-1.17 2.5-2.5 0-.83-.67-1.5-1.5-1.5",
    "M19 3c-3.87 0-7.63 1.79-10.2 4.86l-2.12 2.53c-.32.38-.21.95.23 1.19l2.77 1.51 1.51 2.77c.24.44.81.55 1.19.23l2.53-2.12C19.21 10.63 21 6.87 21 3z",
    "M13 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4",
  ],
  tune: [
    "M3 17v2h6v-2zm0-12v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zm-6-8v-2H3v2zm14-2V9H9v2zm-4-8v6h2V3z",
  ],
  upload_file: [
    "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm0 2.5L18.5 9H14z",
    "M12 19l4-4h-2.5v-4h-3v4H8z",
  ],
};

export default function MaterialIcon({
  name,
  className = "",
}: {
  name: MaterialIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      {ICON_PATHS[name].map((path, index) => (
        <path key={`${name}-${index}`} d={path} />
      ))}
    </svg>
  );
}
