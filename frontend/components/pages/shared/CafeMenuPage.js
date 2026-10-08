'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAllMenus, addItem, updateItem, deleteItem, updateDayMenu, parsePdfMenu, importParsedMenu, getDayMenu, getCafeConfig, updateCafeConfig, syncItemImages } from '@/api/cafeMenuApi';
import { placeOrder, getMyOrders, submitPayment, cancelOrder } from '@/api/cafeOrderApi';
import { useAuth } from '@/context/AuthContext';
import {
  Edit2, Trash2, Plus, ChevronLeft, ChevronRight, Clock, Leaf, UtensilsCrossed,
  Coffee, Utensils, Cookie, Moon, Sunrise, CheckCircle2, LayoutGrid,
  ClipboardList, Megaphone, Salad, FileUp, Sparkles, X, AlertCircle,
  CheckSquare, Square, RotateCcw, Download, FileText, FileSpreadsheet, ShoppingCart, Minus, RefreshCw,
} from 'lucide-react';
import styles from './CafeMenuPage.module.css';

const ADMIN_ROLES = ['admin', 'hr', 'md'];
/** Set false to show menu only (no cart / orders) while ordering is paused. */
const CAFE_ORDERING_ENABLED = false;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATEGORIES = ['Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Dinner'];
const TODAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

const CAT_COLORS = {
  Breakfast: '#f59e0b', Lunch: '#22c55e', Snacks: '#f97316',
  Beverages: '#0ea5e9', Dinner: '#8b5cf6',
};
const CAT_BG = {
  Breakfast: '#fffbeb', Lunch: '#f0fdf4', Snacks: '#fff7ed',
  Beverages: '#f0f9ff', Dinner: '#faf5ff',
};
const CAT_ICONS = {
  Breakfast: <Sunrise size={16} />,
  Lunch: <Utensils size={16} />,
  Snacks: <Cookie size={16} />,
  Beverages: <Coffee size={16} />,
  Dinner: <Moon size={16} />,
};

const CATEGORY_CLASSES = {
  Breakfast: {
    active: styles.categoryBreakfastActive,
    tone: styles.categoryBreakfastTone,
    text: styles.categoryBreakfastText,
    image: styles.itemImageBreakfast,
    price: styles.priceBreakfast,
  },
  Lunch: {
    active: styles.categoryLunchActive,
    tone: styles.categoryLunchTone,
    text: styles.categoryLunchText,
    image: styles.itemImageLunch,
    price: styles.priceLunch,
  },
  Snacks: {
    active: styles.categorySnacksActive,
    tone: styles.categorySnacksTone,
    text: styles.categorySnacksText,
    image: styles.itemImageSnacks,
    price: styles.priceSnacks,
  },
  Beverages: {
    active: styles.categoryBeveragesActive,
    tone: styles.categoryBeveragesTone,
    text: styles.categoryBeveragesText,
    image: styles.itemImageBeverages,
    price: styles.priceBeverages,
  },
  Dinner: {
    active: styles.categoryDinnerActive,
    tone: styles.categoryDinnerTone,
    text: styles.categoryDinnerText,
    image: styles.itemImageDinner,
    price: styles.priceDinner,
  },
};

const EMPTY_ITEM = { name: '', description: '', price: '', category: 'Lunch', isVeg: true, isAvailable: true, imageUrl: '' };

