/**
 * Live Script Generator — Google Docs Export Web App
 * ---------------------------------------------------------------------
 * Integration layer between the static frontend (GitHub Pages) and
 * Google Docs/Drive. The frontend never holds an OAuth token or any
 * Drive-writing credential — it only POSTs a Structured Export Payload
 * (plain JSON, see core.js `buildExportPayload`) to this Web App, which
 * runs under a Google account that already owns/has access to the
 * Template Doc and Output Folder.
 *
 * See google-apps-script/README.md for deployment instructions,
 * Execute-As trade-offs, and how to configure Script Properties.
 * ---------------------------------------------------------------------
 */

// ---------------------------------------------------------------------
// Config — Template ID / Output Folder ID are PUBLIC configuration (just
// Drive file/folder IDs, not secrets) and are read from Script Properties
// so they can be changed without editing/redeploying code.
// Project Settings -> Script Properties -> add:
//   GOOGLE_DOCS_TEMPLATE_ID
//   GOOGLE_DRIVE_OUTPUT_FOLDER_ID
// ---------------------------------------------------------------------
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const templateId = props.getProperty('GOOGLE_DOCS_TEMPLATE_ID');
  const outputFolderId = props.getProperty('GOOGLE_DRIVE_OUTPUT_FOLDER_ID');
  if (!templateId) throw new ExportError_('CONFIG_MISSING_TEMPLATE_ID', 'GOOGLE_DOCS_TEMPLATE_ID is not set in Script Properties.');
  if (!outputFolderId) throw new ExportError_('CONFIG_MISSING_OUTPUT_FOLDER_ID', 'GOOGLE_DRIVE_OUTPUT_FOLDER_ID is not set in Script Properties.');
  return { templateId, outputFolderId };
}

// Idempotency window: a repeated request with the same key inside this
// window returns the SAME document instead of creating a duplicate.
const IDEMPOTENCY_TTL_SECONDS = 6 * 60 * 60; // 6 hours

// ---------------------------------------------------------------------
// Centralized Document Theme Config — one place for all brand colors, not
// scattered across functions. Values are Google Docs-safe hex strings.
// ---------------------------------------------------------------------
const DOCUMENT_THEMES = {
  SKINOXY: {
    accent: '#F6C9D0',       // soft pink — clean, gentle skincare-advisor mood
    scriptBlockBg: '#FDF3F5',
    headingColor: '#B23A55'
  },
  KISS: {
    accent: '#E8B4E0',       // playful, feminine fragrance mood
    scriptBlockBg: '#FBF0FA',
    headingColor: '#8E2F82'
  },
  DGMR: {
    accent: '#CDB79E',       // grounded, trustworthy hair/scalp-advisor mood
    scriptBlockBg: '#F6F1EA',
    headingColor: '#5B4636'
  },
  DEFAULT: {
    accent: '#D9D9D9',
    scriptBlockBg: '#F5F5F5',
    headingColor: '#333333'
  }
};

function getThemeForBrand_(brandLabel) {
  const label = String(brandLabel || '').toUpperCase();
  if (label.indexOf('SKINOXY') !== -1) return DOCUMENT_THEMES.SKINOXY;
  if (label.indexOf('KISS') !== -1) return DOCUMENT_THEMES.KISS;
  if (label.indexOf('DAENG') !== -1 || label.indexOf('DGMR') !== -1) return DOCUMENT_THEMES.DGMR;
  return DOCUMENT_THEMES.DEFAULT;
}

// ---------------------------------------------------------------------
// Error model — errorCode is a stable machine-readable string; message is
// a short human-readable Thai sentence. Stack traces never go to the caller.
// ---------------------------------------------------------------------
function ExportError_(errorCode, message) {
  this.errorCode = errorCode;
  this.message = message;
}
ExportError_.prototype = Object.create(Error.prototype);

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check — GET request, returns only a static status string, no
 * config values, no Drive/Doc IDs, so it's safe to expose even to
 * unauthenticated callers if the deployment's Access setting allows it.
 */
function doGet(e) {
  return jsonResponse_({ success: true, status: 'ok', service: 'live-script-generator-export' });
}

