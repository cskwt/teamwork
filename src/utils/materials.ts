import { Material, MaterialKind } from '../types';

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
