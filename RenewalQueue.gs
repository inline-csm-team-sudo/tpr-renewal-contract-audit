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
  'Deposit Commission Rate (%)', 'Deposit Buy-in Price (%)'
];
const PLAN_REVIEW_HEADERS = [
  'Branch ID', 'Original Plan Family', 'New Plan Family', 'Complete Plan Match',
  'Reviewer', 'Reviewed At', 'Notes'
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
  ['Deposit Commission Detail Required From', '2026-07-25', '此日期起的新覆核若有 Deposit-Commission，必須填入文件中的抽成比例或買入價格。']
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Renewal Queue')
    .addItem('Build Queue', 'buildQueue')
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
  const control = readSettings_(ss.getSheetByName('Control'));
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

function appendAudit_(sheet, batchId, month, count, missingTpr, missingRenewal) {
  sheet.appendRow([new Date(), batchId, month, 'Build Queue', count, missingTpr.join(', '), missingRenewal.join(', '), 'Test only; no formal TPR writeback']);
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
  ensureBonusAuditSettings_(controlSheet);
  const control = readSettings_(controlSheet);
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
  const shareOverageSource = shareOverageSourceAudit_(ss, control, byBranch, qx);
  const evidence = indexedReview_(ss.getSheetByName('Contract Evidence Review'), 'Branch ID');
  const plans = indexedReview_(ss.getSheetByName('Plan Classification Review'), 'Branch ID');
  const approvals = indexedReview_(ss.getSheetByName('Special Approval Review'), 'Branch ID');
  const shares = indexedReview_(ss.getSheetByName('Share Group Review'), 'Share Plan ID');
  const bonusReference = loadRsvBonusReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const familyReference = loadRsvFamilyReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const resultRows = [];
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
    const inferredFamilies = {
      oldFamily: inferRsvPlanFamily_(oldRows, tx, familyReference, shareOverage),
      newFamily: inferRsvPlanFamily_(queueRows.map(r => r.values), qx, familyReference, shareOverage)
    };
    const planAudit = planComplianceAudit_(plan, planChange, inferredFamilies);
    const special = specialApprovalAudit_(planAudit, approval, hasNonFullYearAnnualRenewal_(queueRows, qx));
    const sourceDates = originalTprDateAudit_(oldRows, queueRows, tx, qx);
    const longTerm = longTermContractAudit_(queueRows, qx, ev);
    const decision = decideAuditStatus_(renewalDataMissing, sourceDates, longTerm, contract, bonus, planAudit, special, share);
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
  });

  queue.getRange(2, 1, resultRows.length, queueHeaders.length).setValues(resultRows);
  queue.getRange(2, requiredHeader_(qx, 'Check', 'Queue') + 1, resultRows.length, 1)
    .clearDataValidations().insertCheckboxes();
  appendAudit_(ss.getSheetByName('Audit Log'), 'AUDIT-' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss'), '', resultRows.length, [], []);
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

function ensureBonusAuditSettings_(sheet) {
  if (!sheet) throw new Error('Control sheet was not found.');
  const values = sheet.getDataRange().getValues();
  const existing = new Set(values.slice(1).map(r => auditText_(r[0])).filter(Boolean));
  const missing = BONUS_AUDIT_SETTINGS.filter(r => !existing.has(r[0]));
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
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
  const oldNormalized = oldRows.map(row => normalizedPlanSignature_(row, tx, signatureOptions));
  const newNormalized = queueRows.map(r => normalizedPlanSignature_(r.values, qx, signatureOptions));
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
    return { action: 'Maintain', planChange: false, reason: '原方案續約：原合約為短約，年費與組數符合 30 天制 prorate 換算；續約改為完整一年。' };
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
  const labels = ['產品', '合約起始日', '合約結束日', '付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  return labels.map(h => {
    if (h === '超額每組單價' && ignoreShareOverage) return '';
    return auditText_(auditGet_(row, ix, h,
      h === '產品' || h.indexOf('合約') === 0 || h.indexOf('付款週期') === 0 || h.indexOf('超額') === 0
    ));
  }).join('¦');
}
function normalizedPlanSignature_(row, ix, options) {
  const labels = ['產品', '合約起始日', '合約結束日', '付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
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
  if (label === '付款週期' && !isMainProduct_(product)) return '';
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
  if (label === '合約價格' && !isMainProduct_(product) && billingCycle === 'monthly') {
    const monthly = Number(value);
    if (isFinite(monthly) && auditText_(value) !== '') return auditText_(monthly * 12);
  }
  if (label === '合約起始日' || label === '合約結束日') return auditDateText_(value) || auditText_(value);
  return auditText_(value);
}
function planDifferenceSummary_(oldRows, queueRows, tx, qx, options) {
  const fields = ['合約起始日', '合約結束日', '付款週期', '合約組數', '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  const oldByProduct = groupBy_(oldRows, row => auditText_(auditGet_(row, tx, '產品', true)));
  const newByProduct = groupBy_(queueRows.map(r => r.values), row => auditText_(auditGet_(row, qx, '產品', true)));
  const products = [...new Set(Object.keys(oldByProduct).concat(Object.keys(newByProduct)))].sort();
  const differences = [];
  products.forEach(product => {
    const oldGroup = (oldByProduct[product] || []).slice().sort((a, b) =>
      normalizedPlanSignature_(a, tx, options).localeCompare(normalizedPlanSignature_(b, tx, options))
    );
    const newGroup = (newByProduct[product] || []).slice().sort((a, b) =>
      normalizedPlanSignature_(a, qx, options).localeCompare(normalizedPlanSignature_(b, qx, options))
    );
    const paired = Math.min(oldGroup.length, newGroup.length);
    for (let i = 0; i < paired; i++) {
      fields.forEach(label => {
        const oldNormalized = normalizedPlanFieldValue_(oldGroup[i], tx, label, options);
        const newNormalized = normalizedPlanFieldValue_(newGroup[i], qx, label, options);
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
  const name = isPass_(review['Restaurant Name Match']);
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
  const evidenceExists = !!evidenceType || name || period.hasInput || plan || seals || directConsent || agreementEmail ||
    auditText_(review['Deposit Commission Rate (%)']) !== '' ||
    auditText_(review['Deposit Buy-in Price (%)']) !== '';
  const required = planChange
    ? '雙方用印正式合約／增補協議；餐廳名稱、合約期間與完整方案均須一致'
    : '完整信件中客戶明確同意，或雙方用印文件；餐廳名稱、合約期間與完整方案均須一致';
  if (!evidenceExists) return { result: 'Need Review', required, reason: '尚未填寫可讀取的合約／信件覆核結果' };
  if (period.result === 'Need Review') return { result: 'Need Review', required, reason: period.reason };
  if (period.result === 'Fail') return { result: 'Fail', required, reason: period.reason };
  if (depositCommission.result !== 'Pass') {
    return { result: depositCommission.result, required, reason: depositCommission.reason };
  }
  if (!name || !plan) return { result: 'Fail', required, reason: '合約／信件未確認餐廳名稱與完整方案皆一致' };
  if (billing.result !== 'Pass') return { result: billing.result, required, reason: billing.reason };
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
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = readTable_(sheet).filter(r => ['RSV Public', 'RSV BD New'].includes(auditText_(r['Plan Family'])));
  const families = groupBy_(rows, r => auditText_(r['Plan Family']));
  const out = [];
  Object.keys(families).forEach(family => {
    const decoded = families[family].map(r => ({
      sourceRow: Number(r['Source Row']),
      values: rawPlanValues_(r['Raw Values JSON'])
    })).filter(r => r.values.length);
    const annualMarker = decoded.find(r => auditText_(r.values[0]) === '年繳方案');
    if (!annualMarker) return;
    const annualRows = decoded.filter(r => r.sourceRow >= annualMarker.sourceRow);
    const usage = annualRows.find(r => auditText_(r.values[0]) === '使用組數');
    const bonus = annualRows.find(r => auditText_(r.values[0]) === '贈送組數');
    if (!usage || !bonus) return;
    const width = Math.max(usage.values.length, bonus.values.length);
    for (let col = 1; col < width; col++) {
      const paid = auditNumber_(usage.values[col]);
      const free = auditNumber_(bonus.values[col]);
      if (paid === null || paid <= 0 || free === null || free < 0) continue;
      out.push({ family, paid, bonus: free });
    }
  });
  return out;
}

function loadRsvFamilyReference_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = readTable_(sheet).filter(r =>
    ['RSV Public', 'RSV BD New'].includes(auditText_(r['Plan Family']))
  );
  const families = groupBy_(rows, r => auditText_(r['Plan Family']));
  const out = [];
  Object.keys(families).forEach(sourceFamily => {
    const family = sourceFamily === 'RSV Public' ? 'Public' : 'BD New';
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
          family,
          period: section.period,
          sets,
          bonus: free === null ? 0 : free,
          price: amount,
          overage: auditNumber_(overage.values[col])
        });
      }
    });
  });
  return out;
}

function referenceReservationSets_(value) {
  const text = auditText_(value).toLowerCase();
  if (text === 'unlimited') return 'unlimited';
  return auditNumber_(value);
}

function inferRsvPlanFamily_(rows, ix, reference, shareOverage) {
  const main = rows.find(r => isMainProduct_(auditText_(auditGet_(r, ix, '產品', true))));
  if (!main || !reference.length) return '';
  const period = auditText_(auditGet_(main, ix, '付款週期', true)).toLowerCase();
  const sets = referenceReservationSets_(auditGet_(main, ix, '合約組數', true));
  const rawBonus = auditNumber_(auditGet_(main, ix, '合約贈送組數', true));
  const bonus = rawBonus === null ? 0 : rawBonus;
  const price = auditNumber_(auditGet_(main, ix, '合約價格', true));
  const overage = auditNumber_(auditGet_(main, ix, '超額每組單價', true));
  const shareId = auditText_(auditGet_(main, ix, 'Share Plan ID'));
  const ignoreOverage = !!shareId && shareOverage && shareOverage.result === 'Pass';
  if (sets === null || price === null) return '';
  const matches = reference.filter(r =>
    r.period === period &&
    referenceValuesEqual_(r.sets, sets) &&
    numbersEqualAllowNull_(r.bonus, bonus) &&
    numbersEqualAllowNull_(r.price, price) &&
    (ignoreOverage || numbersEqualAllowNull_(r.overage, overage))
  );
  const families = [...new Set(matches.map(r => r.family))];
  return families.length === 1 ? families[0] : '';
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
  const pricedRows = queueRows.filter(r => auditText_(auditGet_(r.values, qx, '合約價格', true)) !== '');
  const mainTotal = pricedRows.filter(r => isMainProduct_(auditText_(auditGet_(r.values, qx, '產品', true))))
    .reduce((sum, r) => sum + Number(auditGet_(r.values, qx, '合約價格', true) || 0), 0);
  const addOnRows = pricedRows.filter(r => !isMainProduct_(auditText_(auditGet_(r.values, qx, '產品', true))));
  const positiveAddOns = addOnRows.filter(r => Number(auditGet_(r.values, qx, '合約價格', true) || 0) > 0);
  // The annual lump sum is only needed to distinguish annual from monthly
  // billing when at least one add-on has a positive recurring charge.  A
  // main-product-only renewal (including a Share-plan member) and zero-fee
  // add-ons cannot be ambiguous for this purpose.
  if (!positiveAddOns.length) return { result: 'Pass', reason: '' };
  const raw = auditText_(review['Annual Payment Amount (NTD)']).replace(/[,，\s$NTD]/gi, '');
  if (raw === '') return { result: 'Need Review', reason: '尚未填入信件／合約中的年繳總金額，無法確認正費用附加服務為年繳或月繳' };
  const amount = Number(raw);
  if (!isFinite(amount)) return { result: 'Need Review', reason: '年繳總金額格式無法判讀，請填入純數字金額' };
  const allTotal = pricedRows.reduce((sum, r) => sum + Number(auditGet_(r.values, qx, '合約價格', true) || 0), 0);
  if (Math.abs(amount - allTotal) <= 1) return { result: 'Pass', reason: '' };
  if (Math.abs(amount - mainTotal) <= 1 && positiveAddOns.length) {
    return { result: 'Need Review', reason: 'add-on 可能為月繳，請人工確認' };
  }
  return { result: 'Fail', reason: '信件／合約年繳總金額與 Queue 的主產品年費或主產品加附加服務年費皆不一致' };
}

function planComplianceAudit_(review, planChange, inferredFamilies) {
  const oldFamily = normalPlanFamily_(inferredFamilies && inferredFamilies.oldFamily) ||
    normalPlanFamily_(review['Original Plan Family']);
  const newFamily = normalPlanFamily_(inferredFamilies && inferredFamilies.newFamily) ||
    normalPlanFamily_(review['New Plan Family']);
  const fullMatch = isPass_(review['Complete Plan Match']);
  if (!oldFamily || !newFamily || !fullMatch) {
    // Exact original-plan renewals (including the approved add-on billing
    // cycle conversion) are already compared against the original TPR by
    // classifyAction_.  A blank family review must not block them.
    if (!planChange) {
      return { oldFamily: '', newFamily: '', result: 'Pass', specialCase: 'Not Required', reason: '原方案完整組合已與原始 TPR 比對一致。' };
    }
    return { oldFamily: oldFamily || 'Unknown', newFamily: newFamily || 'Unknown', result: 'Need Check', specialCase: 'Unknown', reason: '尚未由方案參照表確認舊／新方案家族與完整組合' };
  }
  if (oldFamily === 'Special' && newFamily === 'Special' && !planChange) {
    return { oldFamily, newFamily, result: 'Pass', specialCase: 'Grandfathered', reason: '' };
  }
  if (oldFamily === 'Special' && newFamily === 'Public') {
    return {
      oldFamily,
      newFamily,
      result: 'Pass',
      specialCase: 'StandardizedToPublic',
      reason: '原特殊方案已改為完整公版方案；雙方用印由合約檢核確認。'
    };
  }
  if ((oldFamily === 'Public' && newFamily === 'Public') || (oldFamily === 'BD New' && newFamily === 'BD New')) {
    return { oldFamily, newFamily, result: 'Pass', specialCase: 'Not Required', reason: '' };
  }
  return { oldFamily, newFamily, result: 'Pass', specialCase: 'Required', reason: '' };
}

function specialApprovalAudit_(plan, review, nonFullYearAnnualRenewal) {
  if (nonFullYearAnnualRenewal) {
    const approved = auditText_(review['Approval Status']).toLowerCase() === 'approved' && !!auditText_(review['Evidence URL']) && !!auditText_(review['Reviewer']) && !!review['Reviewed At'];
    return approved
      ? { required: 'Yes', status: 'Approved', reason: '' }
      : { required: 'Yes', status: unresolvedApprovalStatus_(review), reason: '年繳續約期間非完整一年，需特殊申請核准、佐證連結、覆核者與日期' };
  }
  if (plan.specialCase === 'StandardizedToPublic') {
    return {
      required: 'No',
      status: 'Not Required',
      reason: '原特殊方案改為完整公版方案，不需額外特殊申請；雙方用印由合約檢核確認'
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

function decideAuditStatus_(renewalDataMissing, sourceDates, longTerm, contract, bonus, plan, special, share) {
  if (renewalDataMissing) return { status: 'Need Renewal Data', reason: 'Renewal DB 找不到或資料不足，已保留原始 TPR 方案。', note: 'Renewal DB 資料不足，已保留原始 TPR 方案，需補齊資料後再檢核。' };
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

function normalPlanFamily_(value) {
  const v = auditText_(value).toLowerCase();
  if (v === 'public' || v === '公版') return 'Public';
  if (v === 'bd new' || v === 'bd新方案' || v === 'bd') return 'BD New';
  if (v === 'special' || v === '特殊') return 'Special';
  return '';
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
