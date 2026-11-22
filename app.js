/**
 * KasKu Pro — Aplikasi Pencatat Keuangan Mobile & Desktop
 * Fitur: PIN Lock, Dark/Light Mode, Auto-OCR Struk, Kategori Custom,
 * Dokumentasi Visual, dan Sinkronisasi Google Sheets + Google Drive per Bulan.
 */

const STORAGE_KEYS = {
  PIN: 'kasku_pin_code',
  THEME: 'kasku_theme',
  TX: 'kasku_transactions_v1',
  CAT_EXPENSE: 'kasku_cat_expense',
  CAT_INCOME: 'kasku_cat_income',
  SCRIPT_URL: 'kasku_apps_script_url'
};

const DEFAULT_EXPENSE_CATS = [
  'Makan & Minum',
  'Belanja Harian',
  'Transportasi',
  'Tagihan & Utang',
  'Kesehatan',
  'Hiburan & Ngopi',
  'Lainnya'
];

const DEFAULT_INCOME_CATS = [
  'Gaji Bulanan',
  'Bonus / THR',
  'Freelance / Proyek',
  'Hasil Jualan',
  'Transfer Masuk',
  'Lainnya'
];

const state = {
  pinBuffer: '',
  unlocked: false,
  activeMonth: getCurrentMonthStr(),
  txType: 'Pengeluaran',
  filterType: 'ALL',
  searchQuery: '',
  currentPhotoBase64: '',
  currentPhotoName: '',
  transactions: [],
  expenseCategories: [],
  incomeCategories: [],
  scriptUrl: ''
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadLocalState();
  initPinLock();
  bindEvents();
  resetDateTimeInput();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

function getCurrentMonthStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function loadLocalState() {
  state.expenseCategories = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAT_EXPENSE)) || [...DEFAULT_EXPENSE_CATS];
  state.incomeCategories = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAT_INCOME)) || [...DEFAULT_INCOME_CATS];
  state.scriptUrl = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL) || '';

  const savedTx = localStorage.getItem(STORAGE_KEYS.TX);
  if (savedTx) {
    state.transactions = JSON.parse(savedTx);
  } else {
    const m = state.activeMonth;
    state.transactions = [
      {
        id: 'tx-demo-1',
        month: m,
        timestamp: `${m}-01T09:00`,
        type: 'Pemasukan',
        category: 'Gaji Bulanan',
        description: 'Gaji utama bulan berjalan (Transfer Bank)',
        amount: 8500000,
        photoData: '',
        driveUrl: ''
      },
      {
        id: 'tx-demo-2',
        month: m,
        timestamp: `${m}-03T12:30`,
        type: 'Pengeluaran',
        category: 'Makan & Minum',
        description: 'Makan siang Ayam Bakar & Es Teh di Warung Mas Budi',
        amount: 32000,
        photoData: '',
        driveUrl: ''
      }
    ];
    persistTransactions();
  }

  document.getElementById('monthPicker').value = state.activeMonth;
  document.getElementById('appsScriptUrlInput').value = state.scriptUrl;
  updateSyncBadge();
}

function persistTransactions() {
  try {
    localStorage.setItem(STORAGE_KEYS.TX, JSON.stringify(state.transactions));
  } catch (e) {
    showToast('Penyimpanan lokal penuh. Hubungkan Google Sheets/Drive agar foto tersimpan di Cloud.');
  }
}

// ==================== PIN LOCK SYSTEM ====================
function initPinLock() {
  const savedPin = localStorage.getItem(STORAGE_KEYS.PIN) || '123456';
  localStorage.setItem(STORAGE_KEYS.PIN, savedPin);

  document.querySelectorAll('.pin-key[data-num]').forEach(btn => {
    btn.addEventListener('click', () => handlePinDigit(btn.dataset.num));
  });

  document.getElementById('pinBackspace').addEventListener('click', () => {
    state.pinBuffer = state.pinBuffer.slice(0, -1);
    renderPinDots();
  });

  document.getElementById('pinResetHint').addEventListener('click', () => {
    document.getElementById('pinMessage').textContent = 'PIN default: 123456. Ubah di menu Pengaturan setelah masuk.';
  });

  document.addEventListener('keydown', (e) => {
    if (state.unlocked) return;
    if (/^[0-9]$/.test(e.key)) {
      handlePinDigit(e.key);
    } else if (e.key === 'Backspace') {
      state.pinBuffer = state.pinBuffer.slice(0, -1);
      renderPinDots();
    }
  });
}

