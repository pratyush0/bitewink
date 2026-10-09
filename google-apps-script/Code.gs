const SHEET_NAMES = {
  survey: 'SurveyResponses',
  founding: 'Founding100'
};
const HEADERS = {
  survey: ['session_id','preferred_meal','frequency','budget','selected_products','page_url','user_agent','created_at','updated_at'],
  founding: ['registration_id','session_id','name','phone','area_or_pin','preferred_meal','frequency','budget','selected_products','page_url','submitted_at']
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validatePayload_(payload);
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (payload.action === 'survey') upsertSurvey_(ss, payload);
    else if (payload.action === 'founding') appendFounding_(ss, payload);
    else throw new Error('Unsupported action');
    return json_({ ok: true });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet() {
  return json_({ ok: true, service: 'BITEWINK response capture', status: 'ready' });
}

function validatePayload_(p) {
  if (!p || typeof p !== 'object') throw new Error('Invalid payload');
  if (p.action !== 'survey' && p.action !== 'founding') throw new Error('Invalid action');
  if (!p.sessionId || String(p.sessionId).length > 100) throw new Error('Invalid session id');
  if (p.action === 'founding') {
    ['name','phone','area','meal','frequency','budget'].forEach(k => {
      if (!String(p[k] || '').trim()) throw new Error('Missing required field: ' + k);
      if (String(p[k]).length > 300) throw new Error('Field too long: ' + k);
    });
    if (!/^[+()\d\s-]{7,25}$/.test(String(p.phone || ''))) throw new Error('Invalid phone number format');
  }
}

function getSheet_(ss, key) {
  let sheet = ss.getSheetByName(SHEET_NAMES[key]);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES[key]);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS[key]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertSurvey_(ss, p) {
  const sheet = getSheet_(ss, 'survey');
  const sessionId = String(p.sessionId);
  const last = sheet.getLastRow();
  let row = 0;
  if (last > 1) {
    const found = sheet.getRange(2, 1, last - 1, 1)
      .createTextFinder(sessionId).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  const now = new Date();
  const createdAt = row ? sheet.getRange(row, 8).getValue() : now;
  const values = [[
    sessionId,
    safeCell_(p.preferredNeed),
    safeCell_(p.frequency),
    safeCell_(p.budget),
    safeCell_(JSON.stringify(Array.isArray(p.selectedProducts) ? p.selectedProducts : [])),
    safeCell_(p.pageUrl),
    safeCell_(p.userAgent),
    createdAt || now,
    now
  ]];
  if (row) sheet.getRange(row, 1, 1, values[0].length).setValues(values);
  else sheet.appendRow(values[0]);
}

function appendFounding_(ss, p) {
  const sheet = getSheet_(ss, 'founding');
  const registrationId = String(p.registrationId || Utilities.getUuid());
  // Prevent a duplicate row if a user retries the same registration id.
  const last = sheet.getLastRow();
  if (last > 1) {
    const found = sheet.getRange(2, 1, last - 1, 1)
      .createTextFinder(registrationId).matchEntireCell(true).findNext();
    if (found) return;
  }
  sheet.appendRow([
    safeCell_(registrationId), safeCell_(p.sessionId), safeCell_(p.name), safeCell_(p.phone),
    safeCell_(p.area), safeCell_(p.meal), safeCell_(p.frequency), safeCell_(p.budget),
    safeCell_(JSON.stringify(Array.isArray(p.selectedProducts) ? p.selectedProducts : [])),
    safeCell_(p.pageUrl), new Date(p.submittedAt || new Date())
  ]);
}

// Prevent spreadsheet formula injection from visitor-controlled text.
function safeCell_(value) {
  const s = value == null ? '' : String(value);
  return /^[=+@\-]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
