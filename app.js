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

function splitPromotions(raw){
  const normalized = raw
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();

  const numberedMatches = [
    ...normalized.matchAll(/(?:^|\n)\s*(?:\d+|[๐-๙]+)[\.\)]\s+/g)
  ];

  if (numberedMatches.length > 1) {
    return numberedMatches.map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < numberedMatches.length
        ? numberedMatches[index + 1].index
        : normalized.length;
      return normalized.slice(start, end).trim();
    }).filter(Boolean);
  }

  // A single promotion's own caption often has blank lines between its intro,
  // bullet list, and gift line (Shopee/Facebook style). Only treat a blank-line
  // gap as a NEW promotion when the text actually mentions more than one
  // "regular price" — that's the one fact every real promotion states once.
  const regularPriceMentions = (normalized.match(/ราคาปกติ|จากปกติ|Full\s*Price/gi) || []).length;
  if (regularPriceMentions <= 1) {
    return [normalized];
  }

  return normalized
    .split(/\n{2,}|(?:^|\n)\s*[-•]\s+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parsePromotion(text, index, knowledge, brand = null, style = null){
  const cleaned = normalizeText(text);
  const prePriceText = extractPrePriceText(cleaned);
  const mainProductText = cleanupPhrase(prePriceText) || cleaned;
  const quantityTiers = extractQuantityTiers(cleaned);
  const regular = moneyAfter(cleaned, [
    /ราคาปกติ[^\d\n]{0,10}([\d,]+(?:\.\d+)?)/i,
    /จากปกติ[^\d\n]{0,10}([\d,]+(?:\.\d+)?)/i,
    /Full\s*Price\s*:?\s*([\d,]+(?:\.\d+)?)/i
  ]) || quantityTiers[0]?.regularPrice || null;
  const promoPrice = moneyAfter(cleaned, [
    /ราคาพิเศษ[^\d\n]{0,10}([\d,]+(?:\.\d+)?)/i,
    /ราคาโปร[^\d\n]{0,10}([\d,]+(?:\.\d+)?)/i,
    /ในราคา[^\d\n]{0,15}([\d,]+(?:\.\d+)?)/i,
    /พิเศษ\s*([\d,]+(?:\.\d+)?)(?!\s*(?:ml|มล\.?|กรัม|g|oz|ขวด|ชิ้น|kg|ก\.?|ลิตร))/i,
    /Price\s*:?\s*([\d,]+(?:\.\d+)?)/i,
    /เพียง\s*([\d,]+(?:\.\d+)?)/i
  ]) || quantityTiers[0]?.promoPrice || null;
  const coupon = extractCoupon(cleaned);
  const explicitFinalPrice = extractFinalPrice(cleaned);
  const calculatedFinalPrice = !explicitFinalPrice && promoPrice && coupon
    ? Math.round(promoPrice * (1 - coupon / 100))
    : null;
  const finalPrice = explicitFinalPrice || calculatedFinalPrice;
  const gift = extractGift(cleaned, knowledge);
  const giftValue = moneyAfter(cleaned, [/มูลค่า\s*([\d,]+(?:\.\d+)?)/i]);
  const giftCount = extractGiftCount(gift);
  const limited = /จำนวน\s*จำกัด|limited/i.test(cleaned);
  const matchedProducts = findProducts(cleaned, knowledge?.products || []);
  const matchedProduct = findProduct(mainProductText, knowledge?.products || [])
    || matchedProducts[0]?.product
    || null;
  const variantInfo = resolveVariants(cleaned, matchedProduct);
  const selectedFragrances = findSelectedFragranceVariants(cleaned, knowledge);
  const title = extractPromotionTitle(prePriceText);
  const productLines = extractProductLines(prePriceText);
  const itemCount = extractItemCount(cleaned, mainProductText, matchedProducts, knowledge);
  const totalCount = itemCount ? itemCount + giftCount : giftCount || null;
  const quantity = extractQuantity(mainProductText);
  const discount = regular && promoPrice ? regular - promoPrice : null;
  const discountPercent = regular && discount ? (discount / regular) * 100 : null;
  const averagePrice = promoPrice && itemCount ? promoPrice / itemCount : null;
  const averageIncludingGift = promoPrice && totalCount ? promoPrice / totalCount : null;
  const promotionType = detectPromotionType(cleaned, knowledge, matchedProducts, selectedFragrances, gift, itemCount);
  const sellingAngle = promotionType.selling_angle;
  const warning = getFinalPriceWarning(explicitFinalPrice, promoPrice, coupon);

  return {
    index: index + 1,
    brandId: knowledge?.brand_id || brand?.id || 'skinoxy',
    brandName: knowledge?.brand || brand?.label || 'SKINOXY',
    brandShort: knowledge?.brand_short || brand?.label || knowledge?.brand || 'SKINOXY',
    brand,
    style,
    knowledge,
    raw: text.trim(),
    title,
    productLines,
    mainProductText,
    quantity,
    itemCount,
    product: matchedProduct,
    matchedProducts,
    selectedVariants: variantInfo.selectedVariants,
    allVariantsSelected: variantInfo.allVariantsSelected,
    variantNote: variantInfo.variantNote,
    selectedFragrances,
    gift,
    giftValue,
    giftCount,
    regular,
    promoPrice,
    quantityTiers,
    coupon,
    finalPrice,
    finalPriceSource: explicitFinalPrice ? 'explicit' : calculatedFinalPrice ? 'calculated' : null,
    discount,
    discountPercent,
    averagePrice,
    totalCount,
    averageIncludingGift,
    promotionType,
    sellingAngle,
    limited,
    warning,
    scriptVariant: 0
  };
}

function normalizeText(text){
  return String(text)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function normalizeForMatch(text){
  return String(text)
    .toLowerCase()
    .replace(/[&]/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMoney(value){
  if (!value) return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value){
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value){
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function moneyAfter(text, patterns){
  for (const pattern of patterns){
    const match = text.match(pattern);
    if (match) return normalizeMoney(match[1]);
  }
  return null;
}

function extractQuantityTiers(text){
  const matches = [...text.matchAll(/ซื้อ\s*(\d+)\s*([ก-๙a-z]+)?[^\n(]*?(?:เพียง|ราคา\S{0,10})\s*([\d,]+(?:\.\d+)?)[.\-]*\s*\(?\s*จากปกติ\s*([\d,]+(?:\.\d+)?)/gi)];
  return matches.map(match => ({
    quantity: Number(match[1]),
    unit: match[2] || null,
    promoPrice: normalizeMoney(match[3]),
    regularPrice: normalizeMoney(match[4])
  }));
}

function buildTierPriceSpeech(p){
  if (!p.quantityTiers || p.quantityTiers.length < 2) return '';

  const lines = p.quantityTiers.map(tier =>
    `ซื้อ ${tier.quantity} ${tier.unit || 'ชุด'} ${formatMoney(tier.promoPrice)} บาท จากราคาปกติ ${formatMoney(tier.regularPrice)} บาท`
  );
  return `${lines.join(' ส่วน ')} ยิ่งซื้อเยอะยิ่งคุ้ม`;
}

function extractCoupon(text){
  const match = text.match(/คูปอง(?:ลดเพิ่ม)?\s*([\d.]+)\s*%/i);
  return match ? Number(match[1]) : null;
}

function extractFinalPrice(text){
  const patterns = [
    /Final(?:\s*Price)?[\s\S]{0,120}?เหลือ(?:เพียง)?\s*([\d,]+(?:\.\d+)?)/i,
    /คูปอง(?:ลดเพิ่ม)?\s*[\d.]+\s*%[\s\S]{0,60}?เหลือ(?:เพียง)?\s*([\d,]+(?:\.\d+)?)/i,
    /เหลือเพียง\s*([\d,]+(?:\.\d+)?)/i
  ];
  return moneyAfter(text, patterns);
}

function extractPrePriceText(text){
  const match = text.match(/^([\s\S]*?)(?=\s*(?:ราคาปกติ|จากปกติ|Full\s*Price|ราคาโปร|ราคาพิเศษ|ในราคา|Price\s*:|Final|คูปอง|เหลือ(?:เพียง)?|จำนวน\s*จำกัด|>>|https?:\/\/|\n\s*\n|$))/i);
  return String(match ? match[1] : text).trim();
}

function extractGift(text, knowledge){
  const stopWords = 'มูลค่า|ราคาปกติ|จากปกติ|ราคาโปร|ราคาพิเศษ|ในราคา|Price\\s*:|Final|คูปอง|เหลือ(?:เพียง)?|จำนวน\\s*จำกัด|>>|https?:\\/\\/|\\n\\s*[*\\-•]|\\n\\s*\\n|$';
  const receiveFree = text.match(new RegExp(`รับฟรี\\s*([\\s\\S]*?)(?=\\s*(?:${stopWords}))`, 'i'));
  if (receiveFree) return cleanupPhrase(receiveFree[1]);

  const explicitGift = text.match(new RegExp(`(?:ของแถม|แถม)\\s*([\\s\\S]*?)(?=\\s*(?:${stopWords}))`, 'i'));
  if (explicitGift) return cleanupPhrase(explicitGift[1]);

  if ((knowledge?.brand_id || '').toLowerCase() === 'kmb') return null;

  const plusGift = text.match(new RegExp(`\\+\\s*(?!คูปอง)([\\s\\S]*?)(?=\\s*(?:${stopWords}))`, 'i'));
  if (plusGift) return cleanupPhrase(plusGift[1]);

  return null;
}

function extractPromotionTitle(prePriceText){
  const lines = String(prePriceText || '')
    .split('\n')
    .map(line => cleanupPhrase(line.replace(/^\+\s*/, '')))
    .filter(Boolean);
  return lines[0] || null;
}

function extractProductLines(prePriceText){
  const lines = String(prePriceText || '')
    .split('\n')
    .map(line => cleanupPhrase(line.replace(/^\+\s*/, '')))
    .filter(Boolean);

  if (lines.length <= 1) return lines;
  return lines.slice(1);
}

function extractQuantity(text){
  const match = text.match(/(\d+(?:\.\d+)?)\s*(กระปุก|หลอด|ขวด|ซอง|ใบ|แผ่น|ชิ้น|แพ็ก|แพค|ชุด|กล่อง)/i);
  return match ? `${match[1]} ${match[2]}` : null;
}

function extractGiftCount(gift){
  if (!gift) return 0;
  const match = gift.match(/(\d+(?:\.\d+)?)\s*(?:ชิ้น|ขวด|หลอด|กระปุก|ซอง|ใบ|แผ่น|แพ็ก|แพค|ชุด|กล่อง)/i);
  return match ? Number(match[1]) : 1;
}

function extractItemCount(rawText, mainProductText, matchedProducts = [], knowledge = null){
  if ((knowledge?.brand_id || '').toLowerCase() === 'dgmr') {
    const dgmrCount = extractDgmrMainItemCount(rawText);
    if (dgmrCount) return dgmrCount;
  }

  const text = mainProductText || rawText;
  const direct = text.match(/(\d+(?:\.\d+)?)\s*(?:ชิ้น|ตัว|หลอด|ขวด|กระปุก|ซอง|ชุด|กล่อง)/i);
  if (direct) return Number(direct[1]);
  if (/เซตคู่|คู่/i.test(text)) return 2;

  const uniqueProductIds = new Set((matchedProducts || []).map(item => item.product?.id).filter(Boolean));
  return uniqueProductIds.size || null;
}

function extractDgmrMainItemCount(text){
  const mainText = String(text || '').split(/รับฟรี|ของแถม|แถม/i)[0];
  const roles = [
    /(?:แชมพู|shampoo)\s*(\d+(?:\.\d+)?)?/i,
    /(?:ครีมนวด|conditioner)\s*(\d+(?:\.\d+)?)?/i,
    /(?:hair\s*tonic|โทนิค)\s*(\d+(?:\.\d+)?)?/i,
    /(?:hair\s*pack|ทรีตเมนต์|treatment)\s*(\d+(?:\.\d+)?)?/i
  ];

  const count = roles.reduce((sum, pattern) => {
    const match = mainText.match(pattern);
    return match ? sum + Number(match[1] || 1) : sum;
  }, 0);

  return count || null;
}

function cleanupPhrase(text){
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[+|,]\s*$/g, '')
    .replace(/\s*[-–—]\s*$/g, '')
    .trim();

  return cleaned || null;
}

function getProductTerms(product){
  return [product.name, ...(product.aliases || [])].filter(Boolean);
}

function getVariantTerms(variant){
  const splitTerms = String(variant.name || '')
    .split(/\s+/)
    .filter(term => {
      const normalized = normalizeForMatch(term);
      return normalized.length > 2 && !['pro', 'sweet', 'and', 'the', 'edt'].includes(normalized);
    });

  return [
    variant.id,
    variant.name,
    variant.color,
    ...(variant.aliases || []),
    ...splitTerms
  ].filter(term => term && String(term).length > 1);
}

function findProduct(text, products){
  const haystack = normalizeForMatch(text);

  return products
    .map(product => {
      const matchedTerm = getProductTerms(product)
        .sort((a, b) => b.length - a.length)
        .find(term => haystack.includes(normalizeForMatch(term)));

      const matchedVariant = (product.variants || [])
        .flatMap(getVariantTerms)
        .sort((a, b) => b.length - a.length)
        .find(term => haystack.includes(normalizeForMatch(term)));

      const score = Math.max(
        matchedTerm ? normalizeForMatch(matchedTerm).length : 0,
        matchedVariant ? normalizeForMatch(matchedVariant).length : 0
      );

      return score ? { product, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0]?.product || null;
}

function findProducts(text, products){
  const haystack = normalizeForMatch(text);

  return products
    .map(product => {
      const productMatch = getProductTerms(product).find(term =>
        haystack.includes(normalizeForMatch(term))
      );
      const matchedVariants = (product.variants || []).filter(variant =>
        getVariantTerms(variant).some(term => haystack.includes(normalizeForMatch(term)))
      );

      if (!productMatch && !matchedVariants.length) return null;
      return { product, productMatch, matchedVariants };
    })
    .filter(Boolean);
}

function resolveVariants(searchText, product){
  if (!product?.variants?.length) {
    return {
      selectedVariants: [],
      allVariantsSelected: false,
      variantNote: 'ยังไม่มีข้อมูลสูตรหรือสีสำหรับสินค้านี้'
    };
  }

  const haystack = normalizeForMatch(searchText);
  const selectedVariants = product.variants.filter(variant =>
    getVariantTerms(variant).some(term => haystack.includes(normalizeForMatch(term)))
  );

  if (selectedVariants.length) {
    return {
      selectedVariants,
      allVariantsSelected: false,
      variantNote: `ระบุสูตร/สี: ${formatVariantList(selectedVariants)}`
    };
  }

  return {
    selectedVariants: product.variants,
    allVariantsSelected: true,
    variantNote: product.variant_rule || 'เลือกได้ทุกสูตรที่ร่วมรายการ'
  };
}

function findSelectedFragranceVariants(text, knowledge){
  const fragranceProduct = (knowledge?.products || []).find(product =>
    ['Fragrance', 'Intense Fragrance'].includes(product.category) || product.id === 'edt_revamp'
  );
  if (!fragranceProduct) return [];

  const haystack = normalizeForMatch(text);
  return (fragranceProduct.variants || []).filter(variant =>
    getVariantTerms(variant).some(term => haystack.includes(normalizeForMatch(term)))
  );
}

function formatVariantList(variants){
  return variants.map(variant =>
    [variant.name, variant.color].filter(Boolean).join(' ')
  ).join(', ');
}

function formatVariantGuidance(p){
  if (!p.product) return 'ยังไม่มีข้อมูลสูตรสำหรับสินค้านี้';

  const prefix = p.allVariantsSelected
    ? 'ไม่ระบุสูตรหรือสีในโปร ตีความว่าเลือกได้ทุกสูตรที่ร่วมรายการ'
    : 'สูตรหรือสีที่ระบุในโปร';

  return `${prefix}: ${formatVariantList(p.selectedVariants)}`;
}

function getFinalPriceWarning(explicitFinalPrice, promoPrice, coupon){
  if (!explicitFinalPrice || !promoPrice || !coupon) return null;
  const calculated = Math.round(promoPrice * (1 - coupon / 100));
  if (Math.abs(explicitFinalPrice - calculated) <= 1) return null;
  return `Final Price จากข้อมูลคือ ${formatMoney(explicitFinalPrice)} บาท แต่คำนวณจากราคาโปรและคูปองได้ ${formatMoney(calculated)} บาท`;
}

function detectPromotionType(text, knowledge, matchedProducts, selectedFragrances, gift, itemCount = null){
  const brandId = (knowledge?.brand_id || '').toLowerCase();
  if (brandId === 'dgmr') {
    return detectDgmrPromotionType(text, knowledge, gift, itemCount);
  }

  if (brandId !== 'kmb') {
    return { id: 'skinoxy_promotion', name: 'SKINOXY Promotion', selling_angle: 'เลือกสูตรตามปัญหาผิวและความคุ้มของโปร' };
  }

  const haystack = normalizeForMatch(text);
  const hasEdt = /edt|perfume|fragrance|น้ำหอม/i.test(text) || selectedFragrances.length > 0;
  const hasUnderarm = /underarm|dry serum|ใต้วงแขน/i.test(text) || hasProductId(matchedProducts, 'underarm_dry_serum');
  const hasShower = /shower|เจลอาบน้ำ/i.test(text) || hasProductId(matchedProducts, 'perfume_shower_gel');
  const hasLotion = /lotion|โลชั่น/i.test(text) || hasProductId(matchedProducts, 'body_lotion_revamp');
  const fragranceNames = (knowledge.products || [])
    .flatMap(product => product.variants || [])
    .filter(variant => ['Fragrance', 'Intense Fragrance'].includes(variant.category))
    .filter(variant => getVariantTerms(variant).some(term => haystack.includes(normalizeForMatch(term))));
  const typeMap = Object.fromEntries((knowledge.promotion_types || []).map(type => [type.id, type]));

  if (hasEdt && hasUnderarm) return typeMap.confidence_set;
  if (hasShower && hasLotion && hasEdt) return typeMap.fragrance_layering_set;
  if (fragranceNames.length >= 2 || /hair mist/i.test(text)) return typeMap.fragrance_duo;
  if (/intense|nude|luxury/i.test(text) && (gift || hasLotion || hasShower)) return typeMap.luxury_lifestyle_set;
  if (hasEdt) return typeMap.single_fragrance;

  return { id: 'kmb_lifestyle_set', name: 'Lifestyle Set', selling_angle: 'เลือกตาม Mood, Character และ Lifestyle' };
}

function detectDgmrPromotionType(text, knowledge, gift, itemCount){
  const typeMap = Object.fromEntries((knowledge.promotion_types || []).map(type => [type.id, type]));
  const hasGift = Boolean(gift);
  const hasShampoo = /แชมพู|shampoo/i.test(text);
  const hasConditioner = /ครีมนวด|conditioner/i.test(text);
  const hasHairTonic = /hair\s*tonic|โทนิค/i.test(text);
  const hasHairPack = /hair\s*pack|ทรีตเมนต์|treatment/i.test(text);
  const hasDlaesoo = /dlaesoo|ดาเลซู/i.test(text);
  const shampooCount = countDgmrRole(text, /(?:แชมพู|shampoo)\s*(\d+(?:\.\d+)?)?/i);

  let base = typeMap.daily_hair_care_set;
  if (hasDlaesoo && hasShampoo && hasConditioner && hasHairPack) {
    base = typeMap.damage_recovery_set;
  } else if (hasShampoo && hasConditioner && hasHairTonic) {
    base = typeMap.hair_fall_complete_set;
  } else if (shampooCount >= 2 || (/หลายขวด|ใช้ต่อเนื่อง/i.test(text) && itemCount >= 2)) {
    base = typeMap.stock_up_set;
  } else if (hasShampoo && hasHairTonic) {
    base = typeMap.scalp_care_set;
  } else if (hasShampoo && hasConditioner) {
    base = typeMap.daily_hair_care_set;
  } else if (hasGift) {
    base = typeMap.gift_bundle;
  }

  if (hasGift && base?.id !== 'gift_bundle') {
    const giftBundle = typeMap.gift_bundle;
    return {
      id: `${base.id}_gift_bundle`,
      name: `${base.name} + ${giftBundle.name}`,
      selling_angle: `${base.selling_angle} | ${giftBundle.selling_angle}`
    };
  }

  return base || {
    id: 'dgmr_hair_care_set',
    name: 'Hair Care Set',
    selling_angle: 'เลือก Routine ตามปัญหาผมและหนังศีรษะ'
  };
}

function countDgmrRole(text, pattern){
  const match = String(text || '').split(/รับฟรี|ของแถม|แถม/i)[0].match(pattern);
  return match ? Number(match[1] || 1) : 0;
}

function hasProductId(matchedProducts, id){
  return (matchedProducts || []).some(item => item.product?.id === id);
}

function formatPriceLines(p){
  return [
    p.regular ? `ราคาปกติ ${formatMoney(p.regular)} บาท` : '',
    p.promoPrice ? `ราคาโปร ${formatMoney(p.promoPrice)} บาท` : '',
    p.coupon ? `คูปองลดเพิ่ม ${p.coupon}%` : '',
    p.finalPrice ? `${p.finalPriceSource === 'calculated' ? 'Final Price คำนวณจากคูปอง' : 'Final Price'} ${formatMoney(p.finalPrice)} บาท` : ''
  ].filter(Boolean);
}

function formatGiftLine(p){
  if (!p.gift) return 'ไม่มีข้อมูลของแถม';
  const value = p.giftValue ? ` มูลค่า ${formatMoney(p.giftValue)} บาท` : '';
  return `${p.gift}${value}`;
}

function formatDiscountLine(p){
  if (!p.discount) return 'ไม่มีข้อมูลส่วนลด';
  return `ลด ${formatMoney(p.discount)} บาท หรือประมาณ ${formatPercent(p.discountPercent)}`;
}

function formatAverageLine(p){
  if (!p.averagePrice) return 'ไม่มีข้อมูลราคาเฉลี่ยต่อชิ้น';
  return `เฉลี่ยชิ้นละ ${formatMoney(p.averagePrice)} บาท`;
}

function formatAverageIncludingGiftLine(p){
  if (!p.averageIncludingGift) return 'ไม่มีข้อมูลราคาเฉลี่ยเมื่อรวมของแถม';
  return `เฉลี่ยเมื่อรวมของแถม ${formatMoney(p.averageIncludingGift)} บาทต่อชิ้น`;
}

function getPrimaryFragrance(p){
  return p.selectedFragrances[0] || p.selectedVariants.find(item =>
    ['Fragrance', 'Intense Fragrance'].includes(item.category)
  ) || null;
}

function formatMood(variant){
  return (variant?.mood || []).slice(0, 3).join(', ') || 'เลือกตาม Mood ที่ชอบ';
}

function formatOccasion(variant){
  return (variant?.occasion || []).slice(0, 3).join(', ') || 'ใช้ได้หลายโอกาส';
}

function formatItemsInSet(p){
  if (p.brandId === 'dgmr') {
    const mainText = String(p.raw || '')
      .split(/รับฟรี|ของแถม|แถม|ราคาปกติ|จากปกติ|ราคาพิเศษ|ราคาโปร|ในราคา|>>|https?:\/\/|\n\s*\n/i)[0]
      .split('\n')
      .map(line => cleanupPhrase(line.replace(/^\+\s*/, '')))
      .filter(Boolean)
      .join(' | ');
    if (mainText) return mainText;
  }

  if (p.productLines?.length) return p.productLines.join(' | ');

  const productLabels = (p.matchedProducts || []).map(item => {
    const variants = item.matchedVariants?.length ? ` ${formatVariantList(item.matchedVariants)}` : '';
    return `${item.product.name}${variants}`;
  });

  return productLabels.join(' | ') || p.mainProductText || '-';
}

function buildSkinoxyVariantKnowledge(p){
  if (!p.product) return 'ยังไม่มี Product Knowledge สำหรับสินค้านี้ จึงไม่เติมสรรพคุณเพิ่ม';

  return p.selectedVariants.map(variant => {
    const painPoints = (variant.pain_points || []).join(', ');
    const benefits = (variant.benefits || []).join(', ');
    const ingredients = (variant.ingredients || []).join(', ');
    const parts = [
      [variant.name, variant.color].filter(Boolean).join(' '),
      painPoints ? `เหมาะกับ ${painPoints}` : '',
      benefits ? `จุดเด่น: ${benefits}` : '',
      ingredients ? `ส่วนผสมเด่น: ${ingredients}` : ''
    ].filter(Boolean);

    return `- ${parts.join(' | ')}`;
  }).join('\n');
}

function joinSentences(lines){
  return lines.filter(Boolean).join(' ');
}

function uniqueFilled(items){
  return [...new Set((items || [])
    .flat()
    .map(item => String(item || '').trim())
    .filter(Boolean))];
}

function listForSpeech(items, fallback = ''){
  const values = uniqueFilled(items);
  if (!values.length) return fallback;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} และ ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} และ ${values[values.length - 1]}`;
}

function getBrandCharacter(p){
  const defaults = {
    skinoxy: {
      positioning: 'Problem-Solution Body Care',
      pain_point_lens: 'เริ่มจากปัญหาผิว แล้วพาเลือกสูตรที่ตรงกับปัญหา',
      mc_tone: 'ชัด ตรงสูตร ไม่พูดเกินข้อมูล'
    },
    kmb: {
      positioning: 'Lifestyle Fragrance Brand',
      pain_point_lens: 'เริ่มจาก Mood, Character และโอกาสใช้งาน',
      mc_tone: 'สนุก มีภาพจำ และไม่พูด Claim เกินข้อมูล'
    },
    dgmr: {
      positioning: 'Hair Care Routine Brand',
      pain_point_lens: 'เริ่มจาก Hair Concern แล้วพาเลือก Routine ที่ตรงกับปัญหา',
      mc_tone: 'จริงจัง เข้าใจปัญหา และไม่ฟันธงผลลัพธ์'
    }
  };

  return {
    ...(defaults[p.brandId] || defaults.skinoxy),
    ...(p.knowledge?.brand_character || {})
  };
}

function buildSession(number, title, lines){
  return `### Session ${number}: ${title} (2-3 นาที)\n${joinSentences(lines)}`;
}

function buildPriceSpeech(p, promoLabel = 'ราคาโปร'){
  const parts = [];
  if (p.regular) parts.push(`จากราคาปกติ ${formatMoney(p.regular)} บาท`);
  if (p.promoPrice) parts.push(`${promoLabel} ${formatMoney(p.promoPrice)} บาท`);
  if (p.discount) parts.push(`ประหยัดไป ${formatMoney(p.discount)} บาท หรือประมาณ ${formatPercent(p.discountPercent)}`);
  if (p.coupon) parts.push(`ถ้าใช้คูปองลดเพิ่ม ${p.coupon}%`);
  if (p.finalPrice) parts.push(`ราคาสุทธิอยู่ที่ ${formatMoney(p.finalPrice)} บาท`);
  return parts.join(' ');
}

function buildSkinoxyChoiceSpeech(p){
  if (!p.product) return 'โปรนี้ยังไม่มีรายละเอียดตัวสินค้าเพิ่มเติม เช็กรายละเอียดจริงในตะกร้าเป็นหลักได้เลย';

  if (p.allVariantsSelected) {
    const choices = p.selectedVariants.map(variant => {
      const pain = (variant.pain_points || []).slice(0, 2).join(' หรือ ');
      const benefit = (variant.benefits || []).slice(0, 2).join(' และ ');
      const label = [variant.name, variant.color].filter(Boolean).join(' ');
      return `ถ้าเจอ ${pain || 'ปัญหาผิวที่ระบุในตะกร้า'} ตัวที่ตอบโจทย์คือ ${label}${benefit ? ` ${benefit}` : ''}`;
    }).join(' ');
    return `โปรนี้ไม่ได้ล็อกสูตรไว้ เลือกได้ทุกสูตรที่ร่วมรายการเลย ${choices}`;
  }

  return `โปรนี้ระบุสูตรไว้แล้ว คือ ${formatVariantList(p.selectedVariants)} วันนี้โฟกัสเฉพาะสูตรนี้`;
}

function getSkinoxyPainPoints(p){
  const variants = (p.selectedVariants?.length ? p.selectedVariants : p.product?.variants) || [];
  return uniqueFilled(variants.flatMap(variant => variant.pain_points || []));
}

function getSkinoxyBenefits(p){
  const variants = (p.selectedVariants?.length ? p.selectedVariants : p.product?.variants) || [];
  return uniqueFilled(variants.flatMap(variant => variant.benefits || []));
}

function buildSkinoxyPainPointSpeech(p){
  const character = getBrandCharacter(p);
  const pains = getSkinoxyPainPoints(p).slice(0, 5);
  const benefits = getSkinoxyBenefits(p).slice(0, 4);
  if (!p.product) {
    return `${character.pain_point_lens} โปรนี้ยังไม่มีรายละเอียดตัวสินค้าเพิ่มเติม ขอเล่าจากราคา ของแถม และรายละเอียดที่อยู่ในตะกร้าเป็นหลัก`;
  }

  return `ถ้ากำลังเจอปัญหาแบบ ${listForSpeech(pains, 'ปัญหาผิวที่ระบุในตะกร้า')} ลองเทียบกับผิวตัวเองดูก่อน แล้วมาดูโปรนี้ในกลุ่ม ${p.product.name} ที่ช่วยได้เรื่อง ${listForSpeech(benefits, 'เลือกสูตรตามข้อมูลสินค้า')}`;
}

function buildSkinoxyScript(p, scriptVariant = 0){
  const priceLines = formatPriceLines(p).join(', ');
  const tierSpeech = buildTierPriceSpeech(p);
  const priceSpeech = tierSpeech || buildPriceSpeech(p, 'ราคาโปร');
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const limitedSpeech = p.limited ? 'จำนวนมีจำกัด ใครสนใจรีบตัดสินใจกดตะกร้าไว้ก่อน' : '';
  const choiceSpeech = buildSkinoxyChoiceSpeech(p);
  const character = getBrandCharacter(p);
  const painSpeech = buildSkinoxyPainPointSpeech(p);
  const hookOptions = [
    `เปิดเรื่องปัญหาผิวกันก่อน ถ้ากำลังเจอผิวที่ดูไม่สมดุล เลือกสูตรไม่ถูก หรืออยากได้โปรที่ดูง่ายในตะกร้า โปร ${p.mainProductText || 'สินค้าในโปร'} ตอบโจทย์ตรงนี้`,
    `ใครกำลังเลือกบอดี้แคร์หรือสกินแคร์ให้ตรงกับปัญหาผิว โปร ${p.mainProductText || 'สินค้าในโปร'} มีทั้งสูตร ราคา และเงื่อนไขให้เทียบในตะกร้าเดียว`,
    `ไม่ต้องเดาจากชื่อสูตรอย่างเดียว โปรนี้ให้เทียบได้ตรงๆ จากปัญหาผิว ความคุ้ม และของจริงที่อยู่ในตะกร้า`
  ];
  const hook = hookOptions[scriptVariant % hookOptions.length];

  return `# สรุปโปรโมชั่น
แบรนด์: ${p.brandName}
สินค้า: ${p.mainProductText || '-'}
Product Knowledge: ${p.product ? p.product.name : 'ไม่พบข้อมูลสินค้า'}
Brand Character: ${character.positioning}
Pain Point Lens: ${character.pain_point_lens}
สูตร/สี: ${formatVariantGuidance(p)}
ราคา: ${priceLines || 'ไม่มีข้อมูลราคา'}
ของแถม: ${formatGiftLine(p)}
จำนวนจำกัด: ${p.limited ? 'ระบุจำนวนจำกัด' : 'ไม่ระบุ'}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดปัญหาผิวและโปรหลัก', [
  hook,
  painSpeech,
  `ถ้ากำลังเจอปัญหาผิวแบบนี้อยู่ กดตะกร้าไว้ก่อนเลย แล้วค่อยดูว่าสูตรไหนร่วมรายการ`,
  priceSpeech || 'ราคาให้ดูตามรายละเอียดในตะกร้า',
  giftSpeech,
  limitedSpeech,
  'กดตะกร้าเพื่อดูตัวเลือกสูตร สี ราคา และเงื่อนไขของโปรก่อนเลือกซื้อ'
])}

${buildSession(2, 'ลงรายละเอียดสูตรและวิธีเลือก', [
  'มาดูกันว่าแต่ละสูตรเหมาะกับใคร',
  choiceSpeech,
  p.gift ? `ถ้าสนใจความคุ้ม โปรนี้แถม ${formatGiftLine(p)} ด้วย` : '',
  priceSpeech ? `ย้ำราคาอีกรอบ ${priceSpeech}` : '',
  'กดตะกร้าไว้ แล้วเลือกสูตรที่ตรงกับปัญหาผิวของตัวเอง'
])}

${buildSession(3, 'ทวนโปรและปิดการขาย', [
  `สรุปอีกรอบ โปรนี้ได้ ${p.mainProductText || 'สินค้าในโปรนี้'}${p.gift ? ` พร้อม ${formatGiftLine(p)}` : ''}`,
  priceSpeech || '',
  p.allVariantsSelected ? 'ถ้ายังไม่แน่ใจว่าจะเลือกสูตรไหน กดเข้าไปดูในตะกร้าแล้วเลือกตามปัญหาผิวได้เลย' : `สูตรในโปรนี้คือ ${formatVariantList(p.selectedVariants)}`,
  p.limited ? 'จำนวนจำกัด ใครเล็งไว้รีบกดตะกร้า' : '',
  'ปิดโปรด้วยการกดตะกร้า เช็กราคา เช็กสูตรที่ร่วมรายการ แล้วเลือกให้ตรงกับผิว'
])}

# Key Message
- ${p.brandName} ${p.mainProductText || 'สินค้าในโปรนี้'}
- เหมาะกับคนที่กำลังเจอ ${listForSpeech(getSkinoxyPainPoints(p).slice(0, 5), 'ปัญหาผิวที่อยากเลือกสูตรให้ตรงจุด')}
- ${formatVariantGuidance(p)}
${formatPriceLines(p).map(line => `- ${line}`).join('\n')}
${p.gift ? `- ของแถม ${formatGiftLine(p)}` : ''}
${p.limited ? '- ข้อมูลโปรระบุจำนวนจำกัด' : ''}
- ใช้คำว่า ตะกร้า เท่านั้น

# Producer Push Line
- ดัน ${p.mainProductText || 'สินค้าในโปร'} ขึ้นตะกร้า
- ${p.promoPrice ? `ย้ำราคาโปร ${formatMoney(p.promoPrice)} บาท` : 'ย้ำดูราคาในตะกร้า'}
- ${p.coupon ? `ย้ำคูปองลดเพิ่ม ${p.coupon}%` : 'ย้ำเลือกสูตรที่ร่วมรายการ'}
- ${p.finalPrice ? `ย้ำ Final Price ${formatMoney(p.finalPrice)} บาท` : 'ย้ำเงื่อนไขในตะกร้า'}
- ${p.gift ? `ย้ำของแถม ${formatGiftLine(p)}` : 'ย้ำความคุ้มของโปร'}
- ${p.allVariantsSelected ? 'ย้ำเลือกได้ทุกสูตรที่ร่วมรายการ' : `ย้ำสูตร/สี ${formatVariantList(p.selectedVariants)}`}
- ${p.limited ? 'ย้ำว่าข้อมูลโปรระบุจำนวนจำกัด' : 'ย้ำดูรายละเอียดก่อนเลือกซื้อ'}
- ปิดให้กดตะกร้า`;
}

function buildKmbExperienceLine(p, variant){
  if (p.promotionType.id === 'confidence_set') {
    return `${variant?.name || 'กลิ่นที่เลือก'} ให้ Character ${formatMood(variant)} แล้วจับคู่กับ Underarm Dry Serum เป็น Routine ความหอมและความมั่นใจในชีวิตประจำวัน`;
  }

  if (p.promotionType.id === 'fragrance_layering_set') {
    return `ลำดับการใช้คือ Shower → Lotion → EDT เริ่มความหอมตอนอาบน้ำ ต่อด้วยการบำรุงผิว แล้วปิดท้ายด้วยกลิ่น ${variant?.name || 'ที่เลือก'} ให้กลิ่นไปในทิศทางเดียวกัน`;
  }

  if (p.promotionType.id === 'fragrance_duo') {
    return 'ใช้สลับตาม Mood หรือจัดเป็น Routine ความหอมในวันที่อยากเปลี่ยน Character';
  }

  return `${variant?.name || 'กลิ่นที่เลือก'} เหมาะกับ Mood ${formatMood(variant)} และโอกาสอย่าง ${formatOccasion(variant)}`;
}

function buildKmbChooseByMood(p){
  if (p.selectedFragrances.length) {
    return p.selectedFragrances.map(variant =>
      `- เลือก ${variant.name} เมื่ออยากได้ Mood ${formatMood(variant)} ใช้กับ ${formatOccasion(variant)}`
    ).join('\n');
  }

  return (p.knowledge.choose_by_mood || []).map(line => `- ${line}`).join('\n');
}

function buildKmbMoodChoicesSpeech(p){
  if (p.selectedFragrances.length) {
    return p.selectedFragrances.map(variant =>
      `${variant.name} เหมาะกับ Mood ${formatMood(variant)} และโอกาสอย่าง ${formatOccasion(variant)}`
    ).join(' ส่วน ');
  }

  const moodChoices = (p.knowledge.choose_by_mood || []).slice(0, 6);
  return moodChoices.length
    ? `ถ้ายังไม่ได้ล็อกกลิ่น ให้ใช้ Mood เป็นตัวเลือก เช่น ${moodChoices.join(' | ')}`
    : 'ถ้ายังไม่ได้ล็อกกลิ่น ให้กดตะกร้าแล้วเลือกกลิ่นที่ร่วมรายการจาก Mood และ Character ที่ชอบ';
}

function buildKmbPainPointSpeech(p, fragrance){
  const character = getBrandCharacter(p);
  if (fragrance) {
    return `หลายคนอยากมีกลิ่นหรือคาแรกเตอร์ที่ชัด แต่ไม่อยากเลือกกลิ่นแบบสุ่ม สำหรับโปรนี้จุดจำง่ายอยู่ที่ ${fragrance.name} ให้ Mood ${formatMood(fragrance)} และใช้กับ ${formatOccasion(fragrance)}`;
  }

  return `${character.pain_point_lens} ถ้าโปรไม่ได้ระบุกลิ่น ให้เริ่มจาก Mood ที่อยากได้ แล้วกดตะกร้าเพื่อเลือกกลิ่นที่ร่วมรายการ`;
}

function buildKmbProductRoleSpeech(p){
  const text = p.raw || p.mainProductText || '';
  const roles = [];
  if (/edt|perfume|fragrance|น้ำหอม/i.test(text) || p.selectedFragrances.length) {
    roles.push('EDT เป็นตัวปิด Character ของลุคและเป็นกลิ่นหลักที่คนจำ Mood ได้');
  }
  if (/underarm|dry serum|ใต้วงแขน/i.test(text) || hasProductId(p.matchedProducts, 'underarm_dry_serum')) {
    roles.push('Underarm Dry Serum เป็นชิ้นที่พาไปสู่ Routine ความมั่นใจในชีวิตประจำวัน');
  }
  if (/shower|เจลอาบน้ำ/i.test(text) || hasProductId(p.matchedProducts, 'perfume_shower_gel')) {
    roles.push('Shower เป็นจุดเริ่มต้นของ Routine ความหอมตั้งแต่ตอนอาบน้ำ');
  }
  if (/lotion|โลชั่น/i.test(text) || hasProductId(p.matchedProducts, 'body_lotion_revamp')) {
    roles.push('Lotion เป็นชั้นบำรุงผิวและช่วยให้กลิ่นใน Routine ไปในทิศทางเดียวกัน');
  }

  return roles.join(' ') || 'สินค้าในโปรนี้ขายจาก Mood, Character และโอกาสใช้งาน โดยยึดข้อมูลที่อยู่ในตะกร้า';
}

function buildKmbHook(p, scriptVariant){
  const variant = getPrimaryFragrance(p);
  const options = [
    `ถ้าวันนี้อยากได้ Mood ${formatMood(variant)} และ Character ที่จำง่าย โปรนี้ของ ${p.brandName} อยู่ในตะกร้า`,
    `เลือกกลิ่นประจำตัวจาก Lifestyle ก่อน แล้วค่อยดูความคุ้มของโปรนี้ในตะกร้า`,
    `${p.title || 'โปรนี้'} เล่นกับ Mood, Character และโอกาสใช้งานได้ชัดมาก`
  ];
  return options[scriptVariant % options.length];
}

function buildKmbScript(p, scriptVariant = 0){
  const fragrance = getPrimaryFragrance(p);
  const hook = buildKmbHook(p, scriptVariant);
  const character = getBrandCharacter(p);
  const priceNormal = p.regular ? `ราคาปกติ ${formatMoney(p.regular)} บาท` : 'ไม่มีข้อมูลราคาปกติ';
  const pricePromo = p.promoPrice ? `ราคาพิเศษ ${formatMoney(p.promoPrice)} บาท` : 'ไม่มีข้อมูลราคาพิเศษ';
  const discountLine = formatDiscountLine(p);
  const averageLine = formatAverageLine(p);
  const items = formatItemsInSet(p);
  const experience = buildKmbExperienceLine(p, fragrance);
  const painSpeech = buildKmbPainPointSpeech(p, fragrance);
  const moodChoicesSpeech = buildKmbMoodChoicesSpeech(p);
  const productRoleSpeech = buildKmbProductRoleSpeech(p);
  const moodSpeech = fragrance
    ? ''
    : 'ถ้าโปรไม่ได้ระบุกลิ่น ให้เลือกกลิ่นที่ร่วมรายการตาม Mood และสไตล์ที่ชอบ';
  const layeringSpeech = p.promotionType.id === 'fragrance_layering_set'
    ? 'เซ็ตนี้เป็น Routine ความหอม เริ่มจาก Shower ต่อด้วย Lotion แล้วปิดด้วย EDT เพื่อให้กลิ่นไปในทิศทางเดียวกัน'
    : experience;
  const sellingAngle = scriptVariant % 2 === 1 && fragrance?.selling_angles?.length
    ? `${p.sellingAngle} | ${fragrance.selling_angles[scriptVariant % fragrance.selling_angles.length]}`
    : p.sellingAngle;

  return `# สรุปข้อมูลโปรโมชั่น

- แบรนด์: ${p.brandName}
- ชื่อโปร: ${p.title || 'ไม่ระบุชื่อโปร'}
- สินค้าในเซ็ต: ${items}
- ของแถม: ${formatGiftLine(p)}
- ราคาปกติ: ${p.regular ? `${formatMoney(p.regular)} บาท` : '-'}
- ราคาพิเศษ: ${p.promoPrice ? `${formatMoney(p.promoPrice)} บาท` : '-'}
- ส่วนลด: ${p.discount ? `${formatMoney(p.discount)} บาท` : '-'}
- เปอร์เซ็นต์ส่วนลด: ${p.discountPercent ? `ประมาณ ${formatPercent(p.discountPercent)}` : '-'}
- จำนวนสินค้า: ${p.itemCount ? `${p.itemCount} ชิ้น` : 'ไม่ระบุ'}
- ราคาเฉลี่ยต่อชิ้น: ${p.averagePrice ? `${formatMoney(p.averagePrice)} บาท` : '-'}
- Promotion Type: ${p.promotionType.name}
- Brand Character: ${character.positioning}
- Pain Point Lens: ${character.pain_point_lens}
- Selling Angle: ${sellingAngle}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิด Mood และปัญหาที่ลูกค้าเจอ', [
  hook,
  painSpeech,
  `โปรนี้ได้ ${items}`,
  moodSpeech,
  `ไม่ต้องเริ่มจากโน้ตกลิ่นยาวๆ หรอก เริ่มจากภาพจำของคนใช้ก่อน เช่น วันนี้อยากดูสดใส ดูมีคลาส ดูอบอุ่น ดูมั่นใจ หรือดูสุขุม แล้วค่อยพาไปเลือกกลิ่น`,
  `ถ้ากำลังหากลิ่นประจำตัว หรืออยากให้การอาบน้ำ ทาผิว และน้ำหอมไปในทิศทางเดียวกัน โปรนี้เป็นโปรที่ดูง่ายในตะกร้า`,
  `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? discountLine : '',
  'ใครอยากได้กลิ่นประจำตัวที่เลือกตาม Mood ได้ กดตะกร้าเพื่อดูโปรนี้'
])}

${buildSession(2, 'เล่า Routine และเลือกกลิ่นให้เป็นภาพ', [
  layeringSpeech,
  productRoleSpeech,
  moodChoicesSpeech,
  `วันนี้อยากให้กลิ่นแบบไหน ถ้าอยากหวานสดใสให้เลือก Mood สดใส ถ้าอยากดูหรูให้เลือก Mood มีคลาส ถ้าอยากอบอุ่นให้เลือก Mood Cozy ถ้าอยากมั่นใจให้เลือก Mood โดดเด่น`,
  `โปรนี้ไม่ได้ขายแค่ชิ้นเดียว แต่ขายเป็น Lifestyle ทั้งชุด กลิ่นต้องเข้ากับสถานการณ์และตัวตนที่อยากสื่อด้วย`,
  p.averagePrice ? `${averageLine}.` : '',
  `ย้ำโปรอีกครั้ง ${pricePromo}${p.discount ? ` ลด ${formatMoney(p.discount)} บาท` : ''}`,
  'กดตะกร้าเพื่อเลือกกลิ่นหรือสูตรที่ร่วมรายการ'
])}

${buildSession(3, 'ทวนความคุ้มและปิดให้เลือกในตะกร้า', [
  `ทวนปิดโปรนี้ ได้ ${items}`,
  `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? `${discountLine}.` : '',
  p.averagePrice ? `${averageLine}.` : '',
  p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '',
  `ถ้ายังเลือกกลิ่นไม่ถูก อย่าเพิ่งเดาว่ากลิ่นไหนดัง ให้เริ่มจาก Mood และคาแรกเตอร์ที่อยากได้ แล้วค่อยกดตะกร้าไปเลือกกลิ่นที่ร่วมรายการ`,
  'ถ้าอยากได้กลิ่นที่เล่า Character ตัวเองได้ชัด กดตะกร้า เลือกกลิ่นที่ใช่ แล้วเช็กเงื่อนไขโปรก่อนตัดสินใจ'
])}

# Key Message สำหรับ MC

- ${p.brandName} เป็น Lifestyle Fragrance Brand
- โปรนี้คือ ${p.promotionType.name}
- เหมาะกับคนที่เลือกกลิ่นไม่ถูก อยากได้คาแรกเตอร์ชัด หรืออยากให้ Routine ความหอมไปในทิศทางเดียวกัน
- ${sellingAngle}
- ${fragrance ? `${fragrance.name} ให้ Mood ${formatMood(fragrance)}` : 'ถ้าไม่ระบุกลิ่น ให้เลือกได้ทุกกลิ่นที่ร่วมรายการ'}
- ใช้ได้กับโอกาสอย่าง ${formatOccasion(fragrance)}
- ${priceNormal}
- ${pricePromo}
- ${discountLine}
- ${averageLine}
- กดตะกร้าเพื่อเลือกกลิ่นหรือสูตรที่ร่วมรายการ

# Producer Push Line

- เปิดด้วย Mood และ Character
- ย้ำแบรนด์ ${p.brandName}
- ดัน ${p.promotionType.name} ขึ้นตะกร้า
- ย้ำ ${sellingAngle}
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ย้ำ ${discountLine}
- ย้ำ ${averageLine}
- ให้เลือกตามสไตล์ที่ชอบ
- ปิดด้วยกดตะกร้า`;
}

function hasDgmrSeriesSpecified(p){
  return /jingi|จิงกิ|dlaesoo|ดาเลซู|jinsoo|จินซู/i.test(p.raw);
}

function buildDgmrChooseByConcern(p){
  if (hasDgmrSeriesSpecified(p)) {
    return 'โปรโมชั่นระบุ Series แล้ว โฟกัสตาม Series ที่อยู่ในข้อมูลโปรเท่านั้น';
  }

  return (p.knowledge.choose_by_hair_concern || []).map(line => `- ${line}`).join('\n');
}

function getDgmrRelevantProducts(p){
  const matched = (p.matchedProducts || []).map(item => item.product).filter(Boolean);
  return matched.length ? matched : (p.knowledge.products || []);
}

function getDgmrConcernPoints(p){
  return uniqueFilled(getDgmrRelevantProducts(p).flatMap(product => product.hair_concerns || []));
}

function getDgmrBenefitPoints(p){
  return uniqueFilled(getDgmrRelevantProducts(p).flatMap(product => product.benefits || []));
}

function buildDgmrPainPointSpeech(p){
  const concerns = getDgmrConcernPoints(p).slice(0, 6);
  return `โปรนี้เปิดจากปัญหาผมและหนังศีรษะได้เลย ไม่ว่าจะเป็น ${listForSpeech(concerns, 'ปัญหาผมและหนังศีรษะที่อยู่ในตะกร้า')} แล้วค่อยพาเข้า Routine ที่เหมาะกับสินค้าในเซ็ต`;
}

function buildDgmrConcernChoiceSpeech(p){
  if (hasDgmrSeriesSpecified(p)) {
    return 'โปรนี้มี Series ในข้อมูลแล้ว จึงโฟกัส Routine ของ Series นั้นตามข้อมูลโปร';
  }

  const choices = (p.knowledge.choose_by_hair_concern || []).slice(0, 3);
  return choices.length
    ? `ถ้ายังไม่ได้ล็อก Series ไว้ เลือกตามปัญหาผมได้เลย ${choices.join('. ')}.`
    : 'ถ้ายังไม่ได้ระบุ Series เลือกสูตรที่ร่วมรายการตามปัญหาผมในตะกร้า';
}

function buildDgmrBenefitSpeech(p){
  const benefits = getDgmrBenefitPoints(p).slice(0, 5);
  return `จุดเด่นของ Routine นี้คือ ${listForSpeech(benefits, 'บทบาทของสินค้าใน Routine ดูแลผม')}`;
}

function buildDgmrProductRoles(p){
  const text = p.raw;
  const roles = [];
  if (/แชมพู|shampoo/i.test(text)) {
    roles.push('Shampoo เป็นขั้นตอนทำความสะอาดหนังศีรษะและเส้นผม ให้หนังศีรษะรู้สึกสะอาดและเบาสบาย');
  }
  if (/ครีมนวด|conditioner/i.test(text)) {
    roles.push('Conditioner เป็นขั้นตอนบำรุงเส้นผม ช่วยให้ผมนุ่มและหวีง่ายขึ้น');
  }
  if (/hair\s*tonic|โทนิค/i.test(text)) {
    roles.push('Hair Tonic เป็นขั้นตอนบำรุงหนังศีรษะหลังสระ เหมือนสกินแคร์สำหรับหนังศีรษะ');
  }
  if (/hair\s*pack|ทรีตเมนต์|treatment/i.test(text)) {
    roles.push('Hair Pack เป็นขั้นตอน Treatment สำหรับผมแห้งเสียมากหรือพันกันง่าย');
  }

  return roles.join(' ') || 'เลือกสินค้าให้ตรงกับ Routine ดูแลผมที่อยู่ในตะกร้า';
}

function buildDgmrRoutineLine(p){
  const typeId = p.promotionType.id;
  if (typeId.includes('hair_fall_complete_set')) {
    return 'ใช้เป็น Routine ได้เลย เริ่มจาก Shampoo ทำความสะอาด ตามด้วย Conditioner บำรุงเส้นผม แล้วปิดท้ายด้วย Hair Tonic บำรุงหนังศีรษะหลังสระ';
  }
  if (typeId.includes('damage_recovery_set')) {
    return 'ใช้เป็น Routine คือ Shampoo ตามด้วย Conditioner แล้วเสริมด้วย Hair Pack สำหรับคนที่อยากดูแลผมแห้งเสียแบบต่อเนื่อง';
  }
  if (typeId.includes('scalp_care_set')) {
    return 'ใช้ Shampoo คู่กับ Hair Tonic เน้นดูแลหนังศีรษะและรากผมในขั้นตอนเดียวกัน';
  }
  if (typeId.includes('daily_hair_care_set')) {
    return 'ใช้ Shampoo คู่กับ Conditioner เป็น Routine พื้นฐานสำหรับทำความสะอาดและบำรุงเส้นผม';
  }
  if (typeId.includes('stock_up_set')) {
    return 'เลือกสูตรตามปัญหาผม แล้วซื้อใช้ต่อเนื่องได้ยาวสำหรับคนใช้ประจำ';
  }

  return 'เลือกสินค้าในเซ็ตให้ตรงกับปัญหาผมและใช้ต่อเนื่อง';
}

function buildDgmrHook(p, scriptVariant){
  const options = [
    `ถ้ากำลังมองหา Routine ดูแลหนังศีรษะและเส้นผมที่ซื้อใช้ต่อเนื่องได้ยาว โปรนี้ของ ${p.brandShort} อยู่ในตะกร้า`,
    `เริ่มจากปัญหาผมก่อน แล้วค่อยเลือก Routine ที่ตอบโจทย์ โปรนี้ช่วยจัดเซ็ตให้ดูง่ายในตะกร้า`,
    `${p.title || 'โปรนี้'} เหมาะกับคนที่อยากดูแลผมแบบต่อเนื่องและคุมงบได้ชัด`
  ];

  return options[scriptVariant % options.length];
}

function buildDgmrScript(p, scriptVariant = 0){
  const items = formatItemsInSet(p);
  const character = getBrandCharacter(p);
  const priceNormal = p.regular ? `ราคาปกติ ${formatMoney(p.regular)} บาท` : 'ไม่มีข้อมูลราคาปกติ';
  const pricePromo = p.promoPrice ? `ราคาพิเศษ ${formatMoney(p.promoPrice)} บาท` : 'ไม่มีข้อมูลราคาพิเศษ';
  const discountLine = formatDiscountLine(p);
  const averageMain = formatAverageLine(p);
  const averageAll = formatAverageIncludingGiftLine(p);
  const routineLine = buildDgmrRoutineLine(p);
  const hook = buildDgmrHook(p, scriptVariant);
  const roleSpeech = buildDgmrProductRoles(p);
  const painSpeech = buildDgmrPainPointSpeech(p);
  const concernSpeech = buildDgmrConcernChoiceSpeech(p);
  const benefitSpeech = buildDgmrBenefitSpeech(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const sellingAngle = scriptVariant % 2 === 1
    ? `${p.sellingAngle} | เน้น Routine และความต่อเนื่อง`
    : p.sellingAngle;

  return `# สรุปข้อมูลโปรโมชั่น

- แบรนด์: ${p.brandName}
- ชื่อโปร: ${p.title || 'ไม่ระบุชื่อโปร'}
- สินค้าในเซ็ต: ${items}
- ของแถม: ${formatGiftLine(p)}
- ราคาปกติ: ${p.regular ? `${formatMoney(p.regular)} บาท` : '-'}
- ราคาพิเศษ: ${p.promoPrice ? `${formatMoney(p.promoPrice)} บาท` : '-'}
- ส่วนลด: ${p.discount ? `${formatMoney(p.discount)} บาท` : '-'}
- เปอร์เซ็นต์ส่วนลด: ${p.discountPercent ? `ประมาณ ${formatPercent(p.discountPercent)}` : '-'}
- จำนวนสินค้าหลัก: ${p.itemCount ? `${p.itemCount} ชิ้น` : 'ไม่ระบุ'}
- จำนวนรวมของแถม: ${p.totalCount ? `${p.totalCount} ชิ้น` : 'ไม่ระบุ'}
- ราคาเฉลี่ยต่อสินค้าหลัก: ${p.averagePrice ? `${formatMoney(p.averagePrice)} บาท` : '-'}
- ราคาเฉลี่ยเมื่อรวมของแถม: ${p.averageIncludingGift ? `${formatMoney(p.averageIncludingGift)} บาท` : '-'}
- มูลค่าของแถม: ${p.giftValue ? `${formatMoney(p.giftValue)} บาท` : '-'}
- Promotion Type: ${p.promotionType.name}
- Brand Character: ${character.positioning}
- Pain Point Lens: ${character.pain_point_lens}
- Selling Angle: ${sellingAngle}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิด Hair Concern และโปรหลัก', [
  hook,
  painSpeech,
  `เซ็ตนี้ได้ ${items}`,
  `ถ้ายังไม่แน่ใจว่าควรเริ่มจากอะไร ไม่ต้องกังวล เดี๋ยวจะพาไล่ทีละขั้นตอนว่าแต่ละชิ้นในเซ็ตทำหน้าที่อะไรบ้าง`,
  `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? `${discountLine}.` : '',
  giftSpeech,
  'กดตะกร้าเพื่อดูรายละเอียดเซ็ตและเลือกสูตรที่ร่วมรายการ'
])}

${buildSession(2, 'ลงรายละเอียด Routine และบทบาทสินค้า', [
  'มาดูกันว่าแต่ละชิ้นในเซ็ตทำหน้าที่อะไรบ้าง',
  roleSpeech,
  concernSpeech,
  benefitSpeech,
  routineLine,
  `${p.brandShort} ขายจากปัญหาผมและ Routine เป็นหลัก ช่วงนี้เล่าจากสิ่งที่เจอในชีวิตประจำวัน เช่น ผมมันง่ายหลังสระ ผมพันกันง่าย ผมแห้งเสียจากการทำสี หรือหนังศีรษะต้องการการบำรุง`,
  p.gift ? `${giftSpeech} ช่วยให้ Routine หลังสระครบขึ้น` : '',
  `ราคาอีกครั้ง ${pricePromo}${p.discount ? ` ลด ${formatMoney(p.discount)} บาท` : ''}`,
  'กดตะกร้าเพื่อเลือกสูตรและดูเงื่อนไขโปร'
])}

${buildSession(3, 'ทวนเซ็ต ความคุ้ม และปิดการขาย', [
  `ทวนปิดโปรนี้ ได้ ${items}`,
  giftSpeech,
  `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? `${discountLine}.` : '',
  `รวมทั้งหมด${p.itemCount ? ` ${p.itemCount} ชิ้น` : ''}${p.totalCount ? ` ถ้านับของแถมด้วยเป็น ${p.totalCount} ชิ้น` : ''}`,
  averageMain,
  averageAll,
  `ถ้ายังลังเล ให้กลับไปที่ปัญหาผมของตัวเองก่อน แล้วค่อยเลือกสูตรที่ร่วมรายการในตะกร้า เพราะโปรนี้ควรเลือกจาก Routine ที่ใช้ต่อเนื่อง ไม่ใช่การซื้อเพราะชื่อสินค้าอย่างเดียว`,
  'ปิดด้วยการกดตะกร้า เลือกสูตรตามปัญหาผม แล้วซื้อใช้ต่อเนื่องได้ยาว'
])}

# Key Message สำหรับ MC

- ${p.brandName} เป็น Hair Care Brand ที่เน้น Routine ดูแลผมและหนังศีรษะ
- โปรนี้คือ ${p.promotionType.name}
- เหมาะกับคนที่กำลังเจอ ${listForSpeech(getDgmrConcernPoints(p).slice(0, 6), 'ปัญหาผมและหนังศีรษะที่อยากดูแล')}
- ${sellingAngle}
- สินค้าในเซ็ต: ${items}
- ${routineLine}
- ${p.gift ? `ของแถม ${formatGiftLine(p)}` : 'ไม่มีข้อมูลของแถม'}
- ${priceNormal}
- ${pricePromo}
- ${discountLine}
- กดตะกร้าเพื่อเลือกสูตรที่ร่วมรายการ

# Producer Push Line

- เปิดจาก Hair Concern ก่อน
- ย้ำแบรนด์ ${p.brandName}
- ดัน ${p.promotionType.name} ขึ้นตะกร้า
- ย้ำ ${sellingAngle}
- ย้ำสินค้าในเซ็ต ${items}
- ย้ำของแถม ${formatGiftLine(p)}
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ย้ำ ${discountLine}
- ปิดด้วยกดตะกร้า`;
}

function createScript(p, scriptVariant = 0){
  const script = p.brandId === 'dgmr'
    ? buildDgmrScript(p, scriptVariant)
    : p.brandId === 'kmb'
      ? buildKmbScript(p, scriptVariant)
      : buildSkinoxyScript(p, scriptVariant);

  return enforceLanguageRules(script, p);
}

function enforceLanguageRules(script, p){
  const forbiddenTerms = p?.knowledge?.language_rules?.forbidden_terms || [
    'ตะกร้าสีเหลือง',
    'ครับ',
    'ค่ะ',
    'นะครับ',
    'นะคะ'
  ];

  return forbiddenTerms.reduce((result, term) => {
    const replacement = term.includes('ตะกร้า') ? 'ตะกร้า' : '';
    return result.split(term).join(replacement);
  }, script);
}

function render(promos){
  results.innerHTML = '';
  const abMode = document.getElementById('abTestMode').checked;

  promos.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const formulaLabel = p.allVariantsSelected
      ? 'ทุกสูตร/กลิ่นที่ร่วมรายการ'
      : formatVariantList(p.selectedVariants) || '-';

    const scriptSectionHtml = abMode
      ? ['A', 'B', 'C'].map((letter, i) => `
        <div class="ab-variant">
          <div class="ab-variant-header">
            <h3>แบบ ${letter}</h3>
            <button class="copy-variant" data-variant="${i}">Copy แบบ ${letter}</button>
          </div>
          <pre class="script-output">${escapeHtml(createScript(p, i))}</pre>
        </div>
      `).join('')
      : `<pre class="script-output">${escapeHtml(createScript(p, p.scriptVariant || 0))}</pre>`;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <p class="brand-label">${escapeHtml(p.brandName)}</p>
          <h2>โปรโมชั่นที่ ${p.index}</h2>
        </div>
        <div class="card-actions">
          ${abMode ? '' : '<button class="generate-again">Generate Again</button><button class="copy-one">Copy Script</button>'}
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

    if (abMode) {
      card.querySelectorAll('.copy-variant').forEach(btn => {
        btn.addEventListener('click', async () => {
          const variantIndex = Number(btn.dataset.variant);
          const letter = ['A', 'B', 'C'][variantIndex];
          await navigator.clipboard.writeText(createScript(p, variantIndex));
          setStatus(`คัดลอกโปรโมชั่นที่ ${p.index} แบบ ${letter} แล้ว`);
        });
      });
    } else {
      const script = createScript(p, p.scriptVariant || 0);
      card.querySelector('.copy-one').addEventListener('click', async () => {
        await navigator.clipboard.writeText(script);
        setStatus(`คัดลอกโปรโมชั่นที่ ${p.index} แล้ว`);
      });

      card.querySelector('.generate-again').addEventListener('click', () => {
        p.scriptVariant = (p.scriptVariant || 0) + 1;
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
