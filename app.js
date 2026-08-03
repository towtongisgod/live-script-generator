// app.js — DOM/UI glue only. All parsing + script-generation logic lives in
// core.js (loaded before this file), so it stays testable in Node without a DOM.

const input = document.getElementById('rawInput');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
const pageTitle = document.getElementById('pageTitle');
const pageDescription = document.getElementById('pageDescription');
const brandTabs = document.getElementById('brandTabs');

const state = {
  activeBrandId: 'skinoxy',
  brands: [],
  brandStyles: {},
  knowledgeByBrand: {},
  currentPromos: []
};

initApp();

document.getElementById('loadSample').addEventListener('click', async () => {
  const brand = getActiveBrand();
  if (!brand?.sample_file) return;
  const res = await fetch(brand.sample_file);
  input.value = await res.text();
  setStatus(`โหลดตัวอย่าง ${brand.label} แล้ว`);
});

document.getElementById('generate').addEventListener('click', async () => {
  await generateScripts();
});

document.getElementById('uploadImage').addEventListener('click', () => {
  document.getElementById('imageInput').click();
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
  setStatus('กำลังปรับภาพและอ่านข้อความ...');
  try {
    const preprocessed = preprocessDrawableForOcr(drawable, sourceWidth, sourceHeight);
    const { data } = await Tesseract.recognize(preprocessed, 'tha+eng', {
      logger: info => {
        if (info.status === 'recognizing text') {
          setStatus(`กำลังอ่านข้อความจากรูป... ${Math.round(info.progress * 100)}%`);
        }
      }
    });
    const text = data.text.trim();
    if (!text) {
      setStatus('อ่านรูปแล้วแต่ไม่พบข้อความ ลองเลือกพื้นที่ให้ตรงตัวหนังสือมากขึ้น');
      return;
    }
    input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text;
    const confidence = Math.round(data.confidence);
    setStatus(confidence < 60
      ? `ถอดข้อความแล้ว แต่ความมั่นใจต่ำ (${confidence}%) ลองเลือกพื้นที่ให้แคบและตรงตัวหนังสือมากขึ้น แล้วตรวจทาน/แก้ข้อความก่อนกด Generate Script`
      : `ถอดข้อความจากรูปแล้ว (ความมั่นใจ ${confidence}%) ตรวจทานก่อน Generate Script`);
  } catch (error) {
    setStatus(`อ่านรูปไม่สำเร็จ: ${error.message}`);
  }
}

document.getElementById('copyAll').addEventListener('click', async () => {
  const text = [...document.querySelectorAll('.script-output')]
    .map(x => x.innerText)
    .join('\n\n---\n\n');
  if (!text) return setStatus('ยังไม่มีผลลัพธ์ให้คัดลอก');
  await navigator.clipboard.writeText(text);
  setStatus('คัดลอกทั้งหมดแล้ว');
});

async function initApp(){
  await loadBrandConfig();
  renderBrandTabs();
  applyBrandUI();
  await loadKnowledgeForBrand(state.activeBrandId);
}

async function loadBrandConfig(){
  try {
    const [brandsRes, stylesRes] = await Promise.all([
      fetch('data/brands.json'),
      fetch('data/brand-styles.json')
    ]);
    const brandsConfig = await brandsRes.json();
    state.brands = brandsConfig.brands || [];
    state.activeBrandId = brandsConfig.default_brand_id || state.brands[0]?.id || 'skinoxy';
    state.brandStyles = await stylesRes.json();
  } catch (error) {
    state.brands = [
      {
        id: 'skinoxy',
        label: 'SKINOXY',
        title: 'SKINOXY Auto Script Generator',
        description: 'วางโปรโมชั่นหลายรายการเป็นก้อนเดียว ระบบจะแยกโปรและสร้างสคริปต์ TikTok Live 3 Session ต่อโปรโมชั่น โดยแต่ละ Session อ่านขายได้ประมาณ 2-3 นาที',
        knowledge_file: 'skinoxy-products.json',
        sample_file: 'sample-promotions.txt',
        placeholder: 'วางข้อมูลโปรโมชั่นที่นี่...'
      }
    ];
    state.brandStyles = {};
  }
}

async function loadKnowledgeForBrand(brandId){
  if (state.knowledgeByBrand[brandId]) return state.knowledgeByBrand[brandId];
  const brand = state.brands.find(item => item.id === brandId);
  const knowledgeFile = brand?.knowledge_file || 'skinoxy-products.json';

  try {
    const res = await fetch(`data/${knowledgeFile}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.knowledgeByBrand[brandId] = await res.json();
  } catch (error) {
    state.knowledgeByBrand[brandId] = {
      brand_id: brandId,
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
  return state.brands.find(item => item.id === state.activeBrandId) || state.brands[0];
}

function getActiveStyle(){
  return state.brandStyles[state.activeBrandId] || {};
}

function renderBrandTabs(){
  if (!brandTabs) return;
  brandTabs.innerHTML = '';

  state.brands.forEach(brand => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `brand-tab${brand.id === state.activeBrandId ? ' active' : ''}`;
    button.textContent = brand.label;
    button.addEventListener('click', async () => {
      if (state.activeBrandId === brand.id) return;
      state.activeBrandId = brand.id;
      state.currentPromos = [];
      results.innerHTML = '';
      renderBrandTabs();
      applyBrandUI();
      await loadKnowledgeForBrand(brand.id);
      setStatus(`เลือกแบรนด์ ${brand.label} แล้ว ข้อความโปรโมชั่นยังอยู่เหมือนเดิม`);
    });
    brandTabs.appendChild(button);
  });
}

function applyBrandUI(){
  const brand = getActiveBrand();
  const style = getActiveStyle();
  if (!brand) return;

  pageTitle.textContent = brand.title;
  pageDescription.textContent = brand.description;
  input.placeholder = brand.placeholder || 'วางข้อมูลโปรโมชั่นที่นี่...';
  document.body.dataset.brand = brand.id;

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

async function generateScripts(){
  const raw = input.value.trim();
  if (!raw) return setStatus('กรุณาวางข้อมูลโปรโมชั่นก่อน');

  const brand = getActiveBrand();
  const knowledge = await loadKnowledgeForBrand(state.activeBrandId);
  const promos = splitPromotions(raw).map((text, index) =>
    parsePromotion(text, index, knowledge, brand, getActiveStyle())
  );

  state.currentPromos = promos;
  render(promos);
  setStatus(`แยกได้ ${promos.length} โปรโมชั่นสำหรับ ${brand.label}`);
}

function setStatus(msg){
  statusEl.textContent = msg;
}

function render(promos){
  results.innerHTML = '';
  const strategyMode = document.getElementById('sellingStrategyMode').checked;
  const singleStrategy = document.getElementById('strategySelect').value;

  promos.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const formulaLabel = p.allVariantsSelected
      ? 'ทุกสูตร/กลิ่นที่ร่วมรายการ'
      : formatVariantList(p.selectedVariants) || '-';

    const scriptSectionHtml = strategyMode
      ? STRATEGIES.map(strategyKey => {
        const meta = STRATEGY_META[strategyKey];
        return `
        <div class="ab-variant">
          <div class="ab-variant-header">
            <div>
              <h3>แบบ ${meta.letter} — ${meta.name} (${meta.thai})</h3>
              <p class="strategy-desc">${escapeHtml(meta.description)}</p>
            </div>
            <div class="card-actions">
              <button class="generate-again-variant" data-strategy="${strategyKey}">Generate Again</button>
              <button class="copy-variant" data-strategy="${strategyKey}">Copy แบบ ${meta.letter}</button>
            </div>
          </div>
          <pre class="script-output">${escapeHtml(createScript(p, strategyKey, p.hookVariants[strategyKey]))}</pre>
        </div>
      `;
      }).join('')
      : `<pre class="script-output">${escapeHtml(createScript(p, singleStrategy, p.hookVariants[singleStrategy]))}</pre>`;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <p class="brand-label">${escapeHtml(p.brandName)}</p>
          <h2>โปรโมชั่นที่ ${p.index}</h2>
        </div>
        <div class="card-actions">
          ${strategyMode ? '' : '<button class="generate-again">Generate Again</button><button class="copy-one">Copy Script</button>'}
        </div>
      </div>
      <div class="meta">
        <div><strong>แบรนด์</strong><br>${escapeHtml(p.brandName)}</div>
        <div><strong>ชื่อโปร</strong><br>${escapeHtml(p.title || '-')}</div>
        <div><strong>สินค้า</strong><br>${escapeHtml(formatItemsInSet(p))}</div>
        <div><strong>สูตร/กลิ่น</strong><br>${escapeHtml(formulaLabel)}</div>
        <div><strong>ราคาปกติ</strong><br>${p.regular ? formatMoney(p.regular) : '-'}</div>
        <div><strong>ราคาพิเศษ</strong><br>${p.promoPrice ? formatMoney(p.promoPrice) : '-'}</div>
        <div><strong>ส่วนลด</strong><br>${p.discount ? `${formatMoney(p.discount)} บาท` : '-'}</div>
        <div><strong>% ส่วนลด</strong><br>${p.discountPercent ? formatPercent(p.discountPercent) : '-'}</div>
        <div><strong>สินค้าหลัก</strong><br>${p.itemCount ? `${p.itemCount} ชิ้น` : '-'}</div>
        <div><strong>รวมของแถม</strong><br>${p.totalCount ? `${p.totalCount} ชิ้น` : '-'}</div>
        <div><strong>เฉลี่ย/ชิ้นหลัก</strong><br>${p.averagePrice ? formatMoney(p.averagePrice) : '-'}</div>
        <div><strong>เฉลี่ยรวมของแถม</strong><br>${p.averageIncludingGift ? formatMoney(p.averageIncludingGift) : '-'}</div>
        <div><strong>Promotion Type</strong><br>${escapeHtml(p.promotionType.name)}</div>
        <div><strong>ของแถม</strong><br>${escapeHtml(formatGiftLine(p))}</div>
        <div><strong>จำนวนจำกัด</strong><br>${p.limited ? 'ระบุ' : '-'}</div>
      </div>
      ${p.warning ? `<p class="warning"><strong>หมายเหตุ:</strong> ${escapeHtml(p.warning)}</p>` : ''}
      ${scriptSectionHtml}
    `;

    if (strategyMode) {
      card.querySelectorAll('.copy-variant').forEach(btn => {
        btn.addEventListener('click', async () => {
          const strategyKey = btn.dataset.strategy;
          const meta = STRATEGY_META[strategyKey];
          await navigator.clipboard.writeText(createScript(p, strategyKey, p.hookVariants[strategyKey]));
          setStatus(`คัดลอกโปรโมชั่นที่ ${p.index} แบบ ${meta.letter} (${meta.name}) แล้ว`);
        });
      });
      card.querySelectorAll('.generate-again-variant').forEach(btn => {
        btn.addEventListener('click', () => {
          const strategyKey = btn.dataset.strategy;
          p.hookVariants[strategyKey] = (p.hookVariants[strategyKey] || 0) + 1;
          render(state.currentPromos);
          setStatus(`Generate Again โปรโมชั่นที่ ${p.index} แบบ ${STRATEGY_META[strategyKey].name} แล้ว`);
        });
      });
    } else {
      const script = createScript(p, singleStrategy, p.hookVariants[singleStrategy]);
      card.querySelector('.copy-one').addEventListener('click', async () => {
        await navigator.clipboard.writeText(script);
        setStatus(`คัดลอกโปรโมชั่นที่ ${p.index} แล้ว`);
      });

      card.querySelector('.generate-again').addEventListener('click', () => {
        p.hookVariants[singleStrategy] = (p.hookVariants[singleStrategy] || 0) + 1;
        render(state.currentPromos);
        setStatus(`Generate Again โปรโมชั่นที่ ${p.index} แล้ว โดยใช้ข้อมูลโปรโมชั่นเดิม`);
      });
    }

    results.appendChild(card);
  });
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