function handlePinDigit(digit) {
  if (state.pinBuffer.length >= 6) return;
  state.pinBuffer += digit;
  renderPinDots();

  if (state.pinBuffer.length === 6) {
    const correctPin = localStorage.getItem(STORAGE_KEYS.PIN) || '123456';
    if (state.pinBuffer === correctPin) {
      unlockApp();
    } else {
      const card = document.getElementById('pinCard');
      const dots = document.getElementById('pinDots');
      dots.classList.add('error');
      card.classList.add('shake');
      document.getElementById('pinMessage').textContent = 'PIN salah! Silakan coba lagi.';
      setTimeout(() => {
        state.pinBuffer = '';
        dots.classList.remove('error');
        card.classList.remove('shake');
        renderPinDots();
      }, 500);
    }
  }
}

function renderPinDots() {
  const spans = document.querySelectorAll('#pinDots span');
  spans.forEach((span, idx) => {
    span.classList.toggle('filled', idx < state.pinBuffer.length);
  });
}

function unlockApp() {
  state.unlocked = true;
  state.pinBuffer = '';
  renderPinDots();
  document.getElementById('pinOverlay').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  renderCategoryChips();
  renderAll();
  if (state.scriptUrl) {
    fetchMonthFromGoogleSheet(state.activeMonth);
  }
}

function lockApp() {
  state.unlocked = false;
  state.pinBuffer = '';
  renderPinDots();
  document.getElementById('pinMessage').textContent = '';
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('pinOverlay').classList.remove('hidden');
}

// ==================== DARK / LIGHT THEME ====================
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  const icon = document.getElementById('themeIcon');
  if (icon && typeof lucide !== 'undefined') {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

// ==================== EVENT BINDINGS ====================
function bindEvents() {
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('lockAppBtn').addEventListener('click', lockApp);

  const monthPicker = document.getElementById('monthPicker');
  monthPicker.addEventListener('change', (e) => {
    if (e.target.value) switchMonth(e.target.value);
  });
  document.getElementById('prevMonthBtn').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => shiftMonth(1));

  document.getElementById('tabExpense').addEventListener('click', () => setTxType('Pengeluaran'));
  document.getElementById('tabIncome').addEventListener('click', () => setTxType('Pemasukan'));

  const amountInput = document.getElementById('amountInput');
  amountInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    e.target.value = raw ? Number(raw).toLocaleString('id-ID') : '';
  });

  document.getElementById('toggleNewCategoryBtn').addEventListener('click', () => {
    document.getElementById('newCategoryRow').classList.toggle('hidden');
    document.getElementById('newCategoryInput').focus();
  });

  document.getElementById('saveNewCategoryBtn').addEventListener('click', addCustomCategory);

  const cameraInput = document.getElementById('cameraInput');
  const galleryInput = document.getElementById('galleryInput');

  document.getElementById('openCameraBtn').addEventListener('click', () => {
    cameraInput.click();
  });

  document.getElementById('openGalleryBtn').addEventListener('click', () => {
    galleryInput.click();
  });

  const onFilePicked = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleImageSelected(file);
  };

  cameraInput.addEventListener('change', onFilePicked);
  galleryInput.addEventListener('change', onFilePicked);

  document.getElementById('rescanBtn').addEventListener('click', async () => {
    if (state.currentPhotoBase64) {
      await runReceiptOCR(state.currentPhotoBase64);
    }
  });

  document.getElementById('removePhotoBtn').addEventListener('click', clearPhotoPreview);

  document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderTransactions();
  });

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.filterType = pill.dataset.filter;
      renderTransactions();
    });
  });

  document.getElementById('syncNowBtn').addEventListener('click', () => {
    if (!state.scriptUrl) {
      showToast('Masukkan URL Google Apps Script di menu Pengaturan terlebih dahulu.');
      openSettingsModal();
      return;
    }
    fetchMonthFromGoogleSheet(state.activeMonth);
  });

  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCurrentMonthCSV);
  document.getElementById('resetDemoBtn').addEventListener('click', () => {
    if (confirm('Hapus semua data lokal di browser ini? Data yang sudah di Google Sheets tetap aman.')) {
      state.transactions = [];
      persistTransactions();
      renderAll();
      showToast('Data lokal dikosongkan.');
    }
  });

  document.getElementById('closeLightboxBtn').addEventListener('click', () => {
    document.getElementById('lightboxModal').classList.add('hidden');
  });
}

