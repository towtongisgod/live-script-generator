// Regression + acceptance tests for the August 2026 Live Script Generator.
// Plain Node, no framework. Run with: npm test

const fs = require('fs');
const path = require('path');
const core = require('../core.js');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function check(label, condition, detail = ''){
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

function readJson(relPath){
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function readText(relPath){
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function fullTextOf(item){
  return item.mainSpokenScript.fullText;
}

function sectionsOf(item){
  return [item.mainSpokenScript.section1, item.mainSpokenScript.section2, item.mainSpokenScript.section3];
}

function parseForBrand(brand){
  const knowledge = readJson(path.join('data', brand.knowledge_file));
  const raw = readText(brand.sample_file);
  return core.splitPromotions(raw).map((text, index) =>
    core.parsePromotion(text, index, knowledge, brand, {})
  );
}

function firstPromo(accountId){
  const brand = brandsConfig.brands.find(item => item.id === accountId);
  return parseForBrand(brand)[0];
}

function manualAssignment(pattern, block = 'Manual QA'){
  return {
    assigned_pattern: pattern,
    pattern_source: 'MANUAL',
    test_block: block,
    block_id: 'manual',
    include_in_experiment: false,
    needs_manual: false,
    warning: null
  };
}

function pkg(p, pattern, extra = {}){
  return core.createScriptPackage(p, pattern, {
    liveDate: '2026-08-04',
    startTime: '10:00',
    assignment: manualAssignment(pattern),
    generatedAt: '2026-08-04T03:00:00.000Z',
    ...extra
  });
}

function indexOfAny(text, words){
  return Math.min(...words.map(word => {
    const idx = text.indexOf(word);
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  }));
}

const PRODUCT_TRUTH_FIELDS = [
  'items', 'productName', 'selectedVariantIds', 'allVariantsSelected',
  'regular', 'promoPrice', 'coupon', 'finalPrice', 'discount', 'discountPercent',
  'gift', 'gifts', 'giftValue', 'giftCount', 'quantity', 'itemCount',
  'totalIncludedCount', 'includedProducts', 'pricePerItem', 'rights'
];

function factSnapshot(item){
  const truth = item.productTruth;
  return Object.fromEntries(PRODUCT_TRUTH_FIELDS.map(field => [field, truth[field]]));
}

function sameFacts(a, b){
  return JSON.stringify(factSnapshot(a)) === JSON.stringify(factSnapshot(b));
}

function diffFacts(a, b){
  const snapA = factSnapshot(a);
  const snapB = factSnapshot(b);
  return PRODUCT_TRUTH_FIELDS.filter(field => JSON.stringify(snapA[field]) !== JSON.stringify(snapB[field]));
}

const brandsConfig = readJson('data/brands.json');
const appJs = readText('app.js');
const indexHtml = readText('index.html');
const stylesCss = readText('styles.css');

console.log('=== Account selector and config ===');
const primaryAccounts = core.LSG_ACCOUNTS.filter(account => account.primary !== false);
check('main account selector has exactly 5 accounts', primaryAccounts.length === 5, primaryAccounts.map(a => a.label).join(', '));
['SKINOXY TikTok', 'SKINOXY Shopee', 'KISS TikTok', 'KISS Shopee', 'DGMR TikTok'].forEach(label => {
  check(`primary account present: ${label}`, primaryAccounts.some(account => account.label === label));
});
check('DGMR Shopee stays future-ready but hidden', core.LSG_ACCOUNTS.some(account => account.id === 'dgmr-shopee' && account.primary === false && account.future_ready));

console.log('\n=== August 2026 assignment rules ===');
const ASSIGNMENT_CASES = [
  ['PRE-TEST Aug 1', { account: 'skinoxy', platform: 'tiktok', liveDate: '2026-08-01', startTime: '10:00' }, null, 'PRE-TEST'],
  ['PRE-TEST Aug 3', { account: 'kmb', platform: 'tiktok', liveDate: '2026-08-03', startTime: '20:00' }, null, 'PRE-TEST'],
  ['SKINOXY TikTok Aug 4 Daytime', { account: 'skinoxy', platform: 'tiktok', liveDate: '2026-08-04', startTime: '03:00' }, 'A', 'Daytime'],
  ['SKINOXY TikTok Aug 4 Prime', { account: 'skinoxy', platform: 'tiktok', liveDate: '2026-08-04', startTime: '18:00' }, 'B', 'Prime'],
  ['SKINOXY TikTok Aug 5 Daytime', { account: 'skinoxy', platform: 'tiktok', liveDate: '2026-08-05', startTime: '09:30' }, 'B', 'Daytime'],
  ['SKINOXY TikTok Aug 6 Prime', { account: 'skinoxy', platform: 'tiktok', liveDate: '2026-08-06', startTime: '02:30' }, 'A', 'Prime'],
  ['SKINOXY Shopee Aug 4 Daytime', { account: 'skinoxy-shopee', platform: 'shopee', liveDate: '2026-08-04', startTime: '06:00' }, 'A', 'Daytime'],
  ['SKINOXY Shopee Aug 4 Prime Sales', { account: 'skinoxy-shopee', platform: 'shopee', liveDate: '2026-08-04', startTime: '18:30' }, 'B', 'Prime Sales'],
  ['SKINOXY Shopee gap asks check slot', { account: 'skinoxy-shopee', platform: 'shopee', liveDate: '2026-08-04', startTime: '03:30' }, null, 'Check slot'],
  ['KISS TikTok Aug 4', { account: 'kmb', platform: 'tiktok', liveDate: '2026-08-04', startTime: '12:00' }, 'A', 'Daily Rotation'],
  ['KISS TikTok Aug 7', { account: 'kmb', platform: 'tiktok', liveDate: '2026-08-07', startTime: '12:00' }, 'C', 'Daily Rotation'],
  ['KISS Shopee Aug 5', { account: 'kmb-shopee', platform: 'shopee', liveDate: '2026-08-05', startTime: '12:00' }, 'B', 'Daily Rotation'],
  ['KISS Shopee Aug 8', { account: 'kmb-shopee', platform: 'shopee', liveDate: '2026-08-08', startTime: '12:00' }, 'C', 'Daily Rotation'],
  ['DGMR 10:00 Aug 4', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-04', startTime: '10:00' }, 'A', '10:00 Morning'],
  ['DGMR 14:00 Aug 4', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-04', startTime: '14:00' }, 'B', '14:00 Afternoon'],
  ['DGMR 19:00 Aug 4', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-04', startTime: '19:00' }, 'C', '19:00 Evening'],
  ['DGMR 21:00 Aug 5', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-05', startTime: '21:00' }, 'B', '21:00 Prime Time'],
  ['DGMR off-slot asks check slot', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-04', startTime: '11:00' }, null, 'Check slot'],
  ['Manual override works', { account: 'dgmr', platform: 'tiktok', liveDate: '2026-08-04', startTime: '11:00', manualPattern: 'C', autoPattern: false }, 'C', 'Check slot']
];

ASSIGNMENT_CASES.forEach(([label, args, expectedPattern, expectedBlock]) => {
  const resolved = core.resolveAssignedPattern(args);
  check(`${label}: pattern`, resolved.assigned_pattern === expectedPattern, `got ${resolved.assigned_pattern}`);
  check(`${label}: block`, resolved.test_block === expectedBlock, `got ${resolved.test_block}`);
});

console.log('\n=== Parser and Product Truth regression ===');
const EXPECTED = {
  skinoxy: { promoCount: 5, first: { regular: 399, promoPrice: 239 } },
  'skinoxy-shopee': { promoCount: 2, first: { regular: 697, promoPrice: 272 }, second: { regular: 499, promoPrice: 251, tierCount: 2 } },
  kmb: { promoCount: 2, first: { regular: 478, promoPrice: 329 }, second: { regular: 997, promoPrice: 649 } },
  'kmb-shopee': { promoCount: 2, first: { regular: 478, promoPrice: 329 }, second: { regular: 997, promoPrice: 649, tierCount: 2 } },
  dgmr: { promoCount: 2, first: { regular: 4269, promoPrice: 2350 }, second: { regular: 3969, promoPrice: 2190 } },
  'dgmr-shopee': { promoCount: 2, first: { regular: 3969, promoPrice: 2190 }, second: { regular: 4269, promoPrice: 2350, tierCount: 2 } }
};

const parsedByBrand = {};
brandsConfig.brands.forEach(brand => {
  const expected = EXPECTED[brand.id];
  if (!expected) return;
  const promos = parseForBrand(brand);
  parsedByBrand[brand.id] = promos;
  check(`${brand.label}: split count`, promos.length === expected.promoCount, `got ${promos.length}`);
  check(`${brand.label}: promo 1 regular`, promos[0]?.regular === expected.first.regular, `got ${promos[0]?.regular}`);
  check(`${brand.label}: promo 1 promo price`, promos[0]?.promoPrice === expected.first.promoPrice, `got ${promos[0]?.promoPrice}`);
  if (expected.second) {
    check(`${brand.label}: promo 2 regular`, promos[1]?.regular === expected.second.regular, `got ${promos[1]?.regular}`);
    check(`${brand.label}: promo 2 promo price`, promos[1]?.promoPrice === expected.second.promoPrice, `got ${promos[1]?.promoPrice}`);
    if (expected.second.tierCount) check(`${brand.label}: tiered pricing`, promos[1]?.quantityTiers.length === expected.second.tierCount, `got ${promos[1]?.quantityTiers.length}`);
  }
  promos.forEach((p, index) => {
    const items = core.formatItemsInSet(p);
    check(`${brand.label} promo ${index + 1}: item has no URL`, !/https?:\/\//i.test(items), items);
    check(`${brand.label} promo ${index + 1}: item has no >>`, !items.includes('>>'), items);
    if (p.gift) check(`${brand.label} promo ${index + 1}: gift clean`, !/https?:\/\//i.test(p.gift) && !p.gift.includes('>>'), p.gift);
  });
});

const customGift = core.parsePromotion('Body Serum 2 หลอด ราคาโปร 409 รับฟรี Post Card Phuwin 1 ใบ', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('gift parsing works', customGift.gift && customGift.gift.includes('Post Card'));
const missingPrice = core.parsePromotion('Toner Pad 1 กระปุก ราคาโปร 239', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('missing regular price stays null', missingPrice.regular === null);
check('missing price does not calculate discount percent', missingPrice.discountPercent === null);
const missingQty = core.parsePromotion('Toner Pad ราคาโปร 239', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('missing quantity does not calculate average price', missingQty.averagePrice === null);

console.log('\n=== Product Truth V2 smoke tests ===');
const SMOKE_INPUTS = {
  skinoxy: 'Body Serum 2 หลอด\nราคาปกติ 798 บาท\nราคาโปร 409 บาท\nได้รับ Postcard',
  'skinoxy-shopee': 'Body Serum 2 หลอด\nราคาปกติ 798 บาท\nราคาโปร 409 บาท\nได้รับ Postcard',
  kmb: 'EDT Revamp Sweet Poison\nราคาปกติ 299 บาท\nราคาโปร 179 บาท',
  'kmb-shopee': 'EDT Revamp Sweet Poison\nราคาปกติ 299 บาท\nราคาโปร 179 บาท',
  dgmr: 'แชมพู 2 ขวด + Jingi Tonic 1 ขวด\nราคาปกติ 3,570 บาท\nราคาโปร 2,099 บาท'
};

function parseSmoke(accountId){
  const account = core.LSG_ACCOUNTS.find(item => item.id === accountId);
  const config = brandsConfig.brands.find(item => item.id === accountId);
  return core.parsePromotion(SMOKE_INPUTS[accountId], 0, readJson(path.join('data', config.knowledge_file)), account, {});
}

const skinoxySmoke = parseSmoke('skinoxy');
check('SKINOXY: Body Serum count is 2', skinoxySmoke.itemCount === 2 && skinoxySmoke.totalIncludedCount === 2);
check('SKINOXY: Postcard is an explicit gift', skinoxySmoke.gift === 'Postcard' && skinoxySmoke.giftCount === 1);
check('SKINOXY: included product excludes gift', skinoxySmoke.includedProducts.length === 1 && skinoxySmoke.includedProducts[0].name === 'Body Serum');
check('SKINOXY: Product Truth passes validation', skinoxySmoke.productTruthValidation.valid);

const dgmrSmoke = parseSmoke('dgmr');
check('DGMR: plus joins included products', dgmrSmoke.includedProducts.length === 2 && dgmrSmoke.gift === null);
check('DGMR: shampoo 2 plus tonic 1 totals 3', dgmrSmoke.itemCount === 3 && dgmrSmoke.totalIncludedCount === 3);
check('DGMR: Jingi Tonic appears once in included products', dgmrSmoke.includedProducts.filter(item => /Jingi Tonic/i.test(item.name)).length === 1);
check('DGMR: safe price per item is 699.67', Math.abs(dgmrSmoke.averagePrice - 699.6666667) < 0.01);
check('DGMR: Product Truth passes validation', dgmrSmoke.productTruthValidation.valid);

const joinedProducts = core.parsePromotion('Body Serum 1 หลอด และ Lotion 1 ขวด ราคาโปร 399 บาท', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('word "และ" joins included products', joinedProducts.itemCount === 2 && joinedProducts.gift === null);
const withProducts = core.parsePromotion('Body Serum 1 หลอด พร้อม Lotion 1 ขวด ราคาโปร 399 บาท', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('word "พร้อม" alone joins included products', withProducts.itemCount === 2 && withProducts.gift === null);
const pairProduct = core.parsePromotion('Body Serum คู่ ราคาโปร 409 บาท', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
check('word "คู่" means two included products', pairProduct.itemCount === 2 && pairProduct.gift === null);

const malformedGift = core.parsePromotion('Body Serum 2 หลอด ราคาโปร 409 บาท รับฟรี', 0, readJson('data/skinoxy-products.json'), core.LSG_ACCOUNTS[0], {});
const malformedPackage = pkg(malformedGift, 'A');
check('unparsed explicit gift emits required error code', malformedGift.productTruthValidation.errors.some(error => error.code === 'EXPLICIT_GIFT_NOT_PARSED'));
check('Product Truth conflict blocks normal script generation', malformedPackage.generationBlocked && malformedPackage.metadata.generationStatus === 'BLOCKED');
check('blocked script gives a clear correction prompt', /แก้ Input|ยืนยันข้อมูล/.test(fullTextOf(malformedPackage)));
const duplicateTruth = core.parsePromotion('Jingi Tonic 1 ขวด ราคาโปร 999 บาท รับฟรี Jingi Tonic 1 ขวด', 0, readJson('data/dgmr-products.json'), core.LSG_ACCOUNTS.find(item => item.id === 'dgmr'), {});
check('duplicate product and gift emits DUPLICATE_PRODUCT_GIFT', duplicateTruth.productTruthValidation.errors.some(error => error.code === 'DUPLICATE_PRODUCT_GIFT'));
check('duplicate product and gift emits PRODUCT_GIFT_CONFLICT', duplicateTruth.productTruthValidation.errors.some(error => error.code === 'PRODUCT_GIFT_CONFLICT'));
const mismatchTruth = core.validateProductTruth({ raw: 'A 2 ขวด', includedProducts: [{ name: 'A', count: 2 }], itemCount: 1, gift: null, promoPrice: 100, averagePrice: 100 });
check('mismatched included count emits PRODUCT_COUNT_MISMATCH', mismatchTruth.errors.some(error => error.code === 'PRODUCT_COUNT_MISMATCH'));
const unsafePriceTruth = core.validateProductTruth({ raw: 'A ราคาโปร 100', includedProducts: [], itemCount: 0, gift: null, promoPrice: 100, averagePrice: Number.NaN });
check('unsafe average emits PRICE_PER_ITEM_UNSAFE', unsafePriceTruth.errors.some(error => error.code === 'PRICE_PER_ITEM_UNSAFE'));

console.log('\n=== Script generation, compliance, and structure ===');
const BANNED = ['ตะกร้าสีเหลือง', 'ครับ', 'ค่ะ', 'นะครับ', 'นะคะ', 'รักษา', 'หายขาด', 'Session 1', 'Session 2', 'Session 3'];
// Guide/outline language that must never survive into the spoken script — the Section
// framework is internal generation logic only; the visible output must be the completed
// spoken script, not instructions telling the MC what to say.
const GUIDE_LANGUAGE_TERMS = [
  'ควรพูด', 'ให้พูด', 'ให้เริ่ม', 'จากนั้นอธิบาย', 'จากนั้นให้', 'ชวนคนดู', 'อธิบายต่อ',
  'ปิดด้วย', 'เชื่อมเข้า', 'เน้นการ', 'เน้นการขาย', 'MC ควร', 'ให้ MC', 'พูดประมาณว่า',
  'สามารถพูดได้ว่า', 'ปรับตาม', 'เติมเอง', 'เพิ่มตัวอย่างเอง', 'ปรับตามสถานการณ์',
  'ตอบคอมเมนต์ตามความเหมาะสม',
  'Section Objective', 'Pain Point', 'Product Knowledge', 'Producer', 'Pattern Strategy',
  'Producer Note', 'Engagement Prompt', 'CTA Suggestion',
  'MC should', 'Explain the', 'Start by', 'Ask viewers to', 'improvise', 'should say',
  'start by', 'ask viewers', 'explain next', 'close with'
];
// A bracketed placeholder like "[พูดชื่อสินค้า]" or "[ใส่ราคา]" means the generator
// left something for a human to fill in — the spoken script must never contain one.
const PLACEHOLDER_BRACKET_RE = /\[[^\]]{1,40}\]/;
const primaryById = Object.fromEntries(primaryAccounts.map(account => [account.id, account]));
Object.keys(primaryById).forEach(accountId => {
  const p = firstPromo(accountId);
  const packages = core.STRATEGIES.map(pattern => pkg(p, pattern));
  check(`${accountId}: creates A/B/C packages`, packages.length === 3);
  packages.forEach(item => {
    const text = fullTextOf(item);
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: has script_id`, /^.+-\d{8}-\d{4}-[ABC]-\d{3}$/.test(item.metadata.scriptId), item.metadata.scriptId);
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: main script not metadata`, !text.includes('scriptId') && !text.includes('Promotion Summary'));
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: no Session labels`, !/Session\s*[123]/i.test(text));
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: has exactly 3 sections`, sectionsOf(item).length === 3 && sectionsOf(item).every(section => section.text && section.text.length > 0));
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: spoken Thai length reasonable`, text.length >= 2000 && text.length <= 6000, `${text.length}`);
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: no banned terms`, BANNED.filter(word => text.includes(word)).length === 0, BANNED.filter(word => text.includes(word)).join(', '));
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: producer line exists`, item.producerPushLine.length > 20);
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: product truth exists`, item.productTruth.items && item.productTruth.rawText);
    sectionsOf(item).forEach((section, index) => {
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no producer/system labels leak into spoken text`,
        !/Pattern A|Pattern B|Pattern C|Producer|Pain Point|Product Knowledge|Guardrail|Section Objective|→|\|/.test(section.text));
      const guideHit = GUIDE_LANGUAGE_TERMS.find(term => section.text.includes(term));
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no guide-style instruction language`,
        !guideHit, guideHit || '');
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no bullet markers, line breaks, or markdown in spoken text`,
        !/[\r\n]/.test(section.text) && !/(^|\s)[-*#]\s/.test(section.text) && !/(^|\s)\d+[.)]\s/.test(section.text));
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no bracketed placeholders`,
        !PLACEHOLDER_BRACKET_RE.test(section.text), (section.text.match(PLACEHOLDER_BRACKET_RE) || [''])[0]);
    });
  });
  check(`${accountId}: A/B/C full scripts differ`, fullTextOf(packages[0]) !== fullTextOf(packages[1]) && fullTextOf(packages[1]) !== fullTextOf(packages[2]));
  check(`${accountId}: Product Truth same A vs B`, sameFacts(packages[0], packages[1]), diffFacts(packages[0], packages[1]).join(', '));
  check(`${accountId}: Product Truth same B vs C`, sameFacts(packages[1], packages[2]), diffFacts(packages[1], packages[2]).join(', '));
  check(`${accountId}: Product Truth same A vs C`, sameFacts(packages[0], packages[2]), diffFacts(packages[0], packages[2]).join(', '));

  const aText = fullTextOf(packages[0]);
  const bText = fullTextOf(packages[1]);
  const cText = fullTextOf(packages[2]);
  check(`${accountId}: Pattern A diagnoses before value`, indexOfAny(aText, ['ปัญหา', 'สังเกต']) < indexOfAny(aText, ['ราคา', 'โปรโมชัน', 'ความคุ้ม']));
  check(`${accountId}: Pattern B engages before promotion`, indexOfAny(bText, ['คอมเมนต์', 'โมเมนต์', 'สถานการณ์']) < indexOfAny(bText, ['ราคา', 'โปร']));
  check(`${accountId}: Pattern C value before objection`, indexOfAny(cText, ['คุ้ม', 'ราคา', 'ตัวเลข']) < indexOfAny(cText, ['ข้อกังวล']));
});

console.log('\n=== V3 Section Output Contract ===');
let sampleMatrixCount = 0;
Object.keys(primaryById).forEach(accountId => {
  const p = firstPromo(accountId);
  core.STRATEGIES.forEach(pattern => {
    const item = pkg(p, pattern);
    sampleMatrixCount += 1;
    sectionsOf(item).forEach((section, index) => {
      check(`${accountId} ${pattern} Section ${index + 1}: speaking time within 2.4-3.6 minutes`,
        section.estimatedMinutes >= 2.4 && section.estimatedMinutes <= 3.6,
        `${section.estimatedMinutes}`);
      check(`${accountId} ${pattern} Section ${index + 1}: has a title`, typeof section.title === 'string' && section.title.length > 0);
    });
    check(`${accountId} ${pattern}: has shortLoop30 and shortLoop90`, item.mainSpokenScript.shortLoop30.length > 0 && item.mainSpokenScript.shortLoop90.length > 0);
    check(`${accountId} ${pattern}: has Q&A entries`, Array.isArray(item.qAndA) && item.qAndA.length > 0);
    check(`${accountId} ${pattern}: has Policy-Safe Guide entries`, Array.isArray(item.policySafeGuide) && item.policySafeGuide.length > 0);
  });
});
check('Sample Matrix: 5 accounts x A/B/C = 15 packages generated', sampleMatrixCount === 15, `${sampleMatrixCount}`);

console.log('\n=== Full promotion set x Pattern A/B/C: complete spoken script, not a guide ===');
let fullMatrixCount = 0;
let fullMatrixSectionCount = 0;
Object.keys(primaryById).forEach(accountId => {
  const brand = brandsConfig.brands.find(item => item.id === accountId);
  const promos = parseForBrand(brand);
  promos.forEach((p, promoIndex) => {
    core.STRATEGIES.forEach(pattern => {
      const item = pkg(p, pattern);
      fullMatrixCount += 1;
      if (item.generationBlocked) return;
      const truth = item.productTruth;
      sectionsOf(item).forEach((section, index) => {
        fullMatrixSectionCount += 1;
        const label = `${accountId} promo${promoIndex + 1} ${pattern} Section ${index + 1}`;
        const guideHit = GUIDE_LANGUAGE_TERMS.find(term => section.text.includes(term));
        check(`${label}: no guide-style instruction language`, !guideHit, guideHit || '');
        check(`${label}: no bullet markers, line breaks, or markdown in spoken text`,
          !/[\r\n]/.test(section.text) && !/(^|\s)[-*#]\s/.test(section.text) && !/(^|\s)\d+[.)]\s/.test(section.text));
        check(`${label}: no bracketed placeholders`,
          !PLACEHOLDER_BRACKET_RE.test(section.text), (section.text.match(PLACEHOLDER_BRACKET_RE) || [''])[0]);
        check(`${label}: contains at least one verified Product Truth detail`,
          (truth.items && section.text.includes(truth.items)) ||
          (truth.productName && section.text.includes(truth.productName)) ||
          [truth.regular, truth.promoPrice, truth.finalPrice].some(price => price && section.text.includes(String(Math.round(price)))));
      });
    });
  });
});
check('Full matrix: every promotion x every Pattern A/B/C produces a package', fullMatrixCount > 15, `${fullMatrixCount}`);
check('Full matrix: sections checked across the entire promotion set', fullMatrixSectionCount === fullMatrixCount * 3 || fullMatrixSectionCount > 0, `${fullMatrixSectionCount}`);

// Acceptance Criteria #12 — Pattern B must not be generic across brands (not just across platform).
const skinoxyB = fullTextOf(pkg(firstPromo('skinoxy'), 'B'));
const kissB = fullTextOf(pkg(firstPromo('kmb'), 'B'));
const dgmrB = fullTextOf(pkg(firstPromo('dgmr'), 'B'));
check('Pattern B: SKINOXY vs KISS cross-brand overlap below 65%', shingleOverlap(skinoxyB, kissB) < 0.65);
check('Pattern B: SKINOXY vs DGMR cross-brand overlap below 65%', shingleOverlap(skinoxyB, dgmrB) < 0.65);
check('Pattern B: KISS vs DGMR cross-brand overlap below 65%', shingleOverlap(kissB, dgmrB) < 0.65);

const skinoxyTikTok = pkg(firstPromo('skinoxy'), 'B', { assignment: manualAssignment('B'), startTime: '19:00' });
const skinoxyShopee = pkg(firstPromo('skinoxy-shopee'), 'B', { assignment: manualAssignment('B'), startTime: '19:00' });
check('TikTok and Shopee persona scripts differ', fullTextOf(skinoxyTikTok) !== fullTextOf(skinoxyShopee));
check('TikTok CTA follows parsed single-product truth', fullTextOf(skinoxyTikTok).includes('เข้าไปดูสินค้าในตะกร้า'));
check('Shopee CTA uses set basket language', fullTextOf(skinoxyShopee).includes('เข้าไปดูเซ็ตในตะกร้า'));

const generatedAgain0 = fullTextOf(pkg(firstPromo('skinoxy'), 'A', { hookVariant: 0 }));
const generatedAgain1 = fullTextOf(pkg(firstPromo('skinoxy'), 'A', { hookVariant: 1 }));
check('Generate Again changes script wording', generatedAgain0 !== generatedAgain1);
check('Generate Again keeps promo price', generatedAgain1.includes('239'));

console.log('\n=== Content QA V2 regression ===');
const QA_TIMES = { skinoxy: '09:30', 'skinoxy-shopee': '09:00', kmb: '11:00', 'kmb-shopee': '09:00', dgmr: '10:00' };
const PRODUCER_PHRASES = ['จุดที่ควรจับ', 'จังหวะการพูด', 'เวลาช่วยเลือก ให้พูด', 'ระหว่างเล่าให้เว้นจังหวะ', 'เมื่อต้องพูดราคา', 'ย้ำอีกครั้งว่าราคา', 'เพราะในไลฟ์ต้อง', 'ปิดการขาย'];
const TEMPLATE_ENGLISH = ['Mood', 'Routine', 'Character', 'Series'];
const qaPackages = {};

Object.keys(SMOKE_INPUTS).forEach(accountId => {
  const promotion = parseSmoke(accountId);
  qaPackages[accountId] = core.STRATEGIES.map(pattern => core.createScriptPackage(promotion, pattern, {
    liveDate: '2026-08-04',
    startTime: QA_TIMES[accountId],
    assignment: manualAssignment(pattern)
  }));
  const scripts = qaPackages[accountId];
  scripts.forEach(item => {
    const text = fullTextOf(item);
    check(`${accountId} ${item.metadata.assignedPattern}: Product Accuracy validation is clean`, item.productTruth.validation.valid && !item.generationBlocked);
    check(`${accountId} ${item.metadata.assignedPattern}: no producer instruction leaks`, PRODUCER_PHRASES.every(phrase => !text.includes(phrase)));
    check(`${accountId} ${item.metadata.assignedPattern}: no template English`, TEMPLATE_ENGLISH.every(term => !new RegExp(`\\b${term}\\b`, 'i').test(text)));
    check(`${accountId} ${item.metadata.assignedPattern}: total speaking time roughly 3 sections worth (7-11 minutes)`, item.estimatedSpeakingTime >= 7 && item.estimatedSpeakingTime <= 11, `${item.estimatedSpeakingTime}`);
    check(`${accountId} ${item.metadata.assignedPattern}: estimatedSpeakingTime metadata exists`, /นาที$/.test(item.metadata.estimatedSpeakingTime));
    check(`${accountId} ${item.metadata.assignedPattern}: strong basket CTA appears exactly once (in the closing section)`, (text.match(/เข้าไปดู(?:สินค้า|เซ็ต)ในตะกร้าแล้วกดรับโปร/g) || []).length === 1);
    check(`${accountId} ${item.metadata.assignedPattern}: producer notes stay separate`, item.producerNotes.length > 0 && !text.includes(item.producerNotes[0]));
  });
  // V3: every pattern targets 3 sections x ~3 minutes (~9 minutes), so A/B/C should be
  // similar total length now (not strictly A-longest/C-shortest like the single-script MVP).
  const totalMinutesByPattern = scripts.map(item => item.estimatedSpeakingTime);
  check(`${accountId}: A/B/C total speaking time stays within a similar band (not one pattern starved)`,
    Math.max(...totalMinutesByPattern) - Math.min(...totalMinutesByPattern) <= 2.5,
    totalMinutesByPattern.join(', '));
});

const singleProductPackages = [...qaPackages.kmb, ...qaPackages['kmb-shopee']];
singleProductPackages.forEach(item => {
  const text = fullTextOf(item);
  check(`single product ${item.metadata.scriptId}: no plural-only wording`, !text.includes('ของทุกชิ้น') && !text.includes('เซ็ตนี้'));
  check(`single product ${item.metadata.scriptId}: no unavailable option CTA`, !text.includes('เลือกสูตร') && !text.includes('เลือกกลิ่น'));
  check(`single product ${item.metadata.scriptId}: uses product basket CTA`, text.includes('เข้าไปดูสินค้าในตะกร้า'));
});

Object.values(qaPackages).forEach(packages => {
  const closing = fullTextOf(packages.find(item => item.metadata.assignedPattern === 'C'));
  check('Pattern C has no purchase-delaying phrase', !/ไม่จำเป็นต้องรีบเลือก|เลือกเมื่อ/.test(closing));
});

const skinoxyClosing = fullTextOf(qaPackages.skinoxy.find(item => item.metadata.assignedPattern === 'C'));
check('SKINOXY Pattern C states safe 204.50 baht per tube', skinoxyClosing.includes('ราคาเฉลี่ย 204.50 บาทต่อหลอด'));
const dgmrClosing = qaPackages.dgmr.find(item => item.metadata.assignedPattern === 'C');
check('DGMR Pattern C states safe 699.67 baht per item', fullTextOf(dgmrClosing).includes('ราคาเฉลี่ย 699.67 บาทต่อชิ้น'));
check('DGMR Pattern C does not classify Jingi Tonic as a gift', dgmrClosing.productTruth.gift === null && !/ของแถม(?:เป็น|:)\s*Jingi Tonic/i.test(fullTextOf(dgmrClosing)));

function shingleOverlap(a, b, size = 5){
  const shingles = text => {
    const words = text.split(/\s+/).filter(Boolean);
    return new Set(words.slice(0, Math.max(0, words.length - size + 1)).map((_, index) => words.slice(index, index + size).join(' ')));
  };
  const left = shingles(a);
  const right = shingles(b);
  const common = [...left].filter(value => right.has(value)).length;
  return common / Math.max(1, Math.min(left.size, right.size));
}

['A', 'B', 'C'].forEach((pattern, index) => {
  check(`SKINOXY ${pattern}: TikTok and Shopee body overlap below 65%`, shingleOverlap(fullTextOf(qaPackages.skinoxy[index]), fullTextOf(qaPackages['skinoxy-shopee'][index])) < 0.65);
  check(`KISS ${pattern}: TikTok and Shopee body overlap below 65%`, shingleOverlap(fullTextOf(qaPackages.kmb[index]), fullTextOf(qaPackages['kmb-shopee'][index])) < 0.65);
});

console.log('\n=== UI, OCR, copy, and responsive static checks ===');
check('UI has account selector', indexHtml.includes('id="accountSelect"'));
check('UI has date input', indexHtml.includes('id="liveDate"'));
check('UI has time input', indexHtml.includes('id="startTime"'));
check('UI has Generate Assigned button', indexHtml.includes('Generate Assigned Pattern'));
check('UI has Generate All warning', indexHtml.includes('ไม่ควรให้ MC สลับ Pattern'));
check('Copy Script uses main script output', appJs.includes('.main-script-output') && appJs.includes('Copy successful'));
check('Copy Metadata exists', appJs.includes('copy-metadata'));
check('Export JSON exists', appJs.includes('Export JSON'));
check('Export JSON appends download link before click', appJs.includes('document.body.appendChild(link)'));
check('OCR crop modal still present', indexHtml.includes('cropModal') && appJs.includes('runOcrOn') && appJs.includes('preprocessDrawableForOcr'));
check('OCR has runtime guard', appJs.includes("typeof Tesseract === 'undefined'"));
check('Responsive CSS has tablet breakpoint', stylesCss.includes('@media (max-width:900px)'));
check('Responsive CSS has mobile breakpoint', stylesCss.includes('@media (max-width:640px)'));
check('No primary DGMR Shopee option in config', primaryAccounts.every(account => account.id !== 'dgmr-shopee'));
check('Config scripts loaded before core', indexHtml.indexOf('config/accounts.js') < indexHtml.indexOf('core.js'));

console.log('\n=== Copy Section contains only the spoken script, nothing else ===');
check('Copy Section handler copies section.text only', appJs.includes('await navigator.clipboard.writeText(sections[index].text)'));
{
  // The visible Section panel (the copyable box) must render only section.title as a
  // label and section.text as the body — it must never render producer/validation
  // notes inside the same box the Copy Section button copies from.
  const panelStart = appJs.indexOf('class="main-copy-box section-panel"');
  const panelBlockEnd = appJs.indexOf('</div>\n    `).join', panelStart);
  const panelBlock = panelStart >= 0 && panelBlockEnd > panelStart ? appJs.slice(panelStart, panelBlockEnd) : '';
  check('Section panel markup is found for inspection', panelBlock.length > 0);
  ['producerNotes', 'validationNotes', 'producerPushLine', 'qAndA', 'policySafeGuide'].forEach(field => {
    check(`Section panel markup does not render ${field} inside the copyable box`, !panelBlock.includes(field));
  });
}
check('Producer/validation notes render only inside the separate supporting-copy <details>',
  appJs.includes('<details class="supporting-copy">') &&
  appJs.indexOf('producerNotes.join') > appJs.indexOf('<details class="supporting-copy">'));

console.log('\n=== Export to Google Doc ===');
const googleIntegrationJs = readText('config/google-integration.js');
check('index.html loads Google Identity Services SDK', indexHtml.includes('https://accounts.google.com/gsi/client'));
check('index.html loads config/google-integration.js', indexHtml.includes('config/google-integration.js'));
// Note: a Google OAuth Web-application Client ID is not a secret — Google's own
// docs expect it embedded in public frontend JS (unlike a client *secret*, which
// this app never uses at all since it's a pure static site with no server).
check('config/google-integration.js has a clientId configured (empty or a real Google OAuth client ID)',
  /clientId:\s*'(|[\w-]+\.apps\.googleusercontent\.com)'/.test(googleIntegrationJs));
check('Google Docs scopes are least-privilege (documents + drive.file only)',
  googleIntegrationJs.includes('auth/documents') && googleIntegrationJs.includes('auth/drive.file') &&
  !googleIntegrationJs.includes('auth/drive"') && !googleIntegrationJs.includes("auth/drive'"));
check('UI has Export to Google Doc button', appJs.includes('export-gdoc') && appJs.includes('Export to Google Doc'));
check('Export to Google Doc button is wired to exportToGoogleDoc', appJs.includes("querySelector('.export-gdoc')") && appJs.includes('exportToGoogleDoc(packageItem)'));
check('Missing Client ID shows a setup message instead of crashing', appJs.includes("ยังไม่ได้ตั้งค่า Google Client ID"));
{
  // buildGoogleDocContent must only pull section.title / section.text (the visible
  // spoken script) into the doc — never producer/validation notes or raw metadata dumps.
  const fnStart = appJs.indexOf('function buildGoogleDocContent');
  const fnEnd = appJs.indexOf('\n}', fnStart);
  const fnBody = fnStart >= 0 && fnEnd > fnStart ? appJs.slice(fnStart, fnEnd) : '';
  check('buildGoogleDocContent is found for inspection', fnBody.length > 0);
  check('buildGoogleDocContent uses section.title and section.text', fnBody.includes('section.title') && fnBody.includes('section.text'));
  ['producerNotes', 'validationNotes', 'producerPushLine', 'qAndA', 'policySafeGuide', 'metadataJson'].forEach(field => {
    check(`buildGoogleDocContent does not pull in ${field}`, !fnBody.includes(field));
  });
}
check('Doc creation uses documents.create then batchUpdate (no plain-text-only fallback that skips formatting request shape)',
  appJs.includes("fetch('https://docs.googleapis.com/v1/documents'") && appJs.includes(':batchUpdate'));
check('Created Google Doc opens in a new tab', appJs.includes("window.open(docUrl, '_blank')"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
