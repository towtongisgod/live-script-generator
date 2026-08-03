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

function sameFacts(a, b){
  return JSON.stringify({
    items: a.productTruth.items,
    regular: a.productTruth.regular,
    promoPrice: a.productTruth.promoPrice,
    finalPrice: a.productTruth.finalPrice,
    gift: a.productTruth.gift,
    itemCount: a.productTruth.itemCount,
    rights: a.productTruth.rights
  }) === JSON.stringify({
    items: b.productTruth.items,
    regular: b.productTruth.regular,
    promoPrice: b.productTruth.promoPrice,
    finalPrice: b.productTruth.finalPrice,
    gift: b.productTruth.gift,
    itemCount: b.productTruth.itemCount,
    rights: b.productTruth.rights
  });
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

console.log('\n=== Script generation, compliance, and structure ===');
const BANNED = ['ตะกร้าสีเหลือง', 'ครับ', 'ค่ะ', 'นะครับ', 'นะคะ', 'รักษา', 'หายขาด', 'Session 1', 'Session 2', 'Session 3'];
const primaryById = Object.fromEntries(primaryAccounts.map(account => [account.id, account]));
Object.keys(primaryById).forEach(accountId => {
  const p = firstPromo(accountId);
  const packages = core.STRATEGIES.map(pattern => pkg(p, pattern));
  check(`${accountId}: creates A/B/C packages`, packages.length === 3);
  packages.forEach(item => {
    const text = item.mainSpokenScript;
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: has script_id`, /^.+-\d{8}-\d{4}-[ABC]-\d{3}$/.test(item.metadata.script_id), item.metadata.script_id);
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: main script not metadata`, !text.includes('script_id') && !text.includes('Promotion Summary'));
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: no Session labels`, !/Session\s*[123]/i.test(item.fullText));
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: spoken Thai length reasonable`, text.length >= 900 && text.length <= 3200, `${text.length}`);
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: no banned terms`, BANNED.filter(word => text.includes(word)).length === 0, BANNED.filter(word => text.includes(word)).join(', '));
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: producer line exists`, item.producerPushLine.length > 20);
    check(`${accountId} Pattern ${item.metadata.assigned_pattern}: product truth exists`, item.productTruth.items && item.productTruth.rawText);
  });
  check(`${accountId}: A/B/C full scripts differ`, packages[0].mainSpokenScript !== packages[1].mainSpokenScript && packages[1].mainSpokenScript !== packages[2].mainSpokenScript);
  check(`${accountId}: Product Truth same A vs B`, sameFacts(packages[0], packages[1]));
  check(`${accountId}: Product Truth same B vs C`, sameFacts(packages[1], packages[2]));

  const aText = packages[0].mainSpokenScript;
  const bText = packages[1].mainSpokenScript;
  const cText = packages[2].mainSpokenScript;
  check(`${accountId}: Pattern A diagnoses before value`, indexOfAny(aText, ['ปัญหา', 'สังเกต']) < indexOfAny(aText, ['ราคา', 'โปรโมชัน', 'ความคุ้ม']));
  check(`${accountId}: Pattern B engages before promotion`, indexOfAny(bText, ['คอมเมนต์', 'โมเมนต์', 'สถานการณ์']) < indexOfAny(bText, ['ราคา', 'โปร']));
  check(`${accountId}: Pattern C value before objection`, indexOfAny(cText, ['คุ้ม', 'ราคา', 'ตัวเลข']) < indexOfAny(cText, ['ข้อกังวล']));
});

const skinoxyTikTok = pkg(firstPromo('skinoxy'), 'B', { assignment: manualAssignment('B'), startTime: '19:00' });
const skinoxyShopee = pkg(firstPromo('skinoxy-shopee'), 'B', { assignment: manualAssignment('B'), startTime: '19:00' });
check('TikTok and Shopee persona scripts differ', skinoxyTikTok.mainSpokenScript !== skinoxyShopee.mainSpokenScript);
check('TikTok CTA uses basket viewing language', skinoxyTikTok.mainSpokenScript.includes('กดดูในตะกร้า'));
check('Shopee CTA uses set basket language', skinoxyShopee.mainSpokenScript.includes('เข้าไปดูเซ็ตในตะกร้า'));

const generatedAgain0 = pkg(firstPromo('skinoxy'), 'A', { hookVariant: 0 }).mainSpokenScript;
const generatedAgain1 = pkg(firstPromo('skinoxy'), 'A', { hookVariant: 1 }).mainSpokenScript;
check('Generate Again changes script wording', generatedAgain0 !== generatedAgain1);
check('Generate Again keeps promo price', generatedAgain1.includes('239'));

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