function shiftMonth(delta) {
  const [y, m] = state.activeMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const nextStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  switchMonth(nextStr);
}

function switchMonth(monthStr) {
  state.activeMonth = monthStr;
  document.getElementById('monthPicker').value = monthStr;
  document.querySelectorAll('.active-sheet-name').forEach(el => el.textContent = monthStr);
  renderAll();
  if (state.scriptUrl) {
    fetchMonthFromGoogleSheet(monthStr);
  }
}

function setTxType(type) {
  state.txType = type;
  const tabExp = document.getElementById('tabExpense');
  const tabInc = document.getElementById('tabIncome');
  const submitBtn = document.getElementById('submitBtn');

  if (type === 'Pengeluaran') {
    tabExp.className = 'type-tab active-expense';
    tabInc.className = 'type-tab';
    submitBtn.className = 'btn-submit expense-submit';
    document.getElementById('submitBtnText').textContent = 'Simpan Pengeluaran';
    document.getElementById('photoSectionLabel').textContent = 'Foto Struk (Auto-Scan) / Dokumentasi Belanja';
    document.getElementById('uploadSub').textContent = 'Otomatis baca nominal & kategori dari struk, tersimpan ke Drive';
    document.getElementById('ocrBadge').classList.remove('hidden');
    document.getElementById('categoryLabel').textContent = 'Kategori Pengeluaran (Bisa Adjust Sendiri)';
    document.getElementById('descLabel').textContent = 'Keterangan (Makan di mana / beli apa)';
    document.getElementById('descInput').placeholder = 'Contoh: Makan siang Soto Ayam Pak Budi / Bayar listrik';
  } else {
    tabInc.className = 'type-tab active-income';
    tabExp.className = 'type-tab';
    submitBtn.className = 'btn-submit income-submit';
    document.getElementById('submitBtnText').textContent = 'Simpan Pemasukan';
    document.getElementById('photoSectionLabel').textContent = 'Dokumentasi Pemasukan (Bukti Transfer / Nota)';
    document.getElementById('uploadSub').textContent = 'Foto dokumentasi otomatis masuk ke folder Google Drive';
    document.getElementById('ocrBadge').classList.add('hidden');
    document.getElementById('categoryLabel').textContent = 'Kategori Uang Masuk (Bisa Adjust Sendiri)';
    document.getElementById('descLabel').textContent = 'Keterangan (Dapat uang dari mana)';
    document.getElementById('descInput').placeholder = 'Contoh: Transfer proyek desain dari Klien A';
  }

  renderCategoryChips();
}

// ==================== CUSTOM CATEGORIES ====================
function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  const hiddenInput = document.getElementById('selectedCategory');
  const list = state.txType === 'Pengeluaran' ? state.expenseCategories : state.incomeCategories;
  const selectedClass = state.txType === 'Pengeluaran' ? 'selected-expense' : 'selected-income';

  if (!list.includes(hiddenInput.value)) {
    hiddenInput.value = list[0] || '';
  }

  container.innerHTML = '';
  list.forEach(cat => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `cat-chip ${hiddenInput.value === cat ? selectedClass : ''}`;
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      hiddenInput.value = cat;
      renderCategoryChips();
    });
    container.appendChild(chip);
  });
}