/**
 * Main entry point. Body must be:
 *   { idempotencyKey: string, payload: <Structured Export Payload> }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new ExportError_('EMPTY_REQUEST_BODY', 'ไม่พบข้อมูลใน Request');
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new ExportError_('INVALID_JSON', 'ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง');
    }

    const payload = body.payload;
    const idempotencyKey = body.idempotencyKey || '';
    validatePayload_(payload);

    // Log only shape/identity info — never full script text or promo pricing
    // details, to avoid writing PII/business-sensitive data into Apps
    // Script's execution logs.
    Logger.log('Export request: brand=%s platform=%s pattern=%s promotions=%s idemKeyLen=%s',
      payload.account && payload.account.brand,
      payload.account && payload.account.platform,
      payload.account && payload.account.pattern,
      (payload.promotions || []).length,
      idempotencyKey.length);

    const cached = getCachedResult_(idempotencyKey);
    if (cached) {
      Logger.log('Idempotent hit — returning existing document instead of creating a new one.');
      return jsonResponse_(Object.assign({ success: true, reused: true }, cached));
    }

    const lock = LockService.getScriptLock();
    const gotLock = lock.tryLock(20000);
    if (!gotLock) {
      throw new ExportError_('LOCK_TIMEOUT', 'ระบบกำลังสร้างเอกสารอื่นอยู่ ลองใหม่อีกครั้งในอีกสักครู่');
    }

    try {
      // Re-check the cache under the lock in case a parallel request just
      // finished (avoids a race where two nearly-simultaneous clicks both
      // pass the first cache check before either has written the result).
      const cachedUnderLock = getCachedResult_(idempotencyKey);
      if (cachedUnderLock) {
        return jsonResponse_(Object.assign({ success: true, reused: true }, cachedUnderLock));
      }

      const result = createExportDocument_(payload);
      setCachedResult_(idempotencyKey, result);
      return jsonResponse_(Object.assign({ success: true, reused: false }, result));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    const errorCode = err && err.errorCode ? err.errorCode : 'INTERNAL_ERROR';
    const message = err && err.message ? err.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ';
    // Full error (with stack) goes to Apps Script's own execution log only —
    // never back to the caller.
    Logger.log('Export failed: %s — %s', errorCode, err && err.stack ? err.stack : message);
    return jsonResponse_({ success: false, errorCode: errorCode, message: message });
  }
}

function getCachedResult_(idempotencyKey) {
  if (!idempotencyKey) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('export:' + idempotencyKey);
  return raw ? JSON.parse(raw) : null;
}

function setCachedResult_(idempotencyKey, result) {
  if (!idempotencyKey) return;
  const cache = CacheService.getScriptCache();
  cache.put('export:' + idempotencyKey, JSON.stringify(result), IDEMPOTENCY_TTL_SECONDS);
}

// ---------------------------------------------------------------------
// Payload validation (mirrors core.js validateExportPayload — kept as a
// separate, minimal implementation here since Apps Script cannot require()
// the Node module directly. If you change the schema in core.js, mirror
// the required-field list here too.)
// ---------------------------------------------------------------------
function validatePayload_(payload) {
  if (!payload) throw new ExportError_('INVALID_EXPORT_PAYLOAD', 'ไม่พบข้อมูล Payload');
  if (payload.schemaVersion !== '1.0') throw new ExportError_('INVALID_SCHEMA_VERSION', 'เวอร์ชันของข้อมูลไม่ตรงกับที่ระบบรองรับ');
  if (!payload.documentTitle || /undefined|null/i.test(payload.documentTitle)) {
    throw new ExportError_('INVALID_DOCUMENT_TITLE', 'ชื่อเอกสารไม่ถูกต้อง');
  }
  if (!payload.account || !payload.account.brand || !payload.account.platform || !payload.account.pattern) {
    throw new ExportError_('INVALID_EXPORT_PAYLOAD', 'ข้อมูล Brand, Platform หรือ Pattern ไม่ครบ');
  }
  if (!payload.promotions || !payload.promotions.length) {
    throw new ExportError_('NO_PROMOTIONS', 'ไม่มีโปรโมชั่นให้ Export');
  }
  payload.promotions.forEach(function (promo, index) {
    if (!promo.productSummary && (!promo.sections || !promo.sections.length)) {
      throw new ExportError_('INVALID_EXPORT_PAYLOAD', 'โปรโมชั่นที่ ' + (index + 1) + ' ไม่มีข้อมูลสินค้าหรือบทพูด');
    }
  });
}

// ---------------------------------------------------------------------
// Document creation — copies the Master Template (never edits it directly),
// moves the copy into the configured Output Folder, then populates it.
// ---------------------------------------------------------------------
function createExportDocument_(payload) {
  const config = getConfig_();
  const templateFile = DriveApp.getFileById(config.templateId);
  const outputFolder = DriveApp.getFolderById(config.outputFolderId);

  const newFile = templateFile.makeCopy(payload.documentTitle, outputFolder);
  const documentId = newFile.getId();

  try {
    const doc = DocumentApp.openById(documentId);
    populateDocument_(doc, payload);
    doc.saveAndClose();
  } catch (populateErr) {
    // If population fails partway, don't leave a half-written doc's name
    // lying about silently — the file still exists (visible in the output
    // folder) but we surface the failure so the user knows to check it.
    Logger.log('Document population failed for %s: %s', documentId, populateErr && populateErr.stack);
    throw new ExportError_('DOCUMENT_POPULATION_FAILED', 'สร้างเอกสารสำเร็จ แต่ใส่ข้อมูลไม่ครบ กรุณาตรวจสอบเอกสารในโฟลเดอร์ Output');
  }

  // New file inherits the Output Folder's sharing settings — this script
  // never changes permissions to public and never shares individually.
  return {
    documentId: documentId,
    documentUrl: 'https://docs.google.com/document/d/' + documentId + '/edit',
    documentTitle: payload.documentTitle,
    createdAt: new Date().toISOString()
  };
}

/**
 * Populates the copied template in place.
 *
 * Convention this expects from the Master Template doc:
 *  - A paragraph containing the literal marker text `{{PROMOTION_BLOCKS}}`
 *    marking where dynamic per-promotion content is inserted.
 *  - Placeholder tokens `{{BRAND}}`, `{{PLATFORM}}`, `{{PATTERN}}`,
 *    `{{PATTERN_NAME}}`, `{{PATTERN_STYLE}}`, `{{LIVE_DATE}}`, `{{START_TIME}}`
 *    used in the Header/Title/Subtitle/Account Summary area.
 *  - A paragraph containing `{{POLICY_GUIDE}}` where the Policy-Safe Word
 *    Guide (team-only, not read aloud) is inserted.
 * See README.md "How to create a Master Template" for the exact layout.
 */
