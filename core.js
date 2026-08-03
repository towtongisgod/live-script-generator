// core.js — pure parsing + script-generation logic (no DOM). Loaded via <script> in the
// browser (before app.js, same global scope) AND via require() in tests/run-tests.js.
// DOM/UI code (event listeners, render(), OCR/crop) stays in app.js — do not add DOM
// access here, it must stay Node-testable.

function loadConfigConstant(globalName, requirePath, fallback){
  if (typeof globalThis !== 'undefined' && globalThis[globalName]) return globalThis[globalName];
  if (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined') {
    try {
      return require(requirePath);
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

const LSG_ACCOUNTS = loadConfigConstant('LSG_ACCOUNTS', './config/accounts.js', []);
const SELLING_PATTERNS = loadConfigConstant('SELLING_PATTERNS', './config/patterns.js', {});
const PERSONA_CONFIG = loadConfigConstant('PLATFORM_PERSONAS', './config/personas.js', {});
const PLATFORM_PERSONAS = PERSONA_CONFIG.PLATFORM_PERSONAS || PERSONA_CONFIG || {};
const BRAND_PERSONAS = PERSONA_CONFIG.BRAND_PERSONAS || (typeof globalThis !== 'undefined' ? globalThis.BRAND_PERSONAS : {}) || {};
const AUDIENCE_PROFILES = PERSONA_CONFIG.AUDIENCE_PROFILES || (typeof globalThis !== 'undefined' ? globalThis.AUDIENCE_PROFILES : {}) || {};
const AUGUST_CONFIG = loadConfigConstant('AUGUST_TEST_PLAN', './config/august-test-plan.js', {});
const resolveAssignedPatternFromConfig = AUGUST_CONFIG.resolveAssignedPattern
  || (typeof globalThis !== 'undefined' ? globalThis.resolveAugustAssignedPattern : null);

function normalizeText(text){
  return String(text)
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
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

  // Bare "ฟรี X" (no "รับ" or "แถม" in front) — another common real-world phrasing.
  const bareFree = text.match(new RegExp(`(?<!รับ)ฟรี\\s*([\\s\\S]*?)(?=\\s*(?:${stopWords}))`, 'i'));
  if (bareFree && bareFree[1]) return cleanupPhrase(bareFree[1]);

  if ((knowledge?.brand_id || '').toLowerCase() === 'kmb') return null;

  const plusGift = text.match(new RegExp(`\\+\\s*(?!คูปอง)([\\s\\S]*?)(?=\\s*(?:${stopWords}))`, 'i'));
  if (plusGift) return cleanupPhrase(plusGift[1]);

  return null;
}

function extractRights(text){
  const match = String(text || '').match(/(?:จำนวน\s*)?(?:สิทธิ์|สิทธิ|จำกัด)\s*(?:เพียง|แค่)?\s*([\d,]+)\s*(?:สิทธิ์|สิทธิ|ชุด|เซต|คน)?/i);
  return match ? normalizeMoney(match[1]) : null;
}

function extractLiveOnly(text){
  return /live\s*only|เฉพาะ\s*ไลฟ์|ในไลฟ์นี้|ราคาไลฟ์|โปรไลฟ์/i.test(String(text || ''));
}

function extractPromoDates(text){
  const value = String(text || '');
  const matches = [
    ...value.matchAll(/(?:วันที่|ถึง|ตั้งแต่)\s*([0-3]?\d[\/.-][01]?\d(?:[\/.-]\d{2,4})?)/g),
    ...value.matchAll(/([0-3]?\d\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.))/g)
  ];
  return matches.map(match => cleanupPhrase(match[1])).filter(Boolean);
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

  return null;
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

// Same facts as formatItemsInSet, but joined with natural Thai instead of a
// literal "|" pipe — use this inside spoken Session lines, keep
// formatItemsInSet (pipes OK) for the reference header/meta card only.
function formatItemsForSpeech(p){
  return formatItemsInSet(p).split(' | ').filter(Boolean).join(' และ ');
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

function splitPromotions(raw){
  const normalized = raw
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
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

function findAccountConfig(brandOrId){
  const id = typeof brandOrId === 'string' ? brandOrId : brandOrId?.id;
  return LSG_ACCOUNTS.find(account => account.id === id) || (typeof brandOrId === 'object' ? brandOrId : null) || null;
}

function parsePromotion(text, index, knowledge, brand = null, style = null){
  const cleaned = normalizeText(text);
  const account = findAccountConfig(brand);
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
  const rights = extractRights(cleaned);
  const liveOnly = extractLiveOnly(cleaned);
  const promoDates = extractPromoDates(cleaned);
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
    accountId: account?.id || brand?.id || knowledge?.brand_id || 'skinoxy',
    accountCode: account?.account_code || brand?.account_code || 'SKN-TT',
    accountLabel: account?.label || brand?.label || knowledge?.brand || 'SKINOXY',
    platform: account?.platform || brand?.platform || 'tiktok',
    brandKey: account?.brand_key || brand?.brand_key || (knowledge?.brand_id === 'kmb' ? 'kiss' : (knowledge?.brand_id || 'skinoxy')),
    knowledgeBrandId: account?.knowledge_brand_id || knowledge?.brand_id || brand?.id || 'skinoxy',
    brandId: knowledge?.brand_id || account?.knowledge_brand_id || brand?.id || 'skinoxy',
    brandName: knowledge?.brand || brand?.label || 'SKINOXY',
    brandShort: knowledge?.brand_short || brand?.label || knowledge?.brand || 'SKINOXY',
    account,
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
    gifts: gift ? [{ name: gift, value: giftValue, count: giftCount }] : [],
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
    products: matchedProducts.map(item => ({
      id: item.product?.id || null,
      name: item.product?.name || null,
      variants: item.matchedVariants || []
    })),
    rights,
    liveOnly,
    promoDates,
    notes: [],
    promotionType,
    sellingAngle,
    limited,
    warning,
    hookVariants: { advisor: 0, bestie: 0, closer: 0 }
  };
}

// ---------------------------------------------------------------------------
// Product Truth — the facts every Selling Strategy must state identically.
// Strategies read this (and `p` directly) but must never invent, add, or
// change any of these values.
// ---------------------------------------------------------------------------
function buildProductTruth(p){
  return {
    account: p.accountId,
    accountLabel: p.accountLabel,
    accountCode: p.accountCode,
    brand: p.brandKey || p.brandId,
    brandId: p.brandId,
    brandName: p.brandName,
    platform: p.platform,
    title: p.title,
    promotion_title: p.title,
    mainProductText: p.mainProductText,
    items: formatItemsInSet(p),
    products: p.products || [],
    productId: p.product ? p.product.id : null,
    productName: p.product ? p.product.name : null,
    selectedVariantIds: (p.selectedVariants || []).map(v => v.id).filter(Boolean),
    allVariantsSelected: p.allVariantsSelected,
    normalPrice: p.regular,
    regular: p.regular,
    promoPrice: p.promoPrice,
    coupon: p.coupon,
    finalPrice: p.finalPrice,
    discount: p.discount,
    discountPercent: p.discountPercent,
    quantityTiers: p.quantityTiers,
    gift: p.gift,
    gifts: p.gifts || [],
    giftValue: p.giftValue,
    giftCount: p.giftCount,
    quantity: p.quantity,
    itemCount: p.itemCount,
    totalCount: p.totalCount,
    rights: p.rights,
    liveOnly: p.liveOnly,
    promoDates: p.promoDates || [],
    notes: p.notes || [],
    rawText: p.raw,
    limited: p.limited,
    promotionTypeId: p.promotionType?.id || null
  };
}

// ---------------------------------------------------------------------------
// Selling Strategy meta (used by app.js to label the UI — not spoken text)
// ---------------------------------------------------------------------------
const STRATEGIES = ['A', 'B', 'C'];

const STRATEGY_ALIASES = {
  advisor: 'A',
  bestie: 'B',
  closer: 'C',
  diagnose: 'A',
  lifestyle: 'B',
  value: 'C'
};

const STRATEGY_META = Object.fromEntries(STRATEGIES.map(key => {
  const pattern = SELLING_PATTERNS[key] || {};
  return [key, {
    letter: key,
    name: pattern.short_name || key,
    thai: pattern.style || '',
    description: pattern.objective || ''
  }];
}));

// ---------------------------------------------------------------------------
// SKINOXY — shared fact-speech helpers (strategy-agnostic; reused by all 3)
// ---------------------------------------------------------------------------
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

function skinoxyPriceSpeech(p){
  const tierSpeech = buildTierPriceSpeech(p);
  return tierSpeech || buildPriceSpeech(p, 'ราคาโปร');
}

function skinoxyGiftSpeech(p){
  return p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
}

function skinoxySummaryHeader(p, strategyKey){
  const character = getBrandCharacter(p);
  const meta = STRATEGY_META[strategyKey];
  return `# สรุปโปรโมชั่น
แบรนด์: ${p.brandName}
Strategy: ${meta.name} (${meta.thai})
สินค้า: ${p.mainProductText || '-'}
Brand Character: ${character.positioning}
สูตร/สี: ${formatVariantGuidance(p)}
ราคา: ${formatPriceLines(p).join(', ') || 'ไม่มีข้อมูลราคา'}
ของแถม: ${formatGiftLine(p)}
จำนวนจำกัด: ${p.limited ? 'ระบุจำนวนจำกัด' : 'ไม่ระบุ'}`;
}

// --- SKINOXY hook libraries (3 per strategy) ---
function skinoxyAdvisorHooks(p){
  const pains = getSkinoxyPainPoints(p).slice(0, 4);
  return [
    'เคยรู้สึกไหมว่าดูแลผิวสม่ำเสมออยู่แล้ว แต่ผิวก็ยังไม่ดีขึ้นเท่าที่ควร บางทีปัญหาอาจไม่ได้อยู่ที่ความขยัน แต่อยู่ที่สูตรที่เลือกไม่ตรงจุด',
    `ถ้ากำลังเจอปัญหาผิวแบบ ${listForSpeech(pains, 'ผิวที่ไม่ค่อยเป็นใจ')} อยู่ตอนนี้ ลองมาเช็กกันว่าโปร ${p.mainProductText || 'ตัวนี้'} ตอบโจทย์ตรงไหนได้บ้าง`,
    'หลายคนเลือกบอดี้แคร์หรือสกินแคร์จากชื่อหรือสีแพ็กเกจ แต่การเลือกจากปัญหาผิวตัวเองจะตรงจุดกว่ามาก วันนี้เลยอยากพามาเช็กกันทีละขั้น'
  ];
}

function skinoxyBestieHooks(p){
  return [
    'วันไหนที่อยากรู้สึกผิวดีขึ้นแบบไม่ต้องทำอะไรเยอะ ลองมีโปรนี้ติดห้องน้ำไว้ดูสิ',
    'จำความรู้สึกตอนอาบน้ำเสร็จแล้วผิวนุ่มจนอยากลูบตัวเองได้ไหม โปรนี้พาไปถึงจุดนั้นได้ง่ายๆ',
    'ถ้าเป็นคนที่ชอบดูแลตัวเองแต่ไม่อยากมีขั้นตอนเยอะ โปรนี้เหมาะกับไลฟ์สไตล์แบบนั้นเลย'
  ];
}

function skinoxyCloserHooks(p){
  const priceSpeech = skinoxyPriceSpeech(p);
  return [
    priceSpeech ? `โปรนี้ ${priceSpeech} ถูกกว่าซื้อปกติชัดเจน` : `โปรนี้ ${p.mainProductText || 'ตัวนี้'} จัดราคามาคุ้มกว่าปกติ`,
    `เซตนี้ได้ ${p.mainProductText || 'สินค้าในโปรนี้'} ครบในราคาเดียว ไม่ต้องซื้อแยกให้แพงกว่าเดิม`,
    'ถ้ากำลังเทียบราคาสกินแคร์อยู่ โปรนี้คุ้มกว่าซื้อแยกแน่นอน มาดูตัวเลขกัน'
  ];
}

function buildSkinoxyAdvisorScript(p, hookVariant = 0){
  const pains = getSkinoxyPainPoints(p).slice(0, 5);
  const priceSpeech = skinoxyPriceSpeech(p);
  const giftSpeech = skinoxyGiftSpeech(p);
  const limitedSpeech = p.limited ? 'จำนวนมีจำกัด ใครสนใจรีบตัดสินใจกดตะกร้าไว้ก่อน' : '';
  const choiceSpeech = buildSkinoxyChoiceSpeech(p);
  const painSpeech = buildSkinoxyPainPointSpeech(p);
  const hooks = skinoxyAdvisorHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  return `${skinoxySummaryHeader(p, 'advisor')}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดปัญหาและกลุ่มที่เหมาะ', [
  hook,
  painSpeech,
  'ถ้าตรงกับปัญหาที่เจออยู่ กดตะกร้าไว้ก่อนได้เลย แล้วมาดูรายละเอียดการเลือกสูตรกันต่อ'
])}

${buildSession(2, 'ช่วยเลือกสูตรให้ตรงปัญหา', [
  choiceSpeech,
  giftSpeech ? `นอกจากตัวหลัก โปรนี้${giftSpeech}เป็นส่วนเสริมด้วย` : '',
  'ถ้ายังไม่แน่ใจว่าเลือกสูตรไหนดี ลองกลับไปเทียบกับปัญหาผิวที่เจอจริงอีกรอบ แล้วเลือกตัวที่ตรงที่สุด'
])}

${buildSession(3, 'ราคา เงื่อนไข และปิดด้วยความเหมาะสม', [
  priceSpeech ? `สำหรับราคา ${priceSpeech}` : 'ราคาให้ดูตามรายละเอียดในตะกร้า',
  limitedSpeech,
  pains.length
    ? `สรุปคือถ้ากำลังเจอ ${listForSpeech(pains, 'ปัญหาผิวที่ว่ามา')} โปรนี้ตอบโจทย์ได้ตรงจุด กดตะกร้าไว้แล้วเลือกสูตรที่เหมาะกับตัวเองได้เลย`
    : 'กดตะกร้าไว้แล้วเลือกสูตรที่ตรงกับปัญหาผิวของตัวเองได้เลย'
])}

# Key Message
- Strategy: Advisor
- ${p.brandName} ${p.mainProductText || 'สินค้าในโปรนี้'}
- เหมาะกับคนที่กำลังเจอ ${listForSpeech(pains, 'ปัญหาผิวที่อยากเลือกสูตรให้ตรงจุด')}
- ${formatVariantGuidance(p)}
${formatPriceLines(p).map(line => `- ${line}`).join('\n')}
${p.gift ? `- ของแถม ${formatGiftLine(p)}` : ''}
${p.limited ? '- ข้อมูลโปรระบุจำนวนจำกัด' : ''}
- ใช้คำว่า ตะกร้า เท่านั้น

# Producer Push Line
- ดัน ${p.mainProductText || 'สินค้าในโปร'} ขึ้นตะกร้า
- ย้ำว่าโปรนี้ช่วยแก้ปัญหาผิวแบบไหน
- ${p.promoPrice ? `ย้ำราคาโปร ${formatMoney(p.promoPrice)} บาท` : 'ย้ำดูราคาในตะกร้า'}
- ${p.gift ? `ย้ำของแถม ${formatGiftLine(p)}` : 'ย้ำความคุ้มของโปร'}
- ${p.allVariantsSelected ? 'ย้ำเลือกได้ทุกสูตรที่ร่วมรายการตามปัญหาผิว' : `ย้ำสูตร/สี ${formatVariantList(p.selectedVariants)}`}
- ปิดให้กดตะกร้า`;
}

function buildSkinoxyBestieScript(p, hookVariant = 0){
  const pains = getSkinoxyPainPoints(p).slice(0, 4);
  const benefits = getSkinoxyBenefits(p).slice(0, 4);
  const priceSpeech = skinoxyPriceSpeech(p);
  const giftSpeech = skinoxyGiftSpeech(p);
  const limitedSpeech = p.limited ? 'จำนวนมีจำกัดด้วยนะ ใครเล็งอยู่รีบกดตะกร้าไว้ก่อน' : '';
  const hooks = skinoxyBestieHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  const scenePicture = benefits.length
    ? `ลองนึกภาพหลังใช้ ${p.mainProductText || 'ตัวนี้'} ดู ${listForSpeech(benefits, 'ผิวดูดีขึ้น')} แบบที่รู้สึกได้เองเลย`
    : `ลองนึกภาพหลังใช้ ${p.mainProductText || 'ตัวนี้'} ดู เป็นความรู้สึกที่ผิวเปลี่ยนไปแบบจับต้องได้`;

  const styleRecommend = p.product && p.selectedVariants.length
    ? p.selectedVariants.map(variant => {
        const pain = (variant.pain_points || []).slice(0, 2).join(' หรือ ');
        const label = [variant.name, variant.color].filter(Boolean).join(' ');
        return `ถ้าเป็นคนที่มักเจอ ${pain || 'ปัญหาผิวแบบนี้'} ลอง ${label} ดู`;
      }).join(' ')
    : 'ลองเลือกตามความรู้สึกที่อยากได้ แล้วเช็กรายละเอียดในตะกร้าอีกที';

  return `${skinoxySummaryHeader(p, 'bestie')}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดจากชีวิตประจำวันและภาพหลังใช้', [
  hook,
  scenePicture,
  pains.length ? `ยิ่งถ้ากำลังเจอ ${listForSpeech(pains, 'ผิวที่ไม่ค่อยเป็นใจ')} อยู่ด้วย ตัวนี้น่าจะช่วยได้เยอะ` : '',
  'ใครสนใจกดตะกร้าเก็บไว้ก่อนได้เลย'
])}

${buildSession(2, 'เลือกให้เข้ากับสไตล์ตัวเอง', [
  styleRecommend,
  'ใครกำลังเล็งอยู่ทักมาคุยในคอมเมนต์ได้เลยว่าผิวเป็นแบบไหน จะได้แนะนำให้ตรงขึ้น',
  giftSpeech ? `แถมยังมี ${formatGiftLine(p)} ให้ด้วย ยิ่งคุ้ม` : ''
])}

${buildSession(3, 'ราคาน่ารักและปิดแบบเพื่อนๆ', [
  priceSpeech ? `ราคาก็น่ารักด้วย ${priceSpeech}` : 'ราคาให้ดูตามรายละเอียดในตะกร้า',
  limitedSpeech,
  'ถ้าอยากลองดูแลผิวให้ดีขึ้นแบบง่ายๆ กดตะกร้าแล้วเลือกสูตรที่ชอบไปเลย'
])}

# Key Message
- Strategy: Bestie
- ${p.brandName} ${p.mainProductText || 'สินค้าในโปรนี้'}
- ภาพหลังใช้: ${listForSpeech(benefits, 'ผิวดูดีขึ้น')}
- ${formatVariantGuidance(p)}
${formatPriceLines(p).map(line => `- ${line}`).join('\n')}
${p.gift ? `- ของแถม ${formatGiftLine(p)}` : ''}
- ใช้คำว่า ตะกร้า เท่านั้น

# Producer Push Line
- เปิดจากภาพชีวิตประจำวัน
- ชวนคอมเมนต์ถามปัญหาผิว
- ${p.promoPrice ? `ย้ำราคาโปร ${formatMoney(p.promoPrice)} บาท` : 'ย้ำดูราคาในตะกร้า'}
- ${p.gift ? `ย้ำของแถม ${formatGiftLine(p)}` : 'ย้ำความคุ้มของโปร'}
- ปิดให้กดตะกร้า`;
}

function buildSkinoxyCloserScript(p, hookVariant = 0){
  const priceSpeech = skinoxyPriceSpeech(p);
  const giftSpeech = skinoxyGiftSpeech(p);
  const limitedSpeech = p.limited ? 'ย้ำว่าจำนวนมีจำกัดจริงตามข้อมูลโปร ใครสนใจรีบกดตะกร้า' : '';
  const hooks = skinoxyCloserHooks(p);
  const hook = hooks[hookVariant % hooks.length];
  const itemize = `เซตนี้ได้ ${p.mainProductText || 'สินค้าในโปรนี้'}${p.gift ? ` พร้อม ${formatGiftLine(p)}` : ''}`;
  const valueLine = p.averagePrice ? `เฉลี่ยแล้วตกชิ้นละ ${formatMoney(p.averagePrice)} บาทเท่านั้น` : '';

  return `${skinoxySummaryHeader(p, 'closer')}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดด้วยโปรโมชั่นและสิ่งที่ได้รับ', [
  hook,
  itemize,
  priceSpeech || 'ราคาให้ดูตามรายละเอียดในตะกร้า',
  'กดตะกร้าเก็บไว้ก่อนได้เลย เดี๋ยวพาไปดูความคุ้มแบบละเอียด'
])}

${buildSession(2, 'เทียบราคาและความคุ้ม', [
  priceSpeech ? `ทวนอีกรอบ ${priceSpeech}` : '',
  valueLine,
  giftSpeech,
  p.allVariantsSelected ? 'เลือกได้ทุกสูตรที่ร่วมรายการ ไม่ต้องกังวลว่าจะพลาดสูตรที่ชอบ' : `สูตรในโปรนี้คือ ${formatVariantList(p.selectedVariants)}`
])}

${buildSession(3, 'ปิดการขายย้ำหลายจุด', [
  `สรุปอีกรอบ ${itemize}`,
  priceSpeech || '',
  limitedSpeech,
  'ถ้ากำลังจะซื้อสกินแคร์อยู่แล้ว โปรนี้คุ้มกว่าซื้อแยกแน่นอน กดตะกร้าตอนนี้เลย'
])}

# Key Message
- Strategy: Closer
- ${p.brandName} ${p.mainProductText || 'สินค้าในโปรนี้'}
${formatPriceLines(p).map(line => `- ${line}`).join('\n')}
${p.gift ? `- ของแถม ${formatGiftLine(p)}` : ''}
${p.averagePrice ? `- เฉลี่ยชิ้นละ ${formatMoney(p.averagePrice)} บาท` : ''}
${p.limited ? '- ข้อมูลโปรระบุจำนวนจำกัด' : ''}
- ใช้คำว่า ตะกร้า เท่านั้น

# Producer Push Line
- ดัน ${p.mainProductText || 'สินค้าในโปร'} ขึ้นตะกร้า
- ย้ำราคาปกติ/ราคาโปรซ้ำๆ
- ${p.gift ? `ย้ำของแถม ${formatGiftLine(p)}` : 'ย้ำความคุ้มของโปร'}
- ${p.limited ? 'ย้ำจำนวนจำกัด' : 'ย้ำให้ตัดสินใจตอนนี้'}
- ปิดให้กดตะกร้า`;
}

// ---------------------------------------------------------------------------
// KMB — shared fact-speech helpers (strategy-agnostic; reused by all 3)
// ---------------------------------------------------------------------------
function buildKmbExperienceLine(p, variant){
  if (p.promotionType.id === 'confidence_set') {
    return `${variant?.name || 'กลิ่นที่เลือก'} ให้ Character ${formatMood(variant)} แล้วจับคู่กับ Underarm Dry Serum เป็น Routine ความหอมและความมั่นใจในชีวิตประจำวัน`;
  }

  if (p.promotionType.id === 'fragrance_layering_set') {
    return `ลำดับการใช้คือเริ่มจาก Shower ตามด้วย Lotion แล้วปิดท้ายด้วยกลิ่น ${variant?.name || 'ที่เลือก'} เริ่มความหอมตอนอาบน้ำ ต่อด้วยการบำรุงผิว ให้กลิ่นไปในทิศทางเดียวกัน`;
  }

  if (p.promotionType.id === 'fragrance_duo') {
    return 'ใช้สลับตาม Mood หรือจัดเป็น Routine ความหอมในวันที่อยากเปลี่ยน Character';
  }

  return `${variant?.name || 'กลิ่นที่เลือก'} เหมาะกับ Mood ${formatMood(variant)} และโอกาสอย่าง ${formatOccasion(variant)}`;
}

function buildKmbMoodChoicesSpeech(p){
  if (p.selectedFragrances.length) {
    return p.selectedFragrances.map(variant =>
      `${variant.name} เหมาะกับ Mood ${formatMood(variant)} และโอกาสอย่าง ${formatOccasion(variant)}`
    ).join(' ส่วน ');
  }

  const moodChoices = (p.knowledge.choose_by_mood || []).slice(0, 6);
  return moodChoices.length
    ? `ถ้ายังไม่ได้ล็อกกลิ่น ให้ใช้ Mood เป็นตัวเลือกได้เลย ${moodChoices.join('. ')}.`
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

function kmbPriceParts(p){
  const priceNormal = p.regular ? `ราคาปกติ ${formatMoney(p.regular)} บาท` : 'ไม่มีข้อมูลราคาปกติ';
  const pricePromo = p.promoPrice ? `ราคาพิเศษ ${formatMoney(p.promoPrice)} บาท` : 'ไม่มีข้อมูลราคาพิเศษ';
  const tierSpeech = buildTierPriceSpeech(p);
  return { priceNormal, pricePromo, tierSpeech };
}

function kmbSummaryHeader(p, strategyKey, items){
  const character = getBrandCharacter(p);
  const meta = STRATEGY_META[strategyKey];
  return `# สรุปข้อมูลโปรโมชั่น

- แบรนด์: ${p.brandName}
- Strategy: ${meta.name} (${meta.thai})
- ชื่อโปร: ${p.title || 'ไม่ระบุชื่อโปร'}
- สินค้าในเซ็ต: ${items}
- ของแถม: ${formatGiftLine(p)}
- ราคาปกติ: ${p.regular ? `${formatMoney(p.regular)} บาท` : '-'}
- ราคาพิเศษ: ${p.promoPrice ? `${formatMoney(p.promoPrice)} บาท` : '-'}
- Promotion Type: ${p.promotionType.name}
- Brand Character: ${character.positioning}`;
}

function kmbAdvisorHooks(p){
  return [
    'เคยเลือกน้ำหอมผิดกลิ่นจนไม่ได้ใช้ต่อไหม ปัญหานี้แก้ได้ด้วยการเลือกจาก Mood ที่อยากได้ก่อนเลือกกลิ่น',
    'ถ้ายังไม่มีกลิ่นประจำตัว หรืออยากได้กลิ่นที่ตรงกับคาแรกเตอร์มากขึ้น มาเช็กกันว่ากลิ่นในโปรนี้เหมาะกับใคร',
    'หลายคนเลือกน้ำหอมจากความดังของกลิ่นอย่างเดียว แต่กลิ่นที่ใช่ควรมาจาก Mood และโอกาสใช้งานของตัวเองก่อน'
  ];
}

function kmbBestieHooks(p){
  return [
    'นึกภาพวันที่แต่งตัวเสร็จ ฉีดน้ำหอมทีเดียวแล้วมั่นใจขึ้นทั้งวันดูสิ',
    'กลิ่นแบบนี้เหมาะกับวันที่อยากให้คนเดินผ่านแล้วจำได้ ไม่ว่าจะไปคาเฟ่ ไปทำงาน หรือเดตพิเศษ',
    'ถ้าเป็นคนที่ชอบมีกลิ่นเป็นซิกเนเจอร์ประจำตัว โปรนี้ช่วยให้เจอกลิ่นที่ใช่ได้ง่ายขึ้น'
  ];
}

function kmbCloserHooks(p, items, priceNormal, pricePromo){
  return [
    `โปรนี้จาก ${priceNormal} วันนี้เหลือ ${pricePromo} คุ้มกว่าซื้อแยกชัดเจน`,
    `เซตนี้ได้ ${items} ครบ ไม่ต้องซื้อทีละชิ้นให้แพงกว่าเดิม`,
    'ถ้ากำลังจะซื้อน้ำหอมอยู่แล้ว โปรนี้จัดเป็นเซตให้คุ้มกว่าซื้อแยกแน่นอน'
  ];
}

function buildKmbAdvisorScript(p, hookVariant = 0){
  const fragrance = getPrimaryFragrance(p);
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = kmbPriceParts(p);
  const painSpeech = buildKmbPainPointSpeech(p, fragrance);
  const moodChoicesSpeech = buildKmbMoodChoicesSpeech(p);
  const productRoleSpeech = buildKmbProductRoleSpeech(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = kmbAdvisorHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  return `${kmbSummaryHeader(p, 'advisor', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดจากปัญหาการเลือกกลิ่น', [
  hook,
  painSpeech,
  `โปรนี้ได้ ${itemsSpeech}`,
  'ถ้ายังไม่มั่นใจว่ากลิ่นไหนตรงกับตัวเอง ลองไล่เช็กไปด้วยกัน'
])}

${buildSession(2, 'ช่วยเลือกกลิ่นและบทบาทสินค้าในเซ็ต', [
  moodChoicesSpeech,
  productRoleSpeech,
  giftSpeech ? `${giftSpeech} ช่วยเสริม Routine ความหอมให้ครบขึ้นด้วย` : ''
])}

${buildSession(3, 'ราคาและปิดด้วยความเหมาะสม', [
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  fragrance ? `ถ้าอยาก Mood ${formatMood(fragrance)} กลิ่นนี้ตอบโจทย์ตรงจุด กดตะกร้าเลือกได้เลย` : 'เลือกกลิ่นที่ตรงกับ Mood ที่อยากได้ แล้วกดตะกร้าได้เลย'
])}

# Key Message สำหรับ MC
- Strategy: Advisor
- ${p.brandName} เป็น Lifestyle Fragrance Brand
- ${priceNormal}
- ${pricePromo}
- ${p.gift ? `ของแถม ${formatGiftLine(p)}` : 'ไม่มีข้อมูลของแถม'}
- ปิดให้กดตะกร้า

# Producer Push Line
- ย้ำแบรนด์ ${p.brandName}
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ปิดด้วยกดตะกร้า`;
}

function buildKmbBestieScript(p, hookVariant = 0){
  const fragrance = getPrimaryFragrance(p);
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = kmbPriceParts(p);
  const experience = buildKmbExperienceLine(p, fragrance);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = kmbBestieHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  return `${kmbSummaryHeader(p, 'bestie', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดจากภาพชีวิตประจำวัน', [
  hook,
  fragrance ? `${fragrance.name} ให้ Mood ${formatMood(fragrance)} เหมาะกับโอกาสอย่าง ${formatOccasion(fragrance)}` : 'เลือกกลิ่นตาม Mood ที่อยากเป็นในวันนี้ได้เลย',
  'ใครนึกภาพออกแล้วอยากลอง ทักมาคุยในคอมเมนต์ได้เลยว่าอยากได้ Mood แบบไหน'
])}

${buildSession(2, 'เล่า Routine และประสบการณ์หลังใช้', [
  experience,
  `โปรนี้ได้ ${itemsSpeech}`,
  giftSpeech ? `${giftSpeech} ทำให้ Routine ความหอมครบขึ้นอีก` : ''
])}

${buildSession(3, 'ราคาน่ารักและปิดแบบเพื่อนๆ', [
  tierSpeech || `ราคาน่ารักด้วย ${priceNormal} ตอนนี้ ${pricePromo}`,
  'ถ้าอยากมีกลิ่นเป็นซิกเนเจอร์ของตัวเอง กดตะกร้าเลือกกลิ่นที่ชอบไปเลย'
])}

# Key Message สำหรับ MC
- Strategy: Bestie
- ${p.brandName} เป็น Lifestyle Fragrance Brand
- ${priceNormal}
- ${pricePromo}
- ปิดให้กดตะกร้า

# Producer Push Line
- เปิดจากภาพชีวิตประจำวันและ Mood
- ชวนคอมเมนต์ถาม Mood ที่อยากได้
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ปิดด้วยกดตะกร้า`;
}

function buildKmbCloserScript(p, hookVariant = 0){
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = kmbPriceParts(p);
  const discountLine = formatDiscountLine(p);
  const averageLine = formatAverageLine(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = kmbCloserHooks(p, itemsSpeech, priceNormal, pricePromo);
  const hook = hooks[hookVariant % hooks.length];

  return `${kmbSummaryHeader(p, 'closer', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดด้วยโปรโมชั่นและสิ่งที่ได้รับ', [
  hook,
  `โปรนี้ได้ ${itemsSpeech}`,
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  'กดตะกร้าเก็บไว้ก่อนได้เลย'
])}

${buildSession(2, 'เทียบราคาและความคุ้ม', [
  p.discount ? `${discountLine}.` : '',
  p.averagePrice ? `${averageLine}.` : '',
  giftSpeech
])}

${buildSession(3, 'ปิดการขายย้ำหลายจุด', [
  `ทวนปิดโปรนี้ ได้ ${itemsSpeech}`,
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? `${discountLine}.` : '',
  'ถ้ากำลังจะซื้อน้ำหอมอยู่แล้ว โปรนี้คุ้มกว่าซื้อแยกแน่นอน กดตะกร้าตอนนี้เลย'
])}

# Key Message สำหรับ MC
- Strategy: Closer
- ${p.brandName}
- ${priceNormal}
- ${pricePromo}
- ${discountLine}
- ${averageLine}
- ปิดให้กดตะกร้า

# Producer Push Line
- ดันโปรนี้ขึ้นตะกร้า
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ย้ำ ${discountLine}
- ปิดด้วยกดตะกร้า`;
}

// ---------------------------------------------------------------------------
// DGMR — shared fact-speech helpers (strategy-agnostic; reused by all 3)
// ---------------------------------------------------------------------------
function hasDgmrSeriesSpecified(p){
  return /jingi|จิงกิ|dlaesoo|ดาเลซู|jinsoo|จินซู/i.test(p.raw);
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

function dgmrPriceParts(p){
  const priceNormal = p.regular ? `ราคาปกติ ${formatMoney(p.regular)} บาท` : 'ไม่มีข้อมูลราคาปกติ';
  const pricePromo = p.promoPrice ? `ราคาพิเศษ ${formatMoney(p.promoPrice)} บาท` : 'ไม่มีข้อมูลราคาพิเศษ';
  const tierSpeech = buildTierPriceSpeech(p);
  return { priceNormal, pricePromo, tierSpeech };
}

function dgmrSummaryHeader(p, strategyKey, items){
  const character = getBrandCharacter(p);
  const meta = STRATEGY_META[strategyKey];
  return `# สรุปข้อมูลโปรโมชั่น

- แบรนด์: ${p.brandName}
- Strategy: ${meta.name} (${meta.thai})
- ชื่อโปร: ${p.title || 'ไม่ระบุชื่อโปร'}
- สินค้าในเซ็ต: ${items}
- ของแถม: ${formatGiftLine(p)}
- ราคาปกติ: ${p.regular ? `${formatMoney(p.regular)} บาท` : '-'}
- ราคาพิเศษ: ${p.promoPrice ? `${formatMoney(p.promoPrice)} บาท` : '-'}
- Promotion Type: ${p.promotionType.name}
- Brand Character: ${character.positioning}`;
}

function dgmrAdvisorHooks(p){
  const concerns = getDgmrConcernPoints(p).slice(0, 4);
  return [
    'เคยรู้สึกว่าดูแลผมสม่ำเสมออยู่แล้ว แต่ผมยังร่วงหรือแห้งเสียเหมือนเดิมไหม บางทีปัญหาอาจอยู่ที่ Routine ไม่ครบมากกว่า',
    `ถ้ากำลังเจอปัญหาผมแบบ ${listForSpeech(concerns, 'ปัญหาผมและหนังศีรษะ')} อยู่ตอนนี้ มาเช็กกันว่าเซตนี้ช่วยตรงไหนได้บ้าง`,
    'หลายคนเลือกแฮร์แคร์จากชื่อแบรนด์อย่างเดียว แต่การเลือกจากปัญหาผมจริงๆ จะตรงจุดกว่า วันนี้เลยอยากพามาเช็กทีละขั้น'
  ];
}

function dgmrBestieHooks(p){
  return [
    'นึกภาพผมที่สระเสร็จแล้วรู้สึกเบา ไม่มัน ไม่ต้องกังวลทั้งวันดูสิ',
    'ถ้าเป็นคนที่อยากมี Routine ดูแลผมแบบไม่ต้องคิดเยอะทุกเช้า เซตนี้ช่วยได้',
    'จำความรู้สึกตอนหนังศีรษะโล่งสบายหลังสระได้ไหม เซตนี้พาไปถึงจุดนั้นได้'
  ];
}

function dgmrCloserHooks(p, items, priceNormal, pricePromo){
  return [
    `เซตนี้จาก ${priceNormal} วันนี้เหลือ ${pricePromo} คุ้มกว่าซื้อแยกทีละขวดชัดเจน`,
    `ได้ ${items} ครบในราคาเดียว ไม่ต้องกลับมาซื้อซ้ำทีละชิ้น`,
    'ถ้ากำลังจะตุนแฮร์แคร์อยู่แล้ว เซตนี้จัดให้คุ้มกว่าซื้อแยกแน่นอน'
  ];
}

function buildDgmrAdvisorScript(p, hookVariant = 0){
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = dgmrPriceParts(p);
  const painSpeech = buildDgmrPainPointSpeech(p);
  const concernSpeech = buildDgmrConcernChoiceSpeech(p);
  const benefitSpeech = buildDgmrBenefitSpeech(p);
  const roleSpeech = buildDgmrProductRoles(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = dgmrAdvisorHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  return `${dgmrSummaryHeader(p, 'advisor', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดปัญหาผมและกลุ่มที่เหมาะ', [
  hook,
  painSpeech,
  `เซ็ตนี้ได้ ${itemsSpeech}`,
  'ถ้าตรงกับปัญหาที่เจออยู่ กดตะกร้าไว้ก่อนได้เลย'
])}

${buildSession(2, 'ช่วยเลือก Series และอธิบายบทบาทสินค้า', [
  concernSpeech,
  roleSpeech,
  benefitSpeech,
  giftSpeech ? `${giftSpeech} ช่วยให้ Routine หลังสระครบขึ้นด้วย` : ''
])}

${buildSession(3, 'ราคาและปิดด้วยความเหมาะสม', [
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  `สรุปคือถ้ากำลังเจอปัญหาผมที่ว่ามา เซตนี้ตอบโจทย์ได้ตรงจุด กดตะกร้าไว้แล้วเลือกสูตรที่เหมาะกับตัวเองได้เลย`
])}

# Key Message สำหรับ MC
- Strategy: Advisor
- ${p.brandName} เป็น Hair Care Brand
- เหมาะกับคนที่กำลังเจอ ${listForSpeech(getDgmrConcernPoints(p).slice(0, 6), 'ปัญหาผมและหนังศีรษะที่อยากดูแล')}
- ${priceNormal}
- ${pricePromo}
- ปิดให้กดตะกร้า

# Producer Push Line
- เปิดจากปัญหาผมก่อน
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ปิดด้วยกดตะกร้า`;
}

function buildDgmrBestieScript(p, hookVariant = 0){
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = dgmrPriceParts(p);
  const routineLine = buildDgmrRoutineLine(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = dgmrBestieHooks(p);
  const hook = hooks[hookVariant % hooks.length];

  return `${dgmrSummaryHeader(p, 'bestie', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดจากความรู้สึกหลังสระผม', [
  hook,
  `เซ็ตนี้ได้ ${itemsSpeech}`,
  'ใครนึกภาพออกแล้วอยากลอง ทักมาคุยในคอมเมนต์ได้เลยว่าผมเป็นแบบไหน'
])}

${buildSession(2, 'เล่า Routine แบบเพื่อนแนะนำ', [
  routineLine,
  giftSpeech ? `${giftSpeech} ทำให้ Routine หลังสระครบขึ้นอีก` : ''
])}

${buildSession(3, 'ราคาน่ารักและปิดแบบเพื่อนๆ', [
  tierSpeech || `ราคาก็น่ารักด้วย ${priceNormal} ตอนนี้ ${pricePromo}`,
  'ถ้าอยากมี Routine ดูแลผมที่ใช้ต่อเนื่องง่ายๆ กดตะกร้าเลือกเซตนี้ไปเลย'
])}

# Key Message สำหรับ MC
- Strategy: Bestie
- ${p.brandName} เป็น Hair Care Brand
- ${priceNormal}
- ${pricePromo}
- ปิดให้กดตะกร้า

# Producer Push Line
- เปิดจากความรู้สึกหลังสระผม
- ชวนคอมเมนต์ถามปัญหาผม
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ปิดด้วยกดตะกร้า`;
}

function buildDgmrCloserScript(p, hookVariant = 0){
  const items = formatItemsInSet(p);
  const itemsSpeech = formatItemsForSpeech(p);
  const { priceNormal, pricePromo, tierSpeech } = dgmrPriceParts(p);
  const discountLine = formatDiscountLine(p);
  const averageMain = formatAverageLine(p);
  const averageAll = formatAverageIncludingGiftLine(p);
  const giftSpeech = p.gift ? `แถมด้วย ${formatGiftLine(p)}` : '';
  const hooks = dgmrCloserHooks(p, itemsSpeech, priceNormal, pricePromo);
  const hook = hooks[hookVariant % hooks.length];

  return `${dgmrSummaryHeader(p, 'closer', items)}

# สคริปต์ TikTok Live

${buildSession(1, 'เปิดด้วยโปรโมชั่นและสิ่งที่ได้รับ', [
  hook,
  `เซ็ตนี้ได้ ${itemsSpeech}`,
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  'กดตะกร้าเก็บไว้ก่อนได้เลย'
])}

${buildSession(2, 'เทียบราคาและความคุ้ม', [
  p.discount ? `${discountLine}.` : '',
  averageMain,
  averageAll,
  giftSpeech
])}

${buildSession(3, 'ปิดการขายย้ำหลายจุด', [
  `ทวนปิดโปรนี้ ได้ ${itemsSpeech}`,
  tierSpeech || `${priceNormal} ตอนนี้ ${pricePromo}`,
  p.discount ? `${discountLine}.` : '',
  'ถ้ากำลังจะตุนแฮร์แคร์อยู่แล้ว เซตนี้คุ้มกว่าซื้อแยกแน่นอน กดตะกร้าตอนนี้เลย'
])}

# Key Message สำหรับ MC
- Strategy: Closer
- ${p.brandName}
- ${priceNormal}
- ${pricePromo}
- ${discountLine}
- ปิดให้กดตะกร้า

# Producer Push Line
- ดันเซตนี้ขึ้นตะกร้า
- ย้ำ ${priceNormal}
- ย้ำ ${pricePromo}
- ย้ำ ${discountLine}
- ปิดด้วยกดตะกร้า`;
}

// ---------------------------------------------------------------------------
// August 2026 script pipeline — Product Truth + Pattern + Brand/Platform persona
// ---------------------------------------------------------------------------
function normalizePatternKey(pattern){
  const value = String(pattern || '').trim();
  const upper = value.toUpperCase();
  if (STRATEGIES.includes(upper)) return upper;
  return STRATEGY_ALIASES[value.toLowerCase()] || null;
}

function getPattern(patternKey){
  const key = normalizePatternKey(patternKey) || 'A';
  return SELLING_PATTERNS[key] || {
    key,
    label: `${key}`,
    short_name: key,
    style: '',
    objective: '',
    sequence: []
  };
}

function getAccountFromPromotion(p){
  return findAccountConfig(p.accountId || p.brand?.id) || p.account || {
    id: p.accountId || p.brandId,
    label: p.accountLabel || p.brandName,
    account_code: p.accountCode || 'SCRIPT',
    brand_key: p.brandKey || getBrandKey(p.brandId),
    platform: p.platform || 'tiktok'
  };
}

function resolveAssignedPattern(args = {}){
  const resolved = typeof resolveAssignedPatternFromConfig === 'function'
    ? resolveAssignedPatternFromConfig(args)
    : {
      assigned_pattern: normalizePatternKey(args.manualPattern) || 'A',
      pattern_source: args.manualPattern ? 'MANUAL' : 'AUTO',
      test_block: 'Manual',
      block_id: 'check',
      include_in_experiment: false,
      needs_manual: false,
      warning: null
    };
  const pattern = getPattern(resolved.assigned_pattern || args.manualPattern || 'A');
  return {
    ...resolved,
    assigned_pattern: resolved.assigned_pattern || normalizePatternKey(args.manualPattern),
    pattern_style: pattern.style || null
  };
}

function getCommunicationProfile(account, platform, testBlock){
  const block = String(testBlock || '').toLowerCase();
  let key = 'daytime';
  if (block.includes('pre-test')) key = 'pretest';
  else if (block.includes('check')) key = 'check';
  else if (block.includes('10') || block.includes('morning')) key = 'morning';
  else if (block.includes('14') || block.includes('afternoon')) key = 'afternoon';
  else if (block.includes('19') || block.includes('evening')) key = 'evening';
  else if (block.includes('prime') || block.includes('late')) key = 'prime';
  else if (block.includes('day')) key = 'daytime';
  return AUDIENCE_PROFILES[key] || AUDIENCE_PROFILES.daytime || { label: 'Daytime', communication: [] };
}

function createScriptId(p, metadata){
  const account = getAccountFromPromotion(p);
  const date = String(metadata.live_date || '').replace(/-/g, '') || 'nodate';
  const time = String(metadata.start_time || '').replace(':', '') || 'notime';
  const index = String(p.index || 1).padStart(3, '0');
  return `${account.account_code || 'SCRIPT'}-${date}-${time}-${metadata.assigned_pattern || 'NA'}-${index}`;
}

function formatCompactPriceTruth(p){
  if (p.quantityTiers?.length >= 2) return buildTierPriceSpeech(p);
  const lines = [];
  if (p.regular) lines.push(`ราคาปกติ ${formatMoney(p.regular)} บาท`);
  if (p.promoPrice) lines.push(`ราคาโปร ${formatMoney(p.promoPrice)} บาท`);
  if (p.coupon) lines.push(`มีคูปองลดเพิ่ม ${p.coupon}% ตามข้อมูลโปร`);
  if (p.finalPrice && p.finalPriceSource === 'explicit') lines.push(`ราคาหลังส่วนลดที่ระบุคือ ${formatMoney(p.finalPrice)} บาท`);
  return lines.join(' ');
}

function getDiscountSpeech(p){
  if (!p.regular || !p.promoPrice || !p.discount) return '';
  return `ส่วนต่างจากราคาปกติอยู่ที่ ${formatMoney(p.discount)} บาท หรือประมาณ ${formatPercent(p.discountPercent)}`;
}

function getAverageSpeech(p){
  if (!p.promoPrice || !p.itemCount) return '';
  return `เมื่อหารตามจำนวนสินค้าหลักที่ระบุ เฉลี่ยชิ้นละ ${formatMoney(p.averagePrice)} บาท`;
}

function getGiftSpeech(p){
  return p.gift ? `โปรนี้มีของแถมเป็น ${formatGiftLine(p)}` : '';
}

function getMainItemsSpeech(p){
  return formatItemsForSpeech(p) || p.mainProductText || 'สินค้าในโปรนี้';
}

function getBrandSpecificAngles(p){
  const brandKey = p.brandKey || getBrandKey(p.brandId);
  if (brandKey === 'kiss') {
    const fragrance = getPrimaryFragrance(p);
    return {
      problem: fragrance
        ? `หลายคนเลือกกลิ่นจากความชอบตอนดมครั้งแรก แต่พอใช้จริงอาจไม่เข้ากับ Mood หรือโอกาสที่ใช้ กลิ่น ${fragrance.name} ในโปรนี้ให้ภาพเป็น ${formatMood(fragrance)} และเหมาะกับ ${formatOccasion(fragrance)}`
        : 'ถ้ายังเลือกกลิ่นไม่ถูก ให้เริ่มจาก Mood ที่อยากได้และโอกาสที่จะใช้จริงก่อน',
      choice: buildKmbMoodChoicesSpeech(p),
      product: buildKmbProductRoleSpeech(p),
      experience: fragrance
        ? `ภาพการใช้คือเลือกกลิ่น ${fragrance.name} ให้เป็นกลิ่นหลักของวัน แล้วค่อยเสริม Routine เฉพาะสินค้าที่อยู่ในเซ็ต`
        : 'ให้เลือกกลิ่นหรือเซ็ตที่ตรงกับ Mood ของวันและเช็กรายละเอียดในตะกร้า',
      fit: 'เหมาะกับคนที่อยากเลือกกลิ่นให้เข้ากับบุคลิก โอกาสใช้งาน และความคุ้มของเซ็ต'
    };
  }

  if (brandKey === 'dgmr') {
    return {
      problem: buildDgmrPainPointSpeech(p),
      choice: buildDgmrConcernChoiceSpeech(p),
      product: buildDgmrProductRoles(p),
      experience: buildDgmrRoutineLine(p),
      fit: 'เหมาะกับคนที่อยากจัด Routine ดูแลเส้นผมและหนังศีรษะให้ครบขึ้นตามสินค้าที่อยู่ในโปร'
    };
  }

  return {
    problem: buildSkinoxyPainPointSpeech(p),
    choice: buildSkinoxyChoiceSpeech(p),
    product: p.product ? `${p.product.name} เป็นตัวหลักในโปรนี้ ให้เลือกสูตรตามปัญหาผิวที่เจอจริง` : 'ให้ยึดรายละเอียดสินค้าในตะกร้าเป็นหลัก',
    experience: listForSpeech(getSkinoxyBenefits(p).slice(0, 4), 'ดูแลผิวตาม Routine ที่เลือก'),
    fit: 'เหมาะกับคนที่อยากเลือกบอดี้แคร์หรือสกินแคร์ตามปัญหาผิวและใช้เป็น Routine ต่อเนื่อง'
  };
}

function getPlatformCta(platform, patternKey){
  if (platform === 'shopee') return patternKey === 'C' ? 'เข้าไปดูเซ็ตในตะกร้าแล้วตัดสินใจจากราคาและตัวเลือกได้เลย' : 'เข้าไปดูเซ็ตในตะกร้าแล้วเลือกสูตรหรือกลิ่นที่ตรงกับตัวเองได้เลย';
  return patternKey === 'C' ? 'กดดูในตะกร้าแล้วเช็กรายละเอียดโปรนี้ได้เลย' : 'กดดูในตะกร้าแล้วเลือกสินค้าที่ตรงกับตัวเองได้เลย';
}

function getPatternLead(patternKey, brandKey, platform, variant){
  const pools = {
    A: [
      'ก่อนเลือกซื้อ ลองเช็กปัญหาหลักของตัวเองให้ชัดก่อน',
      'เริ่มจากคำถามง่ายๆ ว่าตอนนี้ต้องการแก้เรื่องไหนมากที่สุด',
      'อย่าเพิ่งเลือกจากชื่อโปรอย่างเดียว ลองดูว่าตัวนี้ตอบโจทย์อะไรจริง'
    ],
    B: [
      'ลองนึกภาพสถานการณ์ที่ใช้จริงในชีวิตประจำวันก่อน',
      'ถ้าอยากให้การเลือกสินค้าง่ายขึ้น ลองมองจากโมเมนต์ที่เราเจอบ่อยๆ',
      'วันนี้ขอเล่าแบบเพื่อนชวนเลือกของที่ใช้ได้จริง'
    ],
    C: [
      'โปรนี้เข้าเรื่องความคุ้มก่อนเลย',
      'ถ้ากำลังเทียบว่าเซ็ตไหนคุ้มกว่า ให้ดูตัวเลขชุดนี้ก่อน',
      'รอบนี้ดูจากสิ่งที่ได้ ราคา และเหตุผลที่ควรกดดูตอนนี้'
    ]
  };
  const platformTail = platform === 'shopee'
    ? ' เพราะคนที่ดูใน Shopee มักอยากเห็นของที่ได้และราคาชัดเร็ว'
    : ' เพราะในไลฟ์ต้องทำให้คนดูหยุดฟังและรู้สึกว่าเกี่ยวกับตัวเองก่อน';
  const base = pools[patternKey] || pools.A;
  return `${base[variant % base.length]}${platformTail}`;
}

function buildPatternAScript(p, context){
  const angles = getBrandSpecificAngles(p);
  const price = formatCompactPriceTruth(p);
  const gift = getGiftSpeech(p);
  const platform = context.platformPersona;
  return joinSentences([
    getPatternLead('A', context.brandKey, context.platform, context.hookVariant || 0),
    context.platform === 'shopee'
      ? `โปรนี้คือ ${getMainItemsSpeech(p)} ก่อนกดซื้อ ลองเช็กให้ชัดว่าตรงกับปัญหาหรือสิ่งที่ต้องการจริงไหม`
      : `${angles.problem}`,
    context.platform === 'shopee'
      ? angles.problem
      : 'ลองสังเกตตัวเองก่อนว่าอาการหรือความต้องการหลักตอนนี้คืออะไร เพราะการเลือกจากปัญหาจริงจะช่วยให้ตัดสินใจง่ายกว่าเลือกจากชื่อโปรอย่างเดียว',
    `วิธีคิดง่ายๆ คือแยกก่อนว่าสิ่งที่ต้องการคือเรื่องไหน แล้วค่อยเทียบกับตัวเลือกในโปร ${angles.choice}`,
    `สินค้าที่อยู่ในโปรนี้คือ ${getMainItemsSpeech(p)} ${angles.product}`,
    `ถ้าจะเลือกให้ตรง ให้เริ่มจากตัวที่ตอบโจทย์หลักก่อน แล้วค่อยดูรายละเอียดในตะกร้าให้ครบตามข้อมูลสินค้า`,
    price ? `ส่วนโปรโมชันที่ยืนยันได้คือ ${price}` : 'ส่วนราคาในโปรนี้ยังไม่ครบพอสำหรับการคำนวณ ให้เช็กราคาในตะกร้าก่อนตัดสินใจ',
    gift,
    `${platform.rules?.cta || 'กดดูในตะกร้า'} ${getPlatformCta(context.platform, 'A')}`
  ]);
}

function buildPatternBScript(p, context){
  const angles = getBrandSpecificAngles(p);
  const price = formatCompactPriceTruth(p);
  const gift = getGiftSpeech(p);
  const scene = context.platform === 'shopee'
    ? `ถ้ากำลังเลื่อนดูโปรและเทียบว่าเซ็ตไหนคุ้มกว่า เซ็ตนี้คือ ${getMainItemsSpeech(p)}`
    : `นึกภาพวันที่อยากให้ Routine ง่ายขึ้น แล้วมี ${getMainItemsSpeech(p)} เตรียมไว้ในตะกร้า`;
  return joinSentences([
    getPatternLead('B', context.brandKey, context.platform, context.hookVariant || 0),
    scene,
    `โมเมนต์ที่คนดูน่าจะเข้าใจคืออยากได้ตัวที่เลือกง่าย ใช้ได้จริง และรู้สึกว่าซื้อแล้วไม่หลงทาง`,
    context.platform === 'tiktok'
      ? 'ใครกำลังลังเลอยู่ ลองคอมเมนต์สิ่งที่ตัวเองอยากแก้หรือ Mood ที่อยากได้ไว้ได้เลย จะได้ช่วยเทียบให้ตรงขึ้น'
      : 'ถ้ากำลังเลือกใน Shopee ให้ดูว่าเซ็ตนี้ตรงกับสูตร กลิ่น หรือ Routine ที่อยากได้ไหมก่อน',
    `ตัวที่เชื่อมกับสถานการณ์นี้คือ ${getMainItemsSpeech(p)} ${angles.experience}`,
    `ประสบการณ์ที่คาดหวังได้โดยไม่พูดเกินข้อมูลคือเลือกให้ตรงกับสิ่งที่ต้องการ แล้วใช้ตาม Routine หรือโอกาสที่เหมาะกับสินค้าในโปร`,
    price ? `รายละเอียดโปรที่ต้องจำคือ ${price}` : 'ถ้าราคายังไม่ครบ ให้กดเข้าไปเช็กราคาในตะกร้าเป็นหลัก',
    gift,
    getPlatformCta(context.platform, 'B')
  ]);
}

function buildPatternCScript(p, context){
  const angles = getBrandSpecificAngles(p);
  const price = formatCompactPriceTruth(p);
  const discount = getDiscountSpeech(p);
  const average = getAverageSpeech(p);
  const gift = getGiftSpeech(p);
  return joinSentences([
    getPatternLead('C', context.brandKey, context.platform, context.hookVariant || 0),
    `โปรนี้เริ่มจากความคุ้มก่อนเลย ได้ ${getMainItemsSpeech(p)}${p.gift ? ` และ ${formatGiftLine(p)}` : ''}`,
    price ? `ตัวเลขที่ยืนยันได้คือ ${price}` : 'ตอนนี้ข้อมูลราคายังไม่ครบพอสำหรับการสรุปส่วนลด ให้เช็กในตะกร้าก่อน',
    discount,
    average,
    `${angles.fit}`,
    `ข้อกังวลก่อนซื้อให้ดูที่ตัวเลือกในตะกร้า ถ้าโปรไม่ได้ระบุสูตร กลิ่น หรือ Series ชัดเจน ให้เลือกจากปัญหา Mood หรือ Routine ที่ตรงกับตัวเอง และไม่ต้องเดาว่าได้ครบทุกสูตร`,
    p.liveOnly ? 'ข้อมูลโปรระบุว่าเกี่ยวกับไลฟ์นี้ ให้เช็กเงื่อนไขในตะกร้าตามเวลาจริงอีกครั้ง' : '',
    p.rights ? `ข้อมูลระบุจำนวนสิทธิ์ ${formatMoney(p.rights)} ให้ตัดสินใจจากข้อมูลจริงที่เห็นในตะกร้า` : '',
    gift,
    `เหตุผลที่ควรกดดูตอนนี้คือจะได้เห็นราคา ตัวเลือก และเงื่อนไขล่าสุดในตะกร้า ${getPlatformCta(context.platform, 'C')}`
  ]);
}

function buildDepthAddendum(p, patternKey, context){
  const brandPersona = context.brandPersona || {};
  const platformPersona = context.platformPersona || {};
  const profile = context.communicationProfile || {};
  const topics = (brandPersona.topics || []).slice(0, 4);
  const topicLine = topics.length
    ? `จุดที่ควรจับให้ชัดในบทนี้คือ ${listForSpeech(topics)} โดยเล่าเฉพาะสิ่งที่สินค้าและโปรนี้มีข้อมูลรองรับ`
    : 'จุดที่ควรจับให้ชัดคือเลือกจากข้อมูลจริงในโปรและตะกร้า';
  const profileLine = profile.communication?.length
    ? `จังหวะการพูดของช่วงนี้ให้เน้น ${listForSpeech(profile.communication)} เพื่อให้คนดูตามทันและตัดสินใจได้ง่าย`
    : '';
  const truthLine = `ย้ำอีกครั้งว่าราคา ของแถม จำนวนชิ้น และตัวเลือก ต้องยึดตามข้อมูลที่ใส่เข้ามาเท่านั้น ถ้ารายละเอียดไหนไม่ระบุ ให้บอกให้คนดูกดดูในตะกร้าแทนการเดา`;

  if (patternKey === 'A') {
    return joinSentences([
      topicLine,
      profileLine,
      'เวลาช่วยเลือก ให้พูดเหมือนกำลังพาคนดูไล่เช็กทีละข้อ ไม่ตัดสินแทนลูกค้า และไม่ทำให้รู้สึกว่าปัญหาของตัวเองเป็นเรื่องแย่',
      'ถ้าสินค้ามีหลายสูตร หลายกลิ่น หรือหลาย Series ให้ใช้ปัญหา Mood หรือ Routine เป็นตัวแยก แล้วชวนคนดูเลือกตัวที่ตรงที่สุด',
      truthLine
    ]);
  }

  if (patternKey === 'B') {
    return joinSentences([
      topicLine,
      profileLine,
      'ระหว่างเล่าให้เว้นจังหวะถามคนดู เช่นกำลังมองหาสูตรไหน กลิ่นแบบไหน หรือ Routine แบบไหน เพื่อให้บทไม่กลายเป็นการอ่านรายละเอียดอย่างเดียว',
      'เมื่อต้องพูดราคา ให้โยงกลับไปที่การใช้งานจริงก่อนเสมอ เพราะ Pattern นี้ต้องทำให้สินค้ารู้สึกอยากมี ไม่ใช่แค่ถูกกว่าปกติ',
      truthLine
    ]);
  }

  return joinSentences([
    topicLine,
    profileLine,
    'เวลาปิดการขาย ให้ช่วยคนดูลดความลังเลด้วยข้อมูลที่ตรวจได้ เช่น ได้อะไรบ้าง ราคาไหนถูกระบุไว้ และต้องเลือกตัวเลือกตรงไหนในตะกร้า',
    'ถ้าคำนวณราคาต่อชิ้นหรือส่วนลดไม่ได้ เพราะข้อมูลจำนวนหรือราคายังไม่ครบ ให้พูดตรงๆ ว่าให้เช็กในตะกร้า แทนการคำนวณเอง',
    truthLine
  ]);
}

function buildMainSpokenScript(p, patternKey, context){
  const builders = { A: buildPatternAScript, B: buildPatternBScript, C: buildPatternCScript };
  const builder = builders[patternKey] || builders.A;
  const base = builder(p, context);
  const expanded = base.length < 1600
    ? `${base} ${buildDepthAddendum(p, patternKey, context)}`
    : base;
  return enforceLanguageRules(expanded, p);
}

function buildPromotionSummary(p){
  return [
    `ชื่อโปร: ${p.title || 'ไม่ระบุชื่อโปร'}`,
    `สินค้า: ${formatItemsInSet(p)}`,
    `สูตร/กลิ่น: ${p.allVariantsSelected ? 'เลือกได้ทุกสูตร/กลิ่นที่ร่วมรายการ' : (formatVariantList(p.selectedVariants) || '-')}`,
    `ราคา: ${formatPriceLines(p).join(', ') || 'ไม่มีข้อมูลราคา'}`,
    `ของแถม: ${formatGiftLine(p)}`,
    `Promotion Type: ${p.promotionType?.name || '-'}`
  ];
}

function buildValidationNotes(p, assignment){
  const notes = [];
  if (!p.regular || !p.promoPrice) notes.push('ข้อมูลราคาไม่ครบ จึงไม่คำนวณเปอร์เซ็นต์ส่วนลดหรือสรุปส่วนลดเกินจริง');
  if (!p.itemCount) notes.push('จำนวนชิ้นไม่ชัดเจน จึงไม่คำนวณราคาต่อชิ้น');
  if (p.warning) notes.push(p.warning);
  if (p.finalPriceSource === 'calculated') notes.push('มีคูปองแต่ไม่มีราคาหลังส่วนลดแบบระบุชัด จึงไม่ใช้ราคาสุดท้ายเป็นคำขายหลัก');
  if (assignment?.warning) notes.push(assignment.warning);
  return uniqueFilled(notes);
}

function formatFullScript(scriptPackage){
  const metadataLines = Object.entries(scriptPackage.metadata).map(([key, value]) =>
    `${key}: ${value === null || value === undefined || value === '' ? '-' : value}`
  );
  const notes = scriptPackage.validationNotes.length
    ? scriptPackage.validationNotes.map(item => `- ${item}`).join('\n')
    : '- ไม่มี';
  return `# Script Metadata
${metadataLines.join('\n')}

# Promotion Summary
${scriptPackage.promotionSummary.join('\n')}

# Main Spoken Script
${scriptPackage.mainSpokenScript}

# Producer Push Line
${scriptPackage.producerPushLine}

# Validation Notes
${notes}`;
}

function createScriptPackage(p, pattern = 'A', context = {}){
  const account = getAccountFromPromotion(p);
  const assignment = context.assignment || resolveAssignedPattern({
    account,
    platform: account.platform,
    liveDate: context.liveDate,
    startTime: context.startTime,
    manualPattern: pattern,
    autoPattern: context.patternSource !== 'MANUAL'
  });
  const patternKey = normalizePatternKey(pattern) || normalizePatternKey(assignment.assigned_pattern) || 'A';
  const patternMeta = getPattern(patternKey);
  const platform = account.platform || p.platform || 'tiktok';
  const brandKey = account.brand_key || p.brandKey || getBrandKey(p.brandId);
  const profile = getCommunicationProfile(account.id, platform, assignment.test_block);
  const generatedAt = context.generatedAt || new Date().toISOString();
  const metadata = {
    script_id: '',
    generated_at: generatedAt,
    account: account.label || p.accountLabel || p.brandName,
    brand: BRAND_PERSONAS[brandKey]?.label || p.brandName,
    platform: PLATFORM_PERSONAS[platform]?.label || platform,
    live_date: context.liveDate || assignment.live_date || '',
    start_time: context.startTime || assignment.start_time || '',
    test_block: assignment.test_block || '',
    assigned_pattern: patternKey,
    pattern_style: patternMeta.style,
    pattern_source: assignment.pattern_source || context.patternSource || 'AUTO',
    promotion_title: p.title || 'ไม่ระบุชื่อโปร',
    script_version: 'august-2026-v1'
  };
  metadata.script_id = createScriptId(p, metadata);
  const truth = buildProductTruth(p);
  const mainSpokenScript = buildMainSpokenScript(p, patternKey, {
    ...context,
    platform,
    brandKey,
    pattern: patternMeta,
    platformPersona: PLATFORM_PERSONAS[platform] || {},
    brandPersona: BRAND_PERSONAS[brandKey] || {},
    communicationProfile: profile,
    assignment,
    productTruth: truth
  });
  const producerPushLine = [
    `${patternMeta.short_name}: ${patternMeta.copy_hint || patternMeta.objective}`,
    `Account ${metadata.account} / ${metadata.test_block}`,
    `ย้ำเฉพาะ Product Truth: ${formatCompactPriceTruth(p) || 'ราคาในตะกร้า'}`,
    getPlatformCta(platform, patternKey)
  ].filter(Boolean).join('\n');
  const validationNotes = buildValidationNotes(p, assignment);
  const scriptPackage = {
    metadata,
    productTruth: truth,
    promotionSummary: buildPromotionSummary(p),
    mainSpokenScript,
    producerPushLine,
    validationNotes,
    pattern: patternMeta,
    assignment,
    structuralMarkers: patternMeta.marker_order || []
  };
  scriptPackage.fullText = formatFullScript(scriptPackage);
  return scriptPackage;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
const BRAND_STRATEGY_BUILDERS = {};

function getBrandKey(brandId){
  if (brandId === 'dgmr') return 'dgmr';
  if (brandId === 'kmb' || brandId === 'kiss') return 'kiss';
  return 'skinoxy';
}

function createScript(p, strategy = 'A', hookVariant = 0, context = {}){
  const patternKey = normalizePatternKey(strategy) || 'A';
  const scriptPackage = createScriptPackage(p, patternKey, {
    ...context,
    hookVariant
  });
  return enforceLanguageRules(scriptPackage.fullText, p);
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

// ---------------------------------------------------------------------------
// Export for Node (tests). In the browser this file is loaded via <script>
// before app.js, so all the functions above are simply global — this guard
// only adds the CommonJS export, it doesn't change browser behavior.
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeText, normalizeForMatch, normalizeMoney, formatMoney, formatPercent, moneyAfter,
    extractQuantityTiers, buildTierPriceSpeech, extractCoupon, extractFinalPrice, extractPrePriceText,
    extractGift, extractPromotionTitle, extractProductLines, extractQuantity, extractGiftCount,
    extractItemCount, extractDgmrMainItemCount, cleanupPhrase, getProductTerms, getVariantTerms,
    findProduct, findProducts, resolveVariants, findSelectedFragranceVariants, formatVariantList,
    formatVariantGuidance, getFinalPriceWarning, detectPromotionType, detectDgmrPromotionType,
    countDgmrRole, hasProductId, formatPriceLines, formatGiftLine, formatDiscountLine,
    formatAverageLine, formatAverageIncludingGiftLine, getPrimaryFragrance, formatMood,
    formatOccasion, formatItemsInSet, formatItemsForSpeech, joinSentences, uniqueFilled, listForSpeech, getBrandCharacter,
    buildSession, buildPriceSpeech, splitPromotions, parsePromotion, buildProductTruth,
    LSG_ACCOUNTS, SELLING_PATTERNS, PLATFORM_PERSONAS, BRAND_PERSONAS, AUDIENCE_PROFILES,
    STRATEGIES, STRATEGY_META, STRATEGY_ALIASES, normalizePatternKey, resolveAssignedPattern,
    getCommunicationProfile, createScriptPackage, createScript, enforceLanguageRules, getBrandKey
  };
}