function addCustomCategory() {
  const input = document.getElementById('newCategoryInput');
  const val = input.value.trim();
  if (!val) return;

  if (state.txType === 'Pengeluaran') {
    if (!state.expenseCategories.includes(val)) {
      state.expenseCategories.push(val);
      localStorage.setItem(STORAGE_KEYS.CAT_EXPENSE, JSON.stringify(state.expenseCategories));
    }
  } else {
    if (!state.incomeCategories.includes(val)) {
      state.incomeCategories.push(val);
      localStorage.setItem(STORAGE_KEYS.CAT_INCOME, JSON.stringify(state.incomeCategories));
    }
  }

  document.getElementById('selectedCategory').value = val;
  input.value = '';
  document.getElementById('newCategoryRow').classList.add('hidden');
  renderCategoryChips();
  showToast(`Kategori "${val}" ditambahkan!`);
}

// ==================== PHOTO COMPRESSION & RECEIPT OCR ====================
async function handleImageSelected(file) {
  state.currentPhotoName = file.name || `bukti_${Date.now()}.jpg`;
  const compressed = await compressImageToBase64(file, 1024, 0.78);
  state.currentPhotoBase64 = compressed;

  document.getElementById('photoPreviewImg').src = compressed;
  document.getElementById('uploadPlaceholder').classList.add('hidden');
  document.getElementById('photoPreviewWrap').classList.remove('hidden');

  if (state.txType === 'Pengeluaran') {
    await runReceiptOCR(compressed);
  }
}

function clearPhotoPreview() {
  state.currentPhotoBase64 = '';
  state.currentPhotoName = '';
  const cam = document.getElementById('cameraInput');
  const gal = document.getElementById('galleryInput');
  if (cam) cam.value = '';
  if (gal) gal.value = '';
  document.getElementById('photoPreviewWrap').classList.add('hidden');
  document.getElementById('uploadPlaceholder').classList.remove('hidden');
  document.getElementById('ocrProgressBox').classList.add('hidden');
}

function compressImageToBase64(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function runReceiptOCR(imageDataUrl) {
  if (typeof Tesseract === 'undefined') return;
  const progressBox = document.getElementById('ocrProgressBox');
  const statusText = document.getElementById('ocrStatusText');
  const percentText = document.getElementById('ocrPercentText');
  const progressBar = document.getElementById('ocrProgressBar');

  progressBox.classList.remove('hidden');
  statusText.textContent = 'Memindai struk dengan OCR...';

  try {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          percentText.textContent = `${pct}%`;
          progressBar.style.width = `${pct}%`;
        }
      }
    });

    const parsed = parseIndonesianReceipt(result.data.text || '');
    if (parsed.amount > 0) {
      document.getElementById('amountInput').value = parsed.amount.toLocaleString('id-ID');
    }
    if (parsed.merchant && !document.getElementById('descInput').value.trim()) {
      document.getElementById('descInput').value = parsed.merchant;
    }
    if (parsed.category && state.expenseCategories.includes(parsed.category)) {
      document.getElementById('selectedCategory').value = parsed.category;
      renderCategoryChips();
    }

    statusText.textContent = parsed.amount > 0
      ? `Terdeteksi: Rp ${parsed.amount.toLocaleString('id-ID')} (${parsed.category}) — silakan cek/adjust`
      : 'Foto tersimpan. Silakan isi atau sesuaikan nominal secara manual.';
    percentText.textContent = 'Selesai';
    progressBar.style.width = '100%';
  } catch (err) {
    statusText.textContent = 'Gagal membaca teks otomatis, silakan input manual.';
  }
}

