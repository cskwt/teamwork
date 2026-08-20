import { Material, MaterialKind } from '../types';

/** قياس ورقة المصنع المستخدمة في Digital */
export const DIGITAL_FACTORY_SHEET = { widthCm: 100, heightCm: 70 } as const;

/**
 * قياسات الطباعة وعدد الحبات من ورقة 100×70.
 * تكلفة القطعة = تكلفة الورقة ÷ piecesPerSheet
 */
export const DIGITAL_PRINT_SIZES = [
  { id: '33x70', label: '33 × 70 cm', widthCm: 33, heightCm: 70, piecesPerSheet: 3 },
  { id: '33x48', label: '33 × 48 cm', widthCm: 33, heightCm: 48, piecesPerSheet: 4 },
  { id: 'a3', label: 'A3 (42 × 29.7)', widthCm: 42, heightCm: 29.7, piecesPerSheet: 4 },
  { id: 'a4', label: 'A4 (29.7 × 21)', widthCm: 29.7, heightCm: 21, piecesPerSheet: 9 },
] as const;

export type DigitalPrintSizeId = (typeof DIGITAL_PRINT_SIZES)[number]['id'];

export const parseMaterialCost = (v: string | undefined | null): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export const formatMaterialCost = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

/** تكلفة القطعة لقياس معيّن من تكلفة ورقة المصنع */
export const pieceCostForSize = (sheetCost: string | undefined, piecesPerSheet: number): number => {
  const sheet = parseMaterialCost(sheetCost);
  if (sheet <= 0 || piecesPerSheet <= 0) return 0;
  return sheet / piecesPerSheet;
};

export const digitalPieceCosts = (sheetCost: string | undefined) =>
  DIGITAL_PRINT_SIZES.map((size) => ({
    ...size,
    pieceCost: pieceCostForSize(sheetCost, size.piecesPerSheet),
  }));

export const materialLabel = (m: Material): string => {
  if (m.kind === 'digital') {
    return [m.paperType, m.paperWeight].filter(Boolean).join(' · ') || m.name || '';
  }
  if (m.kind === 'large-format') {
    return [m.rollType, m.rollWidth].filter(Boolean).join(' · ') || m.name || '';
  }
  return m.name || [m.paperType, m.paperWeight, m.rollType, m.rollWidth].filter(Boolean).join(' · ');
};

export const materialsOfKind = (materials: Material[] | undefined, kind: MaterialKind): Material[] =>
  [...(materials || [])]
    .filter((m) => {
      if (m.kind) return m.kind === kind;
      // Legacy name-only materials → treat as digital
      return kind === 'digital' && !!m.name;
    })
    .sort((a, b) => materialLabel(a).localeCompare(materialLabel(b), undefined, { sensitivity: 'base' }));
