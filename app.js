// app.js — DOM/UI orchestration only. Parsing, assignment, personas, Product Truth,
// and script generation stay in core/config files so tests can run without a DOM.

const input = document.getElementById('rawInput');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
const pageTitle = document.getElementById('pageTitle');
const pageDescription = document.getElementById('pageDescription');
const accountSelect = document.getElementById('accountSelect');
const liveDateInput = document.getElementById('liveDate');
const startTimeInput = document.getElementById('startTime');
const autoPatternInput = document.getElementById('autoPattern');
const manualPatternSelect = document.getElementById('manualPattern');
const assignmentPanel = document.getElementById('assignmentPanel');

const state = {
  activeBrandId: 'skinoxy',
  brands: [],
  allBrands: [],
  brandStyles: {},
  knowledgeByBrand: {},
  currentPromos: [],
  currentMode: 'assigned',
  lastPackages: []
};

initApp();

document.getElementById('loadSample').addEventListener('click', async () => {
  const brand = getActiveBrand();
  if (!brand?.sample_file) return;
  setStatus('Parsing: กำลังโหลดตัวอย่าง...');
  const res = await fetch(brand.sample_file);
  input.value = await res.text();
  setStatus(`Ready: โหลดตัวอย่าง ${brand.label} แล้ว`);
});

document.getElementById('generateAssigned').addEventListener('click', async () => {
  await generateScripts('assigned');
});

document.getElementById('generateAll').addEventListener('click', async () => {
  await generateScripts('review');
});

document.getElementById('uploadImage').addEventListener('click', () => {
  document.getElementById('imageInput').click();
});

document.getElementById('copyAll').addEventListener('click', async () => {
  const text = [...document.querySelectorAll('.main-script-output')]
    .map(x => x.innerText.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (!text) return setStatus('Warning: ยังไม่มีสคริปต์ให้คัดลอก');
  await navigator.clipboard.writeText(text);
  setStatus('Copy successful: คัดลอก Main Spoken Script ทั้งหมดแล้ว');
});

accountSelect.addEventListener('change', async () => {
  state.activeBrandId = accountSelect.value;
  state.currentPromos = [];
  state.lastPackages = [];
  results.innerHTML = '';
  applyBrandUI();
  await loadKnowledgeForBrand(state.activeBrandId);
  updateAssignmentPanel();
  setStatus(`Ready: เลือก Account ${getActiveBrand()?.label || ''} แล้ว`);
});

[liveDateInput, startTimeInput, autoPatternInput, manualPatternSelect].forEach(el => {
  el.addEventListener('change', () => {
    if (el === manualPatternSelect && manualPatternSelect.value) autoPatternInput.checked = false;
    updateAssignmentPanel();
  });
});

const cropModal = document.getElementById('cropModal');
const cropCanvas = document.getElementById('cropCanvas');
const cropCtx = cropCanvas.getContext('2d');
let cropSourceImage = null;
let cropDisplayScale = 1;
let cropSelection = null;
let cropDragStart = null;

document.getElementById('imageInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  cropSourceImage = await loadImageFromFile(file);
  const maxDisplayWidth = Math.max(280, Math.min(820, window.innerWidth - 80));
  cropDisplayScale = cropSourceImage.width > maxDisplayWidth ? maxDisplayWidth / cropSourceImage.width : 1;
  cropCanvas.width = Math.round(cropSourceImage.width * cropDisplayScale);
  cropCanvas.height = Math.round(cropSourceImage.height * cropDisplayScale);
  cropSelection = null;
  drawCropCanvas();
  cropModal.hidden = false;
});

function drawCropCanvas(){
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.drawImage(cropSourceImage, 0, 0, cropCanvas.width, cropCanvas.height);
  if (cropSelection) {
    cropCtx.strokeStyle = '#ee4d2d';
    cropCtx.lineWidth = 2;
    cropCtx.strokeRect(cropSelection.x, cropSelection.y, cropSelection.w, cropSelection.h);
    cropCtx.fillStyle = 'rgba(238,77,45,0.15)';
    cropCtx.fillRect(cropSelection.x, cropSelection.y, cropSelection.w, cropSelection.h);
  }
}

