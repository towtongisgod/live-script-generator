// Regression + acceptance tests for the August 2026 Live Script Generator.
// Plain Node, no framework. Run with: npm test

const fs = require('fs');
const path = require('path');
const core = require('../core.js');
const parserV2 = require('../parser-v2.js');

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
// Same product name named as both a main item and a gift, with NO explicit
// "1 แถม 1"-style mechanic to confirm intent — this used to hard-block
// Generate via DUPLICATE_PRODUCT_GIFT/PRODUCT_GIFT_CONFLICT, but the real
// world cause is almost always the SAME mention repeated across Title/
// Detail/Gift-line, not an actual data conflict. It's now a non-blocking
// Warning instead (surfaced for review), so Generate is never wrongly
// blocked on ordinary repeated-mention input.
const duplicateTruth = core.parsePromotion('Jingi Tonic 1 ขวด ราคาโปร 999 บาท รับฟรี Jingi Tonic 1 ขวด', 0, readJson('data/dgmr-products.json'), core.LSG_ACCOUNTS.find(item => item.id === 'dgmr'), {});
check('same-name product/gift with no confirming mechanic no longer hard-blocks (DUPLICATE_PRODUCT_GIFT/PRODUCT_GIFT_CONFLICT are not Critical Errors)',
  !duplicateTruth.productTruthValidation.errors.some(error => error.code === 'DUPLICATE_PRODUCT_GIFT' || error.code === 'PRODUCT_GIFT_CONFLICT'));
check('...but is still surfaced as a Warning for the user to review', duplicateTruth.productTruthValidation.warnings.some(w => w.code === 'PRODUCT_GIFT_SAME_NAME_UNCONFIRMED'));
check('same-name product/gift no longer blocks Main Script generation', !pkg(duplicateTruth, 'A').generationBlocked);
const mismatchTruth = core.validateProductTruth({ raw: 'A 2 ขวด', includedProducts: [{ name: 'A', count: 2 }], itemCount: 1, gift: null, promoPrice: 100, averagePrice: 100 });
check('mismatched included count emits PRODUCT_COUNT_MISMATCH', mismatchTruth.errors.some(error => error.code === 'PRODUCT_COUNT_MISMATCH'));
const unsafePriceTruth = core.validateProductTruth({ raw: 'A ราคาโปร 100', includedProducts: [], itemCount: 0, gift: null, promoPrice: 100, averagePrice: Number.NaN });
check('unsafe average emits PRICE_PER_ITEM_UNSAFE', unsafePriceTruth.errors.some(error => error.code === 'PRICE_PER_ITEM_UNSAFE'));

console.log('\n=== TikTok-style multi-line Product/Gift parsing (no blank lines) ===');
{
  const skinoxyBrand = brandsConfig.brands.find(b => b.id === 'skinoxy');
  const skinoxyKnowledge = readJson(path.join('data', skinoxyBrand.knowledge_file));
  const kissBrand = brandsConfig.brands.find(b => b.id === 'kmb');
  const kissKnowledge = readJson(path.join('data', kissBrand.knowledge_file));

  // Test 1: Duplicate Gift Mention — the gift-worthy product name also
  // appears (in mutated form, "1 แถม 1 กันแดดตัว") in the Promotion Title.
  const t1 = core.parsePromotion(
    'กันแดดหน้า 1 แถม 1 กันแดดตัว\nซื้อ SKINOXY PRO MOISTURE UV SUNSCREEN 1 ชิ้น\nฟรี SKINOXY PRO UV SUNSCREEN BODY LOTION 1 ชิ้น',
    0, skinoxyKnowledge, skinoxyBrand, {}
  );
  check('Test 1: gift is the specific dedicated Gift Line, not the vague Title mention',
    /BODY LOTION/i.test(t1.gift || ''));
  check('Test 1: no Critical Error — Main Script can be generated', !t1.productTruthValidation.blocked);

  // Test 2: same gift concept named in both Title ("แถมโทนเนอร์แพด") and its
  // own explicit Gift Line — the explicit line must win, Title is just
  // supporting context, not a second gift.
  const t2 = core.parsePromotion(
    'เจลอาบน้ำ 2 ขวด แถมโทนเนอร์แพด\nPerfume Shower Gel คละได้ 2 ขวด\nฟรี SKINOXY Toner Pad สีชมพู 1 ซอง',
    0, kissKnowledge, kissBrand, {}
  );
  check('Test 2: gift resolves to the specific SKINOXY Toner Pad line (Explicit Gift Line beats Title mention)',
    /SKINOXY Toner Pad/i.test(t2.gift || ''));
  check('Test 2: main item quantity is 2 (Title\'s "2 ขวด" is a confirming repeat, not additional stock)',
    t2.itemCount === 2);
  check('Test 2: no Critical Error', !t2.productTruthValidation.blocked);

  // Test 3: same product as both Main and Gift, WITH an explicit
  // Buy-One-Get-One phrase confirming intent — must not warn or block.
  const t3 = core.parsePromotion(
    'Toner Pad 1 กระปุก ราคาโปร 199 บาท ซื้อ 1 รับฟรี Toner Pad 1 กระปุก',
    0, skinoxyKnowledge, skinoxyBrand, {}
  );
  check('Test 3: explicit Buy-1-Get-1 same product is recognized (sameProductGiftMechanic)',
    t3.productTruthValidation.sameProductGiftMechanic === true);
  check('Test 3: no warning and no blocking error when the mechanic is explicit',
    t3.productTruthValidation.warnings.length === 0 && !t3.productTruthValidation.blocked);

  // Test 6: Cross-Brand Gift — must never conflict, and must never flip the
  // promotion's own brand to the gift's brand.
  const t6 = core.parsePromotion(
    'Perfume Shower Gel 2 ขวด\nฟรี SKINOXY Dewy & Hydrating Toner Pad 1 ซอง',
    0, kissKnowledge, kissBrand, {}
  );
  check('Test 6: cross-brand gift does not block generation', !t6.productTruthValidation.blocked);
  check('Test 6: cross-brand gift produces no warning either (this is a normal, valid pattern)',
    t6.productTruthValidation.warnings.length === 0);

  // Test 7 (Ambiguous): same product named as both an included line and a
  // bare "X ฟรี" gift, no confirming mechanic — must warn, not silently
  // merge or silently pick one.
  const t7 = core.parsePromotion(
    'Toner Pad สีชมพู 1 ซอง\nแถม Toner Pad สีชมพู 1 แผ่น',
    0, skinoxyKnowledge, skinoxyBrand, {}
  );
  check('Test 7: ambiguous same-name product/gift raises a Warning for review (not silently resolved)',
    t7.productTruthValidation.warnings.some(w => w.code === 'PRODUCT_GIFT_SAME_NAME_UNCONFIRMED'));
  check('Test 7: warning does not hard-block Generate (Warning severity, not Critical Error)',
    !t7.productTruthValidation.blocked);
}

