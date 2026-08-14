/**
 * Test-only Renewal DB -> TPR Queue converter.
 * This project is intentionally locked to the test workbook. It never writes
 * to the original TPR spreadsheet.
 */
const RENEWAL_QUEUE_TEST_WORKBOOK_ID = '1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4';
const QUEUE_LEADING_HEADERS = ['', 'Check', 'Note', 'Demand', 'Comment', '合約'];
const QUEUE_HELPER_HEADERS = ['Batch ID', 'Original TPR Row', 'Renewal DB Row', 'Transformation Status'];
const QUEUE_AUDIT_HEADERS = [
  'Update Action', 'Plan Change', 'Original Plan Family', 'New Plan Family',
  'Plan Compliance', 'Required Evidence', 'Evidence Type', 'Inline Seal',
  'Customer Seal', 'Contract Check', 'Special Approval Required',
  'Special Approval Status', 'Share Group Check', 'Difference',
  'Update Status', 'Status Reason', 'Reviewed At'
];
const EVIDENCE_REVIEW_HEADERS = [
  'Branch ID', 'Evidence URL', 'Evidence Type', 'Restaurant Name Match',
  'Contract Period Match', 'Full Plan Match', 'Customer Explicit Consent',
  'Agreement Confirmation Text', 'Confirmation Sender', 'Inline Seal',
  'Customer Seal', 'Reviewer', 'Reviewed At', 'Status', 'Notes',
  'Annual Payment Amount (NTD)', 'Billing Cycle Match',
  'Contract Start Date', 'Contract End Date',
  'Deposit Commission Rate (%)', 'Deposit Buy-in Price (%)',
  'Document Restaurant Name', 'Document Legal Entity Name',
  'Restaurant Name Match Result', 'Restaurant Alias Evidence',
  'Reviewed Evidence File ID', 'Reviewed Evidence Modified At',
  'Annual Payment Evidence Quote', 'Annual Payment Evidence Location'
];
const PLAN_REVIEW_HEADERS = [
  'Branch ID', 'Original Plan Family', 'New Plan Family', 'Complete Plan Match',
  'Reviewer', 'Reviewed At', 'Notes',
  'First Contract Start Date', 'Expected Plan Family', 'Original Plan Code',
  'New Plan Code', 'Catalog Match Rule', 'Catalog Exception', 'Origin Source'
];
const SPECIAL_REVIEW_HEADERS = [
  'Branch ID', 'Approval Status', 'Evidence URL', 'Reviewer', 'Reviewed At', 'Notes'
];
const SHARE_REVIEW_HEADERS = [
  'Share Plan ID', 'Member Check', 'Tax ID Check', 'Contract Check',
  'Overage Check', 'Status', 'Reviewer', 'Reviewed At', 'Notes'
];
const BONUS_AUDIT_SETTINGS = [
  ['Bonus Warning Ratio', 0.12, '贈送組數／使用組數超過此比例時需人工確認；例如 0.12 = 12%。'],
  ['Bonus Critical Ratio', 0.30, '贈送組數／使用組數超過此比例時判定為嚴重異常。'],
  ['Bonus Warning Multiplier', 1.20, '相較同使用組數公版／BD 新方案贈送組數的提醒倍數。'],
  ['Bonus Critical Multiplier', 2.00, '相較同使用組數公版／BD 新方案贈送組數的嚴重異常倍數。'],
  ['Bonus Minimum Extra Groups', 50, '方案參照的最低容許加送組數，用來避免小方案因少量差異被誤判。'],
  ['Contract Date Detail Required From', '2026-07-21', '此日期起的新覆核必須填入合約／信件實際起訖日，由程式自行與 Queue 比對。'],
  ['Deposit Commission Detail Required From', '2026-07-25', '此日期起的新覆核若有 Deposit-Commission，必須填入文件中的抽成比例或買入價格。'],
  ['Restaurant Name Detail Required From', '2026-08-13', '此日期起的新覆核必須記錄文件實際店名、人工比對結果及所覆核的 Drive 檔案版本；簽約實體不得代替使用店家名稱。']
];
const PLAN_ORIGIN_SETTINGS = [
  ['RSV Plan Reference Spreadsheet ID', '10ECF2b0yu6loRZqDl_4ynHOuc2yz-IAUjPirCj-dxvM', 'RSV／RwG 方案來源；只允許程式維護 Plan Code 欄。'],
  ['RSV Plan Reference Tab', 'TMS 方案', 'RSV／RwG 方案來源分頁。'],
  ['RSV Plan Code Header', 'Plan Code', '方案來源的永久代碼欄；既有代碼不得改寫。'],
  ['Legacy Branch Master Tab', 'Legacy Branch Master', 'Legacy cohort 主檔；正常流程不得重新掃描 Raw : TPR。'],
  ['Legacy Branch ID Header', 'Branch ID', 'Legacy Branch Master 的 Branch ID 欄位標題。']
];
const CANONICAL_PLAN_HEADERS = [
  'Plan Code', 'Version', 'Status', 'Plan Family', 'Source Catalog',
  'Billing Period', 'Product', 'Usage Sets', 'Bonus Sets', 'Price',
  'Overage Unit Price', 'Source Spreadsheet ID', 'Source Sheet', 'Source Row',
  'Effective From', 'Effective To', 'Imported At', 'Record JSON'
];
const PLAN_CHANGE_HEADERS = [
  'Change ID', 'Plan Code', 'Change Type', 'Detected At', 'Old Version',
  'Old Values JSON', 'New Values JSON', 'Approval Status', 'Reviewer',
  'Reviewed At', 'Notes', 'Affected Branch IDs', 'Applied At'
];
const PLAN_REFERENCE_MAPPING_HEADERS = [
  'Mapping ID', 'Plan Family', 'Source Spreadsheet ID', 'Source Tab',
  'Layout Type', 'Header Row', 'Data Start Row', 'Header Group',
  'Header Label', 'Canonical Plan Field', 'Data Type', 'Normalization',
  'Required In Combination', 'Combination Key Part', 'Special Plan Flag Rule',
  'Status', 'Notes'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Renewal Queue')
    .addItem('Build Queue', 'buildQueue')
    .addItem('Sync Plan Catalog', 'syncPlanCatalog')
    .addItem('Run Contract Audit', 'runContractAudit')
    .addItem('Validate configuration', 'validateConfiguration')
    .addToUi();
}

// Run once from Apps Script to show the Renewal Queue menu in the test workbook.
function installTestWorkbookMenu() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onOpen')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(RENEWAL_QUEUE_TEST_WORKBOOK_ID)
    .onOpen()
    .create();
}

function buildQueue() {
  const ss = SpreadsheetApp.openById(RENEWAL_QUEUE_TEST_WORKBOOK_ID);
  const controlSheet = ss.getSheetByName('Control');
  ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
  const control = readSettings_(controlSheet);
  syncPlanCatalog_(ss, control);
  const manualIds = String(control['Selected Branch IDs'] || '')
    .split(/[\n,\s]+/).map(String).map(s => s.trim()).filter(Boolean);
  const selectionMode = String(control['Selection Mode'] || 'TPR Check Box = TRUE');
  const useCheckBox = selectionMode === 'TPR Check Box = TRUE';
  const useDemand = String(control['Renewal Month Mode'] || 'Auto from TPR Demand') !== 'Manual Control Month';
  if (!useCheckBox && !manualIds.length) throw new Error('Control!Selected Branch IDs is empty.');

  const tpr = SpreadsheetApp.openById(control['Original TPR Spreadsheet ID'])
    .getSheetByName(control['Original TPR Tab']);
  if (!tpr) throw new Error('Configured Original TPR tab was not found.');

  const mappings = readTable_(ss.getSheetByName('Field Mapping'))
    .filter(r => r['Source'] === 'Renewal DB' && isActive_(r['Active']));
  const planRules = readTable_(ss.getSheetByName('Plan Value Rules')).filter(r => isActive_(r['Active']));
  const tprValues = tpr.getDataRange().getValues();
  const tprHeaders = tprValues[1].map(String); // TPR header row is configured as row 2.
  const tprIndex = headerIndex_(tprHeaders);
  const branchCol = requiredHeader_(tprIndex, 'Branch ID', 'TPR');
  const queue = ss.getSheetByName('TPR Update Queue');
  const payloadHeaders = queuePayloadHeaders_(tprHeaders, tprIndex);
  const helperStart = payloadHeaders.length;
  const queueHeaders = payloadHeaders.concat(QUEUE_HELPER_HEADERS, QUEUE_AUDIT_HEADERS);
  const selectionCol = useCheckBox
    ? requiredHeader_(tprIndex, control['TPR Selection Header'] || 'Check Box', 'TPR')
    : null;
  const demandCol = useDemand
    ? requiredHeader_(tprIndex, control['TPR Demand Header'] || 'Demand', 'TPR')
    : null;
  const sourceRows = tprValues.slice(2)
    .map((row, i) => ({ row: i + 3, values: row }))
    .filter(x => useCheckBox
      ? matchesSelection_(x.values[selectionCol], control['TPR Selection Value'] || 'TRUE')
      : manualIds.includes(String(x.values[branchCol]).trim()))
    .map(x => Object.assign(x, {
      renewalMonth: useDemand
        ? renewalMonthFromDemand_(x.values[demandCol])
        : String(control['Renewal Month'] || '').trim()
    }));
  const ids = [...new Set(sourceRows.map(x => String(x.values[branchCol]).trim()))];
  if (!ids.length) throw new Error(useCheckBox ? 'No TPR rows have Check Box = TRUE.' : 'No matching TPR rows were found.');
  const invalidDemandRows = sourceRows.filter(x => !x.renewalMonth).map(x => 'TPR!' + x.row);
  if (invalidDemandRows.length) {
    throw new Error('Demand could not be converted to YYYYMM for: ' + invalidDemandRows.join(', ') +
      '. Expected format such as 2026/8月續約. Queue was not changed.');
  }
  assertOneDemandMonthPerBranch_(sourceRows, branchCol);
  const months = [...new Set(sourceRows.map(x => x.renewalMonth))].sort();
  const monthLabel = months.join(', ');
  const batchId = makeBatchId_(control['Batch ID'], months, useDemand);

  const renewalSs = SpreadsheetApp.openById(control['Renewal DB Spreadsheet ID']);
  const renewalTimeZone = renewalSs.getSpreadsheetTimeZone();
  const renewalByMonth = {};
  const unavailableTabs = [];
  months.forEach(month => {
    const tabName = String(control['Renewal DB Tab Pattern']).replace('{Renewal Month}', month);
    const renewal = renewalSs.getSheetByName(tabName);
    if (!renewal) { unavailableTabs.push(tabName); return; }
    const renewalValues = renewal.getDataRange().getValues();
    const renewalIndexes = resolveMappings_(mappings, expandGroups_(renewalValues[0]), renewalValues[1].map(String));
    const renewalBranchIndex = requiredMapping_(renewalIndexes, 'branch_id');
    const wantedIds = new Set(sourceRows
      .filter(x => x.renewalMonth === month)
      .map(x => String(x.values[branchCol]).trim()));
    const byBranch = {};
    renewalValues.slice(2).forEach((row, i) => {
      const id = String(row[renewalBranchIndex] || '').trim();
      if (id && wantedIds.has(id)) byBranch[id] = { row: i + 3, values: row };
    });
    renewalByMonth[month] = { indexes: renewalIndexes, byBranch, timeZone: renewalTimeZone };
  });
  if (unavailableTabs.length) {
    throw new Error('Renewal DB tab not found: ' + unavailableTabs.join(', ') + '. Queue was not changed.');
  }

  const queueIndex = headerIndex_(payloadHeaders);
  const output = [];
  const foundSourceIds = new Set();
  sourceRows.forEach(source => {
    const branchId = String(source.values[branchCol]).trim();
    foundSourceIds.add(branchId);
    const renewalMonth = source.renewalMonth;
    const renewalSet = renewalByMonth[renewalMonth];
    const renewalRow = renewalSet.byBranch[branchId];
    const base = queueBaseFromTpr_(payloadHeaders, tprIndex, source.values);
    if (!renewalRow) {
      setExact_(base, queueIndex, 'Check', false);
      setExact_(base, queueIndex, 'Note', needRenewalDataNote_(branchId, source.values[demandCol]));
      output.push([...base, batchId, 'TPR!' + source.row, '', 'Need Renewal Data — manual review required']);
      return;
    }
    const data = transformRow_(base, queueIndex, renewalRow.values, renewalSet.indexes, planRules, renewalSet.timeZone);
    setExact_(data, queueIndex, 'Check', false);
    output.push([...data, batchId, 'TPR!' + source.row, renewalMonth + '!' + renewalRow.row, data._status || 'Converted — review required']);
  });

  const missingTpr = useCheckBox ? [] : manualIds.filter(id => !foundSourceIds.has(id));
  const missingRenewal = [...new Set(sourceRows
    .filter(x => !renewalByMonth[x.renewalMonth].byBranch[String(x.values[branchCol]).trim()])
    .map(x => x.renewalMonth + ':' + String(x.values[branchCol]).trim()))];
  if (!output.length) {
    appendAudit_(ss.getSheetByName('Audit Log'), batchId, monthLabel, 0, missingTpr, missingRenewal);
    notify_('No Queue rows were built. The existing Queue was kept unchanged.\n' +
      'Check that selected TPR rows have a matching Renewal DB row.');
    return;
  }
  writeQueue_(queue, queueHeaders, output, queueIndex);
  setupAuditSheets_(ss, queue);
  appendAudit_(ss.getSheetByName('Audit Log'), batchId, monthLabel, output.length, missingTpr, missingRenewal);
  notify_(
    'Queue built: ' + output.length + ' product rows across ' + monthLabel + '.\n' +
    'Missing original TPR: ' + (missingTpr.join(', ') || 'none') + '\n' +
    'Missing Renewal DB: ' + (missingRenewal.join(', ') || 'none')
  );
}

function validateConfiguration() {
  const ss = SpreadsheetApp.openById(RENEWAL_QUEUE_TEST_WORKBOOK_ID);
  const maps = readTable_(ss.getSheetByName('Field Mapping')).filter(r => isActive_(r['Active']));
  const duplicates = maps.filter((r, i, all) => all.findIndex(x => x['Mapping Key'] === r['Mapping Key']) !== i);
  notify_(duplicates.length ? 'Duplicate Mapping Key: ' + duplicates.map(r => r['Mapping Key']).join(', ') : 'Configuration looks structurally valid.');
}

function syncPlanCatalog() {
  const ss = SpreadsheetApp.openById(RENEWAL_QUEUE_TEST_WORKBOOK_ID);
  const controlSheet = ss.getSheetByName('Control');
  ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
  const result = syncPlanCatalog_(ss, readSettings_(controlSheet));
  notify_('Plan catalog synced. Active plans: ' + result.activePlans.length +
    '; pending changes: ' + result.pendingChanges.length + '.');
}