function getCropCanvasPoint(event){
  const rect = cropCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(cropCanvas.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(cropCanvas.height, event.clientY - rect.top))
  };
}

cropCanvas.addEventListener('mousedown', (event) => {
  cropDragStart = getCropCanvasPoint(event);
  cropSelection = { x: cropDragStart.x, y: cropDragStart.y, w: 0, h: 0 };
});

cropCanvas.addEventListener('mousemove', (event) => {
  if (!cropDragStart) return;
  const point = getCropCanvasPoint(event);
  cropSelection = {
    x: Math.min(cropDragStart.x, point.x),
    y: Math.min(cropDragStart.y, point.y),
    w: Math.abs(point.x - cropDragStart.x),
    h: Math.abs(point.y - cropDragStart.y)
  };
  drawCropCanvas();
});

window.addEventListener('mouseup', () => {
  cropDragStart = null;
});

document.getElementById('cropCancel').addEventListener('click', () => {
  cropModal.hidden = true;
  cropSourceImage = null;
});

document.getElementById('cropUseWhole').addEventListener('click', async () => {
  const img = cropSourceImage;
  cropModal.hidden = true;
  if (!img) return;
  await runOcrOn(img, img.width, img.height);
});

document.getElementById('cropExtract').addEventListener('click', async () => {
  const img = cropSourceImage;
  const selection = cropSelection;
  cropModal.hidden = true;
  if (!img) return;

  if (!selection || selection.w < 10 || selection.h < 10) {
    await runOcrOn(img, img.width, img.height);
    return;
  }

  const sx = selection.x / cropDisplayScale;
  const sy = selection.y / cropDisplayScale;
  const sw = selection.w / cropDisplayScale;
  const sh = selection.h / cropDisplayScale;

  const cropped = document.createElement('canvas');
  cropped.width = Math.round(sw);
  cropped.height = Math.round(sh);
  cropped.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cropped.width, cropped.height);

  await runOcrOn(cropped, cropped.width, cropped.height);
});