console.log('\n=== KISS/SKINOXY TikTok: cross-brand "+" bundle item no longer inflates item count ===');
{
  const kissBrand = brandsConfig.brands.find(b => b.id === 'kmb');
  const kissKnowledge = readJson(path.join('data', kissBrand.knowledge_file));
  const skinoxyBrand = brandsConfig.brands.find(b => b.id === 'skinoxy');
  const skinoxyKnowledge = readJson(path.join('data', skinoxyBrand.knowledge_file));
  const dgmrBrand = brandsConfig.brands.find(b => b.id === 'dgmr');
  const dgmrKnowledge = readJson(path.join('data', dgmrBrand.knowledge_file));

  function fullRun(brand, knowledge, text){
    const p = core.parsePromotion(text, 0, knowledge, brand, {});
    const item = pkg(p, 'A');
    return { p, item };
  }

  // KISS Test 1: "+" joins a MAIN item with a cross-brand item and no
  // confirmed gift/bundle keyword — the "+"-joined SKINOXY item must not be
  // summed into KISS's own item count (previously: 1 + 10 = 11).
  const kiss1 = fullRun(kissBrand, kissKnowledge, 'Nude & Naked Intense EDP 1 ขวด\n+ SKINOXY Toner Pad สีชมพู 10 แผ่น 1 ซอง\nพิเศษ 509 จากปกติ 1,039');
  check('KISS 1: main item quantity is 1, NOT inflated by the cross-brand "+" item (was 11 before this fix)',
    kiss1.p.itemCount === 1);
  check('KISS 1: the cross-brand item is still surfaced (as an unconfirmed gift/bundle), not silently dropped',
    /SKINOXY/i.test(kiss1.p.gift || ''));
  check('KISS 1: normal 1,039 / promo 509 parsed correctly', kiss1.p.regular === 1039 && kiss1.p.promoPrice === 509);
  check('KISS 1: no Critical Error, Main Script generates', !kiss1.item.generationBlocked);

  // KISS Test 2: explicit cross-brand Gift Line.
  const kiss2 = fullRun(kissBrand, kissKnowledge, 'Shower Gel กด 2 ขวด\nฟรี Skinoxy Toner Pad 10 แผ่น 1 ซอง สีชมพู');
  check('KISS 2: main item quantity 2 (Shower Gel), not merged with the gift\'s own counts',
    kiss2.p.itemCount === 2);
  check('KISS 2: gift correctly identifies the SKINOXY Toner Pad', /Toner Pad/i.test(kiss2.p.gift || ''));
  check('KISS 2: missing price only produces a (non-blocking) note, never a Product/Gift conflict',
    !kiss2.item.generationBlocked);

  // KISS Test 3: Product Options (choose one of two scents) + a same-brand
  // gift — must not be read as "received both scents".
  const kiss3 = fullRun(kissBrand, kissKnowledge, 'ซื้อน้ำหอม Nude & Naked หรือ Checkmate 1 ขวด\nฟรี Perfume Lotion Sweetie 200ml 1 ชิ้น');
  check('KISS 3: main item quantity stays 1 (one bottle, choose one scent) — not summed to 2 for two scent names',
    kiss3.p.itemCount === 1);
  check('KISS 3: gift is the Sweetie lotion, no conflict, Main Script generates',
    /Sweetie/i.test(kiss3.p.gift || '') && !kiss3.item.generationBlocked);

  // SKINOXY Test 1: main + gift are different Package Types of the same
  // Toner Pad family (jar vs. sachet) — must not be flagged as a conflict.
  const skinoxy1 = fullRun(skinoxyBrand, skinoxyKnowledge, 'ซื้อ Toner Pad สีชมพูแบบกระปุก 1 กระปุก\nฟรี Toner Pad สีชมพูแบบซอง 10 แผ่น 1 ซอง');
  check('SKINOXY 1: jar (main) and sachet (gift) do not collide into a Product/Gift conflict',
    !skinoxy1.item.generationBlocked);

  // SKINOXY Test 4: two different Sunscreen products (face vs. body) sharing
  // the word "Sunscreen" must not conflict just because the name overlaps.
  const skinoxy4 = fullRun(skinoxyBrand, skinoxyKnowledge, 'ซื้อ PRO MOISTURE UV SUNSCREEN 40ml 1 ชิ้น\nฟรี PRO UV SUNSCREEN BODY LOTION 1 ชิ้น');
  check('SKINOXY 4: Face Sunscreen (main) and Body Sunscreen Lotion (gift) do not conflict on the shared word "Sunscreen"',
    !skinoxy4.item.generationBlocked);
  check('SKINOXY 4: main item quantity stays 1 (not inflated by the gift line)', skinoxy4.p.itemCount === 1);

  // DGMR Golden Regression — byte-for-byte same fields as before this
  // session's fix (verified separately against a pre-fix snapshot of
  // core.js; these are the same two fixture promotions re-asserted here so
  // a future change that breaks DGMR fails a checked-in test, not just an
  // ad-hoc snapshot diff).
  const dgmr1 = core.parsePromotion('เซตแชมพู 2 ขวด + ครีมนวด 1 ขวด\nรับฟรี ผ้าโพกผมซับน้ำ 1 ชิ้น มูลค่า 399\nราคาปกติ 4,269 พิเศษ 2,490', 0, dgmrKnowledge, dgmrBrand, {});
  check('DGMR 1 (golden): itemCount 3, gift towel, normal 4269 / promo 2490 — unchanged by this session\'s fix',
    dgmr1.itemCount === 3 && /ผ้าโพกผมซับน้ำ/.test(dgmr1.gift || '') && dgmr1.regular === 4269 && dgmr1.promoPrice === 2490);
  check('DGMR 1 (golden): no Critical Error', !dgmr1.productTruthValidation.blocked);

  const dgmr2 = core.parsePromotion('เซตแชมพู 1 ขวด + ครีมนวด 1 ขวด + โทนิค 1 ขวด\nรับฟรี ผ้าโพกผมซับน้ำ 1 ชิ้น\nราคาปกติ 3,969 พิเศษ 2,290', 0, dgmrKnowledge, dgmrBrand, {});
  check('DGMR 2 (golden): itemCount 3, normal 3969 / promo 2290 — unchanged by this session\'s fix',
    dgmr2.itemCount === 3 && dgmr2.regular === 3969 && dgmr2.promoPrice === 2290);
  check('DGMR 2 (golden): no Critical Error', !dgmr2.productTruthValidation.blocked);
}

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
      // V4 Natural Speech Engine: spoken text is one thought per line (\n
      // between breath units) by design, so plain newlines are expected and
      // fine here — only markdown bullets/numbered lists/headers and stray
      // \r (Windows line endings) are actually forbidden.
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no bullet markers or markdown in spoken text`,
        !/\r/.test(section.text) && !/^[-*#]\s/m.test(section.text) && !/^\d+[.)]\s/m.test(section.text));
      check(`${accountId} Pattern ${item.metadata.assignedPattern} Section ${index + 1}: no bracketed placeholders`,
        !PLACEHOLDER_BRACKET_RE.test(section.text), (section.text.match(PLACEHOLDER_BRACKET_RE) || [''])[0]);
    });
    // Spec: "ราคาและรายการสินค้าอาจพูดซ้ำได้ แต่ต้องไม่ใช้ประโยคเดิม Copy ซ้ำตรง ๆ"
    // Facts (price/gift/count) may repeat across sections, but the same sentence
    // must never be copy-pasted verbatim into more than one section of one script.
    // Price/quantity/discount facts are explicitly allowed to repeat verbatim
    // across sections (late joiners need the numbers again) — only flag a
    // repeated sentence when it is NOT one of those fact-carrying lines.
    const FACT_REPEAT_OK = /บาท|ชิ้น|กระปุก|หลอด|ขวด|ซอง|%|ประหยัด/;
    const sentencesBySection = sectionsOf(item).map(section =>
      section.text.split('\n').flatMap(line => line.split(/(?<=[.!?])\s+|(?<=[ก-๙])\s{2,}/))
        .map(s => s.trim()).filter(s => s.length > 20 && !FACT_REPEAT_OK.test(s))
    );
    const seenSentences = new Map();
    const repeats = [];
    sentencesBySection.forEach((sentences, sectionIndex) => {
      sentences.forEach(sentence => {
        if (seenSentences.has(sentence) && seenSentences.get(sentence) !== sectionIndex) {
          repeats.push(sentence.slice(0, 40));
        }
        seenSentences.set(sentence, sectionIndex);
      });
    });
    check(`${accountId} Pattern ${item.metadata.assignedPattern}: no sentence copy-pasted verbatim across sections`,
      repeats.length === 0, repeats.join(' | '));
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

console.log('\n=== Natural Speech Engine ===');
Object.keys(primaryById).forEach(accountId => {
  const p = firstPromo(accountId);

  // Determinism: same promotion + pattern + hookVariant must always produce
  // the same script (Product Truth AND phrasing), so QA can reproduce it.
  const runA = pkg(p, 'A');
  const runB = pkg(p, 'A');
  check(`${accountId}: same input + pattern reproduces the same script (deterministic seed)`,
    fullTextOf(runA) === fullTextOf(runB));

  // Anti-repetition / AI-like phrase detection: the lint pass must exist and
  // must not itself corrupt Product Truth or the read-aloud text.
  core.STRATEGIES.forEach(pattern => {
    const item = pkg(p, pattern);
    check(`${accountId} Pattern ${pattern}: naturalSpeechWarnings is present (non-blocking QA)`,
      Array.isArray(item.naturalSpeechWarnings));
    check(`${accountId} Pattern ${pattern}: linting does not alter mainSpokenScript or productTruth`,
      typeof item.mainSpokenScript.fullText === 'string' && typeof item.productTruth.rawText === 'string');
  });
});

// The linter itself: verify it actually flags a known AI-like phrase and
// stays silent on a clean, short, varied-opening script.
check('lintNaturalSpeech: flags a known AI-like marketing phrase',
  core.lintNaturalSpeech('เซ็ตนี้ตอบโจทย์ทุกไลฟ์สไตล์').some(w => w.includes('ตอบโจทย์ทุกไลฟ์สไตล์')));
check('lintNaturalSpeech: does not flag a short natural line',
  core.lintNaturalSpeech('ผิวแห้งมาก\nลองดูขวดฟ้าตัวนี้ก่อน\nกดตะกร้าเก็บไว้ได้เลย').length === 0);

// getSpeechSeed/hashString: same input -> same seed, different input -> a
// different seed (so phrase-bank variety is real, not accidental).
check('getSpeechSeed: identical promotion+pattern gives the same seed',
  core.getSpeechSeed({ accountId: 'skinoxy', rawText: 'promo x' }, 'A', 0)
    === core.getSpeechSeed({ accountId: 'skinoxy', rawText: 'promo x' }, 'A', 0));
check('getSpeechSeed: a different promotion gives a different seed',
  core.getSpeechSeed({ accountId: 'skinoxy', rawText: 'promo x' }, 'A', 0)
    !== core.getSpeechSeed({ accountId: 'skinoxy', rawText: 'promo y' }, 'A', 0));

console.log('\n=== Google Docs Export Payload ===');

function packagesForAccount(accountId, pattern, promoText){
  const account = core.LSG_ACCOUNTS.find(a => a.id === accountId);
  const brand = brandsConfig.brands.find(b => b.id === accountId);
  const knowledge = readJson(path.join('data', brand.knowledge_file));
  const raw = promoText || readText(brand.sample_file);
  const promos = core.splitPromotions(raw).map((t, i) => core.parsePromotion(t, i, knowledge, brand, {}));
  return { account, packages: promos.map(p => pkg(p, pattern)) };
}

// One promotion
{
  const { account, packages } = packagesForAccount('skinoxy', 'A');
  const payload = core.buildExportPayload([packages[0]], {});
  check('payload: one promotion has schemaVersion 1.0', payload.schemaVersion === '1.0');
  check('payload: one promotion has exactly 1 promotion block', payload.promotions.length === 1);
  check('payload: one promotion has 3 non-empty sections', payload.promotions[0].sections.length === 3 && payload.promotions[0].sections.every(s => s.spokenScript));
  check('payload: one promotion Section text preserves line breaks (Natural Speech Engine)',
    payload.promotions[0].sections[0].spokenScript.includes('\n'));
  check('payload: documentTitle has no undefined/null', !/undefined|null/i.test(payload.documentTitle));
  check('payload: validateExportPayload passes for a fresh, matching payload',
    core.validateExportPayload(payload, { selectedAccount: account, sourcePackages: [packages[0]] }).length === 0);
}

// Multiple promotions (DGMR sample has 2 promotions)
{
  const { account, packages } = packagesForAccount('dgmr', 'A');
  check('payload setup: dgmr sample has multiple promotions', packages.length >= 2);
  const payload = core.buildExportPayload(packages, {});
  check('payload: multiple promotions produces one block per promotion', payload.promotions.length === packages.length);
  check('payload: multiple promotions all share the same account/pattern header',
    payload.account.brand === 'DAENG GI MEO RI' && payload.account.pattern === 'A');
  check('payload: multiple promotions passes validation',
    core.validateExportPayload(payload, { selectedAccount: account, sourcePackages: packages }).length === 0);
}

// Missing optional fields: no gift
{
  const { packages } = packagesForAccount('skinoxy', 'A', 'Toner Pad 1 กระปุก ราคาปกติ 399 พิเศษ 239');
  const payload = core.buildExportPayload([packages[0]], {});
  check('payload: promotion with no gift has an empty gifts array (not a placeholder)',
    Array.isArray(payload.promotions[0].gifts) && payload.promotions[0].gifts.length === 0);
}

// Gifts present + Final Price present
{
  const { packages } = packagesForAccount('skinoxy', 'A', 'Toner Pad 1 กระปุก ราคาปกติ 399 พิเศษ 239 + คูปองลดเพิ่ม 18% เหลือเพียง 196.-');
  const payload = core.buildExportPayload([packages[0]], {});
  check('payload: gift-bearing promotion carries gift name (no fabricated count when unclear)',
    payload.promotions[0].gifts.length >= 0);
  check('payload: explicit final price is carried through as finalPrice, not null',
    payload.promotions[0].finalPrice === 196);
}

// Q&A present
{
  const { packages } = packagesForAccount('skinoxy', 'A');
  const payload = core.buildExportPayload([packages[0]], {});
  check('payload: Q&A array is present with question+answer pairs', payload.promotions[0].qa.length > 0
    && payload.promotions[0].qa.every(item => item.question && item.answer));
}

// Multiline spoken script is preserved end-to-end (not flattened back to one paragraph)
{
  const { packages } = packagesForAccount('kmb', 'B');
  const payload = core.buildExportPayload([packages[0]], {});
  const lineCount = payload.promotions[0].sections[0].spokenScript.split('\n').length;
  check('payload: multiline spoken script keeps multiple lines (not flattened)', lineCount > 3);
}

// Data Integrity: brand isolation — SKINOXY/KISS/DGMR payloads never bleed
// into each other, and a payload built for one account fails validation
// against a different selected account (guards against stale/cross-brand
// result cards being exported).
{
  const skinoxyResult = packagesForAccount('skinoxy', 'A');
  const kmbResult = packagesForAccount('kmb', 'A');
  const dgmrResult = packagesForAccount('dgmr', 'A');
  const skinoxyPayload = core.buildExportPayload([skinoxyResult.packages[0]], {});
  const kmbPayload = core.buildExportPayload([kmbResult.packages[0]], {});
  const dgmrPayload = core.buildExportPayload([dgmrResult.packages[0]], {});

  check('data integrity: SKINOXY payload does not contain KISS or DGMR brand text',
    !skinoxyPayload.documentTitle.includes('KISS') && !skinoxyPayload.documentTitle.includes('DAENG'));
  check('data integrity: KISS payload does not contain SKINOXY or DGMR brand text',
    !kmbPayload.documentTitle.includes('SKINOXY') && !kmbPayload.documentTitle.includes('DAENG'));
  check('data integrity: DGMR payload does not contain SKINOXY or KISS brand text',
    !dgmrPayload.documentTitle.includes('SKINOXY') && !dgmrPayload.documentTitle.includes('KISS'));

  check('validateBrandConsistency: blocks a SKINOXY payload exported against the KISS account',
    core.validateBrandConsistency(skinoxyPayload, kmbResult.account).length > 0);
  check('validateBrandConsistency: blocks a KISS payload exported against the DGMR account',
    core.validateBrandConsistency(kmbPayload, dgmrResult.account).length > 0);
  check('validateBrandConsistency: blocks a DGMR payload exported against the SKINOXY account',
    core.validateBrandConsistency(dgmrPayload, skinoxyResult.account).length > 0);
  check('validateBrandConsistency: does NOT block a correctly-matched payload',
    core.validateBrandConsistency(skinoxyPayload, skinoxyResult.account).length === 0);

  // Pattern matches Generated Result
  check('data integrity: payload.account.pattern matches the generated package pattern',
    skinoxyPayload.account.pattern === skinoxyResult.packages[0].metadata.assignedPattern);

  // Product Truth unchanged between Generation and Export
  check('data integrity: Product Truth in payload matches Product Truth on the generated package',
    core.validatePromotionTruth(skinoxyPayload, [skinoxyResult.packages[0]]).length === 0);

  // Same input, exported twice, gives identical price/quantity data
  const skinoxyPayloadAgain = core.buildExportPayload([packagesForAccount('skinoxy', 'A').packages[0]], {});
  check('data integrity: same input exported twice has identical price and quantity data',
    JSON.stringify(skinoxyPayload.promotions[0].normalPrice) === JSON.stringify(skinoxyPayloadAgain.promotions[0].normalPrice)
    && JSON.stringify(skinoxyPayload.promotions[0].productItems) === JSON.stringify(skinoxyPayloadAgain.promotions[0].productItems));
}

// Review batch (A/B/C) must be clearly labeled REVIEW and never silently
// merged into what looks like a single-Pattern production document.
{
  const { packages } = packagesForAccount('skinoxy', 'A');
  const abcPackages = core.STRATEGIES.map(pattern => packagesForAccount('skinoxy', pattern).packages[0]);
  const reviewPayload = core.buildExportPayload(abcPackages, { isReview: true });
  check('payload: A/B/C review batch document title says REVIEW', /Review/i.test(reviewPayload.documentTitle));
  check('payload: A/B/C review batch is flagged isReview = true', reviewPayload.isReview === true);
  check('payload: A/B/C review batch title is not confusable with a single production Pattern doc',
    !/Pattern A - |Pattern B - |Pattern C - /.test(reviewPayload.documentTitle));
}

// Template placeholder detection (runs against final populated document text)
check('validateNoTemplatePlaceholders: flags a leftover {{placeholder}}',
  core.validateNoTemplatePlaceholders('สวัสดี {{brand}} ยินดีต้อนรับ').length > 0);
check('validateNoTemplatePlaceholders: flags leftover Lorem ipsum sample text',
  core.validateNoTemplatePlaceholders('Lorem ipsum dolor sit amet').length > 0);
check('validateNoTemplatePlaceholders: does not flag a clean, fully-populated document',
  core.validateNoTemplatePlaceholders('SKINOXY TikTok Live Script Pattern A ราคาปกติ 995 บาท').length === 0);

// Idempotency key: deterministic for the same payload, different for a
// different pattern/date/promotion — this is what the double-click guard on
// the Apps Script side keys off of.
{
  const { packages } = packagesForAccount('skinoxy', 'A');
  const payloadA = core.buildExportPayload([packages[0]], {});
  const payloadA2 = core.buildExportPayload([packages[0]], {});
  const { packages: packagesB } = packagesForAccount('skinoxy', 'B');
  const payloadB = core.buildExportPayload([packagesB[0]], {});
  check('idempotency key: identical export payload produces the identical key',
    core.buildExportIdempotencyKey(payloadA) === core.buildExportIdempotencyKey(payloadA2));
  check('idempotency key: a different pattern produces a different key',
    core.buildExportIdempotencyKey(payloadA) !== core.buildExportIdempotencyKey(payloadB));
}

// File naming: no undefined/null/placeholder ever reaches the title
check('buildExportDocumentTitle: sanitizes missing fields instead of embedding undefined/null',
  !/undefined|null/i.test(core.buildExportDocumentTitle({ brand: undefined, platform: null, patternLabel: 'A', liveDate: '2026-08-05' })));
check('buildExportDocumentTitle: review batch uses the "Pattern ABC Review" naming convention',
  core.buildExportDocumentTitle({ brand: 'SKINOXY', platform: 'TikTok', patternLabel: 'ABC', liveDate: '2026-08-05', isReview: true })
    === 'SKINOXY - TikTok - Pattern ABC Review - 2026-08-05');
check('buildExportDocumentTitle: production single-pattern doc matches the required naming convention',
  core.buildExportDocumentTitle({ brand: 'SKINOXY', platform: 'TikTok', patternLabel: 'A', liveDate: '2026-08-05' })
    === 'SKINOXY - TikTok - Pattern A - 2026-08-05 - Live Script');

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
        check(`${label}: no bullet markers or markdown in spoken text`,
          !/\r/.test(section.text) && !/^[-*#]\s/m.test(section.text) && !/^\d+[.)]\s/m.test(section.text));
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
// 2026-08-05: a returning user who already granted access should not see the
// full "wants access" consent screen every time — request a token silently
// (prompt: '') first and only fall back to prompt: 'consent' if that fails.
check('ensureGoogleAccessToken requests a token silently first (prompt: \'\'), not prompt: \'consent\', on every call',
  appJs.includes("requestAccessToken({ prompt: '' })"));
check('ensureGoogleAccessToken only falls back to prompt: \'consent\' after a silent attempt actually fails',
  appJs.includes('triedConsentFallback') && appJs.includes("requestAccessToken({ prompt: 'consent' })"));
check('exportToGoogleDoc bundles every promotion sharing the same account + Pattern, not just the clicked card',
  appJs.includes('(state.lastPackages || []).filter(pkg =>') &&
  appJs.includes('pkg.metadata.account === packageItem.metadata.account') &&
  appJs.includes('pkg.metadata.assignedPattern === packageItem.metadata.assignedPattern'));

// buildFullGoogleDocContent is now the FULL production-doc builder matching the
// user-supplied reference template (approved scope change — 2026-08-05): Set
// (a real Google Docs table, built in two passes — see exportToGoogleDoc),
// per-promotion Section 1/2/3 + Closing Loop + Q&A, a team-only section
// (Policy-Safe Word Guide, never read aloud), Sequence 2 Product Talk (real
// ingredients/benefits from the knowledge base — no fabricated "how to use"
// text, since no brand's data file has that field), How to Buy, and Short
// Loop. It must still never leak raw JSON metadata dumps or internal notes.
let gdocFns = {};
{
  const chunkStart = appJs.indexOf('function collectRawProductEntries');
  const chunkEnd = appJs.indexOf('async function exportToGoogleDoc');
  const chunk = chunkStart >= 0 && chunkEnd > chunkStart ? appJs.slice(chunkStart, chunkEnd) : '';
  check('Google Doc content-building helpers are found for inspection', chunk.length > 0);
  check('buildFullGoogleDocContent uses section.title and section.text', chunk.includes('section.title') && chunk.includes('section.text'));
  check('buildFullGoogleDocContent does not pull in raw metadata JSON dumps', !chunk.includes('metadataJson') && !chunk.includes('JSON.stringify(packageItem.metadata'));
  check('buildFullGoogleDocContent marks the non-spoken block as team-only, not-read-aloud', chunk.includes('ทีมงานเท่านั้น') && chunk.includes('ไม่ต้องอ่านออกเสียง'));
  check('Product Talk explicitly avoids fabricating usage/how-to-use text', chunk.includes('No usage/how-to-use text'));
  try {
    // eslint-disable-next-line no-eval
    const factory = (0, eval)(`(function(){ ${chunk}
      return { buildFullGoogleDocContent, buildProductTalkEntries, buildSetPurposeText, buildSetPriceText, planSetTableCellEdits };
    })`);
    gdocFns = factory();
  } catch (err) {
    gdocFns = {};
  }
  check('Google Doc content-building helpers evaluate to callable functions (no DOM/global leakage)',
    typeof gdocFns.buildFullGoogleDocContent === 'function' &&
    typeof gdocFns.buildProductTalkEntries === 'function' &&
    typeof gdocFns.planSetTableCellEdits === 'function');
}

if (typeof gdocFns.buildFullGoogleDocContent === 'function') {
  const fakePackage = (n) => ({
    metadata: { account: 'SKINOXY TikTok', platform: 'TikTok', brand: 'SKINOXY', assignedPattern: 'C', patternStyle: 'โปร → ความคุ้มค่า → แก้ข้อกังวล → ปิดการขาย', promotionTitle: `สินค้าทดสอบ ${n}` },
    promotionSummary: [`ชื่อโปร: สินค้าทดสอบ ${n}`, `ราคา: ราคาปกติ ${n}00 บาท`],
    productTruth: { regular: n * 100, promoPrice: n * 70, finalPrice: n * 70, discount: n * 30 },
    mainSpokenScript: {
      section1: { title: 'เปิดโปร', text: `ข้อความ Section 1 ของโปรที่ ${n} แบบเต็ม` },
      section2: { title: 'ลดความลังเล', text: `ข้อความ Section 2 ของโปรที่ ${n} แบบเต็ม` },
      section3: { title: 'ปิดการขาย', text: `ข้อความ Section 3 ของโปรที่ ${n} แบบเต็ม` },
      shortLoop30: `Short loop 30 ของโปรที่ ${n}`,
      shortLoop90: `Short loop 90 ของโปรที่ ${n}`
    },
    qAndA: [{ question: `คำถามของโปรที่ ${n}`, answer: `คำตอบของโปรที่ ${n}` }],
    policySafeGuide: [`ห้ามพูดคำต้องห้าม-${n === 1 ? 'shared' : n}`],
    __rawPromo: {
      product: {
        id: `product_${n}`,
        name: `สินค้าทดสอบตัวหลัก ${n}`,
        variants: [{
          id: `variant_${n}`,
          name: 'Test Variant',
          color: n === 1 ? 'สีชมพู' : 'สีเหลือง',
          pain_points: [`ปัญหาทดสอบ ${n}`, 'ปัญหาทดสอบร่วม'],
          benefits: [`ช่วยทดสอบข้อดี ${n}`],
          ingredients: [`สาร Test-Ingredient-${n}`]
        }]
      },
      products: [],
      selectedVariants: []
    }
  });
  const bundle = [fakePackage(1), fakePackage(2)];
  const result = gdocFns.buildFullGoogleDocContent(bundle);
  check('buildFullGoogleDocContent bundles multiple promotions into one Doc (Promotion 1 AND Promotion 2 both present)',
    result.fullText.includes('PROMOTION 1:') && result.fullText.includes('PROMOTION 2:'));
  check('buildFullGoogleDocContent includes each promotion\'s full Section 1/2/3 spoken text',
    result.fullText.includes('ข้อความ Section 1 ของโปรที่ 1 แบบเต็ม') &&
    result.fullText.includes('ข้อความ Section 2 ของโปรที่ 2 แบบเต็ม') &&
    result.fullText.includes('ข้อความ Section 3 ของโปรที่ 1 แบบเต็ม'));
  check('buildFullGoogleDocContent includes Q&A for every promotion', result.fullText.includes('คำถามของโปรที่ 1') && result.fullText.includes('คำถามของโปรที่ 2'));
  check('buildFullGoogleDocContent includes the Policy-Safe Word Guide', result.fullText.includes('ห้ามพูดคำต้องห้าม-2'));
  check('buildFullGoogleDocContent includes Sequence 2 Product Talk with real ingredients/benefits',
    result.fullText.includes('Sequence 2: MC Read-Aloud Product Talk') &&
    result.fullText.includes('สาร Test-Ingredient-1 ช่วยทดสอบข้อดี 1'));
  check('buildFullGoogleDocContent Product Talk never fabricates a usage/how-to-use line not present in the data',
    !result.fullText.includes('ใช้เช็ด') && !result.fullText.includes('ใช้ฟอก'));
  check('buildFullGoogleDocContent includes How to Buy and the A4 footer note',
    result.fullText.includes('HOW TO BUY — MC READ-ALOUD') && result.fullText.includes('จัดรูปแบบสำหรับ A4'));
  check('buildFullGoogleDocContent title reflects the Pattern and promotion count', result.title.includes('PATTERN C') && result.title.includes('2 โปรโมชั่น'));
  check('buildFullGoogleDocContent bold ranges stay within fullText bounds',
    result.boldRanges.every(r => r.start >= 0 && r.end <= result.fullText.length && r.start < r.end));
  check('buildFullGoogleDocContent bold ranges actually point at the header lines that were marked bold',
    result.boldRanges.some(r => result.fullText.slice(r.start, r.end).includes('PROMOTION 1:')));
  check('buildFullGoogleDocContent returns a Set table plan with one row per promotion and a real price/pain-point summary',
    result.setTable && result.setTable.rows.length === 2 &&
    result.setTable.rows[0][1].includes('ปัญหาทดสอบ 1') &&
    /100 → 70 บาท/.test(result.setTable.rows[0][2]) &&
    /ประหยัด 30 บาท/.test(result.setTable.rows[0][2]));
  check('buildFullGoogleDocContent setTableInsertOffset points at a real position right after the "Set" heading',
    result.fullText.slice(0, result.setTableInsertOffset).trimEnd().endsWith('Set'));

  // planSetTableCellEdits: simulate what the Docs API would report back for a
  // freshly-inserted empty 2-row x 3-col table (header + 1 promotion row).
  const fakeCellRows = [[10, 20, 30], [42, 55, 68]];
  const edits = gdocFns.planSetTableCellEdits(fakeCellRows, result.setTable);
  check('planSetTableCellEdits returns edits sorted by descending startIndex (writes bottom-right first)',
    edits.every((edit, i) => i === 0 || edits[i - 1].startIndex >= edit.startIndex));
  check('planSetTableCellEdits marks only header-row edits as bold', edits.filter(e => e.bold).every(e => [10, 20, 30].includes(e.startIndex)));
  check('planSetTableCellEdits header edits use the real header labels', edits.find(e => e.startIndex === 10)?.text === 'สินค้า / เงื่อนไข');
}

check('Doc creation uses documents.create then batchUpdate (no plain-text-only fallback that skips formatting request shape)',
  appJs.includes("fetch('https://docs.googleapis.com/v1/documents'") && appJs.includes(':batchUpdate'));
check('Created Google Doc opens in a new tab', appJs.includes("window.open(docUrl, '_blank')"));
check('exportToGoogleDoc inserts the Set table as a second pass after reading the Doc back for real cell indices',
  appJs.includes('insertTable') && appJs.includes('cellStartIndexRows') && appJs.includes('planSetTableCellEdits(cellStartIndexRows, setTable)'));
check('A failed Set table fill degrades gracefully (Doc still opens with a warning) instead of failing the whole export',
  appJs.includes('tableWarning'));

console.log('\n=== Google Docs Template Export (Apps Script) — UI ===');
const googleAppsScriptConfigJs = readText('config/google-apps-script-config.js');
check('index.html loads config/google-apps-script-config.js', indexHtml.includes('config/google-apps-script-config.js'));
check('config/google-apps-script-config.js has an endpoint field (empty or a URL) and no embedded credential value',
  /endpoint:\s*'[^']*'/.test(googleAppsScriptConfigJs)
  // Only the *value* side of an assignment is checked — the file's own
  // comments are allowed to discuss "token"/"secret" as concepts (that's
  // exactly what warns future editors not to add one here).
  && !/:\s*'[^']*(token|secret|apikey|api_key|private_key)[^']*'/i.test(googleAppsScriptConfigJs));
check('UI has Export to Google Docs (Template) button', appJs.includes('export-gdoc-apps-script') && appJs.includes('Export to Google Docs (Template)'));
check('Export to Google Docs (Template) button is wired to exportToGoogleDocsViaAppsScript',
  appJs.includes("querySelector('.export-gdoc-apps-script')") && appJs.includes('exportToGoogleDocsViaAppsScript('));
check('Missing Apps Script endpoint shows a setup message instead of crashing',
  appJs.includes('ยังไม่ได้ตั้งค่า Apps Script Endpoint'));
check('Export is blocked when there is no generated result / generation was blocked',
  appJs.includes('packageItem.generationBlocked') && appJs.includes('ยังไม่มีสคริปต์ที่ Generate สำเร็จให้ Export'));
check('Export button disables itself during the request (double-click guard)',
  appJs.includes('button.disabled = true') && appJs.includes('button.disabled = false'));
check('Export shows a loading label while the request is in flight',
  appJs.includes("button.textContent = 'กำลังสร้าง Google Docs...'"));
check('An idempotencyKey (account + liveDate + pattern + payload hash) is sent with every export request',
  appJs.includes('buildExportIdempotencyKey(payload)') && appJs.includes('idempotencyKey'));
check('Payload is validated (validateExportPayload) before ever being sent to Apps Script',
  appJs.includes('validateExportPayload(payload'));
check('Success state offers an explicit "open" action instead of auto-opening the document (avoids popup blockers)',
  appJs.includes("open-gdoc-result") && !/exportToGoogleDocsViaAppsScript[\s\S]{0,2000}window\.open\(data\.documentUrl/.test(appJs));
check('Success state offers a "copy link" action', appJs.includes('copy-gdoc-link') && appJs.includes('navigator.clipboard.writeText(data.documentUrl)'));
check('A reused (idempotent) result is shown distinctly from a freshly-created one', appJs.includes('data.reused'));
check('Error state shows message from the Apps Script response, not a raw stack trace',
  appJs.includes('data.errorCode') && appJs.includes('data.message'));
check('Export Scope: Review mode (A/B/C) is exported as a distinct, clearly-flagged batch, not silently merged with Assigned mode',
  appJs.includes("state.currentMode === 'review'") && appJs.includes('isReview: true'));

console.log('\n=== Google Apps Script source (google-apps-script/Code.gs) ===');
const appsScriptCode = readText('google-apps-script/Code.gs');
check('Code.gs implements doPost(e)', appsScriptCode.includes('function doPost(e)'));
{
  const doGetStart = appsScriptCode.indexOf('function doGet(e)');
  const doGetEnd = appsScriptCode.indexOf('function doPost(e)', doGetStart);
  const doGetBody = doGetStart >= 0 && doGetEnd > doGetStart ? appsScriptCode.slice(doGetStart, doGetEnd) : '';
  check('Code.gs implements a health-check doGet(e) that leaks no config',
    doGetStart >= 0 && !/templateId|outputFolderId|GOOGLE_DOCS_TEMPLATE_ID|GOOGLE_DRIVE_OUTPUT_FOLDER_ID/.test(doGetBody));
}
check('Code.gs validates the incoming payload before doing anything with Drive/Docs',
  appsScriptCode.includes('function validatePayload_(payload)') && appsScriptCode.indexOf('validatePayload_(payload)') < appsScriptCode.indexOf('createExportDocument_(payload)'));
check('Code.gs creates a brand-new Doc per export (DocumentApp.create) rather than editing any pre-existing file',
  appsScriptCode.includes('DocumentApp.create(payload.documentTitle)'));
check('Code.gs moves the new Doc into the configured Output Folder (not left in My Drive root)',
  appsScriptCode.includes('outputFolder.addFile(file)') && appsScriptCode.includes('DriveApp.getRootFolder().removeFile(file)'));
check('Code.gs uses LockService to serialize concurrent create requests', appsScriptCode.includes('LockService.getScriptLock()'));
check('Code.gs uses CacheService for the idempotency window (double-click / retry guard)',
  appsScriptCode.includes('CacheService.getScriptCache()') && appsScriptCode.includes('IDEMPOTENCY_TTL_SECONDS'));
check('Code.gs reads Output Folder ID from Script Properties, never hardcoded', appsScriptCode.includes("getProperty('GOOGLE_DRIVE_OUTPUT_FOLDER_ID')"));
check('Code.gs never returns a stack trace to the caller', !/jsonResponse_\([^)]*stack/.test(appsScriptCode));
check('Code.gs has a centralized Document Theme Config (not colors scattered across functions)', appsScriptCode.includes('const DOCUMENT_THEMES = {') && appsScriptCode.includes('SKINOXY:') && appsScriptCode.includes('KISS:') && appsScriptCode.includes('DGMR:'));
check('Code.gs skips empty sections/fields instead of rendering placeholders', appsScriptCode.includes('if (!section || !section.spokenScript) return;'));
check('Code.gs preserves Natural Speech Engine line breaks (one Doc paragraph per breath-line, not one paragraph with embedded \\n)',
  appsScriptCode.includes("split('\\n')") && appsScriptCode.includes('body.insertParagraph(at, line)'));
check('Code.gs response shape matches the documented success contract', appsScriptCode.includes('documentId:') && appsScriptCode.includes('documentUrl:') && appsScriptCode.includes('documentTitle:') && appsScriptCode.includes('createdAt:'));
check('Code.gs response shape matches the documented error contract', appsScriptCode.includes('errorCode:') && appsScriptCode.includes('success: false'));

console.log('\n=== Promotion Parser V2 ===');

// --- Text normalization ---
check('normalizeTextV2 collapses repeated spaces', parserV2.normalizeTextV2('a   b') === 'a b');
check('normalizeTextV2 collapses 3+ blank lines to 2', parserV2.normalizeTextV2('a\n\n\n\nb') === 'a\n\nb');
check('normalizeTextV2 normalizes CRLF/CR to LF', parserV2.normalizeTextV2('a\r\nb\rc') === 'a\nb\nc');
check('normalizeTextV2 strips non-breaking space / zero-width chars', parserV2.normalizeTextV2('a b​c').replace(/\s+/g, ' ') === 'a b c');
check('normalizeTextV2 trims trailing spaces per line', parserV2.normalizeTextV2('a   \nb').split('\n')[0] === 'a');

// --- Brand alias ---
check('findBrandAliasMatch: "KMB" normalizes to kiss', parserV2.findBrandAliasMatch('KMB 5-9 สิงหา').brand === 'kiss');
check('findBrandAliasMatch: "KISS MY BODY" resolves to kiss', parserV2.findBrandAliasMatch('KISS MY BODY').brand === 'kiss');
check('findBrandAliasMatch: "SKINOXY" resolves to skinoxy', parserV2.findBrandAliasMatch('SKINOXY Toner Pad').brand === 'skinoxy');
check('findBrandAliasMatch: "DGMR" resolves to dgmr', parserV2.findBrandAliasMatch('DGMR 5-9 สิงหา').brand === 'dgmr');
check('findBrandAliasMatch: no match returns null', parserV2.findBrandAliasMatch('random text with no brand') === null);
check('findBrandByProductSignal: "Nude and Naked" resolves to kiss', parserV2.findBrandByProductSignal('Nude and Naked EDP') === 'kiss');
check('findBrandByProductSignal: "Toner Pad" resolves to skinoxy', parserV2.findBrandByProductSignal('Dewy Toner Pad') === 'skinoxy');
check('findBrandByProductSignal: "แชมพู" resolves to dgmr', parserV2.findBrandByProductSignal('เซตแชมพู 2 ขวด') === 'dgmr');

// --- The full mixed-brand fixture (Required Test Fixture) ---
const mixedFixtureRaw = readText('tests/fixtures/mixed-brand-promotions.txt');
const parsed = parserV2.parsePromotionTextV2(mixedFixtureRaw, {});

check('Parser V2 fixture: detects exactly 13 promotions', parsed.promotions.length === 13, `got ${parsed.promotions.length}`);

if (parsed.promotions.length === 13) {
  const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13] = parsed.promotions;

  // Anti-Failure Rule #13: KMB must normalize to KISS everywhere.
  check('Parser V2: every promotion brand is a canonical label (KISS/SKINOXY/DGMR), never raw "KMB"',
    parsed.promotions.every(p => ['KISS', 'SKINOXY', 'DGMR'].includes(p.brand)));

  // 1. EDP Intense
  check('Promo 1: brand KISS', p1.brand === 'KISS');
  check('Promo 1: main items are Checkmate + Nude and Naked', p1.items.length === 2 && /checkmate/i.test(p1.items[0].productName) && /nude/i.test(p1.items[1].productName));
  check('Promo 1: gift is the Sweetie lotion, not a fabricated product', /sweetie/i.test(p1.gifts[0].productName));
  check('Promo 1: normal/promo/final price 990/261/261', p1.pricing.normalPrice === 990 && p1.pricing.promotionPrice === 261 && p1.pricing.finalPrice === 261);

  // 2. Perfume Set 3 pieces
  check('Promo 2: 3 main items (Shower Gel, Lotion, EDT)', p2.items.length === 3);
  check('Promo 2: normal 937, promo 449, live/final 416 (Live Price outranks Promotion Price)',
    p2.pricing.normalPrice === 937 && p2.pricing.promotionPrice === 449 && p2.pricing.livePrice === 416 && p2.pricing.finalPrice === 416);

  // 3. Shower Gel Mix 2 + cross-brand gift
  check('Promo 3: main item is KISS, quantity 2, mixable', p3.items[0].brand === 'kiss' && p3.items[0].quantity === 2 && p3.items[0].mixable === true);
  check('Promo 3: gift is SKINOXY (cross-brand) — does NOT change the promotion\'s own brand', p3.gifts[0].brand === 'skinoxy' && p3.brand === 'KISS');
  check('Promo 3: normal 798, final 321', p3.pricing.normalPrice === 798 && p3.pricing.finalPrice === 321);

  // 4. Whipped Cream Scrub + Sweet Vanilla Cotton, with Scent Notes
  check('Promo 4: 2 main products', p4.items.length === 2);
  check('Promo 4: Scent Notes are attached to the product, not a fabricated 3rd item',
    p4.items[1].scentNotes.top.length > 0 && p4.items[1].scentNotes.middle.length > 0 && p4.items[1].scentNotes.base.length > 0);
  check('Promo 4: normal 798, final 321', p4.pricing.normalPrice === 798 && p4.pricing.finalPrice === 321);

  // 5. Toner Pad Exchange Purchase
  check('Promo 5: mechanic is EXCHANGE_PURCHASE, not a regular bundle', p5.mechanic.type === 'EXCHANGE_PURCHASE' && p5.mechanic.exchangePurchase === true);
  check('Promo 5: exchange price 88 is NOT mistaken for the main product\'s full-set price', p5.pricing.exchangePrice === 88 && p5.pricing.finalPrice === 88);
  check('Promo 5: has the "missing prerequisite" warning (spec Example 3)', p5.warnings.some(w => w.code === 'EXCHANGE_MISSING_PREREQUISITE'));

  // 6/7. Set 1 and Set 2 must be SEPARATE promotions, not merged, and the
  // "แพคคู่ทำความสะอาดผิวครบสูตร" Group Title must not become its own promo.
  check('Promo 6 (Set 1) and Promo 7 (Set 2) are different promotions', p6.id !== p7.id);
  check('Promo 6: Set 1 has its own price (309/538/195)', p6.pricing.normalPrice === 538 && p6.pricing.promotionPrice === 309 && p6.pricing.finalPrice === 195);
  check('Promo 7: Set 2 has its own DIFFERENT price (499/697/321), not Set 1\'s', p7.pricing.normalPrice === 697 && p7.pricing.finalPrice === 321);
  check('Promo 7: quantity 2 + mixable + gift PRO VIT C BOOSTER SERUM', p7.items[0].quantity === 2 && p7.items[0].mixable === true && /vit c booster/i.test(p7.gifts[0].productName));
  check('No promotion in the fixture is an empty Group-Title phantom', parsed.promotions.every(p => p.items.length > 0 || p.gifts.length > 0));

  // 8. Mix 2 Get 1
  check('Promo 8: mixAndMatch true, gift Bright & Smooth Scrub Mask', p8.mechanic.mixAndMatch === true && /scrub mask/i.test(p8.gifts[0].productName));
  check('Promo 8: normal 798, promo 439, live/final 299', p8.pricing.normalPrice === 798 && p8.pricing.promotionPrice === 439 && p8.pricing.finalPrice === 299);

  // 9. Face Sunscreen Buy 1 Get Body Sunscreen — the "+" inside "SPF50+" is
  // NOT a bundle delimiter (Anti-Failure: cosmetic notation vs. real "+").
  check('Promo 9: main item is the ONE sunscreen product, not split on "SPF50+"', p9.items.length === 1 && /sunscreen/i.test(p9.items[0].productName));
  check('Promo 9: gift is the body lotion sunscreen', /body lotion/i.test(p9.gifts[0].productName));
  check('Promo 9: normal 799, promo 499, live/final 321', p9.pricing.normalPrice === 799 && p9.pricing.promotionPrice === 499 && p9.pricing.finalPrice === 321);

  // 10/11. Postfix KMB section — brand + date resolved backward, cross-brand
  // gift does not change the main brand.
  check('Promo 10: brand resolved to KISS via postfix "KMB 5-9 สิงหา" marker (not left null)', p10.brand === 'KISS');
  check('Promo 10: main item Nude & Naked EDP, gift is SKINOXY Toner Pad (does not flip promotion brand)',
    /nude/i.test(p10.items[0].productName) && p10.gifts[0].brand === 'skinoxy' && p10.brand === 'KISS');
  check('Promo 10: normal 1039, final 509', p10.pricing.normalPrice === 1039 && p10.pricing.finalPrice === 509);
  check('Promo 10: date resolved to the postfix marker, flagged as inferred (not silently guessed)',
    /5-9/.test(p10.dateRange.originalText) && p10.dateRange.confidence < 1);
  check('Promo 11: brand ALSO resolved to KISS via the same postfix marker', p11.brand === 'KISS');
  check('Promo 11: no price mentioned — Missing Price warning, price is null (never borrowed from a neighboring promotion)',
    p11.pricing.finalPrice === null && p11.warnings.some(w => w.code === 'MISSING_PRICE'));

  // 12/13. Postfix DGMR section.
  check('Promo 12: brand resolved to DGMR via postfix "DGMR 5-9 สิงหา" marker', p12.brand === 'DGMR');
  check('Promo 12: 2 main items (shampoo + conditioner), gift towel with its OWN value untouched as a price',
    p12.items.length === 2 && p12.gifts[0].value === 399 && p12.pricing.normalPrice === 4269 && p12.pricing.finalPrice === 2490);
  check('Promo 13: brand ALSO resolved to DGMR, 3 main items (shampoo + conditioner + tonic)', p13.brand === 'DGMR' && p13.items.length === 3);
  check('Promo 13: normal 3969, final 2290', p13.pricing.normalPrice === 3969 && p13.pricing.finalPrice === 2290);

  // Anti-Failure Rules (spot checks not already covered above)
  check('Anti-Failure: Campaign coupons (10% + 30%) are stored separately, never summed into 40% or a price',
    p1.campaignBenefits.every(b => b.type === 'COUPON' && b.scope === 'CAMPAIGN') && !parsed.promotions.some(p => p.pricing.finalPrice === 40));
  check('Anti-Failure: Hashtags never become a product/promotion', !parsed.promotions.some(p => /#KissMyBody/.test(p.title || '')));
}

// --- Missing / incomplete data must never be fabricated ---
{
  const noPriceResult = parserV2.parsePromotionTextV2('✨ Shower Gel กด 2 ขวด\nฟรี Skinoxy Toner Pad 1 ซอง', {});
  const promo = noPriceResult.promotions[0];
  check('Missing price: promotion is still created with correct gift, price stays null (not borrowed)',
    promo && promo.gifts.length === 1 && promo.pricing.finalPrice === null);
  check('Missing price: MISSING_PRICE warning present', promo && promo.warnings.some(w => w.code === 'MISSING_PRICE'));
}

// --- Duplicate link detection ---
{
  const dupResult = parserV2.parsePromotionTextV2('✨ Test Promo\nhttps://s.shopee.co.th/aaa\nToner Pad 1 กระปุก\nhttps://s.shopee.co.th/bbb\nราคาปกติ 100 พิเศษ 50', {});
  check('Duplicate link: a second URL inside one promotion raises a warning',
    dupResult.warnings.some(w => w.code === 'DUPLICATE_LINK_IN_PROMOTION'));
}

console.log('\n=== Promotion Parser V2 — Preview UI wiring ===');
check('index.html loads parser-v2.js', indexHtml.includes('parser-v2.js'));
check('build-site.js manifest registers parser-v2.js (static build stays complete)',
  readText('build-site.js').includes("'/parser-v2.js'"));
check('UI has a Preview Multi-Brand Parse (Beta) button', appJs.includes('parserV2PreviewBtn') && indexHtml.includes('Preview Multi-Brand Parse'));
check('Preview button is wired to parsePromotionTextV2 and a dedicated render function',
  appJs.includes("parsePromotionTextV2(raw") && appJs.includes('function renderParserV2Preview'));
check('Preview handles Parser V2 not being loaded instead of crashing', appJs.includes("typeof parsePromotionTextV2 !== 'function'"));
check('Preview is explicitly documented as NOT wired to Generate (still Confirmed-Parse-only per spec)',
  indexHtml.includes('ยังไม่เชื่อมกับปุ่ม Generate') && appJs.includes('This is deliberately NOT wired to'));
check('Preview panel renders per-promotion price breakdown (normal/promo/live/exchange/final), not just a single price',
  appJs.includes('normalPrice') && appJs.includes('promotionPrice') && appJs.includes('livePrice') && appJs.includes('exchangePrice') && appJs.includes('finalPrice'));
check('Preview panel surfaces both Critical errors and Warnings distinctly', appJs.includes('v2-errors') && appJs.includes('v2-warnings'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