// Smart Menu Import Modal (PDF + CSV)
const SAMPLE_CSV = `name,description,price,category,isVeg,day
Paneer Butter Masala,Rich creamy paneer curry,80,Lunch,true,Monday
Dal Tadka,Yellow lentils with tadka,60,Lunch,true,Monday
Jeera Rice,Fragrant cumin rice,40,Lunch,true,Monday
Masala Chai,Spiced Indian tea,15,Beverages,true,everyday
Samosa,Crispy fried pastry with potato filling,20,Snacks,true,everyday
Bread Rolls,Fresh soft bread rolls,35,Snacks,true,Tuesday
Chicken Curry,Spicy chicken in gravy,90,Lunch,false,Wednesday
Poha,Flattened rice with spices,30,Breakfast,true,Monday
Idli Sambar,Steamed rice cakes with sambar,40,Breakfast,true,Tuesday
Cold Coffee,Chilled coffee with milk,40,Beverages,true,everyday`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cafe_menu_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { items: [], error: 'CSV must have a header row and at least one data row.' };

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const nameIdx = header.indexOf('name');
  const priceIdx = header.indexOf('price');
  const catIdx = header.indexOf('category');
  const descIdx = header.indexOf('description');
  const vegIdx = header.indexOf('isveg');
  const dayIdx = header.indexOf('day');

  if (nameIdx === -1) return { items: [], error: 'CSV must have a "name" column.' };
  if (priceIdx === -1) return { items: [], error: 'CSV must have a "price" column.' };

  const VALID_CATS = ['Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Dinner'];
  const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'everyday'];
  const items = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const cols = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());

    const name = cols[nameIdx]?.replace(/^["']|["']$/g, '').trim();
    if (!name || name.length < 2) { errors.push(`Row ${i + 1}: missing name`); continue; }

    const price = parseFloat(cols[priceIdx]) || 0;
    const rawCat = cols[catIdx]?.replace(/^["']|["']$/g, '').trim() || '';
    const category = VALID_CATS.find(c => c.toLowerCase() === rawCat.toLowerCase()) || 'Lunch';
    const desc = descIdx >= 0 ? (cols[descIdx]?.replace(/^["']|["']$/g, '').trim() || '') : '';
    const vegRaw = vegIdx >= 0 ? cols[vegIdx]?.toLowerCase().trim() : 'true';
    const isVeg = vegRaw !== 'false' && vegRaw !== '0' && vegRaw !== 'no';
    const rawDay = dayIdx >= 0 ? cols[dayIdx]?.replace(/^["']|["']$/g, '').trim() : '';
    const day = VALID_DAYS.find(d => d.toLowerCase() === rawDay?.toLowerCase()) || null;

    items.push({ name: name.slice(0, 100), description: desc.slice(0, 200), price, category, isVeg, day });
  }

  return { items, errors };
}

function PdfImportModal({ onClose, onImported }) {
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [step, setStep] = useState('upload');
  const [fileType, setFileType] = useState('pdf'); // 'pdf' | 'csv'
  const [file, setFile] = useState(null);
  const [parsedItems, setParsedItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [targetDay, setTargetDay] = useState('');
  const [mode, setMode] = useState('append');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [csvErrors, setCsvErrors] = useState([]);

  const handleFile = (f) => {
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || f.name.endsWith('.pdf');
    const isCsv = f.type === 'text/csv' || f.type === 'application/vnd.ms-excel' || f.name.endsWith('.csv');
    if (!isPdf && !isCsv) { setError('Please upload a PDF or CSV file.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return; }
    setFileType(isPdf ? 'pdf' : 'csv');
    setFile(f);
    setError('');
  };

  const handleParse = async () => {
    if (!file) return;
    setStep('parsing');
    setError('');
    setCsvErrors([]);

    if (fileType === 'csv') {
      // Parse CSV entirely on the frontend - no backend needed
      try {
        const text = await file.text();
        const { items, errors } = parseCsvText(text);
        if (items.length === 0) {
          setError(errors.length > 0 ? errors[0] : 'No valid items found in CSV. Check the format.');
          setStep('upload');
          return;
        }
        if (errors.length > 0) setCsvErrors(errors);
        setParsedItems(items);
        setSelected({});
        setStep('review');
      } catch (err) {
        setError('Failed to read CSV file.');
        setStep('upload');
      }
      return;
    }

    // PDF path
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await parsePdfMenu(fd);
      const items = res.data.data || [];
      if (items.length === 0) {
        setError('No menu items found in the PDF.');
        setStep('upload');
        return;
      }
      if (res.data.warning) setError(res.data.warning);
      setParsedItems(items);
      setSelected({});
      setStep('review');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to parse PDF.';
      setError(msg);
      setStep('upload');
    }
  };

  const handleImport = async () => {
    const toImport = parsedItems.filter((_, i) => selected[i]);
    if (toImport.length === 0) return;
    setStep('importing');
    try {
      await importParsedMenu({ items: toImport, targetDay: targetDay || null, mode });
      setStep('done');
      setTimeout(() => { onImported(); onClose(); }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed.');
      setStep('review');
    }
  };

  const toggleAll = () => {
    const allSelected = parsedItems.every((_, i) => selected[i]);
    const sel = {};
    parsedItems.forEach((_, i) => { sel[i] = !allSelected; });
    setSelected(sel);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className={`${styles.modalOverlay} ${styles.darkOverlay}`}>
      <div className={`${styles.modalPanel} ${styles.pdfPanel}`}>

        {/* Header */}
        <div className={`row-between flex-shrink-0 ${styles.pdfHeader}`}>
          <div className={`row-center ${styles.pdfHeaderTitle}`}>
            <div className={`d-flex align-center justify-center ${styles.pdfHeaderIcon}`}>
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <h3 className={`font-extrabold text-heading ${styles.pdfTitle}`}>Smart Menu Import</h3>
              <p className={`text-muted text-sm ${styles.pdfSubtitle}`}>Upload a PDF - our parser extracts the menu automatically</p>
            </div>
          </div>
          <button onClick={onClose} className={`d-flex align-center justify-center cursor-pointer text-secondary btn-ghost-base ${styles.roundCloseButton}`}>
            <X size={16} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className={styles.stepsBar}>
          {[['upload', 'Upload PDF'], ['review', 'Review Items'], ['done', 'Done']].map(([s, label], idx) => {
            const stepOrder = { upload: 0, parsing: 0, review: 1, importing: 1, done: 2 };
            const current = stepOrder[step];
            const isActive = stepOrder[s] === current;
            const isDone = stepOrder[s] < current;
            return (
              <div key={s} className={styles.stepItem}>
                <div className={styles.stepLabelWrap}>
                  <div className={`${styles.stepCircle} ${isDone ? styles.stepCircleDone : isActive ? styles.stepCircleActive : styles.stepCircleIdle}`}>
                    {isDone ? 'Done' : idx + 1}
                  </div>
                  <span className={`${styles.stepLabel} ${isDone ? styles.stepLabelDone : isActive ? styles.stepLabelActive : styles.stepLabelIdle}`}>{label}</span>
                </div>
                {idx < 2 && <div className={styles.stepDivider} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className={styles.pdfBody}>

          {/* Error */}
          {error && (
            <div className={styles.pdfError}>
              <AlertCircle size={16} color="#dc2626" className={styles.pdfErrorIcon} />
              <p className={styles.pdfErrorText}>{error}</p>
            </div>
          )}

          {/* STEP: Upload */}
          {(step === 'upload') && (
            <div className={styles.pdfStack}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : file ? styles.dropZoneReady : styles.dropZoneIdle}`}
                onClick={() => document.getElementById('pdf-upload-input').click()}
              >
                <input id="pdf-upload-input" type="file" accept=".pdf,application/pdf" className={styles.hiddenInput} onChange={e => handleFile(e.target.files[0])} />
                {file ? (
                  <>
                    <div className={`d-flex align-center justify-center ${styles.dropIcon} ${styles.fileIcon}`}>
                      <CheckCircle2 size={24} color="#22c55e" />
                    </div>
                    <p className={styles.fileName}>{file.name}</p>
                    <p className={styles.dropMeta}>{(file.size / 1024).toFixed(0)} KB - Click to change</p>
                  </>
                ) : (
                  <>
                    <div className={`d-flex align-center justify-center ${styles.dropIcon} ${styles.uploadIcon}`}>
                      <FileUp size={24} color="#6366f1" />
                    </div>
                    <p className={styles.dropTitle}>Drop your cafe menu PDF here</p>
                    <p className={styles.dropMeta}>or click to browse - Max 10MB</p>
                  </>
                )}
              </div>

              {/* Tips */}
              <div className={styles.tipsBox}>
                <p className={styles.tipsTitle}>Tips for best results</p>
                <ul className={styles.tipsList}>
                  {['Use a text-based PDF (not a scanned image)', 'Include item names, prices, and categories', 'Mention days (Monday, Tuesday...) for day-specific items', 'Mark items as Veg/Non-Veg if possible'].map(tip => (
                    <li key={tip} className={styles.tipsItem}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* STEP: Parsing */}
          {step === 'parsing' && (
            <div className={styles.statusState}>
              <div className={`d-flex align-center justify-center ${styles.statusIcon} ${styles.parseIcon} ${styles.spin}`}>
                <Sparkles size={24} color="#fff" />
              </div>
              <p className={styles.statusTitle}>Parsing your menu...</p>
              <p className={styles.statusSubtitle}>Extracting items, prices and categories with AI</p>
              <p className={styles.statusHint}>This may take up to 30 seconds</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* STEP: Review */}
          {step === 'review' && (
            <div className={styles.pdfStack}>
              {/* Import settings */}
              <div className={styles.reviewSettings}>
                <div>
                  <label className={styles.fieldLabelDark}>Default Day (for unassigned items)</label>
                  <select value={targetDay} onChange={e => setTargetDay(e.target.value)}
                    className={styles.compactSelect}>
                    <option value="">- Skip unassigned -</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabelDark}>Import Mode</label>
                  <select value={mode} onChange={e => setMode(e.target.value)}
                    className={styles.compactSelect}>
                    <option value="append">Append (keep existing items)</option>
                    <option value="replace">Replace menu (preserve item images)</option>
                  </select>
                  <p className={styles.smallMutedText}>Existing images are preserved for matching item names in both modes.</p>
                </div>
              </div>

              {/* Toolbar: select all + bulk category */}
              <div className={styles.reviewToolbar}>
                {/* Row 1: select controls */}
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarActions}>
                    <button onClick={toggleAll} className={`${styles.toolbarButton} ${styles.selectAllButton}`}>
                      {parsedItems.every((_, i) => selected[i]) ? <CheckSquare size={13} /> : <Square size={13} />}
                      {parsedItems.every((_, i) => selected[i]) ? 'Deselect All' : 'Select All'}
                    </button>
                    <button onClick={() => setSelected({})} className={`${styles.toolbarButton} ${styles.clearButton}`}>
                      Clear
                    </button>
                  </div>
                  <span className={styles.selectedCount}>{selectedCount} of {parsedItems.length} selected</span>
                </div>

                {/* Row 2: bulk category setter */}
                <div className={styles.bulkCategoryRow}>
                  <span className={styles.bulkLabel}>
                    Set {selectedCount > 0 ? `${selectedCount} selected` : 'selected'} -&gt;
                  </span>
                  {['Breakfast','Lunch','Snacks','Beverages','Dinner'].map(cat => {
                    const bulkClasses = {
                      Breakfast: styles.bulkBreakfast,
                      Lunch: styles.bulkLunch,
                      Snacks: styles.bulkSnacks,
                      Beverages: styles.bulkBeverages,
                      Dinner: styles.bulkDinner,
                    };
                    return (
                      <button key={cat}
                        disabled={selectedCount === 0}
                        onClick={() => {
                          if (selectedCount === 0) return;
                          setParsedItems(prev => prev.map((it, idx) => selected[idx] ? { ...it, category: cat } : it));
                        }}
                        className={`${styles.bulkCategoryButton} ${selectedCount === 0 ? styles.bulkCategoryDisabled : bulkClasses[cat]}`}>
                        {cat}
                      </button>
                    );
                  })}
                  {selectedCount === 0 && (
                    <span className={styles.bulkEmptyHint}>select items first</span>
                  )}
                </div>
              </div>

              {/* Items list */}
              <div className={styles.parsedList}>
                {parsedItems.map((item, i) => (
                  <div key={i} className={`${styles.parsedItem} ${selected[i] ? styles.parsedItemSelected : styles.parsedItemIdle}`}>
                    {/* Checkbox */}
                    <div onClick={() => setSelected(s => ({ ...s, [i]: !s[i] }))}
                      className={`${styles.parsedCheckbox} ${selected[i] ? styles.parsedCheckboxSelected : styles.parsedCheckboxIdle}`}>
                      {selected[i] ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>
                    {/* Name + description */}
                    <div onClick={() => setSelected(s => ({ ...s, [i]: !s[i] }))}
                      className={styles.parsedText}>
                      <div className={styles.parsedNameRow}>
                        <span className={`${styles.parsedDot} ${item.isVeg ? styles.vegBg : styles.nonVegBg}`} />
                        <p className={styles.parsedName}>{item.name}</p>
                      </div>
                      {item.description && <p className={styles.parsedDescription}>{item.description}</p>}
                    </div>
                    {/* Editable category dropdown */}
                    <div className={styles.parsedControls}>
                      <select
                        value={item.category}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          e.stopPropagation();
                          setParsedItems(prev => prev.map((it, idx) => idx === i ? { ...it, category: e.target.value } : it));
                        }}
                        className={styles.parsedCategorySelect}>
                        {['Breakfast','Lunch','Snacks','Beverages','Dinner'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {item.day && item.day !== 'everyday' && <span className={`${styles.parsedTag} ${styles.parsedDayTag}`}>{item.day}</span>}
                      {item.day === 'everyday' && <span className={`${styles.parsedTag} ${styles.parsedEverydayTag}`}>Everyday</span>}
                      <span className={styles.parsedPrice}>Rs. {item.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP: Importing */}
          {step === 'importing' && (
            <div className={`text-heading ${styles.statusState}`}>
              <div className={`d-flex align-center justify-center ${styles.statusIcon} ${styles.savingIcon}`}>
                <RotateCcw size={24} color="#22c55e" className={styles.spin} />
              </div>
              <p className={`font-bold ${styles.subtitle}`}>Saving to menu...</p>
            </div>
          )}

          {/* STEP: Done */}
          {step === 'done' && (
            <div className={styles.statusState}>
              <div className={`d-flex align-center justify-center ${styles.statusIcon} ${styles.doneIcon}`}>
                <CheckCircle2 size={28} color="#22c55e" />
              </div>
              <p className={`font-bold text-heading ${styles.subtitle}`}>Menu imported successfully!</p>
              <p className={`text-muted ${styles.statusSubtitle}`}>Refreshing menu...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'upload' || step === 'review') && (
          <div className={styles.pdfFooter}>
            <button onClick={onClose} className={styles.secondaryButton}>Cancel</button>
            {step === 'upload' && (
              <button onClick={handleParse} disabled={!file}
                className={`${styles.pdfActionButton} ${file ? styles.pdfParseReady : styles.pdfActionDisabled}`}>
                <Sparkles size={14} /> Parse Menu
              </button>
            )}
            {step === 'review' && (
              <button onClick={handleImport} disabled={selectedCount === 0}
                className={`${styles.pdfActionButton} ${selectedCount > 0 ? styles.pdfImportReady : styles.pdfActionDisabled}`}>
                <CheckCircle2 size={14} /> Import {selectedCount} Item{selectedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SyncModal({ onClose, onSync, loading, itemName, setItemName, result }) {
  const handleSync = async () => {
    if (!itemName.trim()) return;
    await onSync(itemName);
  };

  return (
    <div className={`${styles.modalOverlay} ${styles.darkOverlay}`}>
      <div className={`${styles.modalPanel} ${styles.syncPanel}`}>
        {/* Header */}
        <div className={styles.syncHeader}>
          <div className={`d-flex align-center justify-center ${styles.syncIcon}`}>
            <RefreshCw size={22} color="#fff" />
          </div>
          <div>
            <h3 className={styles.modalTitle}>Sync Item Images</h3>
            <p className={styles.smallMutedText}>Sync image across multiple days for the same item</p>
          </div>
        </div>

        {/* Input */}
        <div className={styles.fieldBlock}>
          <label className={styles.upperLabel}>Item Name</label>
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="e.g., Cold Drink, Soft Drink, Cold Coffee"
            className={styles.syncInput}
            disabled={loading}
            onKeyPress={e => e.key === 'Enter' && handleSync()}
          />
          <p className={styles.fieldHint}>Enter the exact name of the item you want to sync (e.g., &quot;Cold Drink&quot;)</p>
        </div>

        {/* Result message */}
        {result && (
          <div className={`${styles.syncResult} ${result.error ? styles.syncResultError : styles.syncResultSuccess}`}>
            {result.error ? 'Error: ' : 'Success: '}{result.error || result.message}
            {result.synced > 0 && (
              <div className={styles.syncResultMeta}>
                Synced {result.synced} of {result.totalInstances} instance(s)
                {result.syncedDays?.length > 0 && ` on ${result.syncedDays.join(', ')}`}
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className={styles.modalActions}>
          <button
            onClick={onClose}
            disabled={loading}
            className={`${styles.secondaryButton} ${loading ? styles.disabledAction : styles.enabledAction}`}
          >
            Close
          </button>
          <button
            onClick={handleSync}
            disabled={loading || !itemName.trim()}
            className={`${styles.syncSubmitButton} ${loading || !itemName.trim() ? styles.disabledAction : styles.enabledAction}`}
          >
            {loading ? 'Syncing...' : 'Sync Images'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemForm({ item, day, onSave, onCancel }) {
  const [form, setForm] = useState(item ? { ...item, price: String(item.price) } : EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [imgPreview, setImgPreview] = useState(item?.imageUrl || '');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImgPreview(ev.target.result);
      setForm(f => ({ ...f, imageUrl: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) return toast.error('Name and price required');
    setSaving(true);
    try {
      const payload = { ...form, price: parseFloat(form.price) };
      if (item?._id) await updateItem(day, item._id, payload);
      else await addItem(day, payload);
      toast.success(item ? 'Item updated' : 'Item added');
      onSave();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`${styles.modalOverlay} ${styles.scrollOverlay}`}>
      <div className={`${styles.modalPanel} ${styles.itemFormPanel}`}>
        <h3 className={`${styles.modalTitle} ${styles.itemFormTitle}`}>{item ? 'Edit Item' : `Add Item - ${day}`}</h3>
        <div className={styles.itemFormFields}>

          {/* Image upload */}
          <div>
            <label className={`${styles.fieldLabelDark} ${styles.photoLabel}`}>Item Photo</label>
            <div className={styles.imageUploadRow}>
              {/* Preview */}
              <div className={`${styles.imagePreview} ${imgPreview ? styles.imagePreviewFilled : styles.imagePreviewEmpty}`}>
                {imgPreview
                  ? <img src={imgPreview} alt="preview" className={styles.previewImage} />
                  : (
                    <svg width="44" height="44" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.mutedPlaceholder}>
                      <ellipse cx="40" cy="52" rx="28" ry="8" fill="#94a3b830" />
                      <circle cx="40" cy="44" r="24" fill="#94a3b820" stroke="#94a3b840" strokeWidth="1.5" />
                      <ellipse cx="40" cy="44" rx="12" ry="7" fill="#94a3b840" />
                      <ellipse cx="40" cy="41" rx="10" ry="5" fill="#94a3b860" />
                      <path d="M33 28 Q34 24 33 20" stroke="#94a3b860" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <path d="M40 26 Q41 22 40 18" stroke="#94a3b860" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <path d="M47 28 Q48 24 47 20" stroke="#94a3b860" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <line x1="62" y1="28" x2="62" y2="48" stroke="#94a3b870" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )
                }
              </div>
              {/* Upload controls */}
              <div className={styles.uploadControls}>
                <label className={styles.uploadButton}>
                  <Plus size={13} /> Upload Photo
                  <input type="file" accept="image/*" onChange={handleImageChange} className={styles.hiddenInput} />
                </label>
                <p className={styles.uploadHint}>JPG, PNG or WebP - Max 2MB</p>
                {imgPreview && (
                  <button onClick={() => { setImgPreview(''); setForm(f => ({ ...f, imageUrl: '' })); }}
                    className={styles.dangerTextButton}>
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={styles.twoColumnGrid}>
            <div>
              <label className={styles.fieldLabelDark}>Item Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Paneer Butter Masala" className={styles.formControl} />
            </div>
            <div>
              <label className={styles.fieldLabelDark}>Price (Rs.) *</label>
              <input type="number" min="0" step="0.5" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" className={styles.formControl} />
            </div>
          </div>
          <div className={styles.twoColumnGrid}>
            <div>
              <label className={styles.fieldLabelDark}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={styles.formControl}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fieldLabelDark}>Type</label>
              <select value={form.isVeg ? 'veg' : 'nonveg'} onChange={e => setForm(f => ({ ...f, isVeg: e.target.value === 'veg' }))} className={styles.formControl}>
                <option value="veg">Veg</option>
                <option value="nonveg">Non-Veg</option>
              </select>
            </div>
          </div>
          <div>
            <label className={styles.fieldLabelDark}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className={styles.formControl} />
          </div>
          <label className={styles.availabilityLabel}>
            <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(f => ({ ...f, isAvailable: e.target.checked }))} className={styles.accentCheckbox} />
            Available today
          </label>
        </div>
        <div className={styles.modalActions}>
          <button onClick={onCancel} className={styles.secondaryButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={`${styles.primarySmallButton} ${saving ? styles.savingAction : styles.enabledAction}`}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CafeMenuPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [menus, setMenus] = useState([]);
  const [activeDay, setActiveDay] = useState(TODAY);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [specialNote, setSpecialNote] = useState('');
  const [editNote, setEditNote] = useState(false);
  const [activeCat, setActiveCat] = useState('All');
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncItemName, setSyncItemName] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [cafeConfig, setCafeConfig] = useState({ lunchCutoff: '11:30', snacksCutoff: '17:00' });
  const [editingConfig, setEditingConfig] = useState(false);
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [payModal, setPayModal] = useState(null); // order being paid
  const [payForm, setPayForm] = useState({ method: 'UPI', ref: '', note: '', screenshot: '' });
  const [submittingPay, setSubmittingPay] = useState(false);

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  const fetchMyOrders = () => getMyOrders().then(r => setMyOrders(r.data.data || [])).catch(() => {});

  const addToCart = (item) => {
    setCart(c => {
      const key = item._id || item.name;
      if (c[key]) return { ...c, [key]: { ...c[key], qty: c[key].qty + 1 } };
      return { ...c, [key]: { ...item, qty: 1 } };
    });
  };
  const removeFromCart = (key) => {
    setCart(c => {
      const current = c[key];
      if (!current) return c;
      if (current.qty <= 1) { const next = { ...c }; delete next[key]; return next; }
      return { ...c, [key]: { ...current, qty: current.qty - 1 } };
    });
  };
  const handlePlaceOrder = async () => {
    if (!cartItems.length) return;
    setPlacing(true);
    try {
      // Derive the booking date from the active day tab
      const today = new Date();
      const todayDayIdx = today.getDay(); // 0=Sun, 1=Mon...
      const daysMap = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
      const targetDayIdx = daysMap[activeDay];
      let diff = targetDayIdx - todayDayIdx;
      if (diff < 0) diff += 7; // next week
      const orderDate = new Date(today);
      orderDate.setDate(orderDate.getDate() + diff);
      const lunchDateStr = orderDate.toISOString().slice(0, 10);

      const items = cartItems.map(i => ({ menuItemId: i._id, name: i.name, category: i.category, price: i.price, quantity: i.qty, isVeg: i.isVeg }));
      await placeOrder({ items, lunchDate: lunchDateStr });
      const dateLabel = orderDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      toast.success(`Order placed for ${dateLabel}!`);
      setCart({});
      setShowCart(false);
      setShowOrders(true);
      fetchMyOrders();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to place order'); }
    finally { setPlacing(false); }
  };

  const fetchMenus = () => {
    setLoading(true);
    return getAllMenus()
      .then(res => {
        setMenus(res.data.data || []);
        const todayMenu = res.data.data?.find(m => m.day === activeDay);
        setSpecialNote(todayMenu?.specialNote || '');
      })
      .catch(() => toast.error('Failed to load menu'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (CAFE_ORDERING_ENABLED) {
      getCafeConfig().then(r => setCafeConfig(r.data.data || {})).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    getAllMenus()
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data || [];
        setMenus(data);
        const dayMenu = data.find((m) => m.day === activeDay);
        setSpecialNote(dayMenu?.specialNote || '');
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load menu'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    setLoading(true);
    getDayMenu(activeDay)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        const dayKey = data?.day || activeDay;
        setMenus((prev) => {
          const rest = prev.filter((m) => m.day !== dayKey);
          return [...rest, { ...data, day: dayKey, items: data?.items || [] }];
        });
        setSpecialNote(data?.specialNote || '');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setMenus((prev) => {
            const rest = prev.filter((m) => m.day !== activeDay);
            return [...rest, { day: activeDay, items: [], specialNote: '' }];
          });
          setSpecialNote('');
        } else {
          toast.error(err.response?.data?.message || 'Failed to load menu');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeDay, isAdmin]);

  const currentMenu = menus.find(m => m.day === activeDay);

  useEffect(() => {
    setSpecialNote(currentMenu?.specialNote || '');
    setActiveCat('All');
  }, [activeDay, currentMenu]);

  const handleDelete = async (itemId) => {
    if (!confirm('Remove this item?')) return;
    try { await deleteItem(activeDay, itemId); toast.success('Item removed'); fetchMenus(); }
    catch { toast.error('Failed to remove'); }
  };

  const handleSaveNote = async () => {
    try {
      await updateDayMenu(activeDay, { items: currentMenu?.items || [], specialNote });
      toast.success('Note saved');
      setEditNote(false);
      fetchMenus();
    } catch { toast.error('Failed to save'); }
  };

  const handleSyncImages = async () => {
    if (!syncItemName.trim()) {
      toast.error('Please enter an item name');
      return;
    }
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await syncItemImages(syncItemName);
      setSyncResult(res.data.data);
      toast.success(res.data.data.message);
      setTimeout(() => {
        setShowSyncModal(false);
        setSyncItemName('');
        setSyncResult(null);
        fetchMenus();
      }, 2000);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Sync failed';
      toast.error(msg);
      setSyncResult({ error: msg });
    } finally {
      setSyncLoading(false);
    }
  };

  // Group items by category
  const grouped = {};
  (currentMenu?.items || []).forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  const totalItems = currentMenu?.items?.length || 0;
  const availableItems = currentMenu?.items?.filter(i => i.isAvailable).length || 0;
  const lunchItems = grouped['Lunch']?.length || 0;
  const snackItems = grouped['Snacks']?.length || 0;

  const activeDayIdx = DAYS.indexOf(activeDay);
  const prevDay = () => setActiveDay(DAYS[(activeDayIdx - 1 + 7) % 7]);
  const nextDay = () => setActiveDay(DAYS[(activeDayIdx + 1) % 7]);

  const catsWithItems = CATEGORIES.filter(c => grouped[c]?.length > 0);
  const filteredCats = activeCat === 'All' ? catsWithItems : catsWithItems.filter(c => c === activeCat);

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className="row-between flex-wrap gap-3">
        <div className={`row-center ${styles.headerTitleWrap}`}>
          <div className={`d-flex align-center justify-center ${styles.headerIcon}`}>
            <Coffee size={22} color="#22c55e" />
          </div>
          <div>
            <h2 className={`section-title ${styles.title}`}>Cafe Menu</h2>
            <p className={`section-subtitle ${styles.subtitle}`}>Manage day-wise meals, snacks and prices</p>
          </div>
        </div>
        {isAdmin && (
          <div className={`d-flex ${styles.headerActions}`}>
            <button onClick={() => setShowPdfImport(true)} className={`row-center gap-2 cursor-pointer font-bold ${styles.outlineButton}`}>
              <Sparkles size={15} /> Import from PDF
            </button>
            <button onClick={() => setShowSyncModal(true)} className={`row-center gap-2 cursor-pointer font-bold ${styles.syncButton}`}>
              <RefreshCw size={15} /> Sync Images
            </button>
            <button onClick={() => { setEditItem(null); setShowForm(true); }} className={`row-center gap-2 cursor-pointer font-bold text-white ${styles.primaryButton}`}>
              <Plus size={15} /> Add Menu Item
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        {[
          { label: 'Total Items Today', val: totalItems, sub: 'Across all categories', icon: <LayoutGrid size={22} color="#6366f1" />, iconClass: styles.statIconTotal },
          { label: 'Lunch Items', val: lunchItems, sub: 'Available today', icon: <Utensils size={22} color="#22c55e" />, iconClass: styles.statIconLunch },
          { label: 'Snack Items', val: snackItems, sub: 'Available today', icon: <Cookie size={22} color="#f97316" />, iconClass: styles.statIconSnacks },
          { label: 'Available Today', val: availableItems, sub: 'All items available', icon: <CheckCircle2 size={22} color="#0ea5e9" />, iconClass: styles.statIconAvailable },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={`${styles.statIcon} ${s.iconClass}`}>{s.icon}</div>
            <div>
              <p className={styles.statLabel}>{s.label}</p>
              <p className={styles.statValue}>{s.val}</p>
              <p className={styles.statSub}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Day selector */}
      <div className={styles.daySelector}>
        <button onClick={prevDay} className={styles.dayNavButton}>
          <ChevronLeft size={16} />
        </button>
        <div className={styles.dayTabs}>
          {DAYS.map(day => {
            const isToday = day === TODAY;
            const isActive = day === activeDay;
            const dayMenu = menus.find(m => m.day === day);
            const count = dayMenu?.items?.length || 0;
            return (
              <button key={day} onClick={() => setActiveDay(day)} className={`${styles.dayButton} ${isActive ? styles.dayButtonActive : styles.dayButtonInactive}`}>
                <div className={`${styles.dayName} ${isActive ? styles.dayNameActive : styles.dayNameInactive}`}>{day.slice(0, 3)}</div>
                <div className={`${styles.dayCount} ${isActive ? styles.dayCountActive : styles.dayCountInactive}`}>
                  {count > 0 ? `${count} item${count !== 1 ? 's' : ''}` : '-'}
                </div>
                {isToday && (
                  <div className={`${styles.todayPill} ${isActive ? styles.todayPillActive : styles.todayPillInactive}`}>Today</div>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={nextDay} className={styles.dayNavButton}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Special note */}
      <div className={styles.noteBar}>
        <span className={styles.noteIcon}><Megaphone size={18} color="#d97706" /></span>
        <div className={styles.noteBody}>
          {editNote ? (
            <div className={styles.noteEditRow}>
              <input value={specialNote} onChange={e => setSpecialNote(e.target.value)}
                placeholder="Add a special note for this day..."
                className={styles.noteInput} />
              <button onClick={handleSaveNote} className={styles.noteSaveButton}>Save</button>
              <button onClick={() => setEditNote(false)} className={styles.noteCancelButton}>Cancel</button>
            </div>
          ) : (
            <div className={styles.noteViewRow}>
              <p className={styles.noteText}>{currentMenu?.specialNote || 'No special note for today.'}</p>
              {isAdmin && <button onClick={() => setEditNote(true)} className={styles.noteEditButton}>Edit</button>}
            </div>
          )}
        </div>
      </div>

      {/* Main content + right sidebar */}
      {loading ? (
        <div className={styles.loadingState}>Loading menu...</div>
      ) : (
        <div className={styles.contentGrid}>

          {/* Left: category filter + items */}
          <div className={styles.mainColumn}>

            {/* Category filter pills + Cart/Orders buttons */}
            <div className={styles.categoryFilters}>
              <button onClick={() => setActiveCat('All')} className={`${styles.categoryButton} ${activeCat === 'All' ? styles.categoryAllActive : styles.categoryInactive}`}>
                All Categories <span className={`${styles.mutedCount} ${styles.allCount}`}>{totalItems} total</span>
              </button>
              {catsWithItems.map(cat => {
                const catClasses = CATEGORY_CLASSES[cat];
                return (
                  <button key={cat} onClick={() => setActiveCat(cat)} className={`row-center ${styles.categoryButton} ${styles.categoryPill} ${activeCat === cat ? catClasses.active : styles.categoryInactive}`}>
                    <span className={`${styles.categoryIcon} ${activeCat === cat ? catClasses.text : styles.categoryIconInactive}`}>{CAT_ICONS[cat]}</span>
                    {cat} <span className={styles.mutedCount}>({grouped[cat]?.length || 0})</span>
                  </button>
                );
              })}
              {/* My Orders — hidden while ordering is paused */}
              {CAFE_ORDERING_ENABLED && (
              <div className={styles.inlineActions}>
                <button onClick={() => { setShowOrders(true); fetchMyOrders(); }}
                  className={styles.ordersButton}>
                  <ClipboardList size={14} /> My Orders
                </button>
              </div>
              )}
            </div>

            {/* Items grouped by category */}
            {totalItems === 0 ? (
              <div className={styles.emptyMenu}>
                <UtensilsCrossed size={40} color="#e2e8f0" className={styles.emptyIcon} />
                <p className={styles.emptyText}>No menu for {activeDay} yet.</p>
                {isAdmin && <button onClick={() => setShowForm(true)} className={styles.textButton}>+ Add items</button>}
              </div>
            ) : filteredCats.map(cat => {
              const catClasses = CATEGORY_CLASSES[cat];
              return (
              <div key={cat}>
                <div className={styles.categoryHeader}>
                  <div className={`${styles.categoryHeaderIcon} ${catClasses.tone}`}>{CAT_ICONS[cat]}</div>
                  <h3 className={styles.categoryTitle}>{cat} Menu</h3>
                  <span className={`${styles.categoryBadge} ${catClasses.tone}`}>{grouped[cat]?.length} item{grouped[cat]?.length !== 1 ? 's' : ''}</span>
                </div>

                <div className={styles.itemsGrid}>
                  {grouped[cat].map(item => (
                    <div key={item._id} className={`${styles.itemCard} ${item.isAvailable ? styles.itemAvailable : styles.itemUnavailable}`}>
                      {/* Image area */}
                      <div className={`${styles.itemImageArea} ${item.imageUrl ? styles.itemImageHasPhoto : catClasses.image}`}>
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className={styles.itemImage} loading="lazy" decoding="async" />
                          : (
                            <svg width="72" height="72" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.placeholderImage}>
                              <ellipse cx="40" cy="52" rx="28" ry="8" fill={`${CAT_COLORS[cat]}25`} />
                              <circle cx="40" cy="44" r="24" fill={`${CAT_COLORS[cat]}18`} stroke={`${CAT_COLORS[cat]}35`} strokeWidth="1.5" />
                              <circle cx="40" cy="44" r="18" fill={`${CAT_COLORS[cat]}12`} />
                              <ellipse cx="40" cy="44" rx="12" ry="7" fill={`${CAT_COLORS[cat]}45`} />
                              <ellipse cx="40" cy="41" rx="10" ry="5" fill={`${CAT_COLORS[cat]}65`} />
                              <path d="M33 28 Q34 24 33 20" stroke={`${CAT_COLORS[cat]}55`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                              <path d="M40 26 Q41 22 40 18" stroke={`${CAT_COLORS[cat]}55`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                              <path d="M47 28 Q48 24 47 20" stroke={`${CAT_COLORS[cat]}55`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                              <line x1="62" y1="28" x2="62" y2="48" stroke={`${CAT_COLORS[cat]}70`} strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="60" y1="28" x2="60" y2="34" stroke={`${CAT_COLORS[cat]}70`} strokeWidth="1" strokeLinecap="round"/>
                              <line x1="64" y1="28" x2="64" y2="34" stroke={`${CAT_COLORS[cat]}70`} strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                          )
                        }
                        {/* VEG badge */}
                        <div className={`${styles.vegBadge} ${item.isVeg ? styles.vegText : styles.nonVegText}`}>
                          <span className={`${styles.miniDot} ${item.isVeg ? styles.vegBg : styles.nonVegBg}`} />
                          {item.isVeg ? 'VEG' : 'NON-VEG'}
                        </div>
                        {item.isAvailable && (
                          <div className={styles.availableBadge}>Available</div>
                        )}
                      </div>

                      {/* Card body */}
                      <div className={styles.itemBody}>
                        <div className={styles.itemHeader}>
                          <p className={styles.itemName}>{item.name}</p>
                          <span className={`${styles.itemPrice} ${catClasses.price}`}>Rs. {item.price}</span>
                        </div>

                        {item.description && (
                          <p className={styles.itemDescription}>{item.description}</p>
                        )}

                        <div className={styles.itemMeta}>
                          <span className={styles.timeBadge}>
                            <Clock size={9} /> {cat === 'Lunch' ? '15-20 mins' : cat === 'Snacks' ? '10-15 mins' : '5-10 mins'}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className={styles.adminActions}>
                            <button onClick={() => { setEditItem(item); setShowForm(true); }}
                              className={`${styles.itemActionButton} ${styles.editItemButton}`}>
                              <Edit2 size={11} /> Edit
                            </button>
                            <button onClick={() => handleDelete(item._id)}
                              className={`${styles.itemActionButton} ${styles.deleteItemButton}`}>
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        )}

                        {/* Add to Cart — disabled while ordering is paused */}
                        {CAFE_ORDERING_ENABLED && item.isAvailable && (() => {
                          const todayIdx = DAYS.indexOf(TODAY);
                          const dayIdx = DAYS.indexOf(activeDay);
                          const isPast = dayIdx < todayIdx;
                          return !isPast;
                        })() && (() => {
                          // Check cutoff for today only
                          const isToday = activeDay === TODAY;
                          let disabled = false;
                          let cutoffMsg = '';
                          if (isToday) {
                            const now = new Date();
                            const cat = (item.category || '').toLowerCase();
                            const cutoff = cat === 'lunch' ? (cafeConfig.lunchCutoff || '11:30') : (cafeConfig.snacksCutoff || '17:00');
                            const [ch, cm] = cutoff.split(':').map(Number);
                            const cutoffTime = new Date(); cutoffTime.setHours(ch, cm, 0, 0);
                            if (now > cutoffTime) { disabled = true; cutoffMsg = `Closed (${cutoff})`; }
                          }
                          return (
                          <div className={`${styles.cartArea} ${isAdmin ? '' : styles.cartAreaWithBorder}`}>
                            {disabled ? (
                              <p className={styles.cutoffMessage}>{cutoffMsg}</p>
                            ) : cart[item._id || item.name] ? (
                              <div className={styles.quantityControl}>
                                <button onClick={() => removeFromCart(item._id || item.name)}
                                  className={`${styles.quantityButton} ${styles.quantityMinus}`}>
                                  <Minus size={12} />
                                </button>
                                <span className={styles.quantityValue}>{cart[item._id || item.name].qty}</span>
                                <button onClick={() => addToCart(item)}
                                  className={`${styles.quantityButton} ${styles.quantityPlus}`}>
                                  <Plus size={12} />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(item)}
                                className={styles.addButton}>
                                <Plus size={11} /> Add
                              </button>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>

          {/* Right sidebar */}
          <div className="d-flex-col gap-4">
            {/* Today's Summary */}
            <div className={`bg-white border-default ${styles.sidebarCard}`}>
              <div className={`row-center gap-2 ${styles.sidebarHeader}`}>
                <div className={`d-flex align-center justify-center ${styles.sidebarIcon} ${styles.summaryIcon}`}>
                  <ClipboardList size={15} color="#6366f1" />
                </div>
                <h4 className={`font-bold text-heading ${styles.sidebarTitle}`}>Today&apos;s Summary</h4>
              </div>
              <div className={`d-flex-col ${styles.summaryRows}`}>
                {[
                  { label: 'Total Items', val: totalItems },
                  { label: 'Lunch Items', val: lunchItems },
                  { label: 'Snack Items', val: snackItems },
                  { label: 'Available',   val: availableItems, valueClass: styles.summaryValueAvailable },
                ].map(row => (
                  <div key={row.label} className={`row-between align-center ${styles.summaryRow}`}>
                    <span className="text-sm text-secondary">{row.label}</span>
                    <span className={`font-bold ${styles.summaryValue} ${row.valueClass || styles.summaryValueDefault}`}>{row.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cafeteria Timings - editable for admin */}
            <div className={`bg-white border-default ${styles.sidebarCard}`}>
              <div className={`row-center gap-2 ${styles.sidebarHeader}`}>
                <div className={`d-flex align-center justify-center ${styles.sidebarIcon} ${styles.cutoffIcon}`}>
                  <Clock size={15} color="#0ea5e9" />
                </div>
                <h4 className={`font-bold text-heading ${styles.sidebarTitle}`}>Booking Cutoff</h4>
                {isAdmin && !editingConfig && (
                  <button onClick={() => setEditingConfig(true)} className={styles.editConfigButton}>Edit</button>
                )}
              </div>
              {editingConfig ? (
                <div className={styles.cutoffForm}>
                  <div>
                    <label className={styles.cutoffLabel}>Lunch Cutoff</label>
                    <input type="time" value={cafeConfig.lunchCutoff || '11:30'} onChange={e => setCafeConfig(c => ({ ...c, lunchCutoff: e.target.value }))}
                      className={styles.cutoffInput} />
                  </div>
                  <div>
                    <label className={styles.cutoffLabel}>Snacks Cutoff</label>
                    <input type="time" value={cafeConfig.snacksCutoff || '17:00'} onChange={e => setCafeConfig(c => ({ ...c, snacksCutoff: e.target.value }))}
                      className={styles.cutoffInput} />
                  </div>
                  <div className={styles.cutoffActions}>
                    <button onClick={async () => {
                      try { await updateCafeConfig({ lunchCutoff: cafeConfig.lunchCutoff, snacksCutoff: cafeConfig.snacksCutoff }); toast.success('Timings saved'); setEditingConfig(false); }
                      catch { toast.error('Failed to save'); }
                    }} className={`${styles.smallButton} ${styles.saveSmallButton}`}>Save</button>
                    <button onClick={() => setEditingConfig(false)} className={`${styles.smallButton} ${styles.cancelSmallButton}`}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.cutoffRow}>
                    <p className={`font-semibold text-body-clr ${styles.cutoffName}`}>Lunch</p>
                    <p className={`text-muted ${styles.cutoffText}`}>Order before {cafeConfig.lunchCutoff || '11:30'}</p>
                  </div>
                  <div className={styles.cutoffRow}>
                    <p className={`font-semibold text-body-clr ${styles.cutoffName}`}>Snacks</p>
                    <p className={`text-muted ${styles.cutoffText}`}>Order before {cafeConfig.snacksCutoff || '17:00'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Healthy Tip */}
            <div className={`bg-white border-default ${styles.sidebarCard}`}>
              <div className={`row-center gap-2 ${styles.sidebarHeaderCompact}`}>
                <div className={`d-flex align-center justify-center ${styles.sidebarIcon} ${styles.tipIcon}`}>
                  <Salad size={15} color="#22c55e" />
                </div>
                <h4 className={`font-bold text-heading ${styles.sidebarTitle}`}>Healthy Tip</h4>
              </div>
              <div className={`row-between ${styles.tipBody}`}>
                <p className={`text-secondary ${styles.tipText}`}>Eat healthy, stay active and keep your mind productive!</p>
                <Salad size={36} color="#22c55e" className={styles.tipLargeIcon} />
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ItemForm
          item={editItem}
          day={activeDay}
          onSave={() => { setShowForm(false); setEditItem(null); fetchMenus(); }}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {showPdfImport && (
        <PdfImportModal
          onClose={() => setShowPdfImport(false)}
          onImported={() => { setShowPdfImport(false); fetchMenus(); }}
        />
      )}

      {showSyncModal && (
        <SyncModal
          onClose={() => { setShowSyncModal(false); setSyncItemName(''); setSyncResult(null); }}
          onSync={handleSyncImages}
          loading={syncLoading}
          itemName={syncItemName}
          setItemName={setSyncItemName}
          result={syncResult}
        />
      )}

      {/* Cart + Orders buttons now inline with categories above */}

      {/* Floating Cart — hidden while ordering is paused */}
      {CAFE_ORDERING_ENABLED && cartCount > 0 && (
        <button onClick={() => setShowCart(true)} className={styles.floatingCartButton}>
          <ShoppingCart size={18} /> {cartCount} Items - Rs. {cartTotal}
        </button>
      )}

      {/* My Orders Panel */}
      {CAFE_ORDERING_ENABLED && showOrders && (
        <div className={styles.modalOverlay} onClick={() => setShowOrders(false)}>
          <div className={`${styles.modalPanel} ${styles.ordersPanel}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>My Orders</h3>
              <button onClick={() => setShowOrders(false)} className={styles.closeButton}><X size={20} /></button>
            </div>
            {myOrders.length === 0 ? (
              <p className={styles.emptyOrders}>No orders yet</p>
            ) : myOrders.map(order => (
              <div key={order._id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <p className={styles.orderTitle}>
                      {order.day} - {new Date(order.lunchDate || order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    <p className={styles.orderMeta}>{order.items?.length} items - Rs. {order.totalAmount}</p>
                  </div>
                  <div className={styles.statusGroup}>
                    <span className={`${styles.statusPill} ${order.status === 'Pending' ? styles.statusPending : order.status === 'Cancelled' ? styles.statusCancelled : styles.statusConfirmed}`}>{order.status}</span>
                    <span className={`${styles.statusPill} ${order.paymentStatus === 'Paid' ? styles.paymentPaid : order.paymentStatus === 'Submitted' ? styles.paymentSubmitted : styles.paymentUnpaid}`}>{order.paymentStatus}</span>
                  </div>
                </div>
                <div className={styles.orderItems}>
                  {order.items?.map((it, i) => <span key={i}>{it.name}{i < order.items.length - 1 ? ', ' : ''}</span>)}
                </div>
                {/* Actions */}
                <div className={styles.orderActions}>
                  {order.paymentStatus === 'Unpaid' && order.status !== 'Cancelled' && (
                    <button onClick={() => { setPayModal(order); setPayForm({ method: 'UPI', ref: '', note: '', screenshot: '' }); }}
                      className={styles.payNowButton}>
                      Pay Now
                    </button>
                  )}
                  {['Pending', 'Confirmed'].includes(order.status) && (
                    <button onClick={async () => {
                      if (!confirm('Cancel this order?')) return;
                      try { await cancelOrder(order._id, 'Cancelled by user'); toast.success('Cancelled'); fetchMyOrders(); }
                      catch { toast.error('Cannot cancel'); }
                    }} className={styles.cancelOrderButton}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart Panel */}
      {CAFE_ORDERING_ENABLED && showCart && (
        <div className={styles.modalOverlay} onClick={() => setShowCart(false)}>
          <div className={`${styles.modalPanel} ${styles.cartPanel}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Your Order</h3>
              <button onClick={() => setShowCart(false)} className={styles.closeButton}><X size={20} /></button>
            </div>

            {/* Cart items */}
            {cartItems.map(item => (
              <div key={item._id || item.name} className={styles.cartItemRow}>
                <div>
                  <p className={styles.cartItemName}>{item.name}</p>
                  <p className={styles.cartItemMeta}>Rs. {item.price} x {item.qty}</p>
                </div>
                <div className={styles.miniQuantityControl}>
                  <button onClick={() => removeFromCart(item._id || item.name)} className={`${styles.miniQuantityButton} ${styles.quantityMinus}`}><Minus size={11} /></button>
                  <span className={styles.miniQuantityValue}>{item.qty}</span>
                  <button onClick={() => addToCart(item)} className={`${styles.miniQuantityButton} ${styles.quantityPlus}`}><Plus size={11} /></button>
                </div>
              </div>
            ))}

            {/* Total + Place Order */}
            <div className={styles.cartFooter}>
              <span className={styles.cartTotal}>Rs. {cartTotal}</span>
              <button onClick={handlePlaceOrder} disabled={placing}
                className={`${styles.confirmOrderButton} ${placing ? styles.confirmOrderDisabled : styles.confirmOrderReady}`}>
                {placing ? 'Booking...' : 'Confirm & Book'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {CAFE_ORDERING_ENABLED && payModal && (
        <div className={`${styles.modalOverlay} ${styles.paymentOverlay}`} onClick={() => setPayModal(null)}>
          <div className={`${styles.modalPanel} ${styles.paymentPanel}`} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Submit Payment</h3>
            <p className={styles.modalSubtitle}>Order total: Rs. {payModal.totalAmount}</p>
            <div className={styles.paymentForm}>
              <div>
                <label className={styles.fieldLabel}>Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  className={styles.formControl}>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Wallet">Wallet</option>
                  <option value="Deduction">Salary Deduction</option>
                </select>
              </div>
              <div>
                <label className={styles.fieldLabel}>Transaction ID / Reference</label>
                <input value={payForm.ref} onChange={e => setPayForm(f => ({ ...f, ref: e.target.value }))}
                  placeholder="e.g. UPI transaction ID"
                  className={styles.formControl} />
              </div>
              <div>
                <label className={styles.fieldLabel}>Note (optional)</label>
                <input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Any additional info"
                  className={styles.formControl} />
              </div>
              <div>
                <label className={styles.fieldLabel}>Payment Screenshot (optional)</label>
                <input type="file" accept="image/*" onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setPayForm(f => ({ ...f, screenshot: reader.result }));
                  reader.readAsDataURL(file);
                }} className={styles.fileInput} />
                {payForm.screenshot && (
                  <img src={payForm.screenshot} alt="proof" className={styles.paymentProof} />
                )}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setPayModal(null)} className={styles.secondaryButton}>Cancel</button>
              <button disabled={submittingPay} onClick={async () => {
                if (!payForm.ref && payForm.method !== 'Cash' && payForm.method !== 'Deduction') { toast.error('Please enter transaction ID'); return; }
                setSubmittingPay(true);
                try {
                  await submitPayment(payModal._id, { paymentMethod: payForm.method, paymentRef: payForm.ref, paymentNote: payForm.note, paymentScreenshot: payForm.screenshot || '' });
                  toast.success('Payment submitted for verification');
                  setPayModal(null);
                  fetchMyOrders();
                } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
                finally { setSubmittingPay(false); }
              }} className={`${styles.submitPaymentButton} ${submittingPay ? styles.savingAction : styles.enabledAction}`}>
                {submittingPay ? 'Submitting...' : 'Submit Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