function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function preprocessDrawableForOcr(drawable, sourceWidth, sourceHeight){
  const scale = sourceWidth < 1200 ? Math.min(2, 1600 / sourceWidth) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const contrasted = gray < 140 ? Math.max(0, gray - 30) : Math.min(255, gray + 40);
    d[i] = d[i + 1] = d[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function runOcrOn(drawable, sourceWidth, sourceHeight){
  setStatus('Parsing: กำลังปรับภาพและอ่านข้อความ...');
  if (typeof Tesseract === 'undefined') {
    setStatus('Warning: OCR runtime ยังโหลดไม่สำเร็จ โปรดเช็กอินเทอร์เน็ตหรือวางข้อความโปรโมชั่นเองก่อน');
    return;
  }
  try {
    const preprocessed = preprocessDrawableForOcr(drawable, sourceWidth, sourceHeight);
    const { data } = await Tesseract.recognize(preprocessed, 'tha+eng', {
      logger: info => {
        if (info.status === 'recognizing text') {
          setStatus(`Parsing: กำลังอ่านข้อความจากรูป... ${Math.round(info.progress * 100)}%`);
        }
      }
    });
    const text = data.text.trim();
    if (!text) {
      setStatus('Warning: อ่านรูปแล้วแต่ไม่พบข้อความ ลองเลือกพื้นที่ให้ตรงตัวหนังสือมากขึ้น');
      return;
    }
    input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text;
    const confidence = Math.round(data.confidence);
    setStatus(confidence < 60
      ? `Warning: ถอดข้อความแล้วแต่ความมั่นใจต่ำ (${confidence}%) ตรวจทานก่อน Generate`
      : `Ready: ถอดข้อความจากรูปแล้ว (ความมั่นใจ ${confidence}%)`);
  } catch (error) {
    setStatus(`Warning: อ่านรูปไม่สำเร็จ: ${error.message}`);
  }
}

async function initApp(){
  await loadBrandConfig();
  setDefaultDate();
  renderAccountSelector();
  applyBrandUI();
  updateAssignmentPanel();
  await loadKnowledgeForBrand(state.activeBrandId);
  setStatus('Ready');
}

function setDefaultDate(){
  if (!liveDateInput.value) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    liveDateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

async function loadBrandConfig(){
  try {
    const [brandsRes, stylesRes] = await Promise.all([
      fetch('data/brands.json'),
      fetch('data/brand-styles.json')
    ]);
    const brandsConfig = await brandsRes.json();
    const configAccounts = Array.isArray(LSG_ACCOUNTS) ? LSG_ACCOUNTS : [];
    const brandsFromData = brandsConfig.brands || [];
    state.allBrands = configAccounts.length
      ? configAccounts.map(account => ({ ...(brandsFromData.find(item => item.id === account.id) || {}), ...account }))
      : brandsFromData;
    state.brands = state.allBrands.filter(brand => brand.primary !== false);
    state.activeBrandId = brandsConfig.default_brand_id || state.brands[0]?.id || 'skinoxy';
    state.brandStyles = await stylesRes.json();
  } catch (error) {
    state.allBrands = Array.isArray(LSG_ACCOUNTS) ? LSG_ACCOUNTS : [];
    state.brands = state.allBrands.filter(brand => brand.primary !== false);
    state.activeBrandId = state.brands[0]?.id || 'skinoxy';
    state.brandStyles = {};
  }
}

async function loadKnowledgeForBrand(brandId){
  if (state.knowledgeByBrand[brandId]) return state.knowledgeByBrand[brandId];
  const brand = state.allBrands.find(item => item.id === brandId);
  const knowledgeFile = brand?.knowledge_file || 'skinoxy-products.json';

  try {
    const res = await fetch(`data/${knowledgeFile}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.knowledgeByBrand[brandId] = await res.json();
  } catch (error) {
    state.knowledgeByBrand[brandId] = {
      brand_id: brand?.knowledge_brand_id || brandId,
      brand: brand?.label || brandId,
      products: [],
      language_rules: {
        basket_word: 'ตะกร้า',
        forbidden_terms: ['ตะกร้าสีเหลือง', 'ครับ', 'ค่ะ', 'นะครับ', 'นะคะ']
      },
      loadError: error.message
    };
  }

  return state.knowledgeByBrand[brandId];
}

function getActiveBrand(){
  return state.allBrands.find(item => item.id === state.activeBrandId) || state.brands[0];
}

function getActiveStyle(){
  return state.brandStyles[state.activeBrandId] || {};
}

function renderAccountSelector(){
  accountSelect.innerHTML = '';
  state.brands.forEach(brand => {
    const option = document.createElement('option');
    option.value = brand.id;
    option.textContent = brand.label;
    accountSelect.appendChild(option);
  });
  accountSelect.value = state.activeBrandId;
}

function applyBrandUI(){
  const brand = getActiveBrand();
  const style = getActiveStyle();
  if (!brand) return;

  pageTitle.textContent = brand.title || 'Live Script Generator';
  pageDescription.textContent = brand.description || '';
  input.placeholder = brand.placeholder || 'วางข้อมูลโปรโมชั่นที่นี่...';
  document.body.dataset.brand = brand.id;
  document.body.dataset.platform = brand.platform || 'tiktok';

  Object.entries({
    '--accent': style.accent,
    '--accent-soft': style.accent_soft,
    '--surface': style.surface,
    '--page': style.page,
    '--text': style.text,
    '--muted': style.muted,
    '--border': style.border
  }).forEach(([key, value]) => {
    if (value) document.documentElement.style.setProperty(key, value);
  });
}

function getCurrentAssignment(){
  const brand = getActiveBrand();
  const manual = manualPatternSelect.value;
  return resolveAssignedPattern({
    account: brand,
    platform: brand?.platform,
    liveDate: liveDateInput.value,
    startTime: startTimeInput.value,
    manualPattern: manual,
    autoPattern: autoPatternInput.checked && !manual
  });
}

function updateAssignmentPanel(){
  const brand = getActiveBrand();
  if (!brand) return;
  const assignment = getCurrentAssignment();
  const pattern = assignment.assigned_pattern ? getPatternForUi(assignment.assigned_pattern) : null;
  const profile = getCommunicationProfile(brand.id, brand.platform, assignment.test_block);
  assignmentPanel.className = `assignment-panel ${assignment.warning ? 'has-warning' : ''}`;
  assignmentPanel.innerHTML = `
    <div><strong>Account</strong><span>${escapeHtml(brand.label)}</span></div>
    <div><strong>Platform</strong><span>${escapeHtml((PLATFORM_PERSONAS[brand.platform]?.label || brand.platform || '-'))}</span></div>
    <div><strong>Live Date</strong><span>${escapeHtml(liveDateInput.value || '-')}</span></div>
    <div><strong>Start Time</strong><span>${escapeHtml(startTimeInput.value || '-')}</span></div>
    <div><strong>Test Block</strong><span>${escapeHtml(assignment.test_block || '-')}</span></div>
    <div><strong>Assigned Pattern</strong><span>${escapeHtml(assignment.assigned_pattern || 'Manual required')}</span></div>
    <div><strong>Pattern Style</strong><span>${escapeHtml(pattern?.style || assignment.pattern_style || '-')}</span></div>
    <div><strong>Mode</strong><span>${escapeHtml(assignment.pattern_source || 'AUTO')}</span></div>
    <div class="wide"><strong>Communication</strong><span>${escapeHtml(profile.label || '-')} · ${escapeHtml((profile.communication || []).join(' · '))}</span></div>
    ${assignment.warning ? `<div class="wide warning-inline"><strong>Warning</strong><span>${escapeHtml(assignment.warning)}</span></div>` : ''}
  `;
}

function getPatternForUi(patternKey){
  return SELLING_PATTERNS[patternKey] || { key: patternKey, style: '', short_name: patternKey };
}

async function generateScripts(mode){
  const raw = input.value.trim();
  if (!raw) return setStatus('Warning: กรุณาวางข้อมูลโปรโมชั่นก่อน');

  const brand = getActiveBrand();
  const assignment = getCurrentAssignment();
  if (mode === 'assigned' && !assignment.assigned_pattern) {
    updateAssignmentPanel();
    return setStatus('Warning: ยังไม่มี Assigned Pattern กรุณาเลือก Manual Override ก่อน Generate');
  }

  setStatus('Parsing: กำลังแยกโปรโมชั่น...');
  const knowledge = await loadKnowledgeForBrand(state.activeBrandId);
  const promos = splitPromotions(raw).map((text, index) =>
    parsePromotion(text, index, knowledge, brand, getActiveStyle())
  );

  setStatus('Generating: กำลังสร้างสคริปต์...');
  state.currentPromos = promos;
  state.currentMode = mode;
  render(promos, mode, assignment);
  const warningCount = state.lastPackages.filter(item => item.validationNotes.length).length;
  const blockedCount = state.lastPackages.filter(item => item.generationBlocked).length;
  setStatus(blockedCount
    ? `Blocked: มี ${blockedCount} รายการที่ Product Truth ขัดแย้ง กรุณาแก้ Input หรือยืนยันข้อมูลก่อน`
    : warningCount
    ? `Warning: Generated ${promos.length} โปรโมชั่น มี ${warningCount} รายการที่ข้อมูลต้องตรวจทาน`
    : `Generated: สร้างสคริปต์ ${promos.length} โปรโมชั่นสำหรับ ${brand.label} แล้ว`);
}

function setStatus(msg){
  statusEl.textContent = msg;
}

function render(promos, mode, assignment){
  results.innerHTML = '';
  state.lastPackages = [];
  const patterns = mode === 'review' ? STRATEGIES : [assignment.assigned_pattern];

  promos.forEach(p => {
    patterns.filter(Boolean).forEach(patternKey => {
      const hookVariant = p.hookVariants?.[patternKey] || 0;
      const packageItem = createScriptPackage(p, patternKey, {
        liveDate: liveDateInput.value,
        startTime: startTimeInput.value,
        assignment: mode === 'review'
          ? { ...assignment, assigned_pattern: patternKey, pattern_source: 'MANUAL' }
          : assignment,
        patternSource: mode === 'review' ? 'MANUAL' : assignment.pattern_source,
        hookVariant
      });
      state.lastPackages.push(packageItem);
      results.appendChild(renderScriptCard(p, packageItem, mode));
    });
  });
}

function renderScriptCard(p, packageItem, mode){
  const card = document.createElement('article');
  const pattern = packageItem.metadata.assignedPattern;
  card.className = `card script-card pattern-${pattern.toLowerCase()}`;
  const metadataJson = JSON.stringify(packageItem.metadata, null, 2);
  const script = packageItem.mainSpokenScript;
  const sections = [script.section1, script.section2, script.section3];
  const exportJson = JSON.stringify({
    metadata: packageItem.metadata,
    productTruth: packageItem.productTruth,
    promotionSummary: packageItem.promotionSummary,
    mainSpokenScript: packageItem.mainSpokenScript,
    qAndA: packageItem.qAndA,
    policySafeGuide: packageItem.policySafeGuide,
    producerPushLine: packageItem.producerPushLine,
    producerNotes: packageItem.producerNotes,
    validationNotes: packageItem.validationNotes
  }, null, 2);

  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="brand-label">${escapeHtml(packageItem.metadata.account)} · Pattern ${escapeHtml(pattern)} · ${escapeHtml(packageItem.metadata.estimatedSpeakingTime || '')}</p>
        <h2>โปรโมชั่นที่ ${p.index}: ${escapeHtml(p.title || 'ไม่ระบุชื่อโปร')}</h2>
      </div>
      <div class="card-actions">
        <button class="generate-again" data-promo-index="${p.index}" data-pattern="${pattern}">Generate Again</button>
        <button class="copy-main">Copy Full Pattern</button>
        <button class="copy-shortloop">Copy Short Loop</button>
        <button class="copy-truth">Copy Product Truth</button>
        <button class="copy-metadata">Copy Metadata</button>
        <button class="copy-form">Copy All as Form</button>
        <button class="print-form">Print / Form View</button>
        <button class="export-json">Export JSON</button>
        <button class="export-gdoc">Export to Google Doc</button>
      </div>
    </div>

    <div class="script-meta">
      ${Object.entries(packageItem.metadata).map(([key, value]) => `
        <div><strong>${escapeHtml(key)}</strong><br>${escapeHtml(value || '-')}</div>
      `).join('')}
    </div>

    <div class="summary-box">
      <h3>Promotion Summary</h3>
      <p>${escapeHtml(packageItem.promotionSummary.join(' · '))}</p>
    </div>

    <div class="section-tabs" role="tablist">
      ${sections.map((section, index) => `
        <button type="button" class="section-tab${index === 0 ? ' active' : ''}" data-section-index="${index}">
          Section ${index + 1}: ${escapeHtml(section.title)}${section.estimatedMinutes != null ? ` (~${section.estimatedMinutes} นาที)` : ''}
        </button>
      `).join('')}
    </div>

    ${sections.map((section, index) => `
      <div class="main-copy-box section-panel" data-section-index="${index}" ${index === 0 ? '' : 'hidden'}>
        <div class="section-panel-header">
          <h3>Section ${index + 1}: ${escapeHtml(section.title)}</h3>
          <button class="copy-section" data-section-index="${index}">Copy Section ${index + 1}</button>
        </div>
        <pre class="main-script-output">${escapeHtml(section.text)}</pre>
        ${section.warning ? `<p class="section-warning">⚠ ${escapeHtml(section.warning)}</p>` : ''}
      </div>
    `).join('')}

    <details class="supporting-copy">
      <summary>Short Loop, Q&amp;A, Policy-Safe Guide, Producer Notes และ Validation Notes</summary>
      <h4>Short Loop (30s)</h4>
      <pre>${escapeHtml(script.shortLoop30)}</pre>
      <h4>Short Loop (90s)</h4>
      <pre>${escapeHtml(script.shortLoop90)}</pre>
      <h4>Q&amp;A</h4>
      <pre>${escapeHtml((packageItem.qAndA || []).map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n') || 'ไม่มี')}</pre>
      <h4>Policy-Safe Guide</h4>
      <pre>${escapeHtml((packageItem.policySafeGuide || []).join('\n') || 'ไม่มี')}</pre>
      <h4>Producer Push Line</h4>
      <pre>${escapeHtml(packageItem.producerPushLine)}</pre>
      <h4>Producer Notes</h4>
      <pre>${escapeHtml(packageItem.producerNotes.join('\n'))}</pre>
      <h4>Validation Notes</h4>
      <pre>${escapeHtml(packageItem.validationNotes.length ? packageItem.validationNotes.join('\n') : 'ไม่มี')}</pre>
    </details>
  `;

  card.querySelectorAll('.section-tab').forEach(tabButton => {
    tabButton.addEventListener('click', () => {
      const index = tabButton.dataset.sectionIndex;
      card.querySelectorAll('.section-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.sectionIndex === index));
      card.querySelectorAll('.section-panel').forEach(panel => {
        panel.hidden = panel.dataset.sectionIndex !== index;
      });
    });
  });

  card.querySelectorAll('.copy-section').forEach(button => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.sectionIndex);
      await navigator.clipboard.writeText(sections[index].text);
      setStatus(`Copy successful: คัดลอก Section ${index + 1} ของ ${packageItem.metadata.scriptId} แล้ว`);
    });
  });

  card.querySelector('.copy-main').addEventListener('click', async () => {
    await navigator.clipboard.writeText(script.fullText);
    setStatus(`Copy successful: คัดลอก Full Pattern ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.copy-shortloop').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`Short Loop (30s)\n${script.shortLoop30}\n\nShort Loop (90s)\n${script.shortLoop90}`);
    setStatus(`Copy successful: คัดลอก Short Loop ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.copy-truth').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(packageItem.productTruth, null, 2));
    setStatus(`Copy successful: คัดลอก Product Truth ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.copy-metadata').addEventListener('click', async () => {
    await navigator.clipboard.writeText(metadataJson);
    setStatus(`Copy successful: คัดลอก Metadata ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.copy-form').addEventListener('click', async () => {
    await navigator.clipboard.writeText(packageItem.fullText);
    setStatus(`Copy successful: คัดลอก Form เต็มของ ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.print-form').addEventListener('click', () => {
    openPrintFormView(p, packageItem);
  });

  card.querySelector('.export-json').addEventListener('click', () => {
    const blob = new Blob([exportJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${packageItem.metadata.scriptId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Generated: Export JSON ${packageItem.metadata.scriptId} แล้ว`);
  });

  card.querySelector('.export-gdoc').addEventListener('click', () => {
    exportToGoogleDoc(packageItem);
  });

  card.querySelector('.generate-again').addEventListener('click', () => {
    const patternKey = pattern;
    p.hookVariants[patternKey] = (p.hookVariants[patternKey] || 0) + 1;
    render(state.currentPromos, state.currentMode, getCurrentAssignment());
    setStatus(`Generated: Generate Again โปรโมชั่นที่ ${p.index} Pattern ${patternKey} แล้ว`);
  });

  return card;
}

function openPrintFormView(p, packageItem){
  const script = packageItem.mainSpokenScript;
  const sections = [script.section1, script.section2, script.section3];
  const metadataRows = Object.entries(packageItem.metadata)
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value || '-')}</td></tr>`)
    .join('');
  const sectionsHtml = sections.map((section, index) => `
    <section class="print-section">
      <h3>Section ${index + 1}: ${escapeHtml(section.title)}${section.estimatedMinutes != null ? ` (~${section.estimatedMinutes} นาที)` : ''}</h3>
      <p class="print-script-block">${escapeHtml(section.text).replace(/\n/g, '<br>')}</p>
    </section>
  `).join('<div class="print-page-break"></div>');
  const qaHtml = (packageItem.qAndA || []).map(item => `<p><strong>Q:</strong> ${escapeHtml(item.question)}<br><strong>A:</strong> ${escapeHtml(item.answer)}</p>`).join('') || '<p>ไม่มี</p>';
  const policyHtml = (packageItem.policySafeGuide || []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>ไม่มี</li>';

  const doc = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>${escapeHtml(packageItem.metadata.scriptId)} — Print / Form View</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 24px; }
  h3 { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 12px; vertical-align: top; }
  th { width: 32%; background: #f5f5f5; }
  .print-script-block { background: #fafafa; border: 1px solid #ddd; padding: 12px 14px; border-radius: 6px; white-space: pre-wrap; }
  .print-page-break { page-break-after: always; }
  ul { padding-left: 20px; }
  .print-summary { font-size: 13px; color: #333; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:16px;">Print</button>
  <h1>${escapeHtml(packageItem.metadata.promotionTitle)}</h1>
  <p class="print-summary">${escapeHtml(packageItem.metadata.account)} · ${escapeHtml(packageItem.metadata.platform)} · Pattern ${escapeHtml(packageItem.metadata.assignedPattern)} · ${escapeHtml(packageItem.metadata.estimatedSpeakingTime)}</p>

  <h2>Script Metadata</h2>
  <table>${metadataRows}</table>

  <h2>Promotion Summary (ตารางสรุปโปรโมชั่นก่อน On Air)</h2>
  <p class="print-summary">${escapeHtml(packageItem.promotionSummary.join(' · '))}</p>

  <h2>Main Spoken Script — 3 Sections</h2>
  ${sectionsHtml}

  <h2>Closing Loop</h2>
  <p><strong>Short Loop 30s:</strong> ${escapeHtml(script.shortLoop30)}</p>
  <p><strong>Short Loop 90s:</strong> ${escapeHtml(script.shortLoop90)}</p>

  <h2>Q&amp;A</h2>
  ${qaHtml}

  <h2>Team Notes / Policy-Safe Guide</h2>
  <ul>${policyHtml}</ul>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    setStatus('Warning: เบราว์เซอร์บล็อก Popup กรุณาอนุญาต Popup แล้วลองใหม่');
    return;
  }
  printWindow.document.write(doc);
  printWindow.document.close();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

// ---------------------------------------------------------------------------
// Export to Google Doc — creates a brand-new Google Doc (via Google Docs API)
// containing the full Pattern (Section 1/2/3 spoken script only — no producer
// notes, no metadata, no internal labels) and opens it in a new tab.
//
// Setup required once, in Google Cloud Console:
//   1. Create/select a project -> APIs & Services -> Library ->
//      enable "Google Docs API" and "Google Drive API".
//   2. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
//      -> Application type: Web application.
//   3. Under "Authorized JavaScript origins" add this site's exact origin
//      (e.g. https://towtongisgod.github.io — no trailing slash, no path).
//   4. Copy the Client ID into config/google-integration.js (GOOGLE_DOCS_CONFIG.clientId).
//   5. OAuth consent screen: while unpublished ("Testing"), add your own
//      Google account under "Test users" or the export button will fail to
//      authorize for anyone else.
// The drive.file scope only grants access to files this app itself creates —
// it never sees the rest of the signed-in user's Drive.
// ---------------------------------------------------------------------------
const googleAuthState = { tokenClient: null, accessToken: null, expiresAt: 0 };

function getGoogleDocsConfig(){
  return (typeof GOOGLE_DOCS_CONFIG !== 'undefined' && GOOGLE_DOCS_CONFIG) || { clientId: '', scopes: '' };
}

function ensureGoogleAccessToken(){
  const config = getGoogleDocsConfig();
  if (!config.clientId) {
    return Promise.reject(new Error('MISSING_CLIENT_ID'));
  }
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    return Promise.reject(new Error('GOOGLE_SDK_NOT_LOADED'));
  }
  if (googleAuthState.accessToken && Date.now() < googleAuthState.expiresAt - 30000) {
    return Promise.resolve(googleAuthState.accessToken);
  }
  return new Promise((resolve, reject) => {
    if (!googleAuthState.tokenClient) {
      googleAuthState.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scopes,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          googleAuthState.accessToken = response.access_token;
          googleAuthState.expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
          resolve(googleAuthState.accessToken);
        },
        error_callback: (err) => reject(new Error(err?.type || 'GOOGLE_AUTH_ERROR'))
      });
    }
    googleAuthState.tokenClient.requestAccessToken({ prompt: googleAuthState.accessToken ? '' : 'consent' });
  });
}

// Pure function (no DOM/network) — builds the plain-text body plus the bold
// header ranges for the Docs API batchUpdate call. Kept separate from the
// fetch calls so it stays easy to unit-test.
function buildGoogleDocContent(packageItem){
  const script = packageItem.mainSpokenScript;
  const sections = [script.section1, script.section2, script.section3];
  const account = packageItem.metadata.account || '';
  const pattern = packageItem.metadata.assignedPattern || '';
  const title = `${account} — Pattern ${pattern} — ${packageItem.metadata.scriptId || ''}`.trim();

  const segments = [{ text: `${title}\n\n`, bold: true }];
  sections.forEach((section, index) => {
    segments.push({ text: `Section ${index + 1}: ${section.title}\n`, bold: true });
    segments.push({ text: `${section.text}\n\n`, bold: false });
  });

  let cursor = 0;
  const boldRanges = [];
  segments.forEach(segment => {
    const start = cursor;
    const end = start + segment.text.length;
    if (segment.bold) boldRanges.push({ start, end });
    cursor = end;
  });

  return {
    title,
    fullText: segments.map(s => s.text).join(''),
    boldRanges
  };
}

async function exportToGoogleDoc(packageItem){
  const config = getGoogleDocsConfig();
  if (!config.clientId) {
    setStatus('Warning: ยังไม่ได้ตั้งค่า Google Client ID — ใส่ค่าใน config/google-integration.js ก่อนใช้ Export to Google Doc');
    return;
  }

  setStatus('Generating: กำลังขออนุญาตเข้าถึง Google Docs...');
  let accessToken;
  try {
    accessToken = await ensureGoogleAccessToken();
  } catch (err) {
    setStatus(`Warning: เชื่อมต่อ Google ไม่สำเร็จ (${err.message}) — ลองใหม่อีกครั้ง`);
    return;
  }

  const { title, fullText, boldRanges } = buildGoogleDocContent(packageItem);
  setStatus('Generating: กำลังสร้าง Google Doc...');

  let documentId;
  try {
    const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!createRes.ok) throw new Error(`create failed (${createRes.status})`);
    const created = await createRes.json();
    documentId = created.documentId;

    const requests = [{ insertText: { location: { index: 1 }, text: fullText } }];
    boldRanges.forEach(range => {
      requests.push({
        updateTextStyle: {
          range: { startIndex: range.start + 1, endIndex: range.end + 1 },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    });

    const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    if (!batchRes.ok) throw new Error(`write content failed (${batchRes.status})`);
  } catch (err) {
    setStatus(`Warning: สร้าง Google Doc ไม่สำเร็จ (${err.message})`);
    return;
  }

  const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  window.open(docUrl, '_blank');
  setStatus(`Generated: สร้าง Google Doc สำหรับ ${packageItem.metadata.scriptId} แล้ว เปิดลิงก์ในแท็บใหม่`);
}
