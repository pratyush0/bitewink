const SHEET_NAMES = {
  survey: 'SurveyResponses',
  founding: 'Founding100'
};
const HEADERS = {
  survey: ['session_id','preferred_meal','frequency','budget','selected_products','page_url','user_agent','created_at','updated_at'],
  founding: ['registration_id','session_id','name','phone','area_or_pin','preferred_meal','frequency','budget','selected_products','page_url','submitted_at','whatsapp_updates_consent','consent_recorded_at']
};
const OPTIONS = {
  need: ['Breakfast','Lunch','Dinner','Snacks'],
  frequency: ['Every day','3–5 times a week','1–2 times a week','Occasionally'],
  budget: ['₹149–199','₹200–249','₹250–299','₹300–349','₹350+'],
  meal: ['Breakfast','Lunch','Dinner','Snacks'],
  products: ['Protein Oat Bowl','Power Lunch Bowl','Balanced Dinner','Smart Snack']
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > 10000) throw new Error('Invalid or oversized payload');
    const payload = JSON.parse(raw);
    validatePayload_(payload);
    lock.waitLock(10000);
    locked = true;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (payload.action === 'survey') upsertSurvey_(ss, payload);
    else appendFounding_(ss, payload);
    return json_({ ok: true });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (_) {} }
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'checkPhone' || params.action === 'checkRegistration') {
    const callback = String(params.callback || '');
    if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,100}$/.test(callback)) {
      return ContentService.createTextOutput('/* invalid callback */')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    if (params.action === 'checkPhone') {
      const phoneHash = String(params.phoneHash || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(phoneHash)) {
        return jsonp_(callback, { ok: false, exists: false, error: 'Invalid phone hash' });
      }
      return jsonp_(callback, { ok: true, exists: phoneHashExists_(phoneHash) });
    }
    const registrationId = String(params.registrationId || '');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(registrationId)) {
      return jsonp_(callback, { ok: false, exists: false, error: 'Invalid registration ID' });
    }
    return jsonp_(callback, { ok: true, exists: registrationExists_(registrationId) });
  }
  return json_({ ok: true, service: 'BITEWINK response capture', status: 'ready' });
}

function phoneHashExists_(phoneHash) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.founding);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const phones = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < phones.length; i++) {
    const normalized = normalizeIndianPhone_(phones[i][0]);
    if (normalized && sha256Hex_(normalized) === phoneHash) return true;
  }
  return false;
}

function registrationExists_(registrationId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.founding);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(registrationId).matchEntireCell(true).findNext();
  return !!found;
}

