/** Formatos de código que lee el escáner (spec de alta, C4). Sin dependencias del navegador. */
export const SCAN_FORMAT_NAMES = ["EAN_13", "UPC_A", "UPC_E", "EAN_8", "CODE_128", "CODE_39", "QR_CODE"] as const;
export type ScanFormatName = (typeof SCAN_FORMAT_NAMES)[number];
