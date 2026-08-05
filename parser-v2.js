// parser-v2.js — Promotion Parser V2
// ---------------------------------------------------------------------------
// Pipeline: Raw Text -> Normalizer -> Line Classifier -> Promotion Segmenter
//   -> Context Resolver -> Field Extractor -> Promotion Validator
//   -> Structured Promotion Data
//
// This module is intentionally standalone (no dependency on core.js) so it
// can be unit-tested and iterated on in isolation. It is NOT yet wired into
// the live Generate flow / app.js UI — see 05_PARSER_V2 final report in the
// chat for what's covered vs. deferred. Script Generation must only ever
// read from the Structured Promotion Data this module returns, never from
// raw text again.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Brand Lexicon — centralized so Brand Alias / Product Signal detection has
// one source of truth (mirrors data/*-products.json brand_key values used
// elsewhere in the repo: 'skinoxy', 'kiss', 'dgmr').
// ---------------------------------------------------------------------------
const BRAND_LEXICON = {
  kiss: {
    key: 'kiss',
    label: 'KISS',
    aliases: ['KISS MY BODY', 'KISSMYBODY', 'KISS', 'KMB', 'คิสมายบอดี้'],
    productSignals: [
      'perfume shower gel', 'perfume lotion', 'eau de toilette', 'edt', 'edp intense', 'edp',
      'nude and naked', 'nude & naked', 'checkmate', 'sweet vanilla cotton', 'sweet poison',
      'vanilla mousse whipped cream scrub', 'whipped cream scrub', 'sweetie'
    ]
  },
  skinoxy: {
    key: 'skinoxy',
    label: 'SKINOXY',
    aliases: ['SKINOXY', 'สกินอ๊อกซี่'],
    productSignals: [
      'toner pad', 'body wash', 'body serum', 'body cream', 'pro acne clear cleanser',
      'pro vit c booster serum', 'pro moisture uv sunscreen', 'pro uv sunscreen body lotion',
      'bright & smooth scrub mask', 'bright and smooth scrub mask', 'brightening body wash',
      'pro resorcinol body serum', 'dewy & hydrating', 'dewy and hydrating', 'bright & glow',
      'bright and glow'
    ]
  },
  dgmr: {
    key: 'dgmr',
    label: 'DGMR',
    aliases: ['DGMR', 'DAENG GI MEO RI'],
    productSignals: ['jingi', 'jinsoo', 'dlaesoo', 'shampoo', 'conditioner', 'tonic', 'โทนิค', 'แชมพู', 'ครีมนวด']
  }
};

const BRAND_ORDER = ['kiss', 'skinoxy', 'dgmr']; // longer/more-specific aliases first within matching

function normalizeForBrandMatch_(text){
  return String(text || '').toUpperCase();
}

// Alias -> canonical brand key. Longest alias first so "KISS MY BODY" beats
// bare "KISS" when both would match the same text.
function findBrandAliasMatch(text){
  const upper = normalizeForBrandMatch_(text);
  let best = null;
  BRAND_ORDER.forEach(key => {
    BRAND_LEXICON[key].aliases.forEach(alias => {
      const idx = upper.indexOf(alias.toUpperCase());
      if (idx === -1) return;
      if (!best || alias.length > best.alias.length) {
        best = { brand: key, alias, index: idx };
      }
    });
  });
  return best;
}