function populateDocument_(doc, payload) {
  const body = doc.getBody();
  const theme = getThemeForBrand_(payload.account.brand);

  replaceTokens_(body, {
    '{{BRAND}}': payload.account.brand,
    '{{PLATFORM}}': payload.account.platform,
    '{{PATTERN}}': payload.account.pattern,
    '{{PATTERN_NAME}}': payload.account.patternName || '',
    '{{PATTERN_STYLE}}': payload.account.patternStyle || '',
    '{{LIVE_DATE}}': payload.account.liveDate || '—',
    '{{START_TIME}}': payload.account.startTime || '—'
  });

  insertAtMarker_(body, '{{PROMOTION_BLOCKS}}', function (anchorIndex) {
    let insertAt = anchorIndex;
    payload.promotions.forEach(function (promo, index) {
      insertAt = insertPromotionBlock_(body, insertAt, promo, index + 1, theme);
    });
    return insertAt;
  });

  insertAtMarker_(body, '{{POLICY_GUIDE}}', function (anchorIndex) {
    let insertAt = anchorIndex;
    (payload.policyGuide || []).forEach(function (line) {
      body.insertParagraph(insertAt, '• ' + line).setIndentStart(18);
      insertAt += 1;
    });
    return insertAt;
  });

  // Safety net: verify no leftover placeholder made it into the final text.
  const finalText = body.getText();
  const leftovers = validateNoTemplatePlaceholders_(finalText);
  if (leftovers.length) {
    throw new ExportError_('TEMPLATE_PLACEHOLDER_LEFT_OVER', 'พบ Placeholder ที่ยังไม่ถูกแทนที่: ' + leftovers.join(', '));
  }
}

function validateNoTemplatePlaceholders_(text) {
  const patterns = [/\{\{[^}]*\}\}/, /Lorem ipsum/i, /PLACEHOLDER/i];
  const found = [];
  patterns.forEach(function (p) { if (p.test(text)) found.push(String(p)); });
  return found;
}

function replaceTokens_(body, tokenMap) {
  Object.keys(tokenMap).forEach(function (token) {
    body.replaceText(escapeRegex_(token), String(tokenMap[token] == null ? '' : tokenMap[token]));
  });
}

function escapeRegex_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Finds the paragraph containing `marker`, hands its index to `insertFn`
// (which inserts new paragraphs starting at that index and returns the next
// free index), then removes the original marker paragraph.
function insertAtMarker_(body, marker, insertFn) {
  const paragraphs = body.getParagraphs();
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].getText().indexOf(marker) !== -1) {
      const anchorIndex = body.getChildIndex(paragraphs[i]);
      insertFn(anchorIndex);
      // Re-fetch: inserting shifted indices, the marker paragraph is now at
      // anchorIndex + (number inserted) — simplest robust approach is to
      // search again by text and remove it.
      const stillThere = body.getParagraphs().filter(function (p) { return p.getText().indexOf(marker) !== -1; });
      stillThere.forEach(function (p) { body.removeChild(p); });
      return;
    }
  }
  Logger.log('Marker not found in template: %s (skipping that section)', marker);
}