function parseIndonesianReceipt(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const fullUpper = rawText.toUpperCase();

  let detectedAmount = 0;
  const totalKeywords = /(GRAND\s*TOTAL|TOTAL\s*BAYAR|TOTAL\s*BELANJA|TOTAL|JUMLAH|TAGIHAN|QRIS|DEBIT|TUNAI)/i;
  const numRegex = /(?:RP\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,8})/gi;

  for (const line of lines) {
    if (totalKeywords.test(line)) {
      const matches = [...line.matchAll(numRegex)];
      for (const m of matches) {
        const val = parseInt(m[1].replace(/[.,]/g, ''), 10);
        if (val >= 500 && val < 500000000 && val > detectedAmount) {
          detectedAmount = val;
        }
      }
    }
  }

  if (detectedAmount === 0) {
    const allMatches = [...rawText.matchAll(numRegex)];
    for (const m of allMatches) {
      const val = parseInt(m[1].replace(/[.,]/g, ''), 10);
      if (val >= 1000 && val < 100000000 && val > detectedAmount) {
        detectedAmount = val;
      }
    }
  }

  const merchantLine = lines.find(l => l.length >= 4 && !/^\d+$/.test(l)) || '';
  const merchant = merchantLine ? `Struk: ${merchantLine.slice(0, 48)}` : '';

  let category = 'Lainnya';
  if (/(KOPI|CAFE|RESTO|WARUNG|AYAM|NASI|MIE|BAKSO|SOTO|MAKAN|MINUM|TEH|FOOD|BREAD|BAKERY|MCD|KFC|STARBUCKS)/i.test(fullUpper)) {
    category = 'Makan & Minum';
  } else if (/(INDOMARET|ALFAMART|ALFAMIDI|SUPERINDO|HYPERMART|MINIMARKET|SWALAYAN|SABUN|BERAS|BELANJA)/i.test(fullUpper)) {
    category = 'Belanja Harian';
  } else if (/(PERTAMINA|SHELL|SPBU|PERTALITE|PERTAMAX|PARKIR|GRAB|GOJEK|TOL|KAI|BENSIN)/i.test(fullUpper)) {
    category = 'Transportasi';
  } else if (/(PLN|LISTRIK|PDAM|INDIHOME|TELKOMSEL|PULSA|TOKEN|INTERNET|TAGIHAN)/i.test(fullUpper)) {
    category = 'Tagihan & Utang';
  } else if (/(APOTEK|KIMIA FARMA|KLINIK|RUMAH SAKIT|OBAT|DOKTER)/i.test(fullUpper)) {
    category = 'Kesehatan';
  } else if (/(BIOSKOP|XXI|CGV|TIKET|GAME|NETFLIX|SPOTIFY)/i.test(fullUpper)) {
    category = 'Hiburan & Ngopi';
  }

  return { amount: detectedAmount, merchant, category };
}

// ==================== FORM SUBMISSION & GOOGLE SHEETS SYNC ====================
function resetDateTimeInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('dateTimeInput').value = now.toISOString().slice(0, 16);
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const rawAmount = document.getElementById('amountInput').value.replace(/\D/g, '');
  const amount = parseInt(rawAmount, 10);
  const category = document.getElementById('selectedCategory').value;
  const description = document.getElementById('descInput').value.trim();
  const timestamp = document.getElementById('dateTimeInput').value;

  if (!amount || amount <= 0) {
    showToast('Masukkan nominal transaksi yang valid.');
    return;
  }

  const txMonth = timestamp ? timestamp.slice(0, 7) : state.activeMonth;
  const newTx = {
    id: `tx-${Date.now()}`,
    month: txMonth,
    timestamp,
    type: state.txType,
    category,
    description,
    amount,
    photoData: state.currentPhotoBase64 || '',
    driveUrl: ''
  };

  state.transactions.unshift(newTx);
  persistTransactions();

  if (txMonth !== state.activeMonth) {
    state.activeMonth = txMonth;
    document.getElementById('monthPicker').value = txMonth;
  }

  renderAll();
  showToast(`${state.txType} Rp ${amount.toLocaleString('id-ID')} dicatat! Saldo diperbarui.`);

  document.getElementById('amountInput').value = '';
  document.getElementById('descInput').value = '';
  const photoToUpload = state.currentPhotoBase64;
  const photoNameToUpload = state.currentPhotoName;
  clearPhotoPreview();
  resetDateTimeInput();

  if (state.scriptUrl) {
    await pushTransactionToGoogleSheet(newTx, photoToUpload, photoNameToUpload);
  }
}