function sha256Hex_(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return digest.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function jsonp_(callback, obj) {
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validatePayload_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid payload');
  if (p.action !== 'survey' && p.action !== 'founding') throw new Error('Invalid action');
  const sessionId = String(p.sessionId || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) throw new Error('Invalid session ID');
  validateUrl_(p.pageUrl, 'page URL', 1000);
  validateProducts_(p.selectedProducts);

  if (p.action === 'survey') {
    validateOptionalChoice_(p.preferredNeed, OPTIONS.need, 'meal interest');
    validateOptionalChoice_(p.frequency, OPTIONS.frequency, 'frequency');
    validateOptionalChoice_(p.budget, OPTIONS.budget, 'budget');
    if (p.userAgent != null && String(p.userAgent).length > 500) throw new Error('User agent too long');
    return;
  }

  const name = String(p.name == null ? '' : p.name).trim();
  const area = String(p.area == null ? '' : p.area).trim();
  if (name.length < 2 || name.length > 80 || !/[\p{L}\p{M}]/u.test(name) || !/^[\p{L}\p{M} .'-]+$/u.test(name)) throw new Error('Invalid name');
  if (area.length < 2 || area.length > 100 || !/[\p{L}\p{M}\d]/u.test(area) || !/^[\p{L}\p{M}\d .,#/()-]+$/u.test(area)) throw new Error('Invalid area or PIN code');
  const phone = normalizeIndianPhone_(p.phone);
  if (!phone) throw new Error('Invalid Indian mobile number');
  if (!OPTIONS.meal.includes(String(p.meal || ''))) throw new Error('Invalid meal preference');
  if (!OPTIONS.frequency.includes(String(p.frequency || ''))) throw new Error('Invalid frequency');
  if (!OPTIONS.budget.includes(String(p.budget || ''))) throw new Error('Invalid budget');
  validateOptionalChoice_(p.preferredNeed, OPTIONS.need, 'meal interest');
  if (p.registrationId != null && !/^[A-Za-z0-9_-]{8,100}$/.test(String(p.registrationId))) throw new Error('Invalid registration ID');
  if (typeof p.whatsappUpdatesConsent !== 'boolean') throw new Error('Invalid WhatsApp consent value');
  if (p.whatsappUpdatesConsent && p.consentRecordedAt != null && String(p.consentRecordedAt).length > 50) throw new Error('Invalid consent timestamp');
}

function validateOptionalChoice_(value, allowed, label) {
  if (value == null || value === '') return;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error('Invalid ' + label);
}

function validateProducts_(products) {
  if (products == null) return;
  if (!Array.isArray(products) || products.length > OPTIONS.products.length) throw new Error('Invalid selected products');
  const seen = {};
  products.forEach(function (product) {
    if (typeof product !== 'string' || !OPTIONS.products.includes(product) || seen[product]) throw new Error('Invalid selected product');
    seen[product] = true;
  });
}

function validateUrl_(value, label, maxLength) {
  const url = String(value == null ? '' : value);
  if (url.length > maxLength || !/^https?:\/\//i.test(url)) throw new Error('Invalid ' + label);
}

function getSheet_(ss, key) {
  let sheet = ss.getSheetByName(SHEET_NAMES[key]);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES[key]);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS[key]);
    sheet.setFrozenRows(1);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    const missingHeaders = HEADERS[key].filter(header => existingHeaders.indexOf(header) === -1);
    if (missingHeaders.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  return sheet;
}

function upsertSurvey_(ss, p) {
  const sheet = getSheet_(ss, 'survey');
  const sessionId = String(p.sessionId);
  const last = sheet.getLastRow();
  let row = 0;
  if (last > 1) {
    const found = sheet.getRange(2, 1, last - 1, 1).createTextFinder(sessionId).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  const now = new Date();
  const createdAt = row ? sheet.getRange(row, 8).getValue() : now;
  const values = [[
    sessionId, safeCell_(p.preferredNeed || ''), safeCell_(p.frequency || ''), safeCell_(p.budget || ''),
    safeCell_(JSON.stringify(Array.isArray(p.selectedProducts) ? p.selectedProducts : [])),
    safeCell_(p.pageUrl), safeCell_(String(p.userAgent || '').slice(0, 500)), createdAt || now, now
  ]];
  if (row) sheet.getRange(row, 1, 1, values[0].length).setValues(values);
  else sheet.appendRow(values[0]);
}

function appendFounding_(ss, p) {
  const sheet = getSheet_(ss, 'founding');
  const registrationId = String(p.registrationId || Utilities.getUuid());
  const last = sheet.getLastRow();
  if (last > 1) {
    const foundId = sheet.getRange(2, 1, last - 1, 1).createTextFinder(registrationId).matchEntireCell(true).findNext();
    if (foundId) return;
  }
  const normalizedPhone = normalizeIndianPhone_(p.phone);
  if (last > 1) {
    const phones = sheet.getRange(2, 4, last - 1, 1).getDisplayValues();
    for (let i = 0; i < phones.length; i++) {
      if (normalizeIndianPhone_(phones[i][0]) === normalizedPhone) {
        console.log('Duplicate Founding 100 registration ignored; existing row: ' + (i + 2));
        return;
      }
    }
  }
  const submittedAt = new Date();
  sheet.appendRow([
    safeCell_(registrationId), safeCell_(String(p.sessionId)), safeCell_(String(p.name).trim()), safeCell_(normalizedPhone),
    safeCell_(String(p.area).trim()), safeCell_(p.meal), safeCell_(p.frequency), safeCell_(p.budget),
    safeCell_(JSON.stringify(Array.isArray(p.selectedProducts) ? p.selectedProducts : [])),
    safeCell_(p.pageUrl), submittedAt,
    p.whatsappUpdatesConsent === true ? 'Yes' : 'No',
    p.whatsappUpdatesConsent === true ? submittedAt : ''
  ]);
}

function normalizeIndianPhone_(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || raw.length > 25 || !/^[+()\d\s-]+$/.test(raw)) return '';
  if ((raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) return '';
  const opens = (raw.match(/\(/g) || []).length;
  const closes = (raw.match(/\)/g) || []).length;
  if (opens !== closes || opens > 2 || /\(\s*\)/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}

function safeCell_(value) {
  const s = value == null ? '' : String(value);
  return /^[=+@\-]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
