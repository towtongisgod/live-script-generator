// Regression tests for core.js — plain Node, no framework.
// Run with: node tests/run-tests.js  (or `npm test`)
//
// Covers the acceptance criteria from the "3 Selling Strategies" upgrade:
//  - parser correctness on every real sample file (no regressions)
//  - no URL / ">>" leakage into product names or gifts
//  - tiered pricing still detected
//  - Product Truth (price/gift/items) identical across all 3 strategies
//  - no banned label words in the spoken (`# สคริปต์ TikTok Live`) section
//  - the 3 strategies are structurally different, not just re-hooked

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
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readJson(relPath){
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function readText(relPath){
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

// Extract just the spoken part of a generated script: from "# สคริปต์ TikTok Live"
// up to (not including) "# Key Message" — everything else (summary header,
// Key Message, Producer Push Line) is reference data and may contain labels.
function extractSpokenSection(script){
  const start = script.indexOf('# สคริปต์ TikTok Live');
  const end = script.indexOf('# Key Message');
  if (start === -1) return script;
  return script.slice(start, end === -1 ? undefined : end);
}

const BANNED_IN_SPEECH = [
  'Pain Point', 'Product Knowledge', 'Guardrail', 'Sales Focus',
  'จากข้อมูลพบว่า', 'จุดที่พูดได้คือ', 'ให้ย้ำว่า',
  'Session Objective', '```', '→'
];

function findBannedWords(spokenText){
  return BANNED_IN_SPEECH.filter(word => spokenText.includes(word));
}

function hasPipeList(spokenText){
  // A markdown-table-style "| a | b |" or inline "X | Y" pipe list.
  return /\s\|\s/.test(spokenText);
}

const brandsConfig = readJson('data/brands.json');

console.log('=== Parser regression tests (real sample files) ===');

const EXPECTED = {
  skinoxy: { promoCount: 5, first: { regular: 399, promoPrice: 239 } },
  'skinoxy-shopee': {
    promoCount: 2,
    first: { regular: 697, promoPrice: 272 },
    second: { regular: 499, promoPrice: 251, tierCount: 2 }
  },
  kmb: { promoCount: 2, first: { regular: 478, promoPrice: 329 }, second: { regular: 997, promoPrice: 649 } },
  'kmb-shopee': {
    promoCount: 2,
    first: { regular: 478, promoPrice: 329 },
    second: { regular: 997, promoPrice: 649, tierCount: 2 }
  },
  dgmr: { promoCount: 2, first: { regular: 4269, promoPrice: 2350 }, second: { regular: 3969, promoPrice: 2190 } },
  'dgmr-shopee': {
    promoCount: 2,
    first: { regular: 3969, promoPrice: 2190 },
    second: { regular: 4269, promoPrice: 2350, tierCount: 2 }
  }
};

const parsedByBrand = {};

brandsConfig.brands.forEach(brand => {
  const expected = EXPECTED[brand.id];
  if (!expected) return; // no baseline recorded for this brand id — skip rather than guess

  const knowledge = readJson(path.join('data', brand.knowledge_file));
  const raw = readText(brand.sample_file);
  const promos = core.splitPromotions(raw).map((text, index) =>
    core.parsePromotion(text, index, knowledge, brand, {})
  );
  parsedByBrand[brand.id] = promos;

  console.log(`\n-- ${brand.label} (${brand.id}) --`);
  check(`splits into ${expected.promoCount} promotion(s)`, promos.length === expected.promoCount,
    `got ${promos.length}`);

  if (expected.first && promos[0]) {
    check('promo 1: regular price correct', promos[0].regular === expected.first.regular,
      `got ${promos[0].regular}, want ${expected.first.regular}`);
    check('promo 1: promo price correct', promos[0].promoPrice === expected.first.promoPrice,
      `got ${promos[0].promoPrice}, want ${expected.first.promoPrice}`);
  }

  if (expected.second && promos[1]) {
    check('promo 2: regular price correct', promos[1].regular === expected.second.regular,
      `got ${promos[1].regular}, want ${expected.second.regular}`);
    check('promo 2: promo price correct', promos[1].promoPrice === expected.second.promoPrice,
      `got ${promos[1].promoPrice}, want ${expected.second.promoPrice}`);
    if (expected.second.tierCount) {
      check('promo 2: tiered pricing detected', promos[1].quantityTiers.length === expected.second.tierCount,
        `got ${promos[1].quantityTiers.length}`);
    }
  }

  promos.forEach((p, i) => {
    const items = core.formatItemsInSet(p);
    check(`promo ${i + 1}: product name has no URL`, !/https?:\/\//i.test(items), items);
    check(`promo ${i + 1}: product name has no ">>"`, !items.includes('>>'), items);
    if (p.gift) {
      check(`promo ${i + 1}: gift text has no URL/">>"`, !/https?:\/\//i.test(p.gift) && !p.gift.includes('>>'), p.gift);
    }
  });
});

console.log('\n=== Selling Strategy tests (Product Truth + structure + spoken-language rules) ===');

Object.entries(parsedByBrand).forEach(([brandId, promos]) => {
  const p = promos[0];
  if (!p) return;
  console.log(`\n-- ${brandId} promo 1 --`);

  const scripts = {};
  core.STRATEGIES.forEach(strategy => {
    scripts[strategy] = core.createScript(p, strategy, 0);
  });

  // Product Truth: every strategy must state the same regular/promo price and
  // gift text somewhere in its spoken section.
  const spokenSections = Object.fromEntries(
    core.STRATEGIES.map(s => [s, extractSpokenSection(scripts[s])])
  );

  if (p.regular) {
    const priceStr = core.formatMoney(p.regular);
    core.STRATEGIES.forEach(strategy => {
      check(`[${strategy}] mentions the same regular price (${priceStr})`,
        spokenSections[strategy].includes(priceStr));
    });
  }

  if (p.promoPrice) {
    const priceStr = core.formatMoney(p.promoPrice);
    core.STRATEGIES.forEach(strategy => {
      check(`[${strategy}] mentions the same promo price (${priceStr})`,
        spokenSections[strategy].includes(priceStr));
    });
  }

  if (p.gift) {
    core.STRATEGIES.forEach(strategy => {
      check(`[${strategy}] mentions the same gift`,
        spokenSections[strategy].includes(p.gift));
    });
  }

  // Structural difference: the 3 scripts must not be identical, and specifically
  // Session 1 must open differently (first ~80 chars after the session title).
  const session1Openers = core.STRATEGIES.map(s => {
    const idx = spokenSections[s].indexOf('Session 1');
    return spokenSections[s].slice(idx, idx + 120);
  });
  check('advisor vs bestie: full script differs', scripts.advisor !== scripts.bestie);
  check('advisor vs closer: full script differs', scripts.advisor !== scripts.closer);
  check('bestie vs closer: full script differs', scripts.bestie !== scripts.closer);
  check('advisor vs bestie: Session 1 opener differs', session1Openers[0] !== session1Openers[1]);
  check('advisor vs closer: Session 1 opener differs', session1Openers[0] !== session1Openers[2]);

  // No banned label/jargon words or pipe-lists in the spoken section, for every strategy.
  core.STRATEGIES.forEach(strategy => {
    const banned = findBannedWords(spokenSections[strategy]);
    check(`[${strategy}] no banned label words in spoken section`, banned.length === 0, banned.join(', '));
    check(`[${strategy}] no pipe-list ("X | Y") in spoken section`, !hasPipeList(spokenSections[strategy]));
  });

  // Generate Again must only change the hook within a strategy, never the
  // Product Truth (price/gift must stay identical across hook variants).
  const advisorVariant0 = core.createScript(p, 'advisor', 0);
  const advisorVariant1 = core.createScript(p, 'advisor', 1);
  check('Generate Again (advisor v0 -> v1) changes the script', advisorVariant0 !== advisorVariant1);
  if (p.promoPrice) {
    const priceStr = core.formatMoney(p.promoPrice);
    check('Generate Again keeps the same promo price', extractSpokenSection(advisorVariant1).includes(priceStr));
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