function transformRow_(row, ix, renewal, mapping, planRules, renewalTimeZone) {
  const value = key => {
    const column = mapping[key];
    return column === undefined ? '' : renewal[column];
  };
  const product = String(row[requiredHeader_(ix, '產品', 'Queue', true)] || '');
  const status = String(value('status') || '');
  if (status === 'Termination Already') { row._status = 'Skipped — Termination Already'; return row; }

  const plan = resolvePlan_(String(value('new_period') || ''), planRules);
  const period = plan.period || String(value('new_period') || '');
  setByPrefix_(row, ix, '付款起始日', '');
  setByPrefix_(row, ix, '合約起始日', dateOnlyForQueue_(value('new_start'), renewalTimeZone));
  setByPrefix_(row, ix, '合約結束日', dateOnlyForQueue_(value('new_end'), renewalTimeZone));
  setByPrefix_(row, ix, '解約日', '');
  setByPrefix_(row, ix, 'Long-Term Contract Notes', value('long_term'));
  setByPrefix_(row, ix, 'TMS Plan Type', value('tms_plan_type'));
  setByPrefix_(row, ix, 'Booking Notification and Type', value('booking_notification'));
  setByPrefix_(row, ix, 'Queuing Notification and Type', value('queuing_notification'));
  setByPrefix_(row, ix, '付款週期', period);

  if (product === 'RSV' || product === 'RwG') {
    setByPrefix_(row, ix, '產品', plan.product);
    setByPrefix_(row, ix, '合約組數', reservationSetsOrBlank_(value('new_sets')));
    setByPrefix_(row, ix, '合約贈送組數', zeroNumberAsBlank_(value('new_bonus')));
    setByPrefix_(row, ix, '合約價格', numberOrBlank_(value('new_price')));
    setByPrefix_(row, ix, 'Share Plan ID', value('new_share'));
    setByPrefix_(row, ix, '超額計算方式', value('new_overage_type'));
    setByPrefix_(row, ix, '超額每組單價', numberOrBlank_(value('new_overage_price')));
  } else if (product === 'Deposit') {
    const type = String(value('deposit_type') || '');
    setByPrefix_(row, ix, '合約組數', '');
    setByPrefix_(row, ix, '合約贈送組數', type.indexOf('B2B') === 0 ? numberOrBlank_(value('deposit_cc')) : '');
    setByPrefix_(row, ix, '合約價格', numberOrBlank_(value('deposit_fee')) * periodMonths_(period));
    setByPrefix_(row, ix, 'Share Plan ID', '');
    setByPrefix_(row, ix, '超額計算方式', type.indexOf('B2B') === 0 ? 'B2B' : (type.indexOf('B2C') === 0 ? 'B2C' : ''));
    setByPrefix_(row, ix, '超額每組單價', numberOrBlank_(value('deposit_setup')));
  } else if (product === 'Deposit-Commission') {
    const type = String(getByPrefix_(row, ix, '超額計算方式') || '');
    setByPrefix_(row, ix, '合約組數', '');
    setByPrefix_(row, ix, '合約贈送組數', type === 'Virtual ATM' ? numberOrBlank_(value('deposit_atm')) : numberOrBlank_(value('deposit_cc')));
    setByPrefix_(row, ix, '合約價格', '');
    setByPrefix_(row, ix, 'Share Plan ID', '');
    setByPrefix_(row, ix, '超額每組單價', '');
  } else if (['Voice', 'Survey', 'eCoupon'].includes(product)) {
    const amountKey = product.toLowerCase();
    setByPrefix_(row, ix, '合約組數', '');
    setByPrefix_(row, ix, '合約贈送組數', '');
    setByPrefix_(row, ix, '合約價格', numberOrBlank_(value(amountKey)) * periodMonths_(period));
    setByPrefix_(row, ix, 'Share Plan ID', '');
    setByPrefix_(row, ix, '超額計算方式', '');
    setByPrefix_(row, ix, '超額每組單價', '');
  }
  row._status = 'Converted — review required';
  return row;
}

function resolvePlan_(newPeriod, rules) {
  const exact = rules.find(r => r['Match Type'] === 'equals' && String(r['Match Value']) === newPeriod);
  const rule = exact || rules.find(r => r['Match Type'] === 'default');
  if (!rule) throw new Error('No Plan Value Rule matches: ' + newPeriod);
  const override = String(rule['Billing Period Override'] || '');
  return { product: rule['Output Main Product'], period: override === 'use source value' ? newPeriod : override };
}

function writeQueue_(sheet, headers, rows, ix) {
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length)
    .setValues(rows.map(r => r.slice(0, headers.length).concat(Array(Math.max(0, headers.length - r.length)).fill(''))));
  const check = requiredHeader_(ix, 'Check', 'Queue') + 1;
  const bonus = requiredHeader_(ix, '合約贈送組數', 'Queue', true) + 1;
  const overage = requiredHeader_(ix, '超額每組單價', 'Queue', true) + 1;
  if (rows.length) {
    sheet.getRange(2, check, rows.length, 1).clearDataValidations().insertCheckboxes();
    sheet.getRange(2, bonus, rows.length, 1).setNumberFormat('0.00');
    sheet.getRange(2, overage, rows.length, 1).setNumberFormat('0.000');
  }
}

function appendAudit_(sheet, batchId, month, count, missingTpr, missingRenewal, operation) {
  sheet.appendRow([new Date(), batchId, month, operation || 'Build Queue', count, missingTpr.join(', '), missingRenewal.join(', '), 'Test only; no formal TPR writeback']);
}
// Alerts pause a script until a person closes the dialog.  That is unsuitable
// for the full Queue/audit run, because it can make an otherwise completed
// job exceed Apps Script's execution limit.  A toast is non-blocking and still
// gives the user visible feedback when the function is started from the Sheet.
function notify_(message) {
  console.log(message);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Renewal Queue', 10); } catch (error) {}
}