// One Promotion's full Dynamic Block: heading, product/price summary, three
// spoken Sections, Short Loop, Q&A, Product Talk if present. Any field that
// is empty/missing is skipped entirely — never rendered as an empty
// placeholder heading.
function insertPromotionBlock_(body, insertAt, promo, promotionNumber, theme) {
  let at = insertAt;

  const heading = body.insertParagraph(at, 'PROMOTION ' + promotionNumber + (promo.productSummary ? ': ' + promo.productSummary : ''));
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  heading.editAsText().setForegroundColor(theme.headingColor);
  at += 1;

  at = insertPriceSummaryTable_(body, at, promo);

  (promo.sections || []).forEach(function (section) {
    if (!section || !section.spokenScript) return;
    const sectionHeading = body.insertParagraph(at, section.title + (section.estimatedMinutes != null ? ' (~' + section.estimatedMinutes + ' นาที)' : ''));
    sectionHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    at += 1;

    const mcLabel = body.insertParagraph(at, '[MC]');
    mcLabel.setBold(true);
    at += 1;

    // Preserve the Natural Speech Engine's line breaks: one Docs paragraph
    // per breath-line, NOT one paragraph with embedded \n (Google Docs
    // paragraphs don't render \n as a visual line break reliably across
    // export formats, so each line becomes its own paragraph instead).
    const lines = String(section.spokenScript).split('\n').filter(Boolean);
    lines.forEach(function (line) {
      const p = body.insertParagraph(at, line);
      p.setBackgroundColor(theme.scriptBlockBg);
      at += 1;
    });
    at += insertBlankParagraph_(body, at);
  });

  if (promo.shortLoop30 || promo.shortLoop90) {
    const loopHeading = body.insertParagraph(at, 'CLOSING LOOP — MC READ-ALOUD');
    loopHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    at += 1;
    if (promo.shortLoop30) { body.insertParagraph(at, '[30s] ' + promo.shortLoop30); at += 1; }
    if (promo.shortLoop90) { body.insertParagraph(at, '[90s] ' + promo.shortLoop90); at += 1; }
    at += insertBlankParagraph_(body, at);
  }

  if (promo.qa && promo.qa.length) {
    const qaHeading = body.insertParagraph(at, 'Q&A — ประโยคที่ MC อ่านตอบได้ทันที');
    qaHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    at += 1;
    promo.qa.forEach(function (item) {
      body.insertParagraph(at, 'ถาม: ' + item.question); at += 1;
      body.insertParagraph(at, '[MC] ' + item.answer); at += 1;
    });
    at += insertBlankParagraph_(body, at);
  }

  if (promo.productTalk && promo.productTalk.length) {
    const talkHeading = body.insertParagraph(at, 'Product Talk — ทีมงานเท่านั้น ไม่ต้องอ่านออกเสียง');
    talkHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    at += 1;
    promo.productTalk.forEach(function (line) { body.insertParagraph(at, '• ' + line); at += 1; });
    at += insertBlankParagraph_(body, at);
  }

  return at;
}

function insertBlankParagraph_(body, at) {
  body.insertParagraph(at, '');
  return 1;
}

// Pre-On-Air Promotion Summary table. Columns with no data anywhere in this
// promotion are omitted from the table entirely (not shown as an all-dash
// column) — an individual missing cell still renders as "—".
function insertPriceSummaryTable_(body, insertAt, promo) {
  const dash = '—';
  const allColumns = [
    { key: 'productSummary', label: 'สินค้า / เงื่อนไข', value: promo.productSummary },
    { key: 'normalPrice', label: 'ราคาปกติ', value: promo.normalPrice != null ? formatBaht_(promo.normalPrice) : null },
    { key: 'promoPrice', label: 'ราคาโปร', value: promo.promoPrice != null ? formatBaht_(promo.promoPrice) : null },
    { key: 'finalPrice', label: 'Final Price', value: promo.finalPrice != null ? formatBaht_(promo.finalPrice) : null },
    { key: 'gifts', label: 'ของแถม', value: (promo.gifts || []).length ? promo.gifts.map(function (g) { return g.name; }).join(', ') : null }
  ];
  const columns = allColumns.filter(function (col) { return col.value != null; });
  if (!columns.length) return insertAt;

  const table = body.insertTable(insertAt, [
    columns.map(function (col) { return col.label; }),
    columns.map(function (col) { return String(col.value || dash); })
  ]);
  const headerRow = table.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) {
    headerRow.getCell(c).editAsText().setBold(true);
  }
  return insertAt + 1;
}

function formatBaht_(amount) {
  return Number(amount).toLocaleString('th-TH') + ' บาท';
}
