import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Package, Pencil, Check, ChevronDown } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { Material, MaterialKind } from '../../types';
import { generateId } from '../../utils/helpers';
import {
  DIGITAL_FACTORY_SHEET,
  digitalPieceCosts,
  effectiveMeterCostKd,
  effectiveSheetCostKd,
  filsToKd,
  formatMaterialCostFils,
  kdToFils,
  materialLabel,
  materialsOfKind,
  meterCostFromRoll,
  parseMaterialCost,
  sheetCostFromPack,
} from '../../utils/materials';

interface MaterialsModalProps {
  onClose: () => void;
}

const MaterialsModal: React.FC<MaterialsModalProps> = ({ onClose }) => {
  const { state, dispatch } = useApp();
  const { tr } = useLang();
  const digitalMaterials = materialsOfKind(state.materials, 'digital');
  const largeMaterials = materialsOfKind(state.materials, 'large-format');

  const [paperType, setPaperType] = useState('');
  const [paperWeight, setPaperWeight] = useState('');
  /** قيمة الرزمة بالدينار */
  const [packCostKd, setPackCostKd] = useState('');
  /** عدد الصفحات في الرزمة */
  const [sheetsPerPack, setSheetsPerPack] = useState('');
  const [rollType, setRollType] = useState('');
  const [rollWidth, setRollWidth] = useState('');
  const [rollCostFils, setRollCostFils] = useState('');
  const [rollMeters, setRollMeters] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<MaterialKind | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const clearDigitalForm = () => {
    setPaperType('');
    setPaperWeight('');
    setPackCostKd('');
    setSheetsPerPack('');
  };

  const clearLargeForm = () => {
    setRollType('');
    setRollWidth('');
    setRollCostFils('');
    setRollMeters('');
  };

  const startEdit = (m: Material) => {
    const kind = m.kind === 'large-format' ? 'large-format' : 'digital';
    setEditingId(m.id);
    setEditingKind(kind);
    if (kind === 'digital') {
      setPaperType(m.paperType || m.name || '');
      setPaperWeight(m.paperWeight || '');
      const packKdVal = parseMaterialCost(m.packCost);
      setPackCostKd(packKdVal > 0 ? String(packKdVal) : '');
      const pages = parseMaterialCost(m.sheetsPerPack);
      setSheetsPerPack(pages > 0 ? String(Math.round(pages)) : '');
      clearLargeForm();
    } else {
      setRollType(m.rollType || m.name || '');
      setRollWidth(m.rollWidth || '');
      const costFils = kdToFils(parseMaterialCost(m.rollCost));
      setRollCostFils(costFils > 0 ? String(costFils) : '');
      const meters = parseMaterialCost(m.rollMeters);
      setRollMeters(meters > 0 ? String(meters) : '');
      clearDigitalForm();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingKind(null);
    clearDigitalForm();
    clearLargeForm();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const livePackKd = parseMaterialCost(packCostKd);
  const livePages = parseMaterialCost(sheetsPerPack);
  const liveSheetCostKd = useMemo(
    () => sheetCostFromPack(livePackKd > 0 ? String(livePackKd) : '', livePages > 0 ? String(livePages) : ''),
    [livePackKd, livePages],
  );
  const livePieceCosts = digitalPieceCosts(liveSheetCostKd > 0 ? liveSheetCostKd : 0);

  const liveRollKd = filsToKd(parseMaterialCost(rollCostFils));
  const liveMeters = parseMaterialCost(rollMeters);
  const liveMeterCostKd = useMemo(
    () => meterCostFromRoll(liveRollKd > 0 ? String(liveRollKd) : '', liveMeters > 0 ? String(liveMeters) : ''),
    [liveRollKd, liveMeters],
  );

  const saveMaterial = (kind: MaterialKind) => {
    const now = new Date().toISOString();
    if (kind === 'digital') {
      const pt = paperType.trim();
      const pw = paperWeight.trim();
      const packKdVal = parseMaterialCost(packCostKd);
      const pages = parseMaterialCost(sheetsPerPack);
      if (!pt || !pw) {
        alert('Enter paper type and paper weight');
        return;
      }
      if ((packCostKd.trim() || sheetsPerPack.trim()) && (packKdVal <= 0 || pages <= 0)) {
        alert(tr.sheetCostInvalid);
        return;
      }
      const packKd = packKdVal > 0 ? String(packKdVal) : '';
      const pagesStr = pages > 0 ? String(Math.round(pages)) : '';
      const derivedSheet = sheetCostFromPack(packKd, pagesStr);
      const sheetCost = derivedSheet > 0 ? String(derivedSheet) : '';
      const exists = digitalMaterials.some(
        (m) =>
          m.id !== editingId &&
          (m.paperType || '').localeCompare(pt, undefined, { sensitivity: 'base' }) === 0 &&
          (m.paperWeight || '').localeCompare(pw, undefined, { sensitivity: 'base' }) === 0,
      );
      if (exists) {
        alert('This material already exists');
        return;
      }
      if (editingId && editingKind === 'digital') {
        const prev = digitalMaterials.find((m) => m.id === editingId);
        dispatch({
          type: 'UPDATE_MATERIAL',
          payload: {
            id: editingId,
            kind: 'digital',
            paperType: pt,
            paperWeight: pw,
            packCost: packKd,
            sheetsPerPack: pagesStr,
            sheetCost: sheetCost || prev?.sheetCost || '',
            createdAt: prev?.createdAt || now,
            updatedAt: now,
          },
        });
        cancelEdit();
        return;
      }
      dispatch({
        type: 'ADD_MATERIAL',
        payload: {
          id: generateId(),
          kind: 'digital',
          paperType: pt,
          paperWeight: pw,
          packCost: packKd,
          sheetsPerPack: pagesStr,
          sheetCost,
          createdAt: now,
          updatedAt: now,
        },
      });
      clearDigitalForm();
      return;
    }

    const rt = rollType.trim();
    const rw = rollWidth.trim();
    const costFils = parseMaterialCost(rollCostFils);
    const meters = parseMaterialCost(rollMeters);
    if (!rt || !rw) {
      alert('Enter roll type and roll width');
      return;
    }
    if ((rollCostFils.trim() || rollMeters.trim()) && (costFils <= 0 || meters <= 0)) {
      alert(tr.rollCostInvalid);
      return;
    }
    const rollCostKd = costFils > 0 ? String(filsToKd(costFils)) : '';
    const metersStr = meters > 0 ? String(meters) : '';
    const derivedMeter = meterCostFromRoll(rollCostKd, metersStr);
    const meterCost = derivedMeter > 0 ? String(derivedMeter) : '';
    const exists = largeMaterials.some(
      (m) =>
        m.id !== editingId &&
        (m.rollType || '').localeCompare(rt, undefined, { sensitivity: 'base' }) === 0 &&
        (m.rollWidth || '').localeCompare(rw, undefined, { sensitivity: 'base' }) === 0,
    );
    if (exists) {
      alert('This material already exists');
      return;
    }
    if (editingId && editingKind === 'large-format') {
      const prev = largeMaterials.find((m) => m.id === editingId);
      dispatch({
        type: 'UPDATE_MATERIAL',
        payload: {
          id: editingId,
          kind: 'large-format',
          rollType: rt,
          rollWidth: rw,
          rollCost: rollCostKd,
          rollMeters: metersStr,
          meterCost: meterCost || prev?.meterCost || '',
          createdAt: prev?.createdAt || now,
          updatedAt: now,
        },
      });
      cancelEdit();
      return;
    }
    dispatch({
      type: 'ADD_MATERIAL',
      payload: {
        id: generateId(),
        kind: 'large-format',
        rollType: rt,
        rollWidth: rw,
        rollCost: rollCostKd,
        rollMeters: metersStr,
        meterCost,
        createdAt: now,
        updatedAt: now,
      },
    });
    clearLargeForm();
  };

  const handleDelete = (id: string, label: string) => {
    if (!window.confirm(`Delete material "${label}"?`)) return;
    if (editingId === id) cancelEdit();
    dispatch({ type: 'DELETE_MATERIAL', payload: id });
  };

  const renderActions = (m: Material, label: string) => (
    <div className="mat-item-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="mat-edit-btn"
        title="Edit"
        onClick={() => startEdit(m)}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="mat-del-btn"
        title="Delete"
        onClick={() => handleDelete(m.id, label)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const renderPieceCosts = (sheetKd: number) => {
    const costs = digitalPieceCosts(sheetKd);
    if (sheetKd <= 0) return null;
    return (
      <div className="mat-piece-costs compact">
        {costs.map((c) => (
          <div key={c.id} className="mat-piece-cost">
            <span className="mat-piece-size">{c.label}</span>
            <span className="mat-piece-meta">
              {tr.piecesPerSheet.replace('{n}', String(c.piecesPerSheet))}
            </span>
            <strong className="mat-piece-price">
              {formatMaterialCostFils(c.pieceCost)} {tr.currencyShort}
            </strong>
          </div>
        ))}
      </div>
    );
  };

  const editingLarge = editingKind === 'large-format' && !!editingId;
  const editingDigital = editingKind === 'digital' && !!editingId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box mat-modal mat-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="mat-header">
          <div className="mat-header-title">
            <span className="mat-header-icon"><Package size={18} /></span>
            <div>
              <h2>{tr.toolInventory}</h2>
              <p>{tr.materialsHint}</p>
            </div>
          </div>
          <button type="button" className="mat-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mat-sections">
          <section className="mat-section" style={{ ['--mat-color' as string]: '#6438E0' }}>
            <h3>Large Format</h3>
            <p className="mat-sheet-note mat-sheet-note-purple">{tr.largeFormatNote}</p>
            <form
              className="mat-add-grid mat-add-grid-pack"
              onSubmit={(e) => {
                e.preventDefault();
                saveMaterial('large-format');
              }}
            >
              <label>
                <span>{tr.rollType}</span>
                <input
                  value={rollType}
                  onChange={(e) => setRollType(e.target.value)}
                  placeholder={tr.rollTypePlaceholder}
                />
              </label>
              <label>
                <span>{tr.rollWidth}</span>
                <input
                  value={rollWidth}
                  onChange={(e) => setRollWidth(e.target.value)}
                  placeholder={tr.rollWidthPlaceholder}
                />
              </label>
              <label>
                <span>{tr.rollCostLabel}</span>
                <input
                  value={rollCostFils}
                  onChange={(e) => setRollCostFils(e.target.value)}
                  inputMode="numeric"
                  placeholder="25000"
                />
              </label>
              <label>
                <span>{tr.rollMetersLabel}</span>
                <input
                  value={rollMeters}
                  onChange={(e) => setRollMeters(e.target.value)}
                  inputMode="decimal"
                  placeholder="50"
                />
              </label>
              <div className="mat-auto-sheet mat-auto-sheet-purple">
                <span>{tr.meterCostLabel}</span>
                <strong>
                  {liveMeterCostKd > 0
                    ? `${formatMaterialCostFils(liveMeterCostKd)} ${tr.currencyShort}`
                    : '—'}
                </strong>
              </div>
              <div className="mat-form-actions">
                {editingLarge && (
                  <button type="button" className="mat-cancel-btn" onClick={cancelEdit}>
                    Close
                  </button>
                )}
                <button type="submit" className="mat-add-btn" disabled={!rollType.trim() || !rollWidth.trim()}>
                  {editingLarge ? <><Check size={15} /> Save</> : <><Plus size={15} /> Add material</>}
                </button>
              </div>
            </form>
            <div className="mat-list">
              {largeMaterials.length === 0 ? (
                <p className="mat-empty">No materials yet</p>
              ) : (
                largeMaterials.map((m) => {
                  const label = materialLabel(m);
                  const meterKd = effectiveMeterCostKd(m);
                  const costFils = kdToFils(parseMaterialCost(m.rollCost));
                  const meters = parseMaterialCost(m.rollMeters);
                  return (
                    <div key={m.id} className={`mat-item${editingId === m.id ? ' editing' : ''}`}>
                      <div className="mat-item-meta">
                        <strong>{m.rollType || m.name}</strong>
                        <small>
                          {m.rollWidth}
                          {costFils > 0 && meters > 0
                            ? ` · ${tr.rollSummary
                                .replace('{cost}', `${costFils} ${tr.currencyShort}`)
                                .replace('{meters}', String(meters))}`
                            : ''}
                          {meterKd > 0
                            ? ` · ${tr.meterCostShort}: ${formatMaterialCostFils(meterKd)} ${tr.currencyShort}`
                            : ''}
                        </small>
                      </div>
                      {renderActions(m, label)}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="mat-section" style={{ ['--mat-color' as string]: '#16a34a' }}>
            <h3>Digital</h3>
            <p className="mat-sheet-note">
              {tr.factorySheetNote
                .replace('{w}', String(DIGITAL_FACTORY_SHEET.widthCm))
                .replace('{h}', String(DIGITAL_FACTORY_SHEET.heightCm))}
            </p>
            <form
              className="mat-add-grid mat-add-grid-digital mat-add-grid-pack"
              onSubmit={(e) => {
                e.preventDefault();
                saveMaterial('digital');
              }}
            >
              <label>
                <span>Paper Type</span>
                <input
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value)}
                  placeholder="Ready made Envelope"
                />
              </label>
              <label>
                <span>Paper Weight</span>
                <input
                  value={paperWeight}
                  onChange={(e) => setPaperWeight(e.target.value)}
                  placeholder="100 GSM"
                />
              </label>
              <label>
                <span>{tr.packCostLabel}</span>
                <input
                  value={packCostKd}
                  onChange={(e) => setPackCostKd(e.target.value)}
                  inputMode="decimal"
                  placeholder="5"
                />
              </label>
              <label>
                <span>{tr.sheetsPerPackLabel}</span>
                <input
                  value={sheetsPerPack}
                  onChange={(e) => setSheetsPerPack(e.target.value)}
                  inputMode="numeric"
                  placeholder="500"
                />
              </label>
              <div className="mat-auto-sheet">
                <span>{tr.sheetCostLabel}</span>
                <strong>
                  {liveSheetCostKd > 0
                    ? `${formatMaterialCostFils(liveSheetCostKd)} ${tr.currencyShort}`
                    : '—'}
                </strong>
              </div>
              {liveSheetCostKd > 0 && (
                <div className="mat-live-costs">
                  <div className="mat-live-costs-title">{tr.autoPieceCosts}</div>
                  <div className="mat-piece-costs">
                    {livePieceCosts.map((c) => (
                      <div key={c.id} className="mat-piece-cost">
                        <span className="mat-piece-size">{c.label}</span>
                        <span className="mat-piece-meta">
                          {tr.piecesPerSheet.replace('{n}', String(c.piecesPerSheet))}
                        </span>
                        <strong className="mat-piece-price">
                          {formatMaterialCostFils(c.pieceCost)} {tr.currencyShort}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mat-form-actions">
                {editingDigital && (
                  <button type="button" className="mat-cancel-btn" onClick={cancelEdit}>
                    Close
                  </button>
                )}
                <button type="submit" className="mat-add-btn" disabled={!paperType.trim() || !paperWeight.trim()}>
                  {editingDigital ? <><Check size={15} /> Save</> : <><Plus size={15} /> Add material</>}
                </button>
              </div>
            </form>
            <div className="mat-list">
              {digitalMaterials.length === 0 ? (
                <p className="mat-empty">No materials yet</p>
              ) : (
                digitalMaterials.map((m) => {
                  const label = materialLabel(m);
                  const sheetKd = effectiveSheetCostKd(m);
                  const hasCost = sheetKd > 0;
                  const expanded = !!expandedIds[m.id];
                  const packKdVal = parseMaterialCost(m.packCost);
                  const pages = Math.round(parseMaterialCost(m.sheetsPerPack));
                  return (
                    <div
                      key={m.id}
                      className={`mat-item mat-item-digital${editingId === m.id ? ' editing' : ''}${expanded ? ' expanded' : ''}${hasCost ? ' expandable' : ''}`}
                      role={hasCost ? 'button' : undefined}
                      tabIndex={hasCost ? 0 : undefined}
                      onClick={() => hasCost && toggleExpand(m.id)}
                      onKeyDown={(e) => {
                        if (!hasCost) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(m.id);
                        }
                      }}
                    >
                      <div className="mat-item-top">
                        <div className="mat-item-meta">
                          <strong>{m.paperType || m.name}</strong>
                          <small>
                            {m.paperWeight}
                            {packKdVal > 0 && pages > 0
                              ? ` · ${tr.packSummary
                                  .replace('{pack}', `${packKdVal} ${tr.currencyKd}`)
                                  .replace('{pages}', String(pages))}`
                              : ''}
                            {hasCost
                              ? ` · ${tr.sheetCostShort}: ${formatMaterialCostFils(sheetKd)} ${tr.currencyShort}`
                              : ''}
                          </small>
                          {hasCost && (
                            <span className="mat-expand-hint">
                              {expanded ? tr.clickToCollapseCosts : tr.clickToExpandCosts}
                            </span>
                          )}
                        </div>
                        <div className="mat-item-top-end">
                          {hasCost && (
                            <ChevronDown
                              size={16}
                              className={`mat-expand-chevron${expanded ? ' open' : ''}`}
                            />
                          )}
                          {renderActions(m, label)}
                        </div>
                      </div>
                      {hasCost && expanded && renderPieceCosts(sheetKd)}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MaterialsModal;