function readSettings_(sheet) { const o = {}; sheet.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) o[String(r[0])] = r[1]; }); return o; }
function readTable_(sheet) { const v = sheet.getDataRange().getValues(); const h = v[0].map(String); return v.slice(1).filter(r => r.some(x => x !== '')).map(r => h.reduce((o, k, i) => (o[k] = r[i], o), {})); }
function isActive_(v) { return String(v).toUpperCase() !== 'FALSE'; }
function norm_(v) { return String(v || '').replace(/\s+/g, '').replace(/[（）]/g, x => x === '（' ? '(' : ')').toLowerCase(); }
function headerIndex_(headers) { const o = {}; headers.forEach((h, i) => { const k = norm_(h); if (!o[k]) o[k] = []; o[k].push(i); }); return o; }
function findHeader_(index, label) { const a = index[norm_(label)]; return a && a.length ? a[0] : null; }
function requiredHeader_(index, label, scope, prefix) { const key = Object.keys(index).find(k => prefix ? k.indexOf(norm_(label)) === 0 : k === norm_(label)); if (!key) throw new Error(scope + ' header missing: ' + label); return index[key][0]; }
function setByPrefix_(row, ix, label, value) { row[requiredHeader_(ix, label, 'Queue', true)] = value; }
function getByPrefix_(row, ix, label) { return row[requiredHeader_(ix, label, 'Queue', true)]; }
function numberOrBlank_(v) { return v === '' || v === null || v === undefined ? '' : Number(v); }
function reservationSetsOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const text = String(v).trim();
  return text.toLowerCase() === 'unlimited' ? 'unlimited' : numberOrBlank_(v);
}
function zeroNumberAsBlank_(v) {
  const value = numberOrBlank_(v);
  return value === 0 ? '' : value;
}
function dateOnlyForQueue_(value, sourceTimeZone) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return value;
  const parts = Utilities.formatDate(value, sourceTimeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd')
    .split('-').map(Number);
  // Use a UTC date-only value so writing between spreadsheets cannot subtract the source time-zone offset.
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}
function periodMonths_(period) {
  const p = String(period).toLowerCase();
  if (p === 'annual') return 12;
  if (p === '6mo') return 6;
  if (p === '3mo') return 3;
  return 1;
}
function matchesSelection_(value, expected) { return String(value).trim().toUpperCase() === String(expected).trim().toUpperCase(); }
function renewalMonthFromDemand_(demand) {
  const text = String(demand || '').trim();
  let match = text.match(/(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*月?/);
  if (!match) match = text.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  return match ? match[1] + ('0' + Number(match[2])).slice(-2) : '';
}
function assertOneDemandMonthPerBranch_(rows, branchCol) {
  const byBranch = {};
  rows.forEach(x => {
    const id = String(x.values[branchCol]).trim();
    if (!byBranch[id]) byBranch[id] = new Set();
    byBranch[id].add(x.renewalMonth);
  });
  const conflicts = Object.keys(byBranch).filter(id => byBranch[id].size > 1);
  if (conflicts.length) throw new Error('Conflicting Demand months for Branch ID: ' + conflicts.join(', ') + '. Queue was not changed.');
}
function makeBatchId_(configuredBatch, months, useDemand) {
  const base = String(configuredBatch || '').trim() || (useDemand ? 'AUTO-DEMAND' : 'TEST');
  return useDemand ? base.replace(/-?\d{6}(?:[_,-]\d{6})*$/, '') + '-' + months.join('_') : base;
}
function queuePayloadHeaders_(tprHeaders, tprIndex) {
  const start = requiredHeader_(tprIndex, 'Branch ID', 'TPR');
  const end = requiredHeader_(tprIndex, 'Queuing Notification and Type', 'TPR');
  return QUEUE_LEADING_HEADERS.concat(tprHeaders.slice(start, end + 1));
}
function queueBaseFromTpr_(queueHeaders, tprIndex, source) {
  return queueHeaders.map(header => {
    if (!header || header === 'Check' || header === 'Note') return '';
    const column = findHeader_(tprIndex, header);
    return column === null ? '' : source[column];
  });
}
function setExact_(row, ix, label, value) { row[requiredHeader_(ix, label, 'Queue')] = value; }
function needRenewalDataNote_(branchId, demand) {
  return 'Renewal DB 找不到 Branch ID「' + branchId + '」' + (demand ? '（Demand：' + demand + '）' : '') +
    '；已保留原始 TPR 方案，需人工確認並補齊 Renewal DB 資料。';
}
function expandGroups_(row) { let current = ''; return row.map(v => { if (v !== '') current = String(v); return current; }); }
function resolveMappings_(maps, groups, headers) {
  const out = {};
  maps.forEach(m => {
    const label = norm_(m['Header Label']), group = norm_(m['Header Group']), occurrence = Number(m['Occurrence'] || 1);
    const matches = headers.map((h, i) => ({ h, i })).filter(x => norm_(x.h) === label && (!group || norm_(groups[x.i]) === group));
    if (matches.length < occurrence) throw new Error('Renewal mapping not found: ' + m['Mapping Key']);
    out[m['Canonical Key']] = matches[occurrence - 1].i;
  });
  return out;
}
function requiredMapping_(map, key) { if (map[key] === undefined) throw new Error('Missing active mapping: ' + key); return map[key]; }

/**
 * Runs the formal, branch-level contract gate.  It never changes the Queue's
 * plan values: it only records whether those values are ready to be used.
 * Human document / seal inspection is deliberately kept in the review tabs;
 * OCR or an unreadable PDF must never be silently counted as proof.
 */
function runContractAudit() {
  const ss = SpreadsheetApp.openById(RENEWAL_QUEUE_TEST_WORKBOOK_ID);
  const queue = ss.getSheetByName('TPR Update Queue');
  if (!queue || queue.getLastRow() < 2) throw new Error('TPR Update Queue has no data. Build Queue first.');
  setupAuditSheets_(ss, queue);

  const controlSheet = ss.getSheetByName('Control');
  ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
  const control = readSettings_(controlSheet);
  const catalogSync = syncPlanCatalog_(ss, control);
  const queueValues = queue.getDataRange().getValues();
  const queueHeaders = queueValues[0].map(String);
  const qx = headerIndex_(queueHeaders);
  const requiredQueueHeaders = ['Check', 'Note', 'Branch ID', '餐廳名稱', '合約', 'Original TPR Row', 'Transformation Status']
    .map(h => requiredHeader_(qx, h, 'Queue', h === '餐廳名稱'));
  const tpr = SpreadsheetApp.openById(control['Original TPR Spreadsheet ID'])
    .getSheetByName(control['Original TPR Tab']);
  if (!tpr) throw new Error('Configured Original TPR tab was not found.');
  const tprValues = tpr.getDataRange().getValues();
  const tx = headerIndex_(tprValues[1].map(String));

  const rows = queueValues.slice(1).map((values, i) => ({ row: i + 2, values }));
  const byBranch = groupBy_(rows, r => auditText_(auditGet_(r.values, qx, 'Branch ID')));
  const origins = loadLegacyBranchOrigins_(ss, control, Object.keys(byBranch));
  const shareOverageSource = shareOverageSourceAudit_(ss, control, byBranch, qx);
  const evidence = indexedReview_(ss.getSheetByName('Contract Evidence Review'), 'Branch ID');
  const plans = indexedReview_(ss.getSheetByName('Plan Classification Review'), 'Branch ID');
  const approvals = indexedReview_(ss.getSheetByName('Special Approval Review'), 'Branch ID');
  const shares = indexedReview_(ss.getSheetByName('Share Group Review'), 'Share Plan ID');
  const bonusReference = loadRsvBonusReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const familyReference = loadRsvFamilyReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const resultRows = [];
  const affectedCatalogChanges = {};
  let readyBranches = 0;

  Object.keys(byBranch).forEach(branchId => {
    const queueRows = byBranch[branchId];
    const oldRows = queueRows.map(r => originalTprRow_(r.values, qx, tprValues, tx)).filter(Boolean);
    const shareOverage = shareOverageSource.byBranch[branchId] || { result: 'Not Applicable', reason: '' };
    const comparison = classifyAction_(oldRows, queueRows, tx, qx, shareOverage);
    const action = comparison.action;
    const planChange = comparison.planChange;
    const ev = evidence[branchId] || {};
    const plan = plans[branchId] || {};
    const approval = approvals[branchId] || {};
    const share = shareAudit_(queueRows, qx, shares, shareOverage);
    const renewalDataMissing = queueRows.some(r => auditText_(auditGet_(r.values, qx, 'Transformation Status')).indexOf('Need Renewal Data') === 0);
    const billing = billingCycleAudit_(ev, queueRows, qx);
    const contract = contractAudit_(ev, planChange, billing, queueRows, qx, control, comparison.reason);
    const bonus = bonusCountAudit_(queueRows, qx, bonusReference, control);
    const origin = origins[branchId] || {};
    const oldPlan = inferRsvPlan_(oldRows, tx, familyReference, shareOverage, origin, { mode:'original' });
    const expectedNewFamily = oldPlan.family === 'Special'
      ? (origin.listed ? 'Public' : 'BD New')
      : oldPlan.family;
    const inferredPlans = {
      oldPlan,
      newPlan: inferRsvPlan_(queueRows.map(r => r.values), qx, familyReference, shareOverage, origin, {
        mode:'renewal', expectedFamily:expectedNewFamily
      })
    };
    const planAudit = planComplianceAudit_(plan, planChange, inferredPlans, origin);
    const special = specialApprovalAudit_(planAudit, approval, hasNonFullYearAnnualRenewal_(queueRows, qx));
    const catalogChange = pendingCatalogChangeAudit_(oldRows, queueRows, tx, qx, catalogSync.pendingChanges, branchId, planAudit);
    (catalogChange.changeIds || []).forEach(changeId => {
      if (!affectedCatalogChanges[changeId]) affectedCatalogChanges[changeId] = new Set();
      affectedCatalogChanges[changeId].add(branchId);
    });
    const sourceDates = originalTprDateAudit_(oldRows, queueRows, tx, qx);
    const longTerm = longTermContractAudit_(queueRows, qx, ev);
    const decision = appendPlanDecisionReason_(
      decideAuditStatus_(renewalDataMissing, catalogChange, sourceDates, longTerm, contract, bonus, planAudit, special, share),
      planAudit
    );
    if (decision.status === 'Ready') readyBranches++;

    queueRows.forEach(r => {
      const output = r.values.slice();
      auditSet_(output, qx, 'Check', decision.status === 'Ready');
      auditSet_(output, qx, 'Note', decision.note);
      auditSet_(output, qx, 'Update Action', action);
      auditSet_(output, qx, 'Plan Change', planChange ? 'Yes' : 'No');
      auditSet_(output, qx, 'Original Plan Family', planAudit.oldFamily || (planChange ? 'Unknown' : 'Not required (original renewal)'));
      auditSet_(output, qx, 'New Plan Family', planAudit.newFamily || (planChange ? 'Unknown' : 'Not required (original renewal)'));
      auditSet_(output, qx, 'Plan Compliance', planAudit.result);
      auditSet_(output, qx, 'Required Evidence', contract.required);
      auditSet_(output, qx, 'Evidence Type', auditText_(ev['Evidence Type']));
      auditSet_(output, qx, 'Inline Seal', auditText_(ev['Inline Seal']));
      auditSet_(output, qx, 'Customer Seal', auditText_(ev['Customer Seal']));
      auditSet_(output, qx, 'Contract Check', contract.result);
      auditSet_(output, qx, 'Special Approval Required', special.required);
      auditSet_(output, qx, 'Special Approval Status', special.status);
      auditSet_(output, qx, 'Share Group Check', share.result);
      auditSet_(output, qx, 'Difference', comparison.reason || (action === 'Maintain' ? '' : action + ': original TPR and Queue key plan conditions differ.'));
      auditSet_(output, qx, 'Update Status', decision.status);
      auditSet_(output, qx, 'Status Reason', decision.reason);
      auditSet_(output, qx, 'Reviewed At', new Date());
      resultRows.push(output);
    });
    writePlanClassificationTrace_(ss.getSheetByName('Plan Classification Review'), branchId, origin, planAudit);
  });

  recordPlanChangeAffectedBranches_(ss.getSheetByName('Plan Catalog Change Review'), affectedCatalogChanges);

  queue.getRange(2, 1, resultRows.length, queueHeaders.length).setValues(resultRows);
  queue.getRange(2, requiredHeader_(qx, 'Check', 'Queue') + 1, resultRows.length, 1)
    .clearDataValidations().insertCheckboxes();
  appendAudit_(ss.getSheetByName('Audit Log'), 'AUDIT-' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss'), '', resultRows.length, [], [], 'Contract Audit');
  notify_('Contract audit completed. Ready branches: ' + readyBranches + ' / ' + Object.keys(byBranch).length +
    '. Review tabs must explicitly confirm document, plan, special approval and Share evidence before Check can be TRUE.');
}

function setupAuditSheets_(ss, queue) {
  ensureReviewSheet_(ss, 'Contract Evidence Review', EVIDENCE_REVIEW_HEADERS);
  ensureReviewSheet_(ss, 'Plan Classification Review', PLAN_REVIEW_HEADERS);
  ensureReviewSheet_(ss, 'Special Approval Review', SPECIAL_REVIEW_HEADERS);
  ensureReviewSheet_(ss, 'Share Group Review', SHARE_REVIEW_HEADERS);
  const values = queue.getDataRange().getValues();
  if (values.length < 2) return;
  const ix = headerIndex_(values[0].map(String));
  const branches = {};
  values.slice(1).forEach(r => {
    const id = auditText_(auditGet_(r, ix, 'Branch ID'));
    if (!id) return;
    if (!branches[id]) branches[id] = auditText_(auditGet_(r, ix, '合約'));
  });
  appendMissingReviewRows_(ss.getSheetByName('Contract Evidence Review'), Object.keys(branches), id => [id, branches[id]]);
  appendMissingReviewRows_(ss.getSheetByName('Plan Classification Review'), Object.keys(branches), id => [id]);
  appendMissingReviewRows_(ss.getSheetByName('Special Approval Review'), Object.keys(branches), id => [id]);
  const shareIds = [...new Set(values.slice(1).map(r => auditText_(auditGet_(r, ix, 'Share Plan ID'))).filter(Boolean))];
  appendMissingReviewRows_(ss.getSheetByName('Share Group Review'), shareIds, id => [id]);
}

function ensureSettings_(sheet, settings) {
  if (!sheet) throw new Error('Control sheet was not found.');
  const values = sheet.getDataRange().getValues();
  const existing = new Set(values.slice(1).map(r => auditText_(r[0])).filter(Boolean));
  const missing = settings.filter(r => !existing.has(r[0]));
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
}

function syncPlanCatalog_(ss, control) {
  const sourceSpreadsheetId = auditText_(control['RSV Plan Reference Spreadsheet ID']);
  const sourceTab = auditText_(control['RSV Plan Reference Tab']);
  const codeHeader = auditText_(control['RSV Plan Code Header']) || 'Plan Code';
  if (!sourceSpreadsheetId || !sourceTab) throw new Error('RSV plan-reference source is not configured.');

  const sourceSheet = SpreadsheetApp.openById(sourceSpreadsheetId).getSheetByName(sourceTab);
  if (!sourceSheet) throw new Error('RSV plan-reference tab was not found: ' + sourceTab);
  const sourcePlans = readAndAssignPlanCodes_(sourceSheet, sourceSpreadsheetId, sourceTab, codeHeader);
  const catalogSheet = ensureReviewSheet_(ss, 'Canonical Plan Catalog', CANONICAL_PLAN_HEADERS);
  const changeSheet = ensureReviewSheet_(ss, 'Plan Catalog Change Review', PLAN_CHANGE_HEADERS);
  const existingCatalog = readTable_(catalogSheet);
  const existingChanges = readTable_(changeSheet);
  const now = new Date();

  if (!existingCatalog.length) {
    const baseline = sourcePlans.map(plan => canonicalPlanRowObject_(plan, 1, 'Active', now, '', now));
    replaceManagedTable_(catalogSheet, CANONICAL_PLAN_HEADERS, baseline.map(objectRow_(CANONICAL_PLAN_HEADERS)));
    syncPlanReferenceMapping_(ss.getSheetByName('Plan Reference Mapping'), sourceSpreadsheetId, sourceTab, codeHeader);
    syncPlanReferenceSnapshot_(ss.getSheetByName('Plan Reference Snapshot'), baseline);
    return { activePlans: baseline, pendingChanges: [] };
  }

  const catalog = existingCatalog.map(normalizeCanonicalPlanRow_).filter(Boolean);
  const changes = existingChanges.map(normalizePlanChangeRow_).filter(Boolean);
  const latestByCode = {};
  catalog.forEach(row => {
    if (!latestByCode[row.planCode] || row.version > latestByCode[row.planCode].version) latestByCode[row.planCode] = row;
  });
  const sourceByCode = {};
  sourcePlans.forEach(plan => { sourceByCode[plan.planCode] = plan; });
  const pending = [];

  sourcePlans.forEach(plan => {
    const prior = latestByCode[plan.planCode];
    if (!prior) {
      const added = canonicalPlanRowObject_(plan, 1, 'Active', now, '', now);
      catalog.push(added);
      latestByCode[plan.planCode] = added;
      upsertPlanChangeObject_(changes, {
        changeId: planChangeId_(plan.planCode, 'Add', '', planRecordJson_(plan)),
        planCode: plan.planCode,
        changeType: 'Add',
        detectedAt: now,
        oldVersion: '',
        oldValuesJson: '',
        newValuesJson: planRecordJson_(plan),
        approvalStatus: 'Auto Approved',
        reviewer: 'System',
        reviewedAt: now,
        notes: '新增方案自動建立永久 Plan Code。',
        affectedBranchIds: '',
        appliedAt: now
      });
      return;
    }

    prior.sourceRow = plan.sourceRow;
    if (planRecordJson_(prior) === planRecordJson_(plan) && prior.status === 'Active') return;
    const oldJson = planRecordJson_(prior);
    const newJson = planRecordJson_(plan);
    const changeId = planChangeId_(plan.planCode, 'Modify', oldJson, newJson);
    const change = upsertPlanChangeObject_(changes, {
      changeId,
      planCode: plan.planCode,
      changeType: 'Modify',
      detectedAt: now,
      oldVersion: prior.version,
      oldValuesJson: oldJson,
      newValuesJson: newJson,
      approvalStatus: 'Pending',
      reviewer: '', reviewedAt: '', notes: '', affectedBranchIds: '', appliedAt: ''
    });
    if (planChangeApproved_(change)) {
      prior.status = 'Superseded';
      prior.effectiveTo = now;
      const next = canonicalPlanRowObject_(plan, prior.version + 1, 'Active', now, '', now);
      catalog.push(next);
      latestByCode[plan.planCode] = next;
      change.appliedAt = change.appliedAt || now;
    } else {
      pending.push(change);
    }
  });

  Object.keys(latestByCode).forEach(planCode => {
    const prior = latestByCode[planCode];
    if (sourceByCode[planCode] || prior.status !== 'Active') return;
    const oldJson = planRecordJson_(prior);
    const changeId = planChangeId_(planCode, 'Deactivate', oldJson, '');
    const change = upsertPlanChangeObject_(changes, {
      changeId,
      planCode,
      changeType: 'Deactivate',
      detectedAt: now,
      oldVersion: prior.version,
      oldValuesJson: oldJson,
      newValuesJson: '',
      approvalStatus: 'Pending',
      reviewer: '', reviewedAt: '', notes: '', affectedBranchIds: '', appliedAt: ''
    });
    if (planChangeApproved_(change)) {
      prior.status = 'Inactive';
      prior.effectiveTo = now;
      change.appliedAt = change.appliedAt || now;
    } else {
      pending.push(change);
    }
  });

  replaceManagedTable_(catalogSheet, CANONICAL_PLAN_HEADERS,
    catalog.sort((a, b) => a.planCode.localeCompare(b.planCode) || a.version - b.version)
      .map(objectRow_(CANONICAL_PLAN_HEADERS)));
  replaceManagedTable_(changeSheet, PLAN_CHANGE_HEADERS,
    changes.sort((a, b) => auditText_(a.detectedAt).localeCompare(auditText_(b.detectedAt)))
      .map(objectRow_(PLAN_CHANGE_HEADERS)));
  const active = catalog.filter(row => row.status === 'Active');
  syncPlanReferenceMapping_(ss.getSheetByName('Plan Reference Mapping'), sourceSpreadsheetId, sourceTab, codeHeader);
  syncPlanReferenceSnapshot_(ss.getSheetByName('Plan Reference Snapshot'), active);
  return { activePlans: active, pendingChanges: pending };
}

function readAndAssignPlanCodes_(sheet, spreadsheetId, sourceSheet, codeHeader) {
  let lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('TMS plan source has no header row.');
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  let codeColumn = headers.findIndex(h => norm_(h) === norm_(codeHeader));
  const codeHeaderMissing = codeColumn < 0;
  if (codeHeaderMissing) codeColumn = lastColumn;
  const ix = headerIndex_(headers);
  const columns = {
    catalog: requiredHeader_(ix, 'Source Tab', 'TMS plan source'),
    billing: requiredHeader_(ix, '繳款週期', 'TMS plan source'),
    product: requiredHeader_(ix, '產品', 'TMS plan source'),
    sets: requiredHeader_(ix, '使用組數', 'TMS plan source'),
    bonus: requiredHeader_(ix, '贈送組數', 'TMS plan source'),
    price: requiredHeader_(ix, '月費 / 年費', 'TMS plan source'),
    overage: requiredHeader_(ix, '每組超額單價', 'TMS plan source')
  };
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) throw new Error('TMS plan source has no data rows.');
  const values = sheet.getRange(2, 1, rowCount, lastColumn).getValues();
  const usedCodes = values.map(r => auditText_(r[codeColumn])).filter(Boolean);
  const duplicates = usedCodes.filter((code, i) => usedCodes.indexOf(code) !== i);
  if (duplicates.length) throw new Error('Duplicate Plan Code in TMS plan source: ' + [...new Set(duplicates)].join(', '));
  let next = usedCodes.reduce((max, code) => {
    const match = code.match(/^TMS-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const plans = [];
  const invalidRows = [];
  values.forEach((row, i) => {
    const sourceCatalog = auditText_(row[columns.catalog]);
    const family = sourceCatalog === 'BD 新方案' ? 'BD New' :
      ['公版方案', 'Lite 方案', 'Email Only 方案'].includes(sourceCatalog) ? 'Public' : '';
    if (!family) return;
    const billing = referenceBillingPeriod_(row[columns.billing]);
    const productText = auditText_(row[columns.product]).toLowerCase();
    const product = productText === 'rwg' ? 'RwG' : productText === 'rsv' ? 'RSV' : '';
    const sets = referenceReservationSets_(row[columns.sets]);
    const price = auditNumber_(row[columns.price]);
    const problems = [];
    if (!billing) problems.push('繳款週期「' + (auditText_(row[columns.billing]) || '空白') + '」目前不支援（僅 monthly／annual）');
    if (!product) problems.push('產品「' + (auditText_(row[columns.product]) || '空白') + '」目前不支援（僅 RSV／RwG）');
    if (sets === null) problems.push('使用組數空白或無法判讀');
    if (price === null) problems.push('月費 / 年費空白或無法判讀');
    if (problems.length) {
      invalidRows.push(sourceSheet + '!' + (i + 2) + '：' + problems.join('、'));
      return;
    }
    let planCode = auditText_(row[codeColumn]);
    if (!planCode) {
      planCode = 'TMS-' + ('0000' + next).slice(-4);
      next++;
      row[codeColumn] = planCode;
    }
    plans.push({
      planCode, family, sourceCatalog, billing, product, sets,
      bonus: auditNumber_(row[columns.bonus]) === null ? 0 : auditNumber_(row[columns.bonus]),
      price, overage: auditNumber_(row[columns.overage]),
      sourceSpreadsheetId: spreadsheetId, sourceSheet, sourceRow: i + 2
    });
  });
  if (invalidRows.length) {
    throw new Error('TMS plan source contains invalid official Catalog rows: ' + invalidRows.join('；'));
  }
  if (!plans.length) throw new Error('TMS plan source contains no supported Public／BD New RSV／RwG plans.');
  if (codeHeaderMissing) {
    sheet.getRange(1, lastColumn).copyTo(sheet.getRange(1, codeColumn + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sheet.getRange(1, codeColumn + 1).setValue(codeHeader);
  }
  sheet.getRange(2, codeColumn + 1, rowCount, 1).setValues(values.map(r => [r[codeColumn]]));
  return plans;
}

function canonicalPlanRowObject_(plan, version, status, effectiveFrom, effectiveTo, importedAt) {
  return {
    planCode: plan.planCode, version, status, family: plan.family,
    sourceCatalog: plan.sourceCatalog, billing: plan.billing, product: plan.product,
    sets: plan.sets, bonus: plan.bonus, price: plan.price, overage: plan.overage,
    sourceSpreadsheetId: plan.sourceSpreadsheetId, sourceSheet: plan.sourceSheet,
    sourceRow: plan.sourceRow, effectiveFrom, effectiveTo, importedAt,
    recordJson: planRecordJson_(plan)
  };
}

function normalizeCanonicalPlanRow_(row) {
  const planCode = auditText_(row['Plan Code']);
  if (!planCode) return null;
  return {
    planCode, version: Number(row['Version'] || 1), status: auditText_(row['Status']),
    family: normalPlanFamily_(row['Plan Family']), sourceCatalog: auditText_(row['Source Catalog']),
    billing: referenceBillingPeriod_(row['Billing Period']), product: auditText_(row['Product']),
    sets: referenceReservationSets_(row['Usage Sets']),
    bonus: auditNumber_(row['Bonus Sets']) === null ? 0 : auditNumber_(row['Bonus Sets']),
    price: auditNumber_(row['Price']), overage: auditNumber_(row['Overage Unit Price']),
    sourceSpreadsheetId: auditText_(row['Source Spreadsheet ID']), sourceSheet: auditText_(row['Source Sheet']),
    sourceRow: Number(row['Source Row'] || 0), effectiveFrom: row['Effective From'], effectiveTo: row['Effective To'],
    importedAt: row['Imported At'], recordJson: auditText_(row['Record JSON'])
  };
}

function planRecordJson_(plan) {
  return JSON.stringify({
    family: plan.family, sourceCatalog: plan.sourceCatalog, billing: plan.billing,
    product: plan.product, sets: plan.sets, bonus: plan.bonus,
    price: plan.price, overage: plan.overage
  });
}

function normalizePlanChangeRow_(row) {
  const changeId = auditText_(row['Change ID']);
  if (!changeId) return null;
  return {
    changeId, planCode: auditText_(row['Plan Code']), changeType: auditText_(row['Change Type']),
    detectedAt: row['Detected At'], oldVersion: row['Old Version'], oldValuesJson: auditText_(row['Old Values JSON']),
    newValuesJson: auditText_(row['New Values JSON']), approvalStatus: auditText_(row['Approval Status']),
    reviewer: auditText_(row['Reviewer']), reviewedAt: row['Reviewed At'], notes: auditText_(row['Notes']),
    affectedBranchIds: auditText_(row['Affected Branch IDs']), appliedAt: row['Applied At']
  };
}

function upsertPlanChangeObject_(changes, defaults) {
  let row = changes.find(change => change.changeId === defaults.changeId);
  if (!row) {
    row = defaults;
    changes.push(row);
    return row;
  }
  ['planCode', 'changeType', 'oldVersion', 'oldValuesJson', 'newValuesJson'].forEach(key => { row[key] = defaults[key]; });
  return row;
}

function planChangeApproved_(change) {
  return auditText_(change.approvalStatus).toLowerCase() === 'approved' &&
    !!auditText_(change.reviewer) && !!change.reviewedAt;
}

function planChangeId_(planCode, type, oldJson, newJson) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, type + '|' + oldJson + '|' + newJson)
    .slice(0, 6).map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
  return 'PLANCHANGE-' + planCode + '-' + digest;
}

function objectRow_(headers) {
  const keys = {
    'Plan Code':'planCode','Version':'version','Status':'status','Plan Family':'family','Source Catalog':'sourceCatalog',
    'Billing Period':'billing','Product':'product','Usage Sets':'sets','Bonus Sets':'bonus','Price':'price',
    'Overage Unit Price':'overage','Source Spreadsheet ID':'sourceSpreadsheetId','Source Sheet':'sourceSheet',
    'Source Row':'sourceRow','Effective From':'effectiveFrom','Effective To':'effectiveTo','Imported At':'importedAt','Record JSON':'recordJson',
    'Change ID':'changeId','Change Type':'changeType','Detected At':'detectedAt','Old Version':'oldVersion',
    'Old Values JSON':'oldValuesJson','New Values JSON':'newValuesJson','Approval Status':'approvalStatus',
    'Reviewer':'reviewer','Reviewed At':'reviewedAt','Notes':'notes','Affected Branch IDs':'affectedBranchIds','Applied At':'appliedAt'
  };
  return object => headers.map(header => object[keys[header]] === undefined ? '' : object[keys[header]]);
}

function replaceManagedTable_(sheet, headers, rows) {
  const clearRows = Math.max(sheet.getLastRow() - 1, rows.length);
  if (clearRows > 0) sheet.getRange(2, 1, clearRows, headers.length).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function syncPlanReferenceMapping_(sheet, sourceSpreadsheetId, sourceTab, codeHeader) {
  if (!sheet) throw new Error('Plan Reference Mapping sheet was not found.');
  const preserved = readTable_(sheet)
    .filter(row => !/^Plan\.RSV(?:\.|$)/i.test(auditText_(row['Mapping ID'])))
    .map(row => PLAN_REFERENCE_MAPPING_HEADERS.map(header => row[header] === undefined ? '' : row[header]));
  const common = ['RSV Public / RSV BD New', sourceSpreadsheetId, sourceTab, 'Row package', 1, 2, ''];
  const rows = [
    ['Plan.RSV.SourceCatalog'].concat(common, ['Source Tab', 'source_catalog', 'text', '公版方案 = Public；BD 新方案 = BD New', 'Yes', 'Yes', 'Source Catalog 決定方案家族', 'Active', '每個來源列是一個不可拆分的完整方案']),
    ['Plan.RSV.PlanCode'].concat(common, [codeHeader, 'plan_code', 'text', '永久代碼；既有方案不得換碼', 'No', 'No', 'No', 'Active', '新增方案才建立新 Plan Code；異動沿用原代碼並建立新版本']),
    ['Plan.RSV.Billing'].concat(common, ['繳款週期', 'billing_period', 'text', '目前支援 monthly／annual；6mo／3mo 需人工確認', 'Yes', 'Yes', 'No', 'Active', '']),
    ['Plan.RSV.Product'].concat(common, ['產品', 'product', 'text', '目前支援 RSV／RwG', 'Yes', 'Yes', 'No', 'Active', '']),
    ['Plan.RSV.Usage'].concat(common, ['使用組數', 'usage_sets', 'number', 'unlimited 保留為 unlimited', 'Yes', 'Yes', 'No', 'Active', '']),
    ['Plan.RSV.Bonus'].concat(common, ['贈送組數', 'free_reservations', 'number', 'blank = 0', 'Yes', 'Yes', 'No', 'Active', '']),
    ['Plan.RSV.Price'].concat(common, ['月費 / 年費', 'plan_price', 'currency', '移除幣別與千分位', 'Yes', 'Yes', 'No', 'Active', '']),
    ['Plan.RSV.Overage'].concat(common, ['每組超額單價', 'overage_unit_price', 'number', '保留小數', 'Yes', 'Yes', 'No', 'Active', ''])
  ];
  replaceManagedTable_(sheet, PLAN_REFERENCE_MAPPING_HEADERS, rows.concat(preserved));
}

function syncPlanReferenceSnapshot_(sheet, activePlans) {
  if (!sheet) throw new Error('Plan Reference Snapshot sheet was not found.');
  const headers = ['Snapshot ID','Plan Family','Source Spreadsheet ID','Source Tab','Source Row','Imported At','Raw Values JSON','Normalized Combination ID','Special Plan Flag'];
  const existing = readTable_(sheet).filter(row => !/^RSV\b/i.test(auditText_(row['Plan Family'])));
  const importedAt = new Date();
  const rsvRows = activePlans.map(plan => [
    plan.planCode + '-V' + plan.version,
    plan.family === 'BD New' ? 'RSV BD New' : 'RSV Public',
    plan.sourceSpreadsheetId, plan.sourceSheet, plan.sourceRow, importedAt,
    JSON.stringify({ values: [plan.sourceCatalog, plan.billing, plan.product, plan.sets, plan.bonus, plan.price, plan.overage], sourceRows: [plan.sourceRow] }),
    plan.planCode, ''
  ]);
  const preserved = existing.map(row => headers.map(header => row[header] === undefined ? '' : row[header]));
  replaceManagedTable_(sheet, headers, rsvRows.concat(preserved));
}

function loadLegacyBranchOrigins_(ss, control, branchIds) {
  const targetIds = [...new Set((branchIds || []).map(auditText_).filter(Boolean))];
  const target = new Set(targetIds);
  const sheetName = auditText_(control['Legacy Branch Master Tab']) || 'Legacy Branch Master';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Legacy Branch Master tab was not found: ' + sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Legacy Branch Master has no header row.');
  const ix = headerIndex_(values[0].map(String));
  const branchColumn = requiredHeader_(ix, control['Legacy Branch ID Header'] || 'Branch ID', sheetName);
  const startColumn = findHeader_(ix, control['Legacy First Contract Date Header'] || 'first contract date');
  const reasonColumn = findHeader_(ix, 'Reason') !== null ? findHeader_(ix, 'Reason') : findHeader_(ix, 'Notes');
  const found = {};
  values.slice(1).forEach((row, index) => {
    const branchId = auditText_(row[branchColumn]);
    if (!branchId || !target.has(branchId)) return;
    if (!found[branchId]) found[branchId] = [];
    found[branchId].push({
      row: index + 2,
      firstContractStart: startColumn === null ? null : dateFromCell_(row[startColumn]),
      firstContractRaw: startColumn === null ? '' : auditText_(row[startColumn]),
      reason: reasonColumn === null ? '' : auditText_(row[reasonColumn])
    });
  });
  const out = {};
  targetIds.forEach(branchId => {
    const entries = found[branchId] || [];
    if (entries.length) {
      const rows = entries.map(entry => entry.row);
      const dateDetails = entries.map(entry => entry.firstContractRaw || '空白').join('／');
      const reasons = [...new Set(entries.map(entry => entry.reason).filter(Boolean))];
      out[branchId] = {
        listed: true,
        duplicate: entries.length > 1,
        conflict: entries.length > 1
          ? 'Legacy Branch Master 的 Branch ID「' + branchId + '」重複出現在第 ' + rows.join('、') + ' 列（首約日：' + dateDetails + '），需人工整理名單'
          : '',
        firstContractStart: entries[0].firstContractStart,
        firstContractRaw: entries[0].firstContractRaw,
        status: entries.length > 1 ? 'Duplicate Legacy Membership' : 'Listed in Legacy Master',
        sourceMode: 'Listed in Legacy Master',
        source: sheetName + '!' + rows.join(',') + (reasons.length ? '；Reason：' + reasons.join('／') : '')
      };
      return;
    }
    out[branchId] = {
      listed: false,
      duplicate: false,
      conflict: '',
      firstContractStart: null,
      firstContractRaw: '',
      status: 'Not Listed in Legacy Master',
      sourceMode: 'Not Listed in Legacy Master',
      source: '不在 ' + sheetName + '；依舊方案完整組合判斷家族'
    };
  });
  return out;
}

function ensureReviewSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  if (!headers.every((h, i) => current[i] === h)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendMissingReviewRows_(sheet, ids, makeRow) {
  const existing = new Set(sheet.getDataRange().getValues().slice(1).map(r => auditText_(r[0])).filter(Boolean));
  const missing = ids.filter(id => !existing.has(id));
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, makeRow(missing[0]).length)
    .setValues(missing.map(makeRow));
}

function indexedReview_(sheet, keyHeader) {
  const values = sheet.getDataRange().getValues();
  const ix = headerIndex_(values[0].map(String));
  const key = requiredHeader_(ix, keyHeader, sheet.getName());
  const out = {};
  values.slice(1).forEach(row => {
    const id = auditText_(row[key]);
    if (!id || out[id]) return;
    out[id] = values[0].reduce((o, h, i) => (o[String(h)] = row[i], o), {});
  });
  return out;
}

function originalTprRow_(queueRow, qx, tprValues, tx) {
  const marker = auditText_(auditGet_(queueRow, qx, 'Original TPR Row'));
  const match = marker.match(/!(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 2 && index < tprValues.length ? tprValues[index] : null;
}

function classifyAction_(oldRows, queueRows, tx, qx, shareOverage) {
  if (!oldRows.length) return { action: 'Need Check', planChange: true, reason: '找不到原始 TPR 列，無法判斷是否為原方案續約。' };
  const signatureOptions = { ignoreShareOverage: shareOverage && shareOverage.result === 'Pass' };
  const rawOldSignatures = oldRows.map(row => planSignature_(row, tx));
  const rawNewSignatures = queueRows.map(r => planSignature_(r.values, qx));
  if (sameMultiset_(rawOldSignatures, rawNewSignatures)) return { action: 'Maintain', planChange: false, reason: '' };
  const oldSignatures = oldRows.map(row => planSignature_(row, tx, signatureOptions));
  const newSignatures = queueRows.map(r => planSignature_(r.values, qx, signatureOptions));
  if (sameMultiset_(oldSignatures, newSignatures)) {
    return {
      action: 'Maintain',
      planChange: false,
      reason: '原方案續約：Share Plan 超額單價依組內最高值統一，不視為換方案。'
    };
  }
  const oldNormalizationOptions = Object.assign({}, signatureOptions, { billingNormalizationSide:'original' });
  const newNormalizationOptions = Object.assign({}, signatureOptions, { billingNormalizationSide:'renewal' });
  const oldNormalized = oldRows.map(row => normalizedPlanSignature_(row, tx, oldNormalizationOptions));
  const newNormalized = queueRows.map(r => normalizedPlanSignature_(r.values, qx, newNormalizationOptions));
  if (sameMultiset_(oldNormalized, newNormalized)) {
    return {
      action: 'Maintain',
      planChange: false,
      reason: signatureOptions.ignoreShareOverage
        ? '原方案續約：Share Plan 超額單價依組內最高值統一，不視為換方案。'
        : '原方案續約：僅附加服務付款週期依續約規則正規化，不視為換方案。'
    };
  }
  if (isProratedOriginalRenewal_(oldRows, queueRows, tx, qx)) {
    return { action: 'Maintain', planChange: false, reason: '原方案續約：原合約為短約，年費與組數符合實際日曆月份天數的 prorate 換算；續約改為完整一年。' };
  }
  const oldKeys = oldRows.map(row => productKey_(row, tx));
  const newKeys = queueRows.map(r => productKey_(r.values, qx));
  const reason = planDifferenceSummary_(oldRows, queueRows, tx, qx, signatureOptions);
  if (newKeys.some(k => !oldKeys.includes(k))) return { action: 'Add', planChange: true, reason };
  if (oldKeys.some(k => !newKeys.includes(k))) return { action: 'Close/Remove', planChange: true, reason };
  return { action: 'Update', planChange: true, reason };
}

function planSignature_(row, ix, options) {
  const ignoreShareOverage = shouldIgnoreShareOverage_(row, ix, options);
  // Renewal dates naturally change every term.  They are checked against the
  // evidence separately and are not part of the commercial-plan identity.
  const labels = ['產品', '付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  return labels.map(h => {
    if (h === '超額每組單價' && ignoreShareOverage) return '';
    return auditText_(auditGet_(row, ix, h,
      h === '產品' || h.indexOf('合約') === 0 || h.indexOf('付款週期') === 0 || h.indexOf('超額') === 0
    ));
  }).join('¦');
}
function normalizedPlanSignature_(row, ix, options) {
  const labels = ['產品', '付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  return labels.map(h => normalizedPlanFieldValue_(row, ix, h, options)).join('¦');
}
function normalizedPlanFieldValue_(row, ix, label, options) {
  const product = auditText_(auditGet_(row, ix, '產品', true));
  const billingCycle = auditText_(auditGet_(row, ix, '付款週期', true)).toLowerCase();
  const overageMethod = auditText_(auditGet_(row, ix, '超額計算方式', true)).toUpperCase();
  const reservationSets = auditText_(auditGet_(row, ix, '合約組數', true)).toLowerCase();
  const value = auditGet_(row, ix, label,
    label === '產品' || label.indexOf('合約') === 0 || label.indexOf('付款週期') === 0 || label.indexOf('超額') === 0
  );
  // Billing normalization is directional.  Only an original monthly add-on
  // may be represented as annual at renewal; annual -> monthly remains a
  // real payment-cycle change and must not be normalized away.
  if (label === '付款週期' && !isMainProduct_(product)) {
    if (options && options.billingNormalizationSide === 'original' && billingCycle === 'monthly') return 'annual';
    return billingCycle;
  }
  if (label === '超額每組單價' && shouldIgnoreShareOverage_(row, ix, options)) return '';
  // A blank RSV/RwG gift count and numeric zero both mean that no free groups
  // are included.  This equivalence is intentionally limited to the main
  // product so missing Deposit-Commission values are never hidden.
  if (label === '合約贈送組數' && isMainProduct_(product)) {
    const number = auditNumber_(value);
    if (auditText_(value) === '' || number === 0) return '0';
  }
  // Deposit reuses TPR fields for two different business values:
  // - B2B gift-count stores the transaction-service percentage.
  // - overage-unit-price stores the setup fee.
  // In both cases blank and numeric zero mean that the fee is not charged.
  // Keep this equivalence limited to Deposit so a missing
  // Deposit-Commission percentage can never be hidden.
  if (product === 'Deposit' &&
      ((label === '合約贈送組數' && overageMethod === 'B2B') || label === '超額每組單價')) {
    const number = auditNumber_(value);
    if (auditText_(value) === '' || number === 0) return '0';
  }
  // Unlimited RSV/RwG has no applicable per-set overage price.  Historical
  // TPR may leave the field blank while Renewal DB explicitly stores zero.
  if (label === '超額每組單價' && isMainProduct_(product) && reservationSets === 'unlimited') {
    const number = auditNumber_(value);
    if (auditText_(value) === '' || number === 0) return '0';
  }
  // Renewal DB annualizes a positive monthly add-on charge when the main
  // product is annual (for example Deposit 1,500/month becomes 18,000/year).
  // Compare those two representations on the same annual basis so this
  // approved billing normalization is not mistaken for a plan change.
  if (label === '合約價格' && !isMainProduct_(product) && billingCycle === 'monthly' &&
      options && options.billingNormalizationSide === 'original') {
    const monthly = Number(value);
    if (isFinite(monthly) && auditText_(value) !== '') return auditText_(monthly * 12);
  }
  if (label === '合約起始日' || label === '合約結束日') return auditDateText_(value) || auditText_(value);
  return auditText_(value);
}
function planDifferenceSummary_(oldRows, queueRows, tx, qx, options) {
  const fields = ['付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  const oldByProduct = groupBy_(oldRows, row => auditText_(auditGet_(row, tx, '產品', true)));
  const newByProduct = groupBy_(queueRows.map(r => r.values), row => auditText_(auditGet_(row, qx, '產品', true)));
  const products = [...new Set(Object.keys(oldByProduct).concat(Object.keys(newByProduct)))].sort();
  const differences = [];
  products.forEach(product => {
    const oldGroup = (oldByProduct[product] || []).slice().sort((a, b) =>
      planSignature_(a, tx, options).localeCompare(planSignature_(b, tx, options))
    );
    const newGroup = (newByProduct[product] || []).slice().sort((a, b) =>
      planSignature_(a, qx, options).localeCompare(planSignature_(b, qx, options))
    );
    const paired = Math.min(oldGroup.length, newGroup.length);
    for (let i = 0; i < paired; i++) {
      fields.forEach(label => {
        const oldPeriod = auditText_(auditGet_(oldGroup[i], tx, '付款週期', true)).toLowerCase();
        const newPeriod = auditText_(auditGet_(newGroup[i], qx, '付款週期', true)).toLowerCase();
        const normalizeMonthlyToAnnual = !isMainProduct_(product) && oldPeriod === 'monthly' && newPeriod === 'annual';
        const oldOptions = normalizeMonthlyToAnnual
          ? Object.assign({}, options || {}, { billingNormalizationSide:'original' })
          : options;
        const newOptions = normalizeMonthlyToAnnual
          ? Object.assign({}, options || {}, { billingNormalizationSide:'renewal' })
          : options;
        const oldNormalized = normalizedPlanFieldValue_(oldGroup[i], tx, label, oldOptions);
        const newNormalized = normalizedPlanFieldValue_(newGroup[i], qx, label, newOptions);
        if (oldNormalized === newNormalized) return;
        differences.push(
          product + (paired > 1 ? ' #' + (i + 1) : '') + ' ' + label + '：原始 TPR「' +
          displayPlanFieldValue_(oldGroup[i], tx, label) + '」→ Renewal DB／Queue「' +
          displayPlanFieldValue_(newGroup[i], qx, label) + '」'
        );
      });
    }
    if (newGroup.length > oldGroup.length) {
      differences.push('新增產品：' + product + '（' + (newGroup.length - oldGroup.length) + ' 列）');
    }
    if (oldGroup.length > newGroup.length) {
      differences.push('移除產品：' + product + '（' + (oldGroup.length - newGroup.length) + ' 列）');
    }
  });
  return differences.length ? '方案差異：' + differences.join('；') : '原始 TPR 與 Renewal DB／Queue 的方案內容不同，需人工確認。';
}
function displayPlanFieldValue_(row, ix, label) {
  const value = auditGet_(row, ix, label,
    label.indexOf('合約') === 0 || label.indexOf('付款週期') === 0 || label.indexOf('超額') === 0
  );
  if (label === '合約起始日' || label === '合約結束日') return auditDateText_(value) || auditText_(value) || '空白';
  return auditText_(value) || '空白';
}
function shouldIgnoreShareOverage_(row, ix, options) {
  if (!options || !options.ignoreShareOverage) return false;
  const product = auditText_(auditGet_(row, ix, '產品', true));
  const shareId = auditText_(auditGet_(row, ix, 'Share Plan ID'));
  return isMainProduct_(product) && !!shareId;
}
function isMainProduct_(product) { return ['RSV', 'RwG'].includes(String(product)); }
function isProratedOriginalRenewal_(oldRows, queueRows, tx, qx) {
  const oldMain = oldRows.find(r => isMainProduct_(auditText_(auditGet_(r, tx, '產品', true))));
  const newMain = queueRows.find(r => isMainProduct_(auditText_(auditGet_(r.values, qx, '產品', true))));
  if (!oldMain || !newMain) return false;
  if (auditText_(auditGet_(newMain.values, qx, '付款週期', true)).toLowerCase() !== 'annual') return false;
  const oldStart = dateFromCell_(auditGet_(oldMain, tx, '合約起始日', true));
  const oldEnd = dateFromCell_(auditGet_(oldMain, tx, '合約結束日', true));
  const newStart = dateFromCell_(auditGet_(newMain.values, qx, '合約起始日', true));
  const newEnd = dateFromCell_(auditGet_(newMain.values, qx, '合約結束日', true));
  if (!oldStart || !oldEnd || !newStart || !newEnd || isFullYearTerm_(oldStart, oldEnd) || !isFullYearTerm_(newStart, newEnd)) return false;
  const factor = calendarProrateFactor_(oldStart, oldEnd);
  if (factor <= 0 || factor >= 12) return false;
  const newByKey = {};
  queueRows.forEach(r => { newByKey[productKey_(r.values, qx)] = r.values; });
  return oldRows.every(oldRow => {
    const newRow = newByKey[productKey_(oldRow, tx)];
    if (!newRow || !sameProrateBase_(oldRow, newRow, tx, qx)) return false;
    return ['合約價格', '合約組數'].every(h => proratedValueMatches_(auditGet_(oldRow, tx, h, true), auditGet_(newRow, qx, h, true), factor));
  });
}
function sameProrateBase_(oldRow, newRow, tx, qx) {
  return ['產品', '合約贈送組數', 'Share Plan ID', '超額計算方式', '超額每組單價'].every(h =>
    auditText_(auditGet_(oldRow, tx, h, h === '產品' || h.indexOf('合約') === 0 || h.indexOf('超額') === 0)) ===
    auditText_(auditGet_(newRow, qx, h, h === '產品' || h.indexOf('合約') === 0 || h.indexOf('超額') === 0)));
}
function proratedValueMatches_(oldValue, annualValue, factor) {
  if (auditText_(oldValue) === '' && auditText_(annualValue) === '') return true;
  const oldNumber = Number(oldValue); const annualNumber = Number(annualValue);
  if (!isFinite(oldNumber) || !isFinite(annualNumber)) return false;
  // Contract amounts and paid reservation sets are calculated precisely across
  // calendar months, then rounded once at the final result.
  return Math.abs(oldNumber - Math.round(annualNumber / 12 * factor)) <= 0.000001;
}
function dateFromCell_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const m = auditText_(value).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
function auditDateText_(value) {
  // Sheet date cells are Date objects representing local midnight in the
  // spreadsheet time zone.  Normalize their local Y/M/D through
  // dateFromCell_ before formatting in UTC, otherwise Taiwan dates are
  // displayed and compared as the previous day.
  const date = dateFromCell_(value);
  if (!date || isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}
function isFullYearTerm_(start, end) {
  const expectedEnd = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate() - 1));
  return end.getTime() === expectedEnd.getTime();
}
function calendarProrateFactor_(start, end) {
  if (end < start) return 0;
  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return (end.getUTCDate() - start.getUTCDate() + 1) / daysInUtcMonth_(start);
  }
  const firstDays = daysInUtcMonth_(start) - start.getUTCDate() + 1;
  const lastDays = end.getUTCDate();
  const fullMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() - 1;
  return firstDays / daysInUtcMonth_(start) + Math.max(0, fullMonths) + lastDays / daysInUtcMonth_(end);
}
function daysInUtcMonth_(date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); }
function hasNonFullYearAnnualRenewal_(queueRows, qx) {
  return queueRows.some(r => {
    const product = auditText_(auditGet_(r.values, qx, '產品', true));
    if (!isMainProduct_(product) || auditText_(auditGet_(r.values, qx, '付款週期', true)).toLowerCase() !== 'annual') return false;
    const start = dateFromCell_(auditGet_(r.values, qx, '合約起始日', true));
    const end = dateFromCell_(auditGet_(r.values, qx, '合約結束日', true));
    return !start || !end || !isFullYearTerm_(start, end);
  });
}
function productKey_(row, ix) {
  return auditText_(auditGet_(row, ix, '產品', true)) + '|' + auditText_(auditGet_(row, ix, '超額計算方式', true));
}
function sameMultiset_(a, b) { return a.length === b.length && a.slice().sort().join('\n') === b.slice().sort().join('\n'); }
function groupBy_(items, key) { return items.reduce((o, item) => { const k = key(item); (o[k] || (o[k] = [])).push(item); return o; }, {}); }

function contractAudit_(review, planChange, billing, queueRows, qx, control, planDifference) {
  const evidenceType = auditText_(review['Evidence Type']).toLowerCase();
  const name = restaurantNameAudit_(review, queueRows, qx, control);
  const period = contractPeriodAudit_(review, queueRows, qx, control);
  const dates = period.result === 'Pass';
  const plan = isPass_(review['Full Plan Match']);
  const depositCommission = depositCommissionAudit_(review, queueRows, qx, control);
  const seals = isPass_(review['Inline Seal']) && isPass_(review['Customer Seal']);
  const directConsent = isPass_(review['Customer Explicit Consent']);
  const agreementEmail = isPass_(review['Agreement Confirmation Text']) &&
    auditText_(review['Confirmation Sender']).toLowerCase() === 'inline-csm-team@inline.tw';
  // Evidence URL is prefilled from Queue when the review row is created.  It
  // is not, by itself, a completed document review: otherwise a fresh queue
  // would incorrectly be reported as a contract mismatch instead of pending.
  const evidenceExists = !!evidenceType || name.hasInput || period.hasInput || plan || seals || directConsent || agreementEmail ||
    auditText_(review['Deposit Commission Rate (%)']) !== '' ||
    auditText_(review['Deposit Buy-in Price (%)']) !== '' ||
    auditText_(review['Annual Payment Amount (NTD)']) !== '' ||
    auditText_(review['Annual Payment Evidence Quote']) !== '' ||
    auditText_(review['Annual Payment Evidence Location']) !== '';
  const splitBilling = !!(billing && billing.requiresDualSeal);
  const required = planChange || splitBilling
    ? '雙方用印正式合約／增補協議；餐廳名稱、合約期間與完整方案均須一致'
    : '完整信件中客戶明確同意，或雙方用印文件；餐廳名稱、合約期間與完整方案均須一致';
  if (!evidenceExists) return { result: 'Need Review', required, reason: '尚未填寫可讀取的合約／信件覆核結果' };
  if (name.result !== 'Pass') return { result: name.result, required, reason: name.reason };
  if (period.result === 'Need Review') return { result: 'Need Review', required, reason: period.reason };
  if (period.result === 'Fail') return { result: 'Fail', required, reason: period.reason };
  if (depositCommission.result !== 'Pass') {
    return { result: depositCommission.result, required, reason: depositCommission.reason };
  }
  if (!plan) return { result: 'Fail', required, reason: '合約／信件未確認完整方案一致' };
  if (billing.result !== 'Pass') return { result: billing.result, required, reason: billing.reason };
  if (splitBilling && !seals) {
    return {
      result: 'Need Dual Seal',
      required,
      reason: billing.reason + '；RSV 年繳但正費用 add-on 維持月繳屬 split-billing 例外，需人工目視確認 inline 與客戶雙方用印'
    };
  }
  if (planChange && !seals) {
    return {
      result: 'Need Dual Seal',
      required,
      reason: (planDifference ? planDifference + '；' : '') + '方案有變更，需人工目視確認 inline 與客戶雙方用印'
    };
  }
  if (!planChange && !(seals || directConsent || agreementEmail)) return { result: 'Need Review', required, reason: '原方案續約尚未確認客戶明確同意、指定達成合意信件或雙方用印' };
  return { result: 'Pass', required, reason: '' };
}

/**
 * Restaurant-name evidence is intentionally human-reviewed.  The program
 * does not fuzzy-match brands or maintain an alias table; it records the
 * exact document name and fails closed when the reviewer marks a mismatch.
 * The reviewed Drive file ID is bound to the current Queue link so a replaced
 * document cannot silently inherit an older approval.
 */
function restaurantNameAudit_(review, queueRows, qx, control) {
  const legacyMatch = isPass_(review['Restaurant Name Match']);
  const documentName = auditText_(review['Document Restaurant Name']);
  const legalName = auditText_(review['Document Legal Entity Name']);
  const matchText = auditText_(review['Restaurant Name Match Result']);
  const reviewedFileId = auditText_(review['Reviewed Evidence File ID']);
  const reviewedModifiedAt = auditText_(review['Reviewed Evidence Modified At']);
  const hasInput = legacyMatch || !!documentName || !!legalName || !!matchText || !!reviewedFileId || !!reviewedModifiedAt;
  const reviewedAt = dateFromCell_(review['Reviewed At']);
  const requiredFrom = dateFromCell_(control['Restaurant Name Detail Required From']);
  const explicitRequired = !!requiredFrom && (!reviewedAt || reviewedAt.getTime() >= requiredFrom.getTime());
  const expectedNames = [...new Set(queueRows.map(r =>
    auditText_(auditGet_(r.values, qx, '餐廳名稱', true))
  ).filter(Boolean))];

  if (!documentName && !matchText && !reviewedFileId) {
    if (!explicitRequired) {
      return legacyMatch
        ? { result: 'Pass', reason: '', hasInput }
        : { result: 'Fail', reason: '合約／信件未確認餐廳名稱一致', hasInput };
    }
    return {
      result: 'Need Review',
      reason: '尚未記錄文件實際店名、人工名稱比對結果與所覆核的 Drive 檔案 ID',
      hasInput
    };
  }

  if (!documentName || !matchText || !reviewedFileId || !reviewedModifiedAt) {
    return {
      result: 'Need Review',
      reason: '餐廳名稱覆核追溯資料不完整：需填文件實際店名、人工比對結果、Drive 檔案 ID 與檔案更新時間',
      hasInput: true
    };
  }

  const queueFileIds = [...new Set(queueRows.map(r =>
    driveFileId_(auditText_(auditGet_(r.values, qx, '合約')))
  ).filter(Boolean))];
  if (queueFileIds.length !== 1 || queueFileIds[0] !== reviewedFileId) {
    return {
      result: 'Need Review',
      reason: '覆核文件版本與 Queue 合約連結不一致，需重新閱讀 Queue 目前連結的文件',
      hasInput: true
    };
  }

  if (isRestaurantNameReviewPending_(matchText)) {
    const expected = expectedNames.length ? expectedNames.join('／') : '未填寫';
    const legal = legalName ? '、簽約實體「' + legalName + '」' : '';
    return {
      result: 'Need Review',
      reason: '餐廳名稱未能確認一致：Queue「' + expected + '」，文件使用店家「' + documentName + '」' + legal + '；文件未提供兩個店名為同一店的證據，需人工確認',
      hasInput: true
    };
  }
  if (!legacyMatch || !isRestaurantNameMatchResult_(matchText)) {
    const expected = expectedNames.length ? expectedNames.join('／') : '未填寫';
    const legal = legalName ? '、簽約實體「' + legalName + '」' : '';
    return {
      result: 'Fail',
      reason: '餐廳名稱未能確認一致：Queue「' + expected + '」，文件使用店家「' + documentName + '」' + legal,
      hasInput: true
    };
  }
  return { result: 'Pass', reason: '', hasInput: true };
}

function isRestaurantNameReviewPending_(value) {
  return ['need review', 'need manual confirmation', 'manual review', '人工確認', '待人工確認']
    .includes(auditText_(value).toLowerCase());
}

function isRestaurantNameMatchResult_(value) {
  return value === true || [
    'true', 'pass', 'passed', 'yes', 'approved', 'match', 'matched',
    'confirmed', 'human confirmed', '人工確認一致', '一致'
  ].includes(auditText_(value).toLowerCase());
}

function driveFileId_(url) {
  const value = auditText_(url);
  const match = value.match(/\/d\/([A-Za-z0-9_-]+)/) ||
    value.match(/\/folders\/([A-Za-z0-9_-]+)/) ||
    value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

/**
 * Deposit-Commission is a percentage stored in Queue's gift-count column.
 * Evidence may state either the commission itself or the restaurant buy-in
 * price.  Buy-in price must equal 100% minus the Queue commission.  Requiring
 * an explicit structured value prevents a generic Full Plan Match checkbox
 * from hiding a missing Renewal DB value or a malformed renewal email.
 */
function depositCommissionAudit_(review, queueRows, qx, control) {
  const rows = queueRows.filter(r =>
    auditText_(auditGet_(r.values, qx, '產品', true)).toLowerCase() === 'deposit-commission'
  );
  if (!rows.length) return { result: 'Pass', reason: '' };

  const expectedRates = [...new Set(rows.map(r =>
    auditNumber_(auditGet_(r.values, qx, '合約贈送組數', true))
  ).filter(v => v !== null))];
  if (expectedRates.length !== 1) {
    return {
      result: 'Need Review',
      reason: 'Queue 的 Deposit-Commission 比例缺漏或同一 Branch 有多個比例，需人工確認 Renewal DB 來源'
    };
  }

  const expectedCommission = expectedRates[0];
  const expectedBuyIn = 100 - expectedCommission;
  const commissionText = auditText_(review['Deposit Commission Rate (%)']);
  const buyInText = auditText_(review['Deposit Buy-in Price (%)']);
  if (commissionText === '' && buyInText === '') {
    const reviewedAt = dateFromCell_(review['Reviewed At']);
    const requiredFrom = dateFromCell_(control['Deposit Commission Detail Required From']);
    const explicitRequired = !!requiredFrom && (!reviewedAt || reviewedAt.getTime() >= requiredFrom.getTime());
    if (!explicitRequired) return { result: 'Pass', reason: '' };
    return {
      result: 'Need Review',
      reason: '尚未填入合約／信件中的 Deposit 抽成比例或買入價格，無法與 Queue／Renewal DB 自動比對'
    };
  }

  const commission = commissionText === '' ? null : auditNumber_(commissionText);
  const buyIn = buyInText === '' ? null : auditNumber_(buyInText);
  if ((commissionText !== '' && commission === null) || (buyInText !== '' && buyIn === null)) {
    return {
      result: 'Need Review',
      reason: '合約／信件中的 Deposit 抽成比例或買入價格格式無法判讀，請填入百分比數字'
    };
  }
  if (commission !== null && Math.abs(commission - expectedCommission) > 0.001) {
    return {
      result: 'Fail',
      reason: 'Deposit 抽成比例不一致：合約／信件為 ' + auditFormatNumber_(commission) +
        '%；Queue／Renewal DB 為 ' + auditFormatNumber_(expectedCommission) + '%'
    };
  }
  if (buyIn !== null && Math.abs(buyIn - expectedBuyIn) > 0.001) {
    return {
      result: 'Fail',
      reason: 'Deposit 買入價格不一致：合約／信件為 ' + auditFormatNumber_(buyIn) +
        '%；依 Queue／Renewal DB 抽成 ' + auditFormatNumber_(expectedCommission) +
        '%，買入價格應為 ' + auditFormatNumber_(expectedBuyIn) + '%'
    };
  }
  return { result: 'Pass', reason: '' };
}

function contractPeriodAudit_(review, queueRows, qx, control) {
  const reviewedAt = dateFromCell_(review['Reviewed At']);
  const requiredFrom = dateFromCell_(control['Contract Date Detail Required From']);
  const start = dateFromCell_(review['Contract Start Date']);
  const end = dateFromCell_(review['Contract End Date']);
  const hasStart = !!auditText_(review['Contract Start Date']);
  const hasEnd = !!auditText_(review['Contract End Date']);
  const explicitRequired = !!requiredFrom && (!reviewedAt || reviewedAt.getTime() >= requiredFrom.getTime());
  if (!hasStart && !hasEnd) {
    if (explicitRequired) {
      return { result: 'Need Review', hasInput: false, reason: '尚未填入合約／信件中的實際起訖日，無法與 Queue／Renewal DB 自動比對' };
    }
    return isPass_(review['Contract Period Match'])
      ? { result: 'Pass', hasInput: true, reason: '' }
      : { result: 'Fail', hasInput: true, reason: '合約／信件期間尚未確認與 Queue／Renewal DB 一致' };
  }
  if (!hasStart || !hasEnd || !start || !end) {
    return { result: 'Need Review', hasInput: true, reason: '合約／信件起訖日不完整或格式無法判讀，請填入 YYYY-MM-DD' };
  }
  const periods = queueContractPeriods_(queueRows, qx);
  if (periods.length !== 1) {
    return { result: 'Need Review', hasInput: true, reason: '同一 Branch 的 Queue 合約期間不只一組，需人工確認各產品期間' };
  }
  const actualStart = auditDateText_(start);
  const actualEnd = auditDateText_(end);
  if (periods[0].start === actualStart && periods[0].end === actualEnd) {
    return { result: 'Pass', hasInput: true, reason: '' };
  }
  return {
    result: 'Fail',
    hasInput: true,
    reason: '合約期間不一致：合約／信件為 ' + actualStart + '～' + actualEnd +
      '；Queue／Renewal DB 為 ' + periods[0].start + '～' + periods[0].end
  };
}

function queueContractPeriods_(queueRows, qx) {
  const rows = queueRows.filter(r => isMainProduct_(auditText_(auditGet_(r.values, qx, '產品', true))));
  const source = rows.length ? rows : queueRows;
  const seen = {};
  source.forEach(r => {
    const start = auditDateText_(auditGet_(r.values, qx, '合約起始日', true));
    const end = auditDateText_(auditGet_(r.values, qx, '合約結束日', true));
    if (start && end) seen[start + '|' + end] = { start, end };
  });
  return Object.keys(seen).map(k => seen[k]);
}

function originalTprDateAudit_(oldRows, queueRows, tx, qx) {
  if (!oldRows.length) return { result: 'Need Check', reason: '找不到原始 TPR 列，無法確認是否有重複或年度錯置資料' };
  const oldPeriods = contractPeriodsFromRows_(oldRows, tx);
  const newPeriods = queueContractPeriods_(queueRows, qx);
  const oldKeys = oldPeriods.map(p => p.start + '|' + p.end);
  const newKeys = newPeriods.map(p => p.start + '|' + p.end);
  if (oldKeys.length && sameMultiset_(oldKeys, newKeys)) return { result: 'Pass', reason: '' };
  return {
    result: 'Need Check',
    reason: '原始 TPR 合約期間為 ' + displayContractPeriods_(oldPeriods) +
      '，本次 Renewal DB／Queue 為 ' + displayContractPeriods_(newPeriods) +
      '，可能有資料重複或年度錯置，需人工確認'
  };
}

function contractPeriodsFromRows_(rows, ix) {
  const mainRows = rows.filter(r => isMainProduct_(auditText_(auditGet_(r, ix, '產品', true))));
  const source = mainRows.length ? mainRows : rows;
  const seen = {};
  source.forEach(row => {
    const start = auditDateText_(auditGet_(row, ix, '合約起始日', true));
    const end = auditDateText_(auditGet_(row, ix, '合約結束日', true));
    if (start && end) seen[start + '|' + end] = { start, end };
  });
  return Object.keys(seen).map(k => seen[k]);
}

function displayContractPeriods_(periods) {
  return periods.length ? periods.map(p => p.start + '～' + p.end).join('、') : '空白／無法辨識';
}

function longTermContractAudit_(queueRows, qx, review) {
  const notes = [...new Set(queueRows.map(r =>
    auditText_(auditGet_(r.values, qx, 'Long-Term Contract Notes', true))
  ).filter(Boolean))];
  if (!notes.length) return { result: 'Not Applicable', reason: '' };
  const queuePeriods = queueContractPeriods_(queueRows, qx);
  const actualStart = auditDateText_(review['Contract Start Date']);
  const actualEnd = auditDateText_(review['Contract End Date']);
  const actual = actualStart && actualEnd ? actualStart + '～' + actualEnd : '尚未填入完整合約期間';
  return {
    result: 'Need Check',
    reason: '長約需人工確認：Renewal DB／Queue 期間為 ' + displayContractPeriods_(queuePeriods) +
      '；合約覆核期間為 ' + actual + '；長約備註為「' + notes.join('；') + '」'
  };
}

function loadRsvBonusReference_(sheet) {
  return loadRsvPlanReference_(sheet)
    .filter(r => r.period === 'annual' && typeof r.sets === 'number' && r.sets > 0 && r.bonus >= 0)
    .map(r => ({ family: r.family, paid: r.sets, bonus: r.bonus }));
}

function loadRsvFamilyReference_(sheet) {
  return loadRsvPlanReference_(sheet);
}

/**
 * Reads the current normalized TMS plan catalog.  Each Snapshot row is one
 * inseparable plan combination with the source values in this order:
 * Source Tab, billing period, product, paid sets, free sets, price, overage.
 *
 * Lite and Email Only are catalog tiers inside the Public compliance family.
 * The legacy matrix parser is retained only so an older Snapshot fails over
 * safely while the workbook is being migrated.
 */
function loadRsvPlanReference_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = readTable_(sheet).filter(r => referencePlanFamily_(r['Plan Family'], rawPlanValues_(r['Raw Values JSON'])[0]));
  const normalized = rows.map(normalizedRsvReferenceRow_).filter(Boolean);
  if (normalized.length) return uniqueRsvReferences_(normalized);
  return legacyRsvPlanReference_(rows);
}

function normalizedRsvReferenceRow_(row) {
  const values = rawPlanValues_(row['Raw Values JSON']);
  if (values.length < 7) return null;
  const family = referencePlanFamily_(row['Plan Family'], values[0]);
  const period = referenceBillingPeriod_(values[1]);
  const productText = auditText_(values[2]).toLowerCase();
  const product = productText === 'rwg' ? 'RwG' : productText === 'rsv' ? 'RSV' : '';
  const sets = referenceReservationSets_(values[3]);
  const free = auditNumber_(values[4]);
  const price = auditNumber_(values[5]);
  if (!family || !period || !product || sets === null || price === null) return null;
  return {
    planCode: auditText_(row['Normalized Combination ID']) || auditText_(row['Snapshot ID']),
    family,
    catalog: auditText_(values[0]),
    product,
    period,
    sets,
    bonus: free === null ? 0 : free,
    price,
    overage: auditNumber_(values[6])
  };
}

function referencePlanFamily_(planFamily, sourceLabel) {
  const family = auditText_(planFamily).toLowerCase();
  const source = auditText_(sourceLabel).toLowerCase();
  if (family === 'rsv bd new' || source === 'bd 新方案' || source === 'bd新方案') return 'BD New';
  if (family === 'rsv public' || family === 'rsv public lite' || family === 'rsv public email only' ||
      source === '公版方案' || source === 'lite 方案' || source === 'lite方案' ||
      source === 'email only 方案' || source === 'email only方案') return 'Public';
  return '';
}

function referenceBillingPeriod_(value) {
  const period = auditText_(value).toLowerCase();
  if (period === 'monthly' || period === '月繳') return 'monthly';
  if (period === 'annual' || period === '年繳') return 'annual';
  return '';
}

function uniqueRsvReferences_(rows) {
  const seen = {};
  return rows.filter(r => {
    const key = [r.planCode, r.family, r.catalog, r.product, r.period, r.sets, r.bonus, r.price, r.overage].join('|');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function legacyRsvPlanReference_(rows) {
  const families = groupBy_(rows, r => auditText_(r['Plan Family']));
  const out = [];
  Object.keys(families).forEach(sourceFamily => {
    const family = referencePlanFamily_(sourceFamily, '');
    if (!family) return;
    const decoded = families[sourceFamily].map(r => ({
      sourceRow: Number(r['Source Row']),
      values: rawPlanValues_(r['Raw Values JSON'])
    })).filter(r => r.values.length).sort((a, b) => a.sourceRow - b.sourceRow);
    [
      { marker: '月繳方案', period: 'monthly' },
      { marker: '年繳方案', period: 'annual' }
    ].forEach(section => {
      const start = decoded.findIndex(r => auditText_(r.values[0]) === section.marker);
      if (start < 0) return;
      let end = decoded.length;
      for (let i = start + 1; i < decoded.length; i++) {
        const label = auditText_(decoded[i].values[0]);
        if (label === '月繳方案' || label === '年繳方案') { end = i; break; }
      }
      const block = decoded.slice(start + 1, end);
      const usage = block.find(r => auditText_(r.values[0]) === '使用組數');
      const bonus = block.find(r => auditText_(r.values[0]) === '贈送組數');
      const overage = block.find(r => auditText_(r.values[0]) === '每組超額單價');
      const price = block.find(r =>
        auditText_(r.values[0]) === '' &&
        r.values.slice(1).some(v => auditNumber_(v) !== null)
      );
      if (!usage || !overage || !price) return;
      const width = Math.max(usage.values.length, price.values.length, overage.values.length,
        bonus ? bonus.values.length : 0);
      for (let col = 1; col < width; col++) {
        const sets = referenceReservationSets_(usage.values[col]);
        const amount = auditNumber_(price.values[col]);
        if (sets === null || amount === null) continue;
        const free = bonus ? auditNumber_(bonus.values[col]) : null;
        out.push({
          planCode: '',
          family,
          catalog: sourceFamily,
          product: '',
          period: section.period,
          sets,
          bonus: free === null ? 0 : free,
          price: amount,
          overage: auditNumber_(overage.values[col])
        });
      }
    });
  });
  return uniqueRsvReferences_(out);
}

function referenceReservationSets_(value) {
  const text = auditText_(value).toLowerCase();
  if (text === 'unlimited') return 'unlimited';
  return auditNumber_(value);
}

function inferRsvPlan_(rows, ix, reference, shareOverage, origin, options) {
  options = options || {};
  const main = rows.find(r => isMainProduct_(auditText_(auditGet_(r, ix, '產品', true))));
  if (!main || !reference.length) return { family:'', planCode:'', resolved:false, conflict:'缺少主產品或方案參照資料', rule:'Unable to match' };
  const product = auditText_(auditGet_(main, ix, '產品', true));
  const period = auditText_(auditGet_(main, ix, '付款週期', true)).toLowerCase();
  const sets = referenceReservationSets_(auditGet_(main, ix, '合約組數', true));
  const rawBonus = auditNumber_(auditGet_(main, ix, '合約贈送組數', true));
  const bonus = rawBonus === null ? 0 : rawBonus;
  const price = auditNumber_(auditGet_(main, ix, '合約價格', true));
  const overage = auditNumber_(auditGet_(main, ix, '超額每組單價', true));
  const shareId = auditText_(auditGet_(main, ix, 'Share Plan ID'));
  const ignoreOverage = !!shareId && shareOverage && shareOverage.result === 'Pass';
  if (sets === null || price === null) return { family:'', planCode:'', resolved:false, conflict:'主產品使用組數或價格空白', rule:'Unable to match' };
  const matches = reference.filter(r =>
    (!r.product || r.product === product) &&
    r.period === period &&
    referenceValuesEqual_(r.sets, sets) &&
    numbersEqualAllowNull_(r.bonus, bonus) &&
    numbersEqualAllowNull_(r.price, price) &&
    (ignoreOverage || numbersEqualAllowNull_(r.overage, overage))
  );
  const families = [...new Set(matches.map(r => r.family))];
  const listed = !!(origin && origin.listed);
  const expected = normalPlanFamily_(options.expectedFamily);
  const isOriginal = options.mode === 'original';
  let family = '';
  let conflict = '';
  let rule = '';
  if (origin && origin.conflict) {
    conflict = origin.conflict;
    rule = 'Legacy membership 重複，停止方案世代判斷';
  } else if (!families.length) {
    family = 'Special';
    rule = '完整組合未匹配 Public／BD New，判定 Special';
  } else if (isOriginal && families.length === 1) {
    family = families[0];
    if (family === 'BD New' && listed) {
      conflict = 'Branch 已列入 Legacy Branch Master，但舊方案完整組合只匹配 BD New，Legacy membership 與方案家族衝突，需人工確認';
      rule = '舊方案唯一匹配 BD New，但 Legacy membership 阻擋自動分類';
    } else {
      rule = '舊方案完整組合唯一匹配 ' + family + '，續約維持原家族' +
        (family === 'Public' && !listed ? '；雖不在 Legacy，仍依唯一 Public 組合延續' : '');
    }
  } else if (isOriginal) {
    family = listed ? 'Public' : 'BD New';
    rule = '舊方案完整組合同時匹配 Public／BD New，依 ' +
      (listed ? '列入 Legacy Branch Master 選擇 Public' : '未列入 Legacy Branch Master 選擇 BD New');
  } else if (families.length === 1) {
    family = families[0];
    rule = '新方案完整組合唯一匹配 ' + family;
  } else if (expected && families.includes(expected)) {
    family = expected;
    rule = '新方案完整組合同時匹配 Public／BD New，依舊方案家族選擇 ' + expected;
  } else {
    conflict = '新方案完整組合同時匹配 Public／BD New，但無法從舊方案家族決定續約家族';
    rule = '新方案重複組合需維持舊方案家族';
  }
  if (ignoreOverage) rule += '；Share Plan 超額單價依組內最高值正規化';
  const familyMatches = matches.filter(r => !family || r.family === family);
  const planCodes = [...new Set(familyMatches.map(r => r.planCode).filter(Boolean))];
  const sourceCatalogs = [...new Set(familyMatches.map(r => r.catalog).filter(Boolean))];
  return {
    family, planCode: planCodes.join(', '), resolved: !!family && !conflict,
    sourceCatalog: sourceCatalogs.length === 1 ? sourceCatalogs[0] : '',
    conflict, rule, matches: familyMatches
  };
}

function rsvPlanSummary_(product, period, sets, bonus, price, overage) {
  return [
    product,
    period,
    '使用 ' + auditFormatNumber_(sets) + ' 組',
    '贈送 ' + auditFormatNumber_(bonus) + ' 組',
    '價格 ' + auditFormatNumber_(price) + ' 元',
    '超額 ' + auditFormatNumber_(overage) + ' 元'
  ].join('／');
}

function referenceValuesEqual_(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return String(a).toLowerCase() === String(b).toLowerCase();
  return numbersEqualAllowNull_(a, b);
}

function numbersEqualAllowNull_(a, b) {
  if (a === null || b === null) return a === null && b === null;
  return isFinite(a) && isFinite(b) && Math.abs(Number(a) - Number(b)) <= 0.000001;
}

function rawPlanValues_(json) {
  try {
    const parsed = JSON.parse(String(json || ''));
    return Array.isArray(parsed.values) ? parsed.values : [];
  } catch (e) {
    return [];
  }
}

function bonusCountAudit_(queueRows, qx, reference, control) {
  const warningRatio = settingNumber_(control, 'Bonus Warning Ratio', 0.12);
  const criticalRatio = settingNumber_(control, 'Bonus Critical Ratio', 0.30);
  const warningMultiplier = settingNumber_(control, 'Bonus Warning Multiplier', 1.20);
  const criticalMultiplier = settingNumber_(control, 'Bonus Critical Multiplier', 2.00);
  const minimumExtra = settingNumber_(control, 'Bonus Minimum Extra Groups', 50);
  let worst = { result: 'Pass', reason: '' };
  queueRows.forEach(r => {
    const product = auditText_(auditGet_(r.values, qx, '產品', true));
    if (product !== 'RSV') return;
    const paid = auditNumber_(auditGet_(r.values, qx, '合約組數', true));
    const bonus = auditNumber_(auditGet_(r.values, qx, '合約贈送組數', true));
    if (paid === null || paid <= 0 || bonus === null || bonus <= 0) return;
    const ratio = bonus / paid;
    const matches = reference.filter(x => Math.abs(x.paid - paid) <= 0.000001);
    const referenceBonus = matches.length ? Math.max.apply(null, matches.map(x => x.bonus)) : null;
    const warningLimit = referenceBonus === null
      ? null
      : referenceBonus + Math.max(referenceBonus * Math.max(0, warningMultiplier - 1), minimumExtra);
    const criticalByReference = referenceBonus !== null && bonus > referenceBonus * criticalMultiplier;
    const warningByReference = warningLimit !== null && bonus > warningLimit;
    const critical = ratio > criticalRatio || criticalByReference;
    const warning = ratio > warningRatio || warningByReference;
    if (!critical && !warning) return;
    const detail = '使用組數 ' + auditFormatNumber_(paid) + '、贈送組數 ' + auditFormatNumber_(bonus) +
      '，贈送比例 ' + auditFormatPercent_(ratio) +
      (referenceBonus === null ? '；找不到相同使用組數的公版／BD 新方案參照' :
        '；同使用組數公版／BD 新方案參照為 ' + auditFormatNumber_(referenceBonus) + ' 組，實際為參照的 ' +
        (bonus / Math.max(referenceBonus, 1)).toFixed(2) + ' 倍');
    const candidate = critical
      ? { result: 'Critical', reason: '贈送組數嚴重異常：' + detail + '。請確認歷史資料是否誤植，或提供特殊核准紀錄' }
      : { result: 'Warning', reason: '贈送組數超出一般容許範圍：' + detail + '。請人工確認' };
    if (worst.result !== 'Critical' || candidate.result === 'Critical') worst = candidate;
  });
  return worst;
}

function settingNumber_(settings, key, fallback) {
  const value = auditNumber_(settings[key]);
  return value === null ? fallback : value;
}

function auditNumber_(value) {
  const text = auditText_(value).replace(/[,，\s$NTD%％元組]/gi, '');
  if (text === '' || text === '-' || text.toLowerCase() === 'null') return null;
  const number = Number(text);
  return isFinite(number) ? number : null;
}

function auditFormatNumber_(value) {
  if (value === null || value === undefined || value === '') return '空白';
  if (!isFinite(Number(value))) return auditText_(value);
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function auditFormatPercent_(value) {
  return (Number(value) * 100).toFixed(1) + '%';
}

function billingCycleAudit_(review, queueRows, qx) {
  // Monthly contracts are checked product-by-product in the evidence review;
  // they do not have an annual lump sum.  6/3-month terms are intentionally
  // routed to manual confirmation because they are not a current standard.
  const mainRows = queueRows.filter(r => isMainProduct_(auditText_(auditGet_(r.values, qx, '產品', true))));
  const mainPeriods = [...new Set(mainRows.map(r => auditText_(auditGet_(r.values, qx, '付款週期', true)).toLowerCase()))];
  if (mainPeriods.some(p => p === '6mo' || p === '3mo')) {
    return { result: 'Need Review', reason: '主產品為 6mo／3mo 付款週期，需人工確認合約與加購計費方式' };
  }
  const hasAnnualMain = mainPeriods.includes('annual');
  if (!hasAnnualMain) return { result: 'Pass', reason: '' };
  const fixedRows = queueRows.filter(r => isFixedContractPriceProduct_(auditText_(auditGet_(r.values, qx, '產品', true))));
  const fixedDetails = fixedRows.map(r => ({
    product: auditText_(auditGet_(r.values, qx, '產品', true)),
    period: auditText_(auditGet_(r.values, qx, '付款週期', true)).toLowerCase(),
    price: auditNumber_(auditGet_(r.values, qx, '合約價格', true))
  }));
  const positiveAddOns = fixedDetails.filter(r => !isMainProduct_(r.product) && r.price !== null && r.price > 0);
  // The annual lump sum is only needed to distinguish annual from monthly
  // billing when at least one add-on has a positive recurring charge.  A
  // main-product-only renewal (including a Share-plan member) and zero-fee
  // add-ons cannot be ambiguous for this purpose.
  if (!positiveAddOns.length) return { result: 'Pass', reason: '' };
  const unsupported = positiveAddOns.filter(r => r.period !== 'annual' && r.period !== 'monthly');
  if (unsupported.length) {
    return { result:'Need Review', reason:'正費用 add-on 付款週期空白或不支援：' + billingPriceSummary_(unsupported) };
  }
  const annualRows = fixedDetails.filter(r => r.period === 'annual');
  const invalidAnnual = annualRows.filter(r => r.price === null);
  if (invalidAnnual.length) {
    return { result:'Need Review', reason:'Queue annual 產品合約價格空白或無法判讀：' + billingPriceSummary_(invalidAnnual) };
  }
  const annualTotal = annualRows.reduce((sum, r) => sum + r.price, 0);
  const summary = billingPriceSummary_(annualRows);
  const rawAmount = auditText_(review['Annual Payment Amount (NTD)']);
  const evidenceQuote = auditText_(review['Annual Payment Evidence Quote']);
  const evidenceLocation = auditText_(review['Annual Payment Evidence Location']);
  if (!rawAmount || !evidenceQuote || !evidenceLocation) {
    const missing = [];
    if (!rawAmount) missing.push('Annual Payment Amount');
    if (!evidenceQuote) missing.push('Evidence Quote');
    if (!evidenceLocation) missing.push('Evidence Location');
    return {
      result: 'Need Review',
      reason: '年繳總金額證據不完整：缺少 ' + missing.join('、') + '；目前文件金額欄位「' +
        (rawAmount || '未填') + '」，Queue annual 合約價格合計 ' + auditFormatNumber_(annualTotal) + ' 元（' + summary +
        '）。請從合約／完整 Email 串逐字補齊，不得由 Queue 加總回推'
    };
  }
  const amount = exactCurrencyAmount_(rawAmount);
  if (amount === null) return { result:'Need Review', reason:'年繳總金額格式無法嚴格判讀：「' + rawAmount + '」' };
  if (!evidenceQuoteContainsAmount_(evidenceQuote, amount)) {
    return {
      result:'Need Review',
      reason:'年繳總金額證據原文未出現填入金額 ' + auditFormatNumber_(amount) + ' 元，請重新從文件擷取'
    };
  }
  if (amount !== annualTotal) {
    return {
      result:'Fail',
      reason:'年繳總額不一致：文件 ' + auditFormatNumber_(amount) + ' 元；Queue annual 合約價格合計 ' +
        auditFormatNumber_(annualTotal) + ' 元（' + summary + '）。請人工確認並修正 Queue 付款週期或金額'
    };
  }
  const monthlyAddOns = positiveAddOns.filter(r => r.period === 'monthly');
  if (monthlyAddOns.length) {
    return {
      result:'Pass',
      requiresDualSeal:true,
      annualPaymentAmount:amount,
      annualQueueTotal:annualTotal,
      reason:'文件年繳總額 ' + auditFormatNumber_(amount) + ' 元與 Queue annual 合計一致；正費用月繳 add-on：' +
        billingPriceSummary_(monthlyAddOns)
    };
  }
  return { result:'Pass', reason:'', annualPaymentAmount:amount, annualQueueTotal:annualTotal };
}

function isFixedContractPriceProduct_(product) {
  const normalized = auditText_(product);
  // Deposit-Commission rows represent percentage / transaction charges, not
  // a fixed contract price.  Treat every other named product as fixed so a
  // newly introduced recurring add-on cannot be silently omitted.
  return !!normalized && normalized.toLowerCase().indexOf('deposit-commission') !== 0;
}

function billingPriceSummary_(rows) {
  return rows.map(r => r.product + ' ' + (r.period || '週期空白') + ' ' + auditFormatNumber_(r.price) + ' 元').join('；');
}

function exactCurrencyAmount_(value) {
  let text = auditText_(value);
  if (!text) return null;
  if (text.normalize) text = text.normalize('NFKC');
  text = text.replace(/(?:新台幣|新臺幣|NT\$|NTD|TWD|\$|元)/gi, '').replace(/[,，\s]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  return isFinite(amount) && amount >= 0 ? amount : null;
}

function evidenceQuoteContainsAmount_(quote, expectedAmount) {
  let text = auditText_(quote);
  if (text.normalize) text = text.normalize('NFKC');
  const candidates = text.match(/\d[\d,，]*(?:\.\d+)?/g) || [];
  return candidates.some(candidate => exactCurrencyAmount_(candidate) === expectedAmount);
}

function planComplianceAudit_(review, planChange, inferredPlans, origin) {
  const oldPlan = inferredPlans && inferredPlans.oldPlan || {};
  const newPlan = inferredPlans && inferredPlans.newPlan || {};
  const oldFamily = normalPlanFamily_(oldPlan.family) || normalPlanFamily_(review['Original Plan Family']);
  const newFamily = normalPlanFamily_(newPlan.family) || normalPlanFamily_(review['New Plan Family']);
  const expectedFamily = oldFamily === 'Special'
    ? (origin && origin.listed ? 'Public' : 'BD New')
    : oldFamily;
  const trace = {
    oldPlanCode: auditText_(oldPlan.planCode), newPlanCode: auditText_(newPlan.planCode),
    oldSourceCatalog: auditText_(oldPlan.sourceCatalog), newSourceCatalog: auditText_(newPlan.sourceCatalog),
    expectedFamily: expectedFamily,
    matchRule: ['原方案：' + auditText_(oldPlan.rule), '新方案：' + auditText_(newPlan.rule)].filter(Boolean).join('；')
  };
  const conflicts = [auditText_(oldPlan.conflict), auditText_(newPlan.conflict)].filter(Boolean);
  if (isExplicitFail_(review['Complete Plan Match'])) {
    conflicts.push('Plan Classification Review 已人工標記 Complete Plan Match 不通過，需人工確認完整方案組合');
  }
  if (conflicts.length) {
    return Object.assign({ oldFamily:oldFamily || 'Unknown', newFamily:newFamily || 'Unknown', result:'Need Check', specialCase:'Unknown', reason:conflicts.join('；') }, trace);
  }
  if (!oldFamily || !newFamily) {
    return Object.assign({ oldFamily:oldFamily || 'Unknown', newFamily:newFamily || 'Unknown', result:'Need Check', specialCase:'Unknown', reason:'尚未由方案參照表與 Legacy membership 確認舊／新方案家族' }, trace);
  }
  if (oldFamily === 'Special' && newFamily === 'Special' && !planChange) {
    return Object.assign({ oldFamily, newFamily, result:'Pass', specialCase:'Grandfathered', reason:'' }, trace);
  }
  if (oldFamily === 'Special' && newFamily === expectedFamily) {
    return Object.assign({
      oldFamily,
      newFamily,
      expectedFamily,
      result: 'Pass',
      specialCase: 'StandardizedToExpected',
      reason: '原特殊方案已改為 Legacy membership 對應的完整 ' + expectedFamily + ' 標準方案；雙方用印由合約檢核確認。'
    }, trace);
  }
  if ((oldFamily === 'Public' && newFamily === 'Public') || (oldFamily === 'BD New' && newFamily === 'BD New')) {
    return Object.assign({ oldFamily, newFamily, expectedFamily, result:'Pass', specialCase:'Not Required', reason:'' }, trace);
  }
  return Object.assign({
    oldFamily, newFamily, expectedFamily, result:'Pass', specialCase:'Required',
    reason:'方案家族由 ' + oldFamily + ' 變更為 ' + newFamily + '，需特殊申請核准'
  }, trace);
}

function specialApprovalAudit_(plan, review, nonFullYearAnnualRenewal) {
  if (nonFullYearAnnualRenewal) {
    const approved = auditText_(review['Approval Status']).toLowerCase() === 'approved' && !!auditText_(review['Evidence URL']) && !!auditText_(review['Reviewer']) && !!review['Reviewed At'];
    return approved
      ? { required: 'Yes', status: 'Approved', reason: '' }
      : { required: 'Yes', status: unresolvedApprovalStatus_(review), reason: '年繳續約期間非完整一年，需特殊申請核准、佐證連結、覆核者與日期' };
  }
  if (plan.specialCase === 'StandardizedToExpected') {
    return {
      required: 'No',
      status: 'Not Required',
      reason: '原特殊方案改為 Legacy membership 對應的完整標準方案，不需額外特殊申請；雙方用印由合約檢核確認'
    };
  }
  if (plan.specialCase === 'Not Required') return { required: 'No', status: 'Not Required', reason: '' };
  if (plan.specialCase === 'Grandfathered') return { required: 'No', status: 'Grandfathered', reason: '' };
  if (plan.specialCase === 'Unknown') return { required: 'Unknown', status: 'Unknown', reason: plan.reason };
  const approved = auditText_(review['Approval Status']).toLowerCase() === 'approved' &&
    !!auditText_(review['Evidence URL']) && !!auditText_(review['Reviewer']) && !!review['Reviewed At'];
  return approved
    ? { required: 'Yes', status: 'Approved', reason: '' }
    : { required: 'Yes', status: unresolvedApprovalStatus_(review), reason: '需填入特殊申請核准紀錄、佐證連結、覆核者與日期' };
}

function unresolvedApprovalStatus_(review) {
  const status = auditText_(review['Approval Status']);
  const normalized = status.toLowerCase();
  return !status || normalized === 'not required' || normalized === 'grandfathered' || normalized === 'approved'
    ? 'Pending'
    : status;
}

/**
 * Re-reads the exact Renewal DB rows referenced by Queue and validates each
 * Share Plan as one group.  A shared overage price is valid only when:
 * 1) every Renewal DB member of the same Share Plan uses the group maximum,
 * 2) every member included in the current Queue has an exact Renewal DB row,
 * 3) Queue uses that same value for every included member, and
 * 4) the manually reviewed contract group confirms its complete membership.
 *
 * When this gate passes, a historical per-branch overage difference is a
 * policy normalization, not a plan change.  Contract consistency is confirmed
 * separately by Contract Evidence Review and Share Group Review.
 */
function shareOverageSourceAudit_(ss, control, byBranch, qx) {
  const result = { byBranch: {}, byGroup: {} };
  const queueMembers = [];
  Object.keys(byBranch).forEach(branchId => {
    byBranch[branchId].forEach(r => {
      const product = auditText_(auditGet_(r.values, qx, '產品', true));
      const shareId = auditText_(auditGet_(r.values, qx, 'Share Plan ID'));
      if (!isMainProduct_(product) || !shareId) return;
      const marker = auditText_(auditGet_(r.values, qx, 'Renewal DB Row'));
      const match = marker.match(/^(.+)!(\d+)$/);
      queueMembers.push({
        branchId,
        shareId,
        queuePrice: auditNumber_(auditGet_(r.values, qx, '超額每組單價', true)),
        tabName: match ? match[1] : '',
        sourceRow: match ? Number(match[2]) : null
      });
    });
  });
  if (!queueMembers.length) return result;

  const maps = readTable_(ss.getSheetByName('Field Mapping'))
    .filter(r => r['Source'] === 'Renewal DB' && isActive_(r['Active']));
  const renewalSs = SpreadsheetApp.openById(control['Renewal DB Spreadsheet ID']);
  const byTab = groupBy_(queueMembers, r => r.tabName);

  Object.keys(byTab).forEach(tabName => {
    const tabMembers = byTab[tabName];
    if (!tabName) {
      tabMembers.forEach(m => {
        result.byBranch[m.branchId] = {
          result: 'Need Check',
          reason: 'Queue 缺少 Renewal DB Row，無法確認 Share Plan 組內最高超額單價'
        };
      });
      return;
    }
    const renewal = renewalSs.getSheetByName(tabName);
    if (!renewal) {
      tabMembers.forEach(m => {
        result.byBranch[m.branchId] = {
          result: 'Need Check',
          reason: '找不到 Renewal DB 分頁「' + tabName + '」，無法確認 Share Plan 組內最高超額單價'
        };
      });
      return;
    }

    const values = renewal.getDataRange().getValues();
    const mapping = resolveMappings_(maps, expandGroups_(values[0]), values[1].map(String));
    const branchColumn = requiredMapping_(mapping, 'branch_id');
    const shareColumn = requiredMapping_(mapping, 'new_share');
    const overageColumn = requiredMapping_(mapping, 'new_overage_price');
    const wantedShares = new Set(tabMembers.map(m => m.shareId));
    const sourceGroups = {};

    values.slice(2).forEach((row, i) => {
      const shareId = auditText_(row[shareColumn]);
      if (!shareId || !wantedShares.has(shareId)) return;
      const groupKey = tabName + '¦' + shareId;
      (sourceGroups[groupKey] || (sourceGroups[groupKey] = [])).push({
        branchId: auditText_(row[branchColumn]),
        shareId,
        sourceRow: i + 3,
        sourcePrice: auditNumber_(row[overageColumn])
      });
    });

    wantedShares.forEach(shareId => {
      const groupKey = tabName + '¦' + shareId;
      const queueGroup = tabMembers.filter(m => m.shareId === shareId);
      const sourceGroup = sourceGroups[groupKey] || [];
      const sourcePrices = sourceGroup.map(m => m.sourcePrice).filter(v => v !== null);
      const highest = sourcePrices.length ? Math.max.apply(null, sourcePrices) : null;
      const sourceUniform = highest !== null && sourceGroup.length > 0 &&
        sourceGroup.every(m => numbersEqual_(m.sourcePrice, highest));
      const queueUniform = highest !== null &&
        queueGroup.every(m => numbersEqual_(m.queuePrice, highest));
      const exactRows = queueGroup.every(m => sourceGroup.some(s =>
        s.branchId === m.branchId && s.sourceRow === m.sourceRow &&
        numbersEqual_(s.sourcePrice, m.queuePrice)
      ));

      let audit;
      if (!sourceGroup.length || highest === null) {
        audit = {
          result: 'Need Check',
          reason: 'Renewal DB 找不到 Share Plan「' + shareId + '」的完整成員或超額單價'
        };
      } else if (!sourceUniform) {
        audit = {
          result: 'Need Check',
          reason: 'Share Plan「' + shareId + '」的 Renewal DB 成員未全部使用組內最高超額單價 ' +
            auditFormatNumber_(highest)
        };
      } else if (!queueUniform || !exactRows) {
        audit = {
          result: 'Need Check',
          reason: 'Share Plan「' + shareId + '」本批 Queue 成員未與各自 Renewal DB 列統一使用最高超額單價 ' +
            auditFormatNumber_(highest)
        };
      } else {
        audit = {
          result: 'Pass',
          highest,
          reason: 'Share Plan「' + shareId + '」Renewal DB 與本批 Queue 成員均使用組內最高超額單價 ' +
            auditFormatNumber_(highest)
        };
      }
      result.byGroup[groupKey] = audit;
      queueGroup.forEach(m => { result.byBranch[m.branchId] = audit; });
    });
  });
  return result;
}

function numbersEqual_(a, b) {
  return a !== null && b !== null && isFinite(a) && isFinite(b) && Math.abs(Number(a) - Number(b)) <= 0.000001;
}

function shareAudit_(rows, qx, reviews, sourceAudit) {
  const shareIds = [...new Set(rows.map(r => auditText_(auditGet_(r.values, qx, 'Share Plan ID'))).filter(Boolean))];
  if (!shareIds.length) return { result: 'Not Applicable', reason: '' };
  if (!sourceAudit || sourceAudit.result !== 'Pass') {
    return {
      result: 'Need Check',
      reason: sourceAudit && sourceAudit.reason
        ? sourceAudit.reason
        : '尚未確認 Share Plan 所有成員、Renewal DB 與 Queue 均使用組內最高超額單價'
    };
  }
  const manual = shareIds.map(id => reviews[id] || {});
  const approved = manual.every(r => isPass_(r['Member Check']) && isPass_(r['Tax ID Check']) && isPass_(r['Contract Check']) && isPass_(r['Overage Check']) && isPass_(r['Status']));
  return approved
    ? { result: 'Pass', reason: sourceAudit.reason }
    : { result: 'Need Check', reason: 'Share Plan 已確認 Renewal DB／Queue 最高超額單價，但尚未確認完整成員、統編、合約期間與合約超額條件' };
}

function pendingCatalogChangeAudit_(oldRows, queueRows, tx, qx, pendingChanges, branchId, planAudit) {
  if (!pendingChanges || !pendingChanges.length) return { result:'Pass', reason:'', changeIds:[] };
  const planCodes = new Set([auditText_(planAudit && planAudit.oldPlanCode), auditText_(planAudit && planAudit.newPlanCode)]
    .join(',').split(',').map(value => value.trim()).filter(Boolean));
  const oldRecord = mainPlanRecordFromRows_(oldRows, tx, planAudit && planAudit.oldFamily, planAudit && planAudit.oldSourceCatalog);
  const newRecord = mainPlanRecordFromRows_(queueRows.map(row => row.values), qx, planAudit && planAudit.newFamily, planAudit && planAudit.newSourceCatalog);
  const unresolved = [];
  const hits = pendingChanges.filter(change => {
    if (planCodes.size) return planCodes.has(change.planCode);
    return [change.oldValuesJson, change.newValuesJson].some(json => {
      const record = parsePlanRecord_(json);
      if (!record) return false;
      const candidates = [oldRecord, newRecord].filter(candidate => sameMainPlanBusinessRecord_(candidate, record));
      if (!candidates.length) return false;
      if (candidates.some(candidate => sameMainPlanRecord_(candidate, record))) return true;
      if (candidates.some(candidate => !candidate.family || !candidate.sourceCatalog)) unresolved.push(change);
      return false;
    });
  });
  if (!hits.length && unresolved.length) {
    const codes = [...new Set(unresolved.map(change => change.planCode).filter(Boolean))].join(', ');
    return {
      result:'Need Check',
      reason:'方案商業值與待核准 Catalog 異動相同，但缺少唯一 Plan Code／家族／來源目錄，無法確認是否受方案 ' + codes + ' 影響，需人工確認',
      changeIds:[...new Set(unresolved.map(change => change.changeId))], branchId
    };
  }
  if (!hits.length) return { result:'Pass', reason:'', changeIds:[] };
  const details = hits.map(change => {
    const oldRecordValue = parsePlanRecord_(change.oldValuesJson);
    const newRecordValue = parsePlanRecord_(change.newValuesJson);
    const status = auditText_(change.approvalStatus) || 'Pending';
    return '方案 ' + change.planCode + ' ' + change.changeType + ' 尚未核准（狀態：' + status + '）：' +
      describePlanRecord_(oldRecordValue) + ' → ' + (newRecordValue ? describePlanRecord_(newRecordValue) : '停用');
  });
  return { result:'Need Check', reason:details.join('；'), changeIds:hits.map(change => change.changeId), branchId };
}

function mainPlanRecordFromRows_(rows, ix, family, sourceCatalog) {
  const main = rows.find(row => isMainProduct_(auditText_(auditGet_(row, ix, '產品', true))));
  if (!main) return null;
  const rawBonus = auditNumber_(auditGet_(main, ix, '合約贈送組數', true));
  return {
    family: normalPlanFamily_(family),
    sourceCatalog: auditText_(sourceCatalog),
    billing: referenceBillingPeriod_(auditGet_(main, ix, '付款週期', true)),
    product: auditText_(auditGet_(main, ix, '產品', true)),
    sets: referenceReservationSets_(auditGet_(main, ix, '合約組數', true)),
    bonus: rawBonus === null ? 0 : rawBonus,
    price: auditNumber_(auditGet_(main, ix, '合約價格', true)),
    overage: auditNumber_(auditGet_(main, ix, '超額每組單價', true))
  };
}

function parsePlanRecord_(json) {
  if (!auditText_(json)) return null;
  try { return JSON.parse(json); } catch (error) { return null; }
}

function sameMainPlanRecord_(left, right) {
  if (!left || !right) return false;
  return !!left.family && !!left.sourceCatalog &&
    left.family === normalPlanFamily_(right.family) && left.sourceCatalog === auditText_(right.sourceCatalog) &&
    sameMainPlanBusinessRecord_(left, right);
}

function sameMainPlanBusinessRecord_(left, right) {
  if (!left || !right) return false;
  return left.billing === right.billing && left.product === right.product &&
    referenceValuesEqual_(left.sets, right.sets) && numbersEqualAllowNull_(left.bonus, right.bonus) &&
    numbersEqualAllowNull_(left.price, right.price) && numbersEqualAllowNull_(left.overage, right.overage);
}

function describePlanRecord_(record) {
  if (!record) return '無資料';
  return [record.family, record.sourceCatalog, record.billing, record.product,
    '使用 ' + auditFormatNumber_(record.sets), '贈送 ' + auditFormatNumber_(record.bonus),
    '價格 ' + auditFormatNumber_(record.price), '超額 ' + auditFormatNumber_(record.overage)]
    .filter(Boolean).join('／');
}

function recordPlanChangeAffectedBranches_(sheet, affected) {
  if (!sheet || !Object.keys(affected).length) return;
  const values = sheet.getDataRange().getValues();
  const ix = headerIndex_(values[0].map(String));
  const idColumn = requiredHeader_(ix, 'Change ID', sheet.getName());
  const branchColumn = requiredHeader_(ix, 'Affected Branch IDs', sheet.getName());
  let changed = false;
  values.slice(1).forEach(row => {
    const changeId = auditText_(row[idColumn]);
    if (!affected[changeId]) return;
    const existing = auditText_(row[branchColumn]).split(',').map(value => value.trim()).filter(Boolean);
    const combined = [...new Set(existing.concat([...affected[changeId]]))].sort().join(', ');
    if (row[branchColumn] !== combined) { row[branchColumn] = combined; changed = true; }
  });
  if (changed) sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
}

function writePlanClassificationTrace_(sheet, branchId, origin, planAudit) {
  if (!sheet) return;
  const values = sheet.getDataRange().getValues();
  const ix = headerIndex_(values[0].map(String));
  const branchColumn = requiredHeader_(ix, 'Branch ID', sheet.getName());
  const rowIndex = values.slice(1).findIndex(row => auditText_(row[branchColumn]) === branchId);
  if (rowIndex < 0) return;
  const row = values[rowIndex + 1].slice();
  const put = (header, value) => { const column = requiredHeader_(ix, header, sheet.getName()); row[column] = value; };
  put('Original Plan Family', planAudit.oldFamily);
  put('New Plan Family', planAudit.newFamily);
  put('First Contract Start Date', origin && origin.firstContractStart ? origin.firstContractStart : '');
  put('Expected Plan Family', planAudit.expectedFamily || planAudit.oldFamily || '');
  put('Original Plan Code', planAudit.oldPlanCode || '');
  put('New Plan Code', planAudit.newPlanCode || '');
  put('Catalog Match Rule', planAudit.matchRule || '');
  put('Catalog Exception', planAudit.reason || '');
  put('Origin Source', origin && origin.source || '');
  sheet.getRange(rowIndex + 2, 1, 1, values[0].length).setValues([row]);
}

function decideAuditStatus_(renewalDataMissing, catalogChange, sourceDates, longTerm, contract, bonus, plan, special, share) {
  if (renewalDataMissing) return { status: 'Need Renewal Data', reason: 'Renewal DB 找不到或資料不足，已保留原始 TPR 方案。', note: 'Renewal DB 資料不足，已保留原始 TPR 方案，需補齊資料後再檢核。' };
  if (catalogChange.result !== 'Pass') return { status:'Need Plan Catalog Review', reason:catalogChange.reason, note:catalogChange.reason + '。' };
  const manualReasons = [];
  if (sourceDates.result !== 'Pass') manualReasons.push(sourceDates.reason);
  if (longTerm.result === 'Need Check') manualReasons.push(longTerm.reason);
  if (manualReasons.length) {
    const reason = manualReasons.join('；');
    return { status: 'Need Check', reason, note: reason + '。' };
  }
  if (contract.result === 'Need Review') return { status: 'Need Contract', reason: contract.reason, note: '需補齊合約／信件覆核：' + contract.reason + '。' };
  if (contract.result === 'Need Dual Seal') return { status: 'Need Dual Seal', reason: contract.reason, note: contract.reason + '。' };
  if (contract.result === 'Fail') return { status: 'Contract Mismatch', reason: contract.reason, note: contract.reason + '。' };
  if (bonus.result === 'Critical') return { status: 'Bonus Anomaly', reason: bonus.reason, note: bonus.reason + '。' };
  if (bonus.result === 'Warning') return { status: 'Need Check', reason: bonus.reason, note: bonus.reason + '。' };
  if (plan.result !== 'Pass') return { status: 'Need Check', reason: plan.reason, note: plan.reason + '。' };
  if (!['Not Required', 'Grandfathered', 'Approved'].includes(special.status)) return { status: 'Need Special Approval', reason: special.reason, note: special.reason + '。' };
  if (share.result !== 'Pass' && share.result !== 'Not Applicable') return { status: 'Need Check', reason: share.reason, note: share.reason + '。' };
  return { status: 'Ready', reason: '文件、方案與必要例外覆核皆已通過。', note: '文件、方案與必要例外覆核皆已通過。' };
}

function appendPlanDecisionReason_(decision, plan) {
  if (!decision || !plan || plan.result === 'Pass' || !auditText_(plan.reason)) return decision;
  if (auditText_(decision.reason).indexOf(auditText_(plan.reason)) >= 0) return decision;
  const reason = auditText_(decision.reason) + '；方案分類：' + auditText_(plan.reason);
  return Object.assign({}, decision, { reason, note: reason + '。' });
}

function normalPlanFamily_(value) {
  const v = auditText_(value).toLowerCase();
  if (v === 'public' || v === '公版' || v === 'lite' || v === 'lite 方案' ||
      v === 'email only' || v === 'email only 方案' || v === 'rsv public' ||
      v === 'rsv public lite' || v === 'rsv public email only') return 'Public';
  if (v === 'bd new' || v === 'bd新方案' || v === 'bd') return 'BD New';
  if (v === 'special' || v === '特殊') return 'Special';
  return '';
}
function isExplicitFail_(value) {
  if (value === false) return true;
  return ['false', 'fail', 'failed', 'no', 'mismatch', 'mismatched', 'not matched', '不通過', '不一致']
    .includes(auditText_(value).toLowerCase());
}
function isPass_(value) { return value === true || ['true', 'pass', 'passed', 'yes', 'approved', 'matched', 'complete'].includes(auditText_(value).toLowerCase()); }
function auditText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (typeof value === 'number') return String(value);
  return String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');
}
function auditGet_(row, ix, label, prefix) {
  const index = requiredHeader_(ix, label, 'Audit', !!prefix);
  return row[index];
}
function auditSet_(row, ix, label, value) { row[requiredHeader_(ix, label, 'Audit')] = value; }