async function pushTransactionToGoogleSheet(tx, imageBase64, imageName) {
  const badge = document.getElementById('syncStatusBadge');
  badge.innerHTML = `<span class="status-dot"></span> Menyimpan ke Sheets & Drive...`;

  try {
    const payload = {
      action: 'add',
      id: tx.id,
      month: tx.month,
      timestamp: tx.timestamp.replace('T', ' '),
      type: tx.type,
      category: tx.category,
      description: tx.description,
      amount: tx.amount,
      imageBase64: imageBase64 || '',
      imageName: imageName || `${tx.month}_${tx.type}_${tx.id}.jpg`
    };

    const res = await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data && data.status === 'success') {
      if (data.driveUrl) {
        const idx = state.transactions.findIndex(t => t.id === tx.id);
        if (idx !== -1) {
          state.transactions[idx].driveUrl = data.driveUrl;
          persistTransactions();
          renderTransactions();
        }
      }
      updateSyncBadge(true);
      showToast(`Tersimpan ke tab Sheet "${tx.month}" & Google Drive!`);
    } else {
      throw new Error(data.message || 'Gagal sinkronisasi');
    }
  } catch (err) {
    updateSyncBadge(false);
    showToast('Tersimpan lokal (Gagal menghubungi Google Sheets URL).');
  }
}

