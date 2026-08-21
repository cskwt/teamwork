import { Material, MaterialKind } from '../types';
import { toWesternDigits } from './helpers';

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
  const n = parseFloat(toWesternDigits(String(v ?? '')).trim());
  return Number.isFinite(n) ? n : 0;
};

/** 1 د.ك = 1000 فلس */
export const kdToFils = (kd: number): number => {
  if (!Number.isFinite(kd) || kd <= 0) return 0;
  return Math.round(kd * 1000);
};

export const filsToKd = (fils: number): number => {
  if (!Number.isFinite(fils) || fils <= 0) return 0;
  return Math.round(fils) / 1000;
};

/** عرض التكلفة بالفلس (من قيمة مخزّنة بالدينار) */
export const formatMaterialCostFils = (kd: number): string => {
  const fils = kdToFils(kd);
  if (fils <= 0) return '—';
  return String(fils);
};

/** @deprecated use formatMaterialCostFils */
export const formatMaterialCost = formatMaterialCostFils;

/** سعر الصفحة من قيمة الرزمة ÷ عدد الصفحات (بالدينار) */
export const sheetCostFromPack = (
  packCost: string | undefined,
  sheetsPerPack: string | undefined,
): number => {
  const pack = parseMaterialCost(packCost);
  const pages = parseMaterialCost(sheetsPerPack);
  if (pack <= 0 || pages <= 0) return 0;
  return pack / pages;
};

/** سعر الصفحة الفعلي للمادة (من الرزمة إن وُجدت، وإلا sheetCost المخزّن) */
export const effectiveSheetCostKd = (m: Pick<Material, 'packCost' | 'sheetsPerPack' | 'sheetCost'>): number => {
  const fromPack = sheetCostFromPack(m.packCost, m.sheetsPerPack);
  if (fromPack > 0) return fromPack;
  return parseMaterialCost(m.sheetCost);
};

/** تكلفة القطعة لقياس معيّن من تكلفة ورقة المصنع */
export const pieceCostForSize = (sheetCost: string | number | undefined, piecesPerSheet: number): number => {
  const sheet = typeof sheetCost === 'number' ? sheetCost : parseMaterialCost(sheetCost);
  if (sheet <= 0 || piecesPerSheet <= 0) return 0;
  return sheet / piecesPerSheet;
};

export const digitalPieceCosts = (sheetCost: string | number | undefined) =>
  DIGITAL_PRINT_SIZES.map((size) => ({
    ...size,
    pieceCost: pieceCostForSize(sheetCost, size.piecesPerSheet),
  }));

/** سعر المتر = سعر الرول ÷ عدد الأمتار */
export const meterCostFromRoll = (
  rollCost: string | undefined,
  rollMeters: string | undefined,
): number => {
  const cost = parseMaterialCost(rollCost);
  const meters = parseMaterialCost(rollMeters);
  if (cost <= 0 || meters <= 0) return 0;
  return cost / meters;
};

/** سعر المتر الفعلي (من الرول إن وُجد، وإلا meterCost المخزّن) */
export const effectiveMeterCostKd = (
  m: Pick<Material, 'rollCost' | 'rollMeters' | 'meterCost'>,
): number => {
  const fromRoll = meterCostFromRoll(m.rollCost, m.rollMeters);
  if (fromRoll > 0) return fromRoll;
  return parseMaterialCost(m.meterCost);
};

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