function findBrandByProductSignal(text){
  const lower = String(text || '').toLowerCase();
  for (const key of BRAND_ORDER) {
    if (BRAND_LEXICON[key].productSignals.some(sig => lower.includes(sig))) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Text Normalizer
// ---------------------------------------------------------------------------
const THAI_MONTHS = [
  ['มกราคม', 1], ['ม\\.?ค\\.?', 1],
  ['กุมภาพันธ์', 2], ['ก\\.?พ\\.?', 2],
  ['มีนาคม', 3], ['มี\\.?ค\\.?', 3],
  ['เมษายน', 4], ['เม\\.?ย\\.?', 4],
  ['พฤษภาคม', 5], ['พ\\.?ค\\.?', 5],
  ['มิถุนายน', 6], ['มิ\\.?ย\\.?', 6],
  ['กรกฎาคม', 7], ['ก\\.?ค\\.?', 7],
  ['สิงหาคม', 8], ['สิงหา', 8], ['ส\\.?ค\\.?', 8],
  ['กันยายน', 9], ['ก\\.?ย\\.?', 9],
  ['ตุลาคม', 10], ['ต\\.?ค\\.?', 10],
  ['พฤศจิกายน', 11], ['พ\\.?ย\\.?', 11],
  ['ธันวาคม', 12], ['ธ\\.?ค\\.?', 12]
];

function normalizeTextV2(raw){
  let text = String(raw || '');
  // Unicode invisibles / non-breaking space / zero-width chars.
  text = text.replace(/[ ​‌‍﻿]/g, ' ');
  // Normalize all line-break styles to \n.
  text = text.replace(/\r\n?/g, '\n');
  // Collapse repeated spaces/tabs (not newlines).
  text = text.replace(/[ \t]+/g, ' ');
  // Collapse 3+ blank lines to exactly 2 (paragraph boundary), keep single
  // blank lines meaningful for boundary detection.
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim trailing spaces per line.
  text = text.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n');
  return text.trim();
}

// ---------------------------------------------------------------------------
// 2. Line Classifier (Pass 1)
// ---------------------------------------------------------------------------
const LINE_TYPES = [
  'CAMPAIGN_TITLE', 'CAMPAIGN_DESCRIPTION', 'BRAND_MARKER', 'PLATFORM_MARKER', 'DATE_RANGE',
  'GLOBAL_COUPON', 'GLOBAL_SHIPPING', 'PROMOTION_TITLE', 'GROUP_TITLE', 'SET_TITLE',
  'PRODUCT_LINE', 'PRODUCT_DESCRIPTION', 'PROMOTION_LINK', 'PRICE_LINE', 'LIVE_PRICE_LINE',
  'NORMAL_PRICE_LINE', 'GIFT_LINE', 'BUY_CONDITION', 'MIX_AND_MATCH_CONDITION',
  'EXCHANGE_PURCHASE', 'SCENT_NOTE_HEADER', 'SCENT_NOTE', 'INGREDIENT_LINE', 'CLAIM_LINE',
  'DISCLAIMER', 'HASHTAG', 'FOOTER_NOTE', 'EMPTY_LINE', 'UNKNOWN'
];

const CAMPAIGN_CODE_RE = /\b\d{1,2}\.\d{1,2}\b/; // "8.8", "9.9", "11.11" mega-sale codes
const URL_RE = /https?:\/\/\S+/i;
const SET_TITLE_RE = /^\s*เซต\s*\d+\s*[:：]/;
const HASHTAG_RE = /^\s*#\S+/;
const DISCLAIMER_RE = /^\s*\*\S/;

function classifyLine_(rawLine, lineNumber){
  const text = rawLine;
  const trimmed = text.trim();
  const line = { text, normalizedText: trimmed, lineNumber, type: 'UNKNOWN', confidence: 0.5, matchedRules: [] };

  const set = (type, confidence, rule) => { line.type = type; line.confidence = confidence; line.matchedRules.push(rule); };

  if (trimmed === '') { set('EMPTY_LINE', 1, 'empty'); return line; }
  if (HASHTAG_RE.test(trimmed) && !URL_RE.test(trimmed)) { set('HASHTAG', 0.95, 'hashtag'); return line; }
  if (DISCLAIMER_RE.test(trimmed)) { set('DISCLAIMER', 0.9, 'disclaimer-asterisk'); return line; }
  if (URL_RE.test(trimmed) && trimmed.replace(URL_RE, '').trim().length < 4) { set('PROMOTION_LINK', 0.95, 'bare-url'); return line; }

  // Postfix Brand/Date marker: short line, JUST a brand alias + a date range,
  // no other product/price content. Must come before generic BRAND detection.
  const aliasHit = findBrandAliasMatch(trimmed);
  const hasDateDigits = /\d{1,2}\s*[-–]\s*\d{1,2}/.test(trimmed);
  if (aliasHit && hasDateDigits && trimmed.length <= 40 && !/บาท|ราคา|฿|:|เพียง/.test(trimmed)) {
    set('BRAND_MARKER', 0.9, 'postfix-brand-date');
    return line;
  }

  if (SET_TITLE_RE.test(trimmed)) { set('SET_TITLE', 0.95, 'set-title'); return line; }

  if (/^Top Notes\s*:/i.test(trimmed) || /^Middle Notes\s*:/i.test(trimmed) || /^Base Notes\s*:/i.test(trimmed)) {
    set('SCENT_NOTE', 0.95, 'scent-note-line'); return line;
  }

  // Campaign Title vs. Promotion Title: both use a leading ✨ in this house
  // style — a title/boundary marker always wins over any mechanic/gift/price
  // keyword the same line's copy happens to also contain (e.g. "✨ ซื้อ...
  // รับฟรี..." is a promotion title, not a BUY_CONDITION line). A Campaign
  // Title is additionally a mega-sale code (two EQUAL digits, "8.8"/"9.9"/
  // "11.11" style — NOT e.g. "pH 5.5", which never carries a leading ✨).
  const isEmojiTitle = /^✨/.test(trimmed);
  if (isEmojiTitle && CAMPAIGN_CODE_RE.test(trimmed) && aliasHit) {
    set('CAMPAIGN_TITLE', 0.85, 'campaign-code');
    return line;
  }
  if (isEmojiTitle) { set('PROMOTION_TITLE', 0.7, 'emoji-title'); return line; }

  // Bullet Promotion boundary: a "- " line is a NEW promotion by itself
  // (spec: "Bullet Promotion เช่น `- Nude & Naked...`"), even when the same
  // line also carries product/gift/price/mechanic content — that content is
  // extracted later from the whole promotion block's combined text, not
  // from this line's sub-type.
  if (/^-\s+\S/.test(trimmed) && (findBrandByProductSignal(trimmed) || /[\d,]+(?:\.\d+)?\s*(?:\.-|บาท)/.test(trimmed))) {
    set('PROMOTION_TITLE', 0.8, 'bullet-promotion');
    return line;
  }

  if (/เฉพาะวันที่|ตั้งแต่วันที่/.test(trimmed) || /\d{1,2}\s*[-–]\s*\d{1,2}\s*(ส\.?ค\.?|สิงหา\S*|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)/.test(trimmed)) {
    set('DATE_RANGE', 0.85, 'date-range');
    return line;
  }

  if (/แลกซื้อ/.test(trimmed)) { set('EXCHANGE_PURCHASE', 0.9, 'exchange-keyword'); return line; }

  if (/คละได้|เลือกคละ|คละ\s*\d/.test(trimmed)) { set('MIX_AND_MATCH_CONDITION', 0.85, 'mixable-keyword'); return line; }
  if (/\d\s*แถม\s*\d|ซื้อ\s*\d.*รับฟรี|ซื้อ.*รับ.*ฟรี/.test(trimmed)) { set('BUY_CONDITION', 0.85, 'buy-x-get-y'); return line; }

  // Price lines — classify by keyword BEFORE generic gift/product detection,
  // since a price line can mention a product name in passing.
  const hasLivePriceWord = /พิเศษในไลฟ์|ในไลฟ์เหลือ|live price|ราคาไลฟ์/i.test(trimmed);
  const hasNormalPriceWord = /ราคาปกติ|จากปกติ|มูลค่าปกติ|\bfull price\b/i.test(trimmed);
  const hasPromoPriceWord = /ราคาพิเศษ|ราคาแพคคู่|เพียง|พิเศษ\s*\d|คู่ละ|ช้อป\s*\d.*เพียง/i.test(trimmed);
  const hasMoneyNumber = /[\d,]+(?:\.\d+)?\s*(?:\.-|บาท|฿)/.test(trimmed) || /(?:ปกติ|พิเศษ|เพียง|คู่ละ)\s*[\d,]+/.test(trimmed);
  if (hasLivePriceWord && hasMoneyNumber) { set('LIVE_PRICE_LINE', 0.9, 'live-price-keyword'); return line; }
  if ((hasNormalPriceWord || hasPromoPriceWord) && hasMoneyNumber) {
    // A line can carry BOTH normal and promo price ("ราคาพิเศษ...จากปกติ...") —
    // keep it as the general PRICE_LINE so the extractor pulls every number,
    // rather than forcing a single label onto a mixed line.
    if (hasNormalPriceWord && !hasPromoPriceWord) { set('NORMAL_PRICE_LINE', 0.85, 'normal-price-only'); return line; }
    set('PRICE_LINE', 0.85, 'price-line-mixed');
    return line;
  }

  if (/ลดเพิ่ม.*%|ลดสูงสุด.*%|คูปอง|กรอกโค้ด/.test(trimmed) && !/บาท/.test(trimmed)) {
    set('GLOBAL_COUPON', 0.8, 'coupon-keyword'); return line;
  }
  if (/ส่งฟรี|จัดส่งฟรี/.test(trimmed)) { set('GLOBAL_SHIPPING', 0.8, 'shipping-keyword'); return line; }

  // Gift keyword — requires the line to actually NAME an item (a quantity
  // unit, a colon introducing one, or a known product signal), not just
  // loosely contain "ของแถม"/"รับ...ฟรี" as marketing prose (e.g. "พร้อมรับ
  // ของแถมสุดพิเศษ..." with no product/qty is NOT a real gift line).
  const namesAnItem = /\d+\s*(ชิ้น|ซอง|ขวด|กระปุก|แผ่น|ใบ)/.test(trimmed) || /:/.test(trimmed) || findBrandByProductSignal(trimmed);
  // Note: \b is ASCII-centric and does not fire around Thai characters (they
  // aren't \w), so "^ฟรี\b" would silently never match "ฟรี SKINOXY..." —
  // use an explicit whitespace/end lookahead instead.
  if (/แถมฟรี|รับฟรี|พร้อมรับ|^ฟรี(?=\s|$)|:\s*ฟรี(?=\s|$)|ของแถม/i.test(trimmed) && namesAnItem) {
    set('GIFT_LINE', 0.85, 'gift-keyword'); return line;
  }

  if (/^(?:🎟️|🏷️|🚚|🎥)/.test(trimmed)) {
    // Emoji-tagged benefit/coupon/shipping lines without a money figure.
    if (/ส่งฟรี/.test(trimmed)) { set('GLOBAL_SHIPPING', 0.8, 'emoji-shipping'); return line; }
    set('GLOBAL_COUPON', 0.6, 'emoji-benefit');
    return line;
  }

  if (/^(?:🧼|🧴|🌸|🍨)/.test(trimmed) || findBrandByProductSignal(trimmed)) {
    set('PRODUCT_LINE', 0.7, 'product-signal');
    return line;
  }

  // A short prose sentence with no keyword hit right after a title/URL is
  // most likely campaign or promotion descriptive copy.
  if (trimmed.length > 20 && !hasMoneyNumber) { set('CAMPAIGN_DESCRIPTION', 0.4, 'prose-fallback'); return line; }

  return line; // UNKNOWN
}

function classifyLines(normalizedText){
  return normalizedText.split('\n').map((text, i) => classifyLine_(text, i));
}

// ---------------------------------------------------------------------------
// 3+4. Promotion Segmenter + Context Resolver
// ---------------------------------------------------------------------------
// Walks the classified lines once, building Campaign -> Promotion boundaries,
// and resolving brand/date context — including RETROACTIVE (postfix) brand
// and date markers that apply backward to prior promotions still missing
// that field, stopping at the nearest explicit marker/campaign boundary.
function segmentAndResolve(lines, options = {}){
  const warnings = [];
  const campaigns = [];
  let currentCampaign = null;
  let currentPromotion = null;
  let currentGroupTitle = null;
  let pendingSetIndex = 0;
  // Lines captured after a CAMPAIGN_TITLE but before the first real
  // promotion/set/group boundary belong to the campaign, not a promotion.
  let inCampaignPreamble = false;

  function startCampaign(titleLine){
    // A still-open promotion from the PREVIOUS campaign must be finished
    // (saved onto that campaign) before switching currentCampaign — otherwise
    // simply nulling currentPromotion here silently drops it.
    finishPromotion();
    currentCampaign = {
      id: `campaign-${campaigns.length + 1}`,
      title: titleLine.normalizedText,
      brand: (findBrandAliasMatch(titleLine.normalizedText) || {}).brand || null,
      dateRange: null,
      coupons: [],
      shipping: [],
      disclaimers: [],
      hashtags: [],
      promotions: []
    };
    campaigns.push(currentCampaign);
    currentGroupTitle = null;
    inCampaignPreamble = true;
  }

  function finishPromotion(){
    if (currentPromotion) currentCampaign.promotions.push(currentPromotion);
    currentPromotion = null;
  }

  function startPromotion(seedLine, opts = {}){
    finishPromotion();
    inCampaignPreamble = false;
    currentPromotion = {
      lines: [],
      brand: opts.brand || null,
      brandSource: opts.brand ? 'explicit' : null,
      dateRange: opts.dateRange || null,
      promotionGroupTitle: opts.groupTitle || currentGroupTitle || null,
      title: seedLine ? seedLine.normalizedText : null,
      startLine: seedLine ? seedLine.lineNumber : null,
      endLine: seedLine ? seedLine.lineNumber : null,
      // Bullet-style promotions ("- Nude & Naked...") sit outside the normal
      // Campaign Title -> coupons -> ✨ promotions structure — they're a loose
      // trailing list, so a Campaign Brand Heading must NOT be assumed to
      // apply to them; only an explicit/postfix Brand Marker should. A
      // regular ✨/Set promotion, by contrast, genuinely belongs to the
      // Campaign it's under, so postfix resolution must stop there.
      isBulletPromotion: Boolean(seedLine && seedLine.matchedRules && seedLine.matchedRules.includes('bullet-promotion'))
    };
    if (seedLine) currentPromotion.lines.push(seedLine);
  }

  function pushLine(line){
    if (!currentPromotion) startPromotion(null);
    currentPromotion.lines.push(line);
    currentPromotion.endLine = line.lineNumber;
  }

  // Retroactive resolution: walk backward through campaign.promotions (and
  // the in-progress currentPromotion) filling in a missing brand/date, but
  // STOP at: an explicit marker of its own, or a regular (non-bullet)
  // promotion — one that structurally belongs to this Campaign's own Brand
  // Heading rather than to the trailing postfix-marker group.
  function applyRetroactive(field, value){
    const targets = currentPromotion ? [currentPromotion, ...currentCampaign.promotions.slice().reverse()] : currentCampaign.promotions.slice().reverse();
    for (const promo of targets) {
      if (field === 'brand') {
        if (promo.brandSource === 'explicit') break; // explicit marker boundary
        if (!promo.isBulletPromotion) break; // reached a real Campaign-heading promotion
        if (promo.brand) continue; // already resolved by an earlier postfix marker
        promo.brand = value;
        promo.brandSource = 'postfix';
      } else if (field === 'dateRange') {
        if (promo.dateRangeSource === 'explicit') break;
        if (!promo.isBulletPromotion) break;
        if (promo.dateRange) continue;
        promo.dateRange = value;
        promo.dateRangeSource = 'postfix';
      }
    }
  }

  // Next non-EMPTY_LINE line's type, used to tell a real Promotion Title
  // apart from a Group Title (one that's immediately followed by a Set
  // Title and so isn't a promotion on its own).
  function nextMeaningfulType(fromIndex){
    for (let j = fromIndex + 1; j < lines.length; j++) {
      if (lines[j].type !== 'EMPTY_LINE') return lines[j].type;
    }
    return null;
  }

  lines.forEach((line, lineIndex) => {
    switch (line.type) {
      case 'EMPTY_LINE':
        if (currentPromotion) currentPromotion.lines.push(line);
        return;

      case 'CAMPAIGN_TITLE':
        startCampaign(line);
        return;

      case 'BRAND_MARKER': {
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        const alias = findBrandAliasMatch(line.normalizedText);
        const dateMatch = line.normalizedText.match(/\d{1,2}\s*[-–]\s*\d{1,2}\s*\S*/);
        if (alias) applyRetroactive('brand', alias.brand);
        if (dateMatch) applyRetroactive('dateRange', { originalText: dateMatch[0] });
        // A bare postfix marker also closes off the current promotion — it
        // doesn't belong inside the next one's content.
        finishPromotion();
        return;
      }

      case 'DATE_RANGE': {
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        if (currentPromotion) {
          currentPromotion.dateRange = { originalText: line.normalizedText };
          currentPromotion.dateRangeSource = 'explicit';
        } else if (currentCampaign) {
          currentCampaign.dateRange = { originalText: line.normalizedText };
        }
        return;
      }

      case 'GLOBAL_COUPON':
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        currentCampaign.coupons.push(line.normalizedText);
        return;
      case 'GLOBAL_SHIPPING':
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        currentCampaign.shipping.push(line.normalizedText);
        return;
      case 'DISCLAIMER':
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        currentCampaign.disclaimers.push(line.normalizedText);
        return;
      case 'HASHTAG':
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        currentCampaign.hashtags.push(line.normalizedText);
        return;

      case 'GROUP_TITLE':
        currentGroupTitle = line.normalizedText;
        finishPromotion();
        return;

      case 'SET_TITLE':
        pendingSetIndex += 1;
        startPromotion(line, { groupTitle: currentGroupTitle });
        return;

      case 'PROMOTION_TITLE':
        if (!currentCampaign) startCampaign({ normalizedText: '', lineNumber: line.lineNumber });
        // A ✨/bullet line with no Set Title right after it is a real
        // promotion boundary — but if the very next non-empty content IS a
        // SET_TITLE, this line is actually a Group Title for the sets that
        // follow, not a promotion of its own (nested-set case).
        if (nextMeaningfulType(lineIndex) === 'SET_TITLE') {
          currentGroupTitle = line.normalizedText;
          finishPromotion();
          return;
        }
        currentGroupTitle = null;
        startPromotion(line);
        return;

      case 'PROMOTION_LINK':
        if (inCampaignPreamble && currentCampaign && !currentCampaign.url) {
          // The very first URL right after a Campaign Title (before any real
          // promotion boundary) is the campaign's own landing link, not a
          // specific promotion's link — don't attach it to a promotion.
          currentCampaign.url = line.normalizedText;
          return;
        }
        if (!currentPromotion) startPromotion(null);
        if (currentPromotion.url) {
          warnings.push({ code: 'DUPLICATE_LINK_IN_PROMOTION', message: `พบ Link มากกว่า 1 รายการในโปรโมชั่นเดียวกัน (บรรทัด ${line.lineNumber})` });
        }
        currentPromotion.url = line.normalizedText;
        pushLine(line);
        return;

      default:
        // Content encountered before any real promotion/set boundary
        // (Campaign Description, benefit-header prose, etc. right after a
        // Campaign Title) belongs to the campaign's own preamble, not a
        // phantom promotion — never auto-start a promotion for it.
        if (inCampaignPreamble && !currentPromotion) return;
        pushLine(line);
    }
  });
  finishPromotion();

  // A GROUP_TITLE that never got any SET_TITLE children (i.e. a lone
  // "group-title-shaped" line with no actual sets under it) should not
  // become an empty phantom promotion — already guaranteed since we only
  // ever create a promotion at SET_TITLE/PROMOTION_TITLE, never at
  // GROUP_TITLE itself.

  return { campaigns, warnings };
}

// ---------------------------------------------------------------------------
// 5. Field Extractor
// ---------------------------------------------------------------------------
function parseMoney_(str){
  if (!str) return null;
  const cleaned = String(str).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractAllPrices_(text){
  const found = [];
  const patterns = [
    ['normal', /(?:ราคาปกติ|จากปกติ|มูลค่าปกติ|ปกติ|full price)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi],
    ['live', /(?:พิเศษในไลฟ์|ราคาพิเศษในไลฟ์|ในไลฟ์เหลือ(?:เพียง)?|ราคาไลฟ์|live price)\s*[:\-]?\s*(?:เหลือ)?(?:เพียง)?\s*([\d,]+(?:\.\d+)?)/gi],
    // Non-greedy [\s\S] (not [^\d]) so an interior digit — e.g. "2 ซอง" inside
    // "รับสิทธิ์แลกซื้อโทนเนอร์แพดแบบซอง 2 ซอง ในราคาพิเศษ 88 บาท" — doesn't
    // break the match before it ever reaches the actual exchange price.
    ['exchange', /(?:แลกซื้อ|รับสิทธิ์แลกซื้อ|เพิ่มเพียง|ซื้อเพิ่มในราคา)[\s\S]{0,60}?([\d,]+(?:\.\d+)?)\s*(?:บาท|\.-)/gi],
    ['promo', /(?:ราคาพิเศษ|ราคาแพคคู่|คู่ละ|ช้อป\s*\d+\s*ชิ้นเพียง)\s*[:\-]?\s*(?:เพียง)?\s*([\d,]+(?:\.\d+)?)/gi],
    ['promo', /(?:^|\s)เพียง\s*([\d,]+(?:\.\d+)?)/gi],
    // Bare "พิเศษ 509" (no "ราคา"/"เพียง" companion word) — used in the
    // compact postfix-style promotions ("... พิเศษ 509 จากปกติ 1,039").
    ['promo', /(?:^|\s)พิเศษ\s+([\d,]+(?:\.\d+)?)(?!\s*%)/gi]
  ];
  patterns.forEach(([kind, re]) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      found.push({ kind, value: parseMoney_(m[1]), index: m.index });
    }
  });
  return found;
}

// Strips price/date keywords and everything after them — used so a gift or
// bundle-item mention embedded in the same composite line as the promotion's
// price doesn't drag price digits into the product name/quantity parse.
function truncateBeforePriceOrDate_(text){
  const idx = text.search(/ราคาปกติ|จากปกติ|มูลค่าปกติ|ราคาพิเศษ|ราคาแพคคู่|พิเศษ(?:ในไลฟ์)?\s*[\d:]|เพียง\s*\d|คู่ละ|เฉพาะวันที่/);
  return idx === -1 ? text : text.slice(0, idx).trim();
}

function parseProductMention_(rawText, fallbackBrand){
  let text = truncateBeforePriceOrDate_(rawText)
    // Product-icon emoji and the "- " bullet marker are astral codepoints —
    // the 'u' flag is required or a character class silently matches only
    // half of a surrogate pair, leaving a mangled leftover character behind.
    .replace(/^[-🧼🧴🌸🍨🎁]\s*/u, '')
    .replace(SET_TITLE_RE, '') // "เซต 1: " is a Set marker, not part of the product name
    .replace(/^(?:แถมฟรี|รับฟรี|ฟรี|พร้อมรับ)[!ๆ]?[:\s]*/i, '')
    .replace(/^กด\s+/i, '') // "กด 2 ขวด" — filler verb, not part of the name
    .trim();
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(ml|มล\.?|g|กรัม)/i);
  // Prefer the LAST quantity/unit match — composite text like
  // "10 แผ่น 1 ซอง" states a sheet-level sub-count before the real
  // container quantity; the container (mentioned last) is what "quantity"
  // means for the promotion/pricing/mixable checks.
  const qtyMatches = [...text.matchAll(/(\d+)\s*(ขวด|ชิ้น|ซอง|กระปุก|แผ่น|ใบ)/g)];
  const qtyMatch = qtyMatches[qtyMatches.length - 1];
  const mixable = /คละได้|คละ\b/.test(rawText);
  const descSplit = text.split(/[:：]/);
  const brandHit = findBrandAliasMatch(text);
  const namePart = descSplit[0]
    .replace(/\(.*?\)/g, '')
    .replace(/\d+\s*(ขวด|ชิ้น|ซอง|กระปุก|แผ่น|ใบ)(?:ต่อออเดอร์)?/g, '')
    .replace(/คละได้|เลือกคละ/g, '') // mixable marker — tracked separately, not part of the name
    .replace(/\+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const description = descSplit.length > 1 ? descSplit.slice(1).join(':').trim() : null;
  return {
    brand: brandHit ? brandHit.brand : (findBrandByProductSignal(text) || fallbackBrand || null),
    productName: namePart,
    variant: null,
    size: sizeMatch ? { value: Number(sizeMatch[1]), unit: sizeMatch[2].toLowerCase().startsWith('m') ? 'ml' : 'g' } : null,
    quantity: qtyMatch ? Number(qtyMatch[1]) : 1,
    unit: qtyMatch ? qtyMatch[2] : null,
    mixable,
    selectableVariants: [],
    descriptions: description ? [description] : [],
    ingredients: [],
    claims: [],
    scentNotes: { top: [], middle: [], base: [] },
    sourceText: rawText.trim()
  };
}

// Splits a composite "main item + bundle/gift item" line at its FIRST
// bundling delimiter ("+", or an explicit gift keyword). Whichever comes
// first in the text wins, since that's the actual word order the source
// text used to join the two mentions.
function splitMainAndBundle_(text){
  // Only a "+" with whitespace on at least one side counts as an item-joining
  // delimiter ("A + B") — a "+" glued directly onto digits/letters like
  // "SPF50+ PA++++" is cosmetic spec notation, not a bundle separator.
  const plusMatch = text.match(/(?<=\s)\+(?=\s)/);
  const plusIdx = plusMatch ? plusMatch.index : -1;
  const giftMatch = text.match(/แถมฟรี|รับฟรี|(?<!ไม่มี)ฟรี(?=\s|$)|พร้อมรับ(?!สิทธิ์)/);
  const giftIdx = giftMatch ? giftMatch.index : -1;
  if (plusIdx === -1 && giftIdx === -1) return { mainText: text, bundleText: null, bundleIsExplicitGift: false };
  const useGift = giftIdx !== -1 && (plusIdx === -1 || giftIdx < plusIdx);
  const splitIdx = useGift ? giftIdx : plusIdx;
  return {
    mainText: text.slice(0, splitIdx).trim(),
    bundleText: text.slice(splitIdx + (useGift ? 0 : 1)).trim(),
    bundleIsExplicitGift: useGift
  };
}

function extractGift_(lines){
  const giftLines = lines.filter(l => l.type === 'GIFT_LINE');
  if (!giftLines.length) return null;
  // Prefer a line with a strong, unambiguous gift marker (🎁, "แถมฟรี",
  // "รับฟรี") over one that only matched on the weaker "พร้อมรับ"/"ของแถม"
  // pattern — the latter can also occur in ordinary marketing prose that
  // merely mentions a gift exists without naming it (e.g. "...พร้อมรับของแถม
  // สุดพิเศษ...") ahead of the real, specific gift line.
  const giftLine = giftLines.find(l => /🎁|แถมฟรี|รับฟรี/.test(l.normalizedText)) || giftLines[0];
  const parsed = parseProductMention_(giftLine.normalizedText, null);
  const valueMatch = giftLine.normalizedText.match(/มูลค่า\s*([\d,]+)/);
  return {
    brand: parsed.brand,
    productName: parsed.productName.replace(/มูลค่า\s*[\d,]+(?:\s*บาท)?/i, '').trim(),
    quantity: parsed.quantity,
    unit: parsed.unit,
    value: valueMatch ? parseMoney_(valueMatch[1]) : null,
    conditions: [],
    sourceText: giftLine.normalizedText
  };
}

// Main items + any bundle/cross-brand gift found inline with them. Two
// sources, tried in order:
//   1. Clean multi-line style: dedicated PRODUCT_LINE-typed lines (one
//      product per line, e.g. the 🧼/🧴/🌸-tagged lines).
//   2. Composite style: a single bullet/title line carries "Main + Bundle"
//      in one sentence (postfix KISS/DGMR sections in the fixture). Only
//      used when style 1 found nothing, so it never double-counts.
const NON_ITEM_LINE_TYPES = ['EMPTY_LINE', 'PROMOTION_LINK', 'DISCLAIMER', 'HASHTAG', 'SCENT_NOTE', 'DATE_RANGE', 'BRAND_MARKER', 'GLOBAL_COUPON', 'GLOBAL_SHIPPING'];

function dedupeItems_(items){
  const seen = new Map();
  const order = [];
  items.forEach(item => {
    const key = `${item.brand || ''}|${item.productName.toLowerCase().trim()}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.mixable = existing.mixable || item.mixable;
      existing.size = existing.size || item.size;
      if (item.descriptions.length) existing.descriptions.push(...item.descriptions);
      return;
    }
    seen.set(key, item);
    order.push(key);
  });
  return order.map(key => seen.get(key));
}

// Same product can legitimately be NAMED on more than one line (a Set Title
// AND its own detail/mixable line both mention it) — a real product line is
// any content line (not just ones sub-classified PRODUCT_LINE) that matches
// the brand lexicon and isn't itself a gift mention. Each candidate line is
// also checked for an inline "+"/gift bundle (the postfix composite style).
function extractItemsAndBundle_(lines, promotionBrand){
  const candidates = lines.filter(l =>
    !NON_ITEM_LINE_TYPES.includes(l.type)
    && l.type !== 'GIFT_LINE' // handled separately by extractGift_, which also picks the strongest gift marker when there are several
    // A plain ✨ headline (as opposed to a "- " bullet promotion, where the
    // title line IS the only place the product is named) is copy, not an
    // item mention, even when its wording happens to include a product name.
    && !(l.matchedRules && l.matchedRules.includes('emoji-title'))
    && l.type !== 'EXCHANGE_PURCHASE' // descriptive exchange-purchase prose, not the item itself
    && l.type !== 'CAMPAIGN_DESCRIPTION' // marketing prose that merely mentions a product/mood in passing
    && findBrandByProductSignal(l.normalizedText)
  );

  const items = [];
  let inlineGift = null;

  candidates.forEach(line => {
    const text = line.normalizedText;
    const { mainText, bundleText, bundleIsExplicitGift } = splitMainAndBundle_(text);
    if (!mainText) {
      // The gift/bundle keyword is at the very start of the line (e.g. "ฟรี
      // SKINOXY PRO VIT C BOOSTER SERUM 10ml") — the whole line names only
      // the gift, there's no main-item text on it.
      if (!inlineGift) {
        const parsed = parseProductMention_(bundleText || text, null);
        inlineGift = { brand: parsed.brand, productName: parsed.productName, quantity: parsed.quantity, unit: parsed.unit, value: null, conditions: [], sourceText: text };
      }
      return;
    }
    const mainItem = parseProductMention_(mainText, promotionBrand);
    items.push(mainItem);
    if (bundleText) {
      const bundleParsed = parseProductMention_(bundleText, promotionBrand);
      const crossBrand = bundleParsed.brand && mainItem.brand && bundleParsed.brand !== mainItem.brand;
      if (bundleIsExplicitGift || crossBrand) {
        if (!inlineGift) {
          inlineGift = { brand: bundleParsed.brand, productName: bundleParsed.productName, quantity: bundleParsed.quantity, unit: bundleParsed.unit, value: null, conditions: [], sourceText: bundleText };
        }
      } else {
        // Same brand, no gift keyword — one or more further core components
        // of the same bundle (e.g. DGMR "เซตแชมพู 1 ขวด + ครีมนวด 1 ขวด +
        // โทนิค" — all three DGMR). Split every remaining "+"-joined part
        // into its own item instead of leaving them concatenated in one.
        bundleText.split(/\s\+\s/).map(part => parseProductMention_(part, promotionBrand)).forEach(part => items.push(part));
      }
    }
  });

  return { items: dedupeItems_(items), inlineGift };
}

function attachScentNotes_(lines, items){
  if (!items.length) return;
  const target = items[items.length - 1]; // nearest-preceding product
  lines.forEach(line => {
    if (line.type !== 'SCENT_NOTE') return;
    const [label, rest] = line.normalizedText.split(/[:：]/);
    const notes = (rest || '').split(',').map(s => s.trim()).filter(Boolean);
    if (/top/i.test(label)) target.scentNotes.top.push(...notes);
    else if (/middle/i.test(label)) target.scentNotes.middle.push(...notes);
    else if (/base/i.test(label)) target.scentNotes.base.push(...notes);
  });
}

function extractMechanic_(lines){
  const hasExchange = lines.some(l => l.type === 'EXCHANGE_PURCHASE');
  const mixLine = lines.find(l => l.type === 'MIX_AND_MATCH_CONDITION');
  const buyLine = lines.find(l => l.type === 'BUY_CONDITION');
  const buyGetMatch = buyLine && buyLine.normalizedText.match(/(\d+)\s*แถม\s*(\d+)/);
  return {
    type: hasExchange ? 'EXCHANGE_PURCHASE' : (buyGetMatch ? 'BUY_X_GET_Y' : (mixLine ? 'MIX_AND_MATCH' : 'BUNDLE')),
    buyQuantity: buyGetMatch ? Number(buyGetMatch[1]) : null,
    getQuantity: buyGetMatch ? Number(buyGetMatch[2]) : null,
    exchangePurchase: hasExchange,
    mixAndMatch: Boolean(mixLine) || lines.some(l => l.type === 'PRODUCT_LINE' && /คละได้|คละ\b/.test(l.normalizedText)),
    prerequisiteText: null
  };
}

function extractPricing_(lines, mechanic){
  // Prices can appear on a dedicated PRICE_LINE, or embedded in a composite
  // bullet/title line alongside the product+gift text (postfix sections) —
  // scan every content line, not just ones sub-classified as price lines.
  const priceLines = lines.filter(l => !['EMPTY_LINE', 'PROMOTION_LINK', 'DISCLAIMER', 'HASHTAG', 'SCENT_NOTE', 'BRAND_MARKER'].includes(l.type));
  const combinedText = priceLines.map(l => l.normalizedText).join(' \n ');
  const prices = extractAllPrices_(combinedText);

  const normal = prices.find(p => p.kind === 'normal');
  const live = prices.find(p => p.kind === 'live');
  const promo = prices.find(p => p.kind === 'promo');
  const exchange = prices.find(p => p.kind === 'exchange');

  const pricing = {
    normalPrice: normal ? normal.value : null,
    promotionPrice: promo ? promo.value : null,
    livePrice: live ? live.value : null,
    finalPrice: null,
    exchangePrice: mechanic.exchangePurchase ? (exchange ? exchange.value : null) : null,
    savingAmount: null,
    currency: 'THB',
    priceSourceText: priceLines.map(l => l.normalizedText)
  };

  if (mechanic.exchangePurchase) {
    // Exchange price is its own thing — never treated as the main product's
    // sale price, and normalPrice here (if any) describes the EXCHANGE
    // item's own regular value, not the main product's.
    pricing.finalPrice = pricing.exchangePrice;
  } else {
    pricing.finalPrice = pricing.livePrice != null ? pricing.livePrice
      : (pricing.promotionPrice != null ? pricing.promotionPrice : null);
  }

  if (pricing.normalPrice != null && pricing.finalPrice != null) {
    pricing.savingAmount = Number((pricing.normalPrice - pricing.finalPrice).toFixed(2));
  }

  return pricing;
}

function buildPromotionObject_(rawPromo, campaign, index, options){
  const lines = rawPromo.lines || [];
  const warnings = [];
  const errors = [];

  // Brand Resolution Priority: (1) explicit/postfix marker already resolved
  // onto rawPromo.brand during segmentation, (2) the main product's own
  // brand, (3) the Campaign Brand Heading, (4) a lexicon scan of the whole
  // block, (5) caller-supplied default account.
  const provisionalBrand = rawPromo.brand || campaign.brand || null;
  const mechanic = extractMechanic_(lines);
  const { items, inlineGift } = extractItemsAndBundle_(lines, provisionalBrand);
  attachScentNotes_(lines, items);
  const explicitGift = extractGift_(lines);
  const gift = explicitGift || inlineGift;
  const pricing = extractPricing_(lines, mechanic);

  const brand = rawPromo.brand
    || (items[0] && items[0].brand)
    || campaign.brand
    || findBrandByProductSignal(lines.map(l => l.normalizedText).join(' '))
    || options.defaultBrand
    || null;
  if (!brand) errors.push({ code: 'UNKNOWN_BRAND', message: 'ไม่ทราบ Brand ของโปรโมชั่นนี้' });

  if (!items.length) errors.push({ code: 'NO_MAIN_PRODUCT', message: 'ไม่พบสินค้าหลักของโปรโมชั่นนี้' });
  if (pricing.finalPrice == null && !mechanic.exchangePurchase) warnings.push({ code: 'MISSING_PRICE', message: 'ไม่พบราคาของโปรโมชั่นนี้' });
  if (mechanic.exchangePurchase && pricing.exchangePrice != null) {
    const mentionsMainPrice = lines.some(l => /หลัก/.test(l.normalizedText));
    if (!mentionsMainPrice) {
      warnings.push({ code: 'EXCHANGE_MISSING_PREREQUISITE', message: 'ยังไม่พบราคาของสินค้าหลักหรือเงื่อนไขยอดซื้อที่ทำให้มีสิทธิ์แลกซื้อ' });
    }
  }
  if (!rawPromo.url) warnings.push({ code: 'MISSING_LINK', message: 'ไม่พบ Link ของโปรโมชั่นนี้' });
  if (rawPromo.dateRange && rawPromo.dateRangeSource !== 'explicit') {
    warnings.push({ code: 'DATE_INFERRED', message: 'วันที่ของโปรโมชั่นนี้อ้างอิงจาก Marker ย้อนหลัง ไม่ใช่ระบุตรงในโปรโมชั่น' });
  }

  return {
    id: `promo-${String(index + 1).padStart(3, '0')}`,
    source: {
      rawText: lines.map(l => l.text).join('\n'),
      startLine: rawPromo.startLine,
      endLine: rawPromo.endLine
    },
    campaignId: campaign.id,
    campaignTitle: campaign.title || null,
    brand: brand ? BRAND_LEXICON[brand].label : null,
    platform: options.platform || null,
    dateRange: rawPromo.dateRange ? {
      startDate: null,
      endDate: null,
      originalText: rawPromo.dateRange.originalText,
      inferredYear: true,
      confidence: rawPromo.dateRangeSource === 'explicit' ? 1 : 0.6
    } : (campaign.dateRange ? { startDate: null, endDate: null, originalText: campaign.dateRange.originalText, inferredYear: true, confidence: 0.6 } : null),
    promotionGroupTitle: rawPromo.promotionGroupTitle || null,
    title: rawPromo.title,
    url: rawPromo.url || null,
    mechanic,
    items,
    gifts: gift ? [gift] : [],
    pricing,
    campaignBenefits: campaign.coupons.map(text => ({ type: 'COUPON', scope: 'CAMPAIGN', inheritedFrom: campaign.id, conditionsKnown: false, sourceText: text })),
    conditions: [],
    disclaimers: campaign.disclaimers.slice(),
    warnings,
    errors,
    confidence: errors.length ? 0.3 : (warnings.length ? 0.7 : 0.9)
  };
}

// ---------------------------------------------------------------------------
// 6. Promotion Validator
// ---------------------------------------------------------------------------
function validatePromotionV2(promotion){
  const critical = (promotion.errors || []).slice();
  const warnings = (promotion.warnings || []).slice();

  if (promotion.items.length > 1) {
    const brands = new Set(promotion.items.map(i => i.brand).filter(Boolean));
    if (brands.size > 1) {
      warnings.push({ code: 'MULTI_BRAND_ITEMS', message: 'พบสินค้าหลักหลายแบรนด์ในโปรโมชั่นเดียว ควรตรวจสอบ' });
    }
  }
  return {
    blocked: critical.length > 0,
    critical,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------
function parsePromotionTextV2(rawText, options = {}){
  const normalized = normalizeTextV2(rawText);
  const lines = classifyLines(normalized);
  const { campaigns, warnings: segmentWarnings } = segmentAndResolve(lines, options);

  const promotions = [];
  campaigns.forEach(campaign => {
    campaign.promotions.forEach(rawPromo => {
      const promo = buildPromotionObject_(rawPromo, campaign, promotions.length, options);
      const validation = validatePromotionV2(promo);
      promo.validation = validation;
      promotions.push(promo);
    });
  });

  return {
    normalizedText: normalized,
    lines,
    campaigns,
    promotions,
    warnings: segmentWarnings
  };
}

// ---------------------------------------------------------------------------
// Exports (Node/tests). In-browser this file can be loaded the same way as
// core.js (plain <script>, functions become globals) once/if it's wired into
// index.html — not done in this phase, see chat report.
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRAND_LEXICON, LINE_TYPES,
    normalizeTextV2, classifyLines, classifyLine_, segmentAndResolve,
    findBrandAliasMatch, findBrandByProductSignal,
    parsePromotionTextV2, validatePromotionV2,
    extractAllPrices_, extractGift_, extractItemsAndBundle_, extractMechanic_, extractPricing_
  };
}