async function fetchMonthFromGoogleSheet(monthStr) {
  if (!state.scriptUrl) return;
  const badge = document.getElementById('syncStatusBadge');
  badge.innerHTML = `<span class="status-dot"></span> Memuat tab ${monthStr}...`;

  try {
    const url = `${state.scriptUrl}?action=get&month=${encodeURIComponent(monthStr)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.status === 'success' && Array.isArray(data.records)) {
      const localOtherMonths = state.transactions.filter(t => t.month !== monthStr);
      const localMap = new Map(state.transactions.map(t => [t.id, t]));

      const mergedMonth = data.records.map(r => {
        const existing = localMap.get(r.id);
        return {
          id: r.id || `sheet-${Math.random().toString(36).slice(2, 9)}`,
          month: monthStr,
          timestamp: r.timestamp,
          type: r.type,
          category: r.category,
          description: r.description,
          amount: Number(r.amount) || 0,
          photoData: existing ? existing.photoData : (r.drivePreviewUrl || ''),
          driveUrl: r.driveUrl || ''
        };
      });

      state.transactions = [...mergedMonth.reverse(), ...localOtherMonths];
      persistTransactions();
      renderAll();
      updateSyncBadge(true);
    }
  } catch (err) {
    updateSyncBadge(false);
  }
}
async function deleteTransactionFromGoogleSheet(id, month) {
  try {
    const res = await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', id, month })
    });
    const data = await res.json();
    if (data && data.status === 'success') {
      showToast(`Baris di tab Sheet "${month}" ikut terhapus!`);
    }
  } catch (err) {
    showToast('Dihapus di aplikasi (Gagal menghapus baris di Google Sheets).');
  }
}

function updateSyncBadge(connected = Boolean(state.scriptUrl)) {
  const badge = document.getElementById('syncStatusBadge');
  if (!state.scriptUrl) {
    badge.className = 'brand-tag';
    badge.innerHTML = `<span class="status-dot"></span> Mode Lokal`;
  } else if (connected) {
    badge.className = 'brand-tag synced';
    badge.innerHTML = `<span class="status-dot"></span> Sheets & Drive Aktif`;
  } else {
    badge.className = 'brand-tag';
    badge.innerHTML = `<span class="status-dot"></span> Offline / Cek URL`;
  }
}

// ==================== RENDERING SUMMARY & TRANSACTIONS ====================
function renderAll() {
  document.querySelectorAll('.active-sheet-name').forEach(el => el.textContent = state.activeMonth);
  renderSummaryCards();
  renderBreakdown();
  renderTransactions();
}

function getMonthTransactions() {
  return state.transactions.filter(t => t.month === state.activeMonth);
}

function renderSummaryCards() {
  const monthTx = getMonthTransactions();
  let totalIncome = 0;
  let totalExpense = 0;
  let incCount = 0;
  let expCount = 0;

  monthTx.forEach(t => {
    if (t.type === 'Pemasukan') {
      totalIncome += t.amount;
      incCount++;
    } else {
      totalExpense += t.amount;
      expCount++;
    }
  });

  const balance = totalIncome - totalExpense;
  document.getElementById('balanceAmount').textContent = formatRupiah(balance);
  document.getElementById('totalIncomeAmount').textContent = formatRupiah(totalIncome);
  document.getElementById('totalExpenseAmount').textContent = formatRupiah(totalExpense);
  document.getElementById('incomeCountLabel').textContent = `${incCount} transaksi masuk`;
  document.getElementById('expenseCountLabel').textContent = `${expCount} transaksi keluar (tanpa limit)`;
}

function renderBreakdown() {
  const expenses = getMonthTransactions().filter(t => t.type === 'Pengeluaran');
  const card = document.getElementById('breakdownCard');
  if (expenses.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  const totals = {};
  let grand = 0;
  expenses.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
    grand += e.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  document.getElementById('topCategoryLabel').innerHTML = `Terbesar: <strong>${top[0]} (${Math.round((top[1] / grand) * 100)}%)</strong>`;

  const palette = ['#f43f5e', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4', '#64748b'];
  const bar = document.getElementById('breakdownBar');
  bar.innerHTML = sorted.map(([cat, val], idx) => {
    const pct = (val / grand) * 100;
    return `<div class="breakdown-seg" style="width:${pct}%;background:${palette[idx % palette.length]}" title="${cat}: ${formatRupiah(val)}"></div>`;
  }).join('');
}

function renderTransactions() {
  const container = document.getElementById('transactionList');
  let list = getMonthTransactions();

  if (state.filterType === 'Pemasukan' || state.filterType === 'Pengeluaran') {
    list = list.filter(t => t.type === state.filterType);
  } else if (state.filterType === 'PHOTO') {
    list = list.filter(t => Boolean(t.photoData || t.driveUrl));
  }

  if (state.searchQuery) {
    list = list.filter(t =>
      t.description.toLowerCase().includes(state.searchQuery) ||
      t.category.toLowerCase().includes(state.searchQuery)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="folder-open"></i>
        <p>Belum ada catatan transaksi di tab bulan <strong>${state.activeMonth}</strong>.</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = '';
  list.forEach(tx => {
    const isIncome = tx.type === 'Pemasukan';
    const hasImg = Boolean(tx.photoData);
    const item = document.createElement('div');
    item.className = 'tx-item';

    const thumbHtml = hasImg
      ? `<img src="${tx.photoData}" alt="Dokumentasi" class="tx-thumb" data-txid="${tx.id}" title="Klik untuk perbesar dokumentasi" />`
      : `<div class="tx-icon-fallback ${isIncome ? 'income-bg' : 'expense-bg'}">
           <i data-lucide="${isIncome ? 'arrow-down-left' : 'shopping-bag'}"></i>
         </div>`;

    const driveBadge = tx.driveUrl
      ? `<a href="${tx.driveUrl}" target="_blank" rel="noopener" class="tx-cat-badge" style="color:var(--accent);text-decoration:none;">Drive ↗</a>`
      : '';

    item.innerHTML = `
      <div class="tx-left">
        ${thumbHtml}
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(tx.description)}</div>
          <div class="tx-meta">
            <span class="tx-cat-badge">${escapeHtml(tx.category)}</span>
            <span>${formatDisplayTime(tx.timestamp)}</span>
            ${driveBadge}
          </div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${isIncome ? 'text-income' : 'text-expense'}">
          ${isIncome ? '+' : '-'}${formatRupiah(tx.amount)}
        </div>
        <div class="tx-actions">
          <button type="button" class="tx-mini-btn" data-del="${tx.id}" title="Hapus dari tampilan lokal">
            <i data-lucide="trash-2" style="width:12px;height:12px;"></i> Hapus
          </button>
        </div>
      </div>
    `;

    container.appendChild(item);
  });

  container.querySelectorAll('.tx-thumb').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.dataset.txid));
  });
container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Warning ke-1 (di halaman): tombol berubah menjadi "Yakin Hapus?" selama 3 detik
      if (btn.dataset.confirming !== 'true') {
        btn.dataset.confirming = 'true';
        btn.style.color = 'var(--expense)';
        btn.style.fontWeight = '700';
        btn.textContent = 'Yakin Hapus?';

        setTimeout(() => {
          if (document.body.contains(btn)) {
            btn.dataset.confirming = 'false';
            btn.style.color = '';
            btn.style.fontWeight = '';
            btn.innerHTML = `<i data-lucide="trash-2" style="width:12px;height:12px;"></i> Hapus`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        }, 3000);
        return;
      }

      // Warning ke-2 (pop-up): konfirmasi akhir sebelum menghapus permanen
      const id = btn.dataset.del;
      const targetTx = state.transactions.find(t => t.id === id);
      if (!targetTx) return;

      const yakinHapus = confirm(
        `Hapus permanen transaksi "${targetTx.description}" (${formatRupiah(targetTx.amount)})?\n\nBaris data di Google Sheets juga akan ikut terhapus.`
      );
      if (!yakinHapus) return;

      // Eksekusi hapus di aplikasi & Google Sheets
      state.transactions = state.transactions.filter(t => t.id !== id);
      persistTransactions();
      renderAll();
      showToast('Transaksi dihapus.');

      if (state.scriptUrl) {
        await deleteTransactionFromGoogleSheet(targetTx.id, targetTx.month);
      }
    });
  });

// ==================== SETTINGS, LIGHTBOX & EXPORT ====================
function openSettingsModal() {
  document.getElementById('appsScriptUrlInput').value = state.scriptUrl;
  document.getElementById('newPinInput').value = '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function saveSettings() {
  const urlVal = document.getElementById('appsScriptUrlInput').value.trim();
  const pinVal = document.getElementById('newPinInput').value.trim();

  if (pinVal) {
    if (!/^\d{6}$/.test(pinVal)) {
      showToast('PIN baru harus tepat 6 digit angka.');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.PIN, pinVal);
  }

  state.scriptUrl = urlVal;
  localStorage.setItem(STORAGE_KEYS.SCRIPT_URL, urlVal);
  updateSyncBadge();
  document.getElementById('settingsModal').classList.add('hidden');
  showToast('Pengaturan disimpan!');

  if (urlVal) {
    fetchMonthFromGoogleSheet(state.activeMonth);
  }
}

function openLightbox(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx || !tx.photoData) return;

  document.getElementById('lightboxTitle').textContent = tx.description;
  document.getElementById('lightboxMeta').textContent = `${tx.type} • ${tx.category} • ${formatDisplayTime(tx.timestamp)}`;
  document.getElementById('lightboxImg').src = tx.photoData;
  document.getElementById('lightboxAmount').textContent = `${tx.type === 'Pemasukan' ? '+' : '-'}${formatRupiah(tx.amount)}`;

  const driveBtn = document.getElementById('lightboxDriveLink');
  if (tx.driveUrl) {
    driveBtn.href = tx.driveUrl;
    driveBtn.classList.remove('hidden');
  } else {
    driveBtn.classList.add('hidden');
  }

  document.getElementById('lightboxModal').classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function exportCurrentMonthCSV() {
  const rows = getMonthTransactions();
  if (rows.length === 0) {
    showToast('Tidak ada data di bulan ini untuk diekspor.');
    return;
  }

  const header = ['Timestamp', 'Tipe', 'Kategori', 'Keterangan', 'Nominal', 'Link Dokumentasi'];
  const csvLines = [
    header.join(','),
    ...rows.map(r => [
      `"${r.timestamp}"`,
      `"${r.type}"`,
      `"${r.category.replace(/"/g, '""')}"`,
      `"${r.description.replace(/"/g, '""')}"`,
      r.amount,
      `"${r.driveUrl || ''}"`
    ].join(','))
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Keuangan_${state.activeMonth}.csv`;
  a.click();
  showToast(`File Keuangan_${state.activeMonth}.csv diunduh!`);
}

// ==================== HELPERS ====================
function formatRupiah(num) {
  const sign = num < 0 ? '-' : '';
  return `${sign}Rp ${Math.abs(num).toLocaleString('id-ID')}`;
}

function formatDisplayTime(ts) {
  if (!ts) return '-';
  return ts.replace('T', ' ');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
