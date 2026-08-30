import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Package, Pencil, Check, ChevronDown, Layers, FileStack, ScrollText } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { Material, MaterialKind } from '../../types';
import { generateId } from '../../utils/helpers';
import { normalizeAmountInput, toWesternDigits } from '../../utils/helpers';
import {
  ACRYLIC_CUT_PIECE,
  ACRYLIC_FACTORY_BOARD,
  acrylicPieceCostFromBoard,
  DIGITAL_FACTORY_SHEET,
  digitalPieceCosts,
  effectiveAcrylicPieceCostKd,
  effectiveMeterCostKd,
  effectiveSheetCostKd,
  formatMaterialCostFils,
  formatMaterialCostKd,
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
  const acrylicMaterials = materialsOfKind(state.materials, 'acrylics');

  const [paperType, setPaperType] = useState('');
  const [paperWeight, setPaperWeight] = useState('');
  /** قيمة الرزمة بالدينار */
  const [packCostKd, setPackCostKd] = useState('');
  /** عدد الصفحات في الرزمة */
  const [sheetsPerPack, setSheetsPerPack] = useState('');
  const [rollType, setRollType] = useState('');
  const [rollWidth, setRollWidth] = useState('');
  const [rollCostKd, setRollCostKd] = useState('');
  const [rollMeters, setRollMeters] = useState('');
  const [acrylicType, setAcrylicType] = useState('');
  const [acrylicThickness, setAcrylicThickness] = useState('');
  const [acrylicBoardCostKd, setAcrylicBoardCostKd] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<MaterialKind | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showDigitalForm, setShowDigitalForm] = useState(false);
  const [showLargeForm, setShowLargeForm] = useState(false);
  const [showAcrylicForm, setShowAcrylicForm] = useState(false);

  const clearDigitalForm = () => {
    setPaperType('');
    setPaperWeight('');
    setPackCostKd('');
    setSheetsPerPack('');
  };

  const clearLargeForm = () => {
    setRollType('');
    setRollWidth('');
    setRollCostKd('');
    setRollMeters('');
  };

  const clearAcrylicForm = () => {
    setAcrylicType('');
    setAcrylicThickness('');
    setAcrylicBoardCostKd('');
  };

  const resolveKind = (m: Material): MaterialKind => {
    if (m.kind === 'large-format' || m.kind === 'acrylics' || m.kind === 'digital') return m.kind;
    return 'digital';
  };

  const startEdit = (m: Material) => {
    const kind = resolveKind(m);
    setEditingId(m.id);
    setEditingKind(kind);
    setShowDigitalForm(kind === 'digital');
    setShowLargeForm(kind === 'large-format');
    setShowAcrylicForm(kind === 'acrylics');
    if (kind === 'digital') {
      setPaperType(m.paperType || m.name || '');
      setPaperWeight(m.paperWeight || '');
      const packKdVal = parseMaterialCost(m.packCost);
      setPackCostKd(packKdVal > 0 ? String(packKdVal) : '');
      const pages = parseMaterialCost(m.sheetsPerPack);
      setSheetsPerPack(pages > 0 ? String(Math.round(pages)) : '');
      clearLargeForm();
      clearAcrylicForm();
    } else if (kind === 'large-format') {
      setRollType(m.rollType || m.name || '');
      setRollWidth(m.rollWidth || '');
      const costKdVal = parseMaterialCost(m.rollCost);
      setRollCostKd(costKdVal > 0 ? String(costKdVal) : '');
      const meters = parseMaterialCost(m.rollMeters);
      setRollMeters(meters > 0 ? String(meters) : '');
      clearDigitalForm();
      clearAcrylicForm();
    } else {
      setAcrylicType(m.acrylicType || m.name || '');
      setAcrylicThickness(m.acrylicThickness || '');
      const boardKd = parseMaterialCost(m.acrylicBoardCost);
      setAcrylicBoardCostKd(boardKd > 0 ? String(boardKd) : '');
      clearDigitalForm();
      clearLargeForm();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingKind(null);
    clearDigitalForm();
    clearLargeForm();
    clearAcrylicForm();
    setShowDigitalForm(false);
    setShowLargeForm(false);
    setShowAcrylicForm(false);
  };

  const openDigitalForm = () => {
    cancelEdit();
    setShowDigitalForm(true);
  };

  const openLargeForm = () => {
    cancelEdit();
    setShowLargeForm(true);
  };

  const openAcrylicForm = () => {
    cancelEdit();
    setShowAcrylicForm(true);
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

  const liveRollKd = parseMaterialCost(rollCostKd);
  const liveMeters = parseMaterialCost(rollMeters);
  const liveMeterCostKd = useMemo(
    () => meterCostFromRoll(liveRollKd > 0 ? String(liveRollKd) : '', liveMeters > 0 ? String(liveMeters) : ''),
    [liveRollKd, liveMeters],
  );

  const liveAcrylicBoardKd = parseMaterialCost(acrylicBoardCostKd);
  const liveAcrylicPieceKd = useMemo(
    () => acrylicPieceCostFromBoard(liveAcrylicBoardKd > 0 ? liveAcrylicBoardKd : 0),
    [liveAcrylicBoardKd],
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
      setShowDigitalForm(false);
      return;
    }

    if (kind === 'acrylics') {
      const at = acrylicType.trim();
      const th = acrylicThickness.trim();
      const boardKdVal = parseMaterialCost(acrylicBoardCostKd);
      if (!at || !th) {
        alert('Enter acrylic type and thickness');
        return;
      }
      if (acrylicBoardCostKd.trim() && boardKdVal <= 0) {
        alert(tr.acrylicCostInvalid);
        return;
      }
      const boardKd = boardKdVal > 0 ? String(boardKdVal) : '';
      const pieceKdVal = acrylicPieceCostFromBoard(boardKd);
      const pieceKd = pieceKdVal > 0 ? String(pieceKdVal) : '';
      const exists = acrylicMaterials.some(
        (m) =>
          m.id !== editingId &&
          (m.acrylicType || '').localeCompare(at, undefined, { sensitivity: 'base' }) === 0 &&
          (m.acrylicThickness || '').localeCompare(th, undefined, { sensitivity: 'base' }) === 0,
      );
      if (exists) {
        alert('This material already exists');
        return;
      }
      if (editingId && editingKind === 'acrylics') {
        const prev = acrylicMaterials.find((m) => m.id === editingId);
        dispatch({
          type: 'UPDATE_MATERIAL',
          payload: {
            id: editingId,
            kind: 'acrylics',
            acrylicType: at,
            acrylicThickness: th,
            acrylicBoardCost: boardKd,
            acrylicPieceCost: pieceKd || prev?.acrylicPieceCost || '',
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
          kind: 'acrylics',
          acrylicType: at,
          acrylicThickness: th,
          acrylicBoardCost: boardKd,
          acrylicPieceCost: pieceKd,
          createdAt: now,
          updatedAt: now,
        },
      });
      clearAcrylicForm();
      setShowAcrylicForm(false);
      return;
    }

    const rt = rollType.trim();
    const rw = rollWidth.trim();
    const costKdVal = parseMaterialCost(rollCostKd);
    const meters = parseMaterialCost(rollMeters);
    if (!rt || !rw) {
      alert('Enter roll type and roll width');
      return;
    }
    if ((rollCostKd.trim() || rollMeters.trim()) && (costKdVal <= 0 || meters <= 0)) {
      alert(tr.rollCostInvalid);
      return;
    }
    const rollCostKdStr = costKdVal > 0 ? String(costKdVal) : '';
    const metersStr = meters > 0 ? String(meters) : '';
    const derivedMeter = meterCostFromRoll(rollCostKdStr, metersStr);
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
          rollCost: rollCostKdStr,
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
        rollCost: rollCostKdStr,
        rollMeters: metersStr,
        meterCost,
        createdAt: now,
        updatedAt: now,
      },
    });
    clearLargeForm();
    setShowLargeForm(false);
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
  const editingAcrylic = editingKind === 'acrylics' && !!editingId;

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
            <h3 className="mat-section-title">
              <span className="mat-section-icon" aria-hidden>
                <ScrollText size={26} color="#fff" strokeWidth={2} />
              </span>
              {tr.sectionRolls}
            </h3>
            {!showLargeForm && !editingLarge ? (
              <button type="button" className="mat-add-btn mat-add-trigger" onClick={openLargeForm}>
                <Plus size={15} /> {tr.addMaterial}
              </button>
            ) : (
              <>
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
                      onChange={(e) => setRollWidth(toWesternDigits(e.target.value))}
                      placeholder={tr.rollWidthPlaceholder}
                    />
                  </label>
                  <label>
                    <span>{tr.rollCostLabel}</span>
                    <input
                      value={rollCostKd}
                      onChange={(e) => setRollCostKd(normalizeAmountInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="25"
                    />
                  </label>
                  <label>
                    <span>{tr.rollMetersLabel}</span>
                    <input
                      value={rollMeters}
                      onChange={(e) => setRollMeters(normalizeAmountInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="50"
                    />
                  </label>
                  <div className="mat-auto-sheet mat-auto-sheet-purple">
                    <span>{tr.meterCostLabel}</span>
                    <strong className="mat-meter-price">
                      {liveMeterCostKd > 0
                        ? `${formatMaterialCostKd(liveMeterCostKd)} ${tr.currencyKd}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="mat-form-actions">
                    <button type="button" className="mat-cancel-btn" onClick={cancelEdit}>
                      Close
                    </button>
                    <button type="submit" className="mat-add-btn" disabled={!rollType.trim() || !rollWidth.trim()}>
                      {editingLarge ? <><Check size={15} /> Save</> : <><Plus size={15} /> {tr.addMaterial}</>}
                    </button>
                  </div>
                </form>
              </>
            )}
            <div className="mat-list">
              {largeMaterials.length === 0 ? (
                <p className="mat-empty">No materials yet</p>
              ) : (
                largeMaterials.map((m) => {
                  const label = materialLabel(m);
                  const meterKd = effectiveMeterCostKd(m);
                  const costKdVal = parseMaterialCost(m.rollCost);
                  const meters = parseMaterialCost(m.rollMeters);
                  return (
                    <div key={m.id} className={`mat-item${editingId === m.id ? ' editing' : ''}`}>
                      <div className="mat-item-meta">
                        <strong>{m.rollType || m.name}</strong>
                        <small>
                          {m.rollWidth}
                          {costKdVal > 0 && meters > 0
                            ? ` · ${tr.rollSummary
                                .replace('{cost}', `${costKdVal} ${tr.currencyKd}`)
                                .replace('{meters}', String(meters))}`
                            : ''}
                          {meterKd > 0 ? (
                            <>
                              {' · '}
                              <span className="mat-meter-price">
                                {tr.meterCostShort}: {formatMaterialCostKd(meterKd)} {tr.currencyKd}
                              </span>
                            </>
                          ) : null}
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
            <h3 className="mat-section-title">
              <span className="mat-section-icon" aria-hidden>
                <FileStack size={26} color="#fff" strokeWidth={2} />
              </span>
              {tr.sectionSheets}
            </h3>
            {!showDigitalForm && !editingDigital ? (
              <button type="button" className="mat-add-btn mat-add-trigger" onClick={openDigitalForm}>
                <Plus size={15} /> {tr.addMaterial}
              </button>
            ) : (
              <>
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
                      onChange={(e) => setPaperWeight(toWesternDigits(e.target.value))}
                      placeholder="100 GSM"
                    />
                  </label>
                  <label>
                    <span>{tr.packCostLabel}</span>
                    <input
                      value={packCostKd}
                      onChange={(e) => setPackCostKd(normalizeAmountInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="5"
                    />
                  </label>
                  <label>
                    <span>{tr.sheetsPerPackLabel}</span>
                    <input
                      value={sheetsPerPack}
                      onChange={(e) => setSheetsPerPack(normalizeAmountInput(e.target.value))}
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
                    <button type="button" className="mat-cancel-btn" onClick={cancelEdit}>
                      Close
                    </button>
                    <button type="submit" className="mat-add-btn" disabled={!paperType.trim() || !paperWeight.trim()}>
                      {editingDigital ? <><Check size={15} /> Save</> : <><Plus size={15} /> {tr.addMaterial}</>}
                    </button>
                  </div>
                </form>
              </>
            )}
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

          <section className="mat-section" style={{ ['--mat-color' as string]: '#0d9488' }}>
            <h3 className="mat-section-title">
              <span className="mat-section-icon" aria-hidden>
                <Layers size={26} color="#fff" strokeWidth={2} />
              </span>
              {tr.sectionAcrylics}
            </h3>
            {!showAcrylicForm && !editingAcrylic ? (
              <button type="button" className="mat-add-btn mat-add-trigger" onClick={openAcrylicForm}>
                <Plus size={15} /> {tr.addMaterial}
              </button>
            ) : (
              <>
                <p className="mat-sheet-note mat-sheet-note-teal">
                  {tr.acrylicsNote
                    .replace('{bw}', String(ACRYLIC_FACTORY_BOARD.widthCm))
                    .replace('{bh}', String(ACRYLIC_FACTORY_BOARD.heightCm))
                    .replaceAll('{n}', String(ACRYLIC_CUT_PIECE.piecesPerBoard))
                    .replace('{pw}', String(ACRYLIC_CUT_PIECE.widthCm))
                    .replace('{ph}', String(ACRYLIC_CUT_PIECE.heightCm))}
                </p>
                <form
                  className="mat-add-grid mat-add-grid-pack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveMaterial('acrylics');
                  }}
                >
                  <label className="mat-field">
                    <span>{tr.acrylicTypeLabel}</span>
                    <input
                      value={acrylicType}
                      onChange={(e) => setAcrylicType(e.target.value)}
                      placeholder={tr.acrylicTypePlaceholder}
                      autoFocus
                    />
                  </label>
                  <label className="mat-field">
                    <span>{tr.acrylicThicknessLabel}</span>
                    <input
                      value={acrylicThickness}
                      onChange={(e) => setAcrylicThickness(e.target.value)}
                      placeholder={tr.acrylicThicknessPlaceholder}
                    />
                  </label>
                  <label className="mat-field">
                    <span>{tr.acrylicBoardCostLabel}</span>
                    <input
                      inputMode="decimal"
                      value={acrylicBoardCostKd}
                      onChange={(e) => setAcrylicBoardCostKd(normalizeAmountInput(e.target.value))}
                      placeholder="0"
                    />
                  </label>
                  {liveAcrylicPieceKd > 0 && (
                    <div className="mat-auto-sheet mat-auto-sheet-teal">
                      <span>{tr.acrylicPieceCostLabel}</span>
                      <strong>
                        {formatMaterialCostKd(liveAcrylicPieceKd)} {tr.currencyKd}
                      </strong>
                      <span className="mat-auto-sheet-sub">
                        {ACRYLIC_CUT_PIECE.widthCm}×{ACRYLIC_CUT_PIECE.heightCm} cm · ÷{ACRYLIC_CUT_PIECE.piecesPerBoard}
                      </span>
                    </div>
                  )}
                  <div className="mat-form-actions">
                    <button type="button" className="mat-cancel-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button type="submit" className="mat-add-btn">
                      {editingAcrylic ? <><Check size={15} /> Save</> : <><Plus size={15} /> Add</>}
                    </button>
                  </div>
                </form>
              </>
            )}
            <div className="mat-list">
              {acrylicMaterials.length === 0 ? (
                <p className="mat-empty">{tr.noMaterialsYet}</p>
              ) : (
                acrylicMaterials.map((m) => {
                  const label = materialLabel(m);
                  const pieceKd = effectiveAcrylicPieceCostKd(m);
                  const boardKd = parseMaterialCost(m.acrylicBoardCost);
                  return (
                    <div
                      key={m.id}
                      className={`mat-item${editingId === m.id ? ' editing' : ''}`}
                    >
                      <div className="mat-item-meta">
                        <strong>{label}</strong>
                        {(boardKd > 0 || m.acrylicThickness || pieceKd > 0) && (
                          <small className="mat-item-subline">
                            {(boardKd > 0 || m.acrylicThickness) && (
                              <span className="mat-item-subline-text">
                                {tr.acrylicSummary
                                  .replace(
                                    '{board}',
                                    boardKd > 0 ? `${formatMaterialCostKd(boardKd)} ${tr.currencyKd}` : '—',
                                  )
                                  .replace('{thickness}', m.acrylicThickness || '—')}
                              </span>
                            )}
                            {pieceKd > 0 ? (
                              <span className="mat-meter-price mat-acrylic-piece-price">
                                {tr.acrylicPieceCostShort}: {formatMaterialCostKd(pieceKd)} {tr.currencyKd}
                              </span>
                            ) : null}
                          </small>
                        )}
                      </div>
                      {renderActions(m, label)}
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
