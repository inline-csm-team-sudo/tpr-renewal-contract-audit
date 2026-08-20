/**
 * Test-only contract gate for the Renewal Queue.  It writes only to the
 * test workbook and never changes the original TPR or Renewal DB sources.
 * Evidence, seals and exception approvals deliberately require a reviewer.
 */
const AUDIT2_TEST_BOOK_ID = '1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4';
const AUDIT2_TPR_BOOK_ID = '1rZVU-n85eDh_ueaRyQojP8dSm4-MTeBz8frIyZynnb4';
const AUDIT2_QUEUE_TAB = 'TPR Update Queue';
const AUDIT2_QUEUE_HEADERS = [
  'Update Action', 'Plan Change', 'Original Plan Family', 'New Plan Family',
  'Plan Compliance', 'Required Evidence', 'Evidence Type', 'Inline Seal',
  'Customer Seal', 'Contract Check', 'Special Approval Required',
  'Special Approval Status', 'Share Group Check', 'Difference',
  'Update Status', 'Status Reason', 'Reviewed At'
];
const AUDIT2_EVIDENCE_HEADERS = [
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
const AUDIT2_PLAN_HEADERS = [
  'Branch ID', 'Original Plan Family', 'New Plan Family', 'Complete Plan Match',
  'Reviewer', 'Reviewed At', 'Notes',
  'First Contract Start Date', 'Expected Plan Family', 'Original Plan Code',
  'New Plan Code', 'Catalog Match Rule', 'Catalog Exception', 'Origin Source'
];
const AUDIT2_SPECIAL_HEADERS = [
  'Branch ID', 'Approval Status', 'Evidence URL', 'Reviewer', 'Reviewed At', 'Notes'
];
const AUDIT2_SHARE_HEADERS = [
  'Share Plan ID', 'Member Check', 'Tax ID Check', 'Contract Check',
  'Overage Check', 'Status', 'Reviewer', 'Reviewed At', 'Notes'
];

function installContractAuditMenu() {
  const ss = SpreadsheetApp.openById(AUDIT2_TEST_BOOK_ID);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'audit2OnOpen')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('audit2OnOpen').forSpreadsheet(ss).onOpen().create();
}

function audit2OnOpen() {
  SpreadsheetApp.getUi().createMenu('Contract Audit')
    .addItem('Run Contract Audit', 'runContractAudit')
    .addToUi();
}

// Retained only for historical reference.  The active audit entry point is
// RenewalQueue.gs#runContractAudit so both the Queue build and audit share
// the same original-renewal and prorate rules.
function runContractAuditLegacy() {
  return runContractAudit();
}

function audit2EnsureQueueHeaders_(queue) {
  const existing = queue.getRange(1, 1, 1, queue.getLastColumn()).getValues()[0].map(String);
  const missing = AUDIT2_QUEUE_HEADERS.filter(h => !existing.includes(h));
  if (missing.length) queue.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}
function audit2SetupReviewSheets_(ss, queue) {
  const evidence = audit2Sheet_(ss, 'Contract Evidence Review', AUDIT2_EVIDENCE_HEADERS);
  const plans = audit2Sheet_(ss, 'Plan Classification Review', AUDIT2_PLAN_HEADERS);
  const special = audit2Sheet_(ss, 'Special Approval Review', AUDIT2_SPECIAL_HEADERS);
  const share = audit2Sheet_(ss, 'Share Group Review', AUDIT2_SHARE_HEADERS);
  const values = queue.getDataRange().getValues(); const ix = audit2Index_(values[0]);
  const branches = {}; values.slice(1).forEach(r => { const id = audit2Text_(audit2Get_(r, ix, 'Branch ID')); if (id && !branches[id]) branches[id] = audit2Text_(audit2Get_(r, ix, '合約')); });
  audit2Append_(evidence, Object.keys(branches), id => [id, branches[id]]);
  audit2Append_(plans, Object.keys(branches), id => [id]);
  audit2Append_(special, Object.keys(branches), id => [id]);
  const shareIds = [...new Set(values.slice(1).map(r => audit2Text_(audit2Get_(r, ix, 'Share Plan ID'))).filter(Boolean))];
  audit2Append_(share, shareIds, id => [id]);
}
function audit2Sheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  if (!headers.every((h, i) => current[i] === h)) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1); return sheet;
}
function audit2Append_(sheet, ids, makeRow) {
  const existing = new Set(sheet.getDataRange().getValues().slice(1).map(r => audit2Text_(r[0])).filter(Boolean));
  const missing = ids.filter(id => !existing.has(id));
  if (missing.length) { const rows = missing.map(makeRow); sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
}
function audit2ReviewIndex_(sheet, key) {
  const values = sheet.getDataRange().getValues(); const ix = audit2Index_(values[0]); const col = audit2Col_(ix, key); const out = {};
  values.slice(1).forEach(row => { const id = audit2Text_(row[col]); if (id && !out[id]) out[id] = values[0].reduce((o, h, i) => (o[String(h)] = row[i], o), {}); }); return out;
}
function audit2OriginalRow_(row, ix, tpr) { const m = audit2Text_(audit2Get_(row, ix, 'Original TPR Row')).match(/!(\d+)$/); return m && Number(m[1]) >= 3 ? tpr[Number(m[1]) - 1] : null; }
function audit2Action_(oldRows, queueRows, tx, qx) {
  if (!oldRows.length) return 'Need Check'; const oldS = oldRows.map(r => audit2Signature_(r, tx)); const newS = queueRows.map(r => audit2Signature_(r.values, qx));
  if (audit2Same_(oldS, newS)) return 'Maintain'; const oldP = oldRows.map(r => audit2Product_(r, tx)); const newP = queueRows.map(r => audit2Product_(r.values, qx));
  if (newP.some(x => !oldP.includes(x))) return 'Add'; if (oldP.some(x => !newP.includes(x))) return 'Close/Remove'; return 'Update';
}
function audit2Signature_(row, ix) { return ['產品','合約起始日','合約結束日','付款週期','合約組數','合約贈送組數','合約價格','Share Plan ID','超額計算方式','超額每組單價'].map(h => audit2Text_(audit2Get_(row, ix, h, h !== 'Share Plan ID'))).join('¦'); }
function audit2Product_(row, ix) { return audit2Text_(audit2Get_(row, ix, '產品', true)) + '|' + audit2Text_(audit2Get_(row, ix, '超額計算方式', true)); }
function audit2Same_(a, b) { return a.length === b.length && a.slice().sort().join('\n') === b.slice().sort().join('\n'); }
function audit2Contract_(r, changed) {
  const name = audit2Pass_(r['Restaurant Name Match']), dates = audit2Pass_(r['Contract Period Match']), plan = audit2Pass_(r['Full Plan Match']);
  const seals = audit2Pass_(r['Inline Seal']) && audit2Pass_(r['Customer Seal']);
  const consent = audit2Pass_(r['Customer Explicit Consent']);
  const confirmation = audit2Pass_(r['Agreement Confirmation Text']) && audit2Text_(r['Confirmation Sender']).toLowerCase() === 'inline-csm-team@inline.tw';
  const required = changed ? '雙方用印正式合約／增補協議；餐廳名稱、合約期間與完整方案均須一致' : '完整信件中客戶明確同意，或雙方用印文件；餐廳名稱、合約期間與完整方案均須一致';
  const hasReview = ['Restaurant Name Match', 'Contract Period Match', 'Full Plan Match', 'Customer Explicit Consent', 'Agreement Confirmation Text', 'Inline Seal', 'Customer Seal', 'Status']
    .some(h => audit2Text_(r[h]));
  // The evidence URL is prefilled from Queue for convenience; it is not itself a review result.
  if (!hasReview) return {result:'Need Review', required, reason:'尚未填寫合約／信件覆核結果'};
  const reviewedAt = audit2Text_(r['Reviewed At']);
  const nameDetailRequired = reviewedAt >= '2026-08-13';
  const nameDetailPresent = audit2Text_(r['Document Restaurant Name']) &&
    audit2Text_(r['Restaurant Name Match Result']) &&
    audit2Text_(r['Reviewed Evidence File ID']) &&
    audit2Text_(r['Reviewed Evidence Modified At']);
  if (nameDetailRequired && !nameDetailPresent) return {result:'Need Review', required, reason:'餐廳名稱覆核追溯資料不完整：需填文件實際店名、人工比對結果、Drive 檔案 ID 與檔案更新時間'};
  if (nameDetailPresent && ['need review','need manual confirmation','manual review','人工確認','待人工確認'].includes(audit2Text_(r['Restaurant Name Match Result']).toLowerCase())) return {result:'Need Review', required, reason:'餐廳名稱未能確認一致：文件使用店家「' + audit2Text_(r['Document Restaurant Name']) + '」；需人工確認'};
  if (nameDetailPresent && !audit2Pass_(r['Restaurant Name Match Result'])) return {result:'Fail', required, reason:'餐廳名稱未能確認一致：文件使用店家「' + audit2Text_(r['Document Restaurant Name']) + '」'};
  if (!name || !dates || !plan) return {result:'Fail', required, reason:'合約／信件未確認餐廳名稱、合約期間與完整方案皆一致'};
  if (changed && !seals) return {result:'Need Dual Seal', required, reason:'方案有變更，需人工目視確認 inline 與客戶雙方用印'};
  if (!changed && !(seals || consent || confirmation)) return {result:'Need Review', required, reason:'原方案續約尚未確認客戶明確同意、指定達成合意信件或雙方用印'};
  return {result:'Pass', required, reason:''};
}
function audit2Plan_(r, changed) {
  const oldFamily = audit2Family_(r['Original Plan Family']), newFamily = audit2Family_(r['New Plan Family']);
  if (!oldFamily || !newFamily || !audit2Pass_(r['Complete Plan Match'])) return {oldFamily:oldFamily||'Unknown',newFamily:newFamily||'Unknown',result:'Need Check',special:'Unknown',reason:'尚未由方案參照表確認舊／新方案家族與完整組合'};
  if (oldFamily === 'Special' && newFamily === 'Special' && !changed) return {oldFamily,newFamily,result:'Pass',special:'Grandfathered',reason:''};
  if (oldFamily === 'Special' && newFamily === 'Public') return {oldFamily,newFamily,result:'Pass',special:'StandardizedToPublic',reason:'原特殊方案已改為完整公版方案；雙方用印由合約檢核確認。'};
  if ((oldFamily === 'Public' && newFamily === 'Public') || (oldFamily === 'BD New' && newFamily === 'BD New')) return {oldFamily,newFamily,result:'Pass',special:'Not Required',reason:''};
  return {oldFamily,newFamily,result:'Pass',special:'Required',reason:''};
}
function audit2Special_(plan, r) {
  if (plan.special === 'StandardizedToPublic') return {required:'No',status:'Not Required',reason:'原特殊方案改為完整公版方案，不需額外特殊申請；雙方用印由合約檢核確認'};
  if (plan.special === 'Not Required') return {required:'No',status:'Not Required',reason:''};
  if (plan.special === 'Grandfathered') return {required:'No',status:'Grandfathered',reason:''};
  if (plan.special === 'Unknown') return {required:'Unknown',status:'Unknown',reason:plan.reason};
  const ok = audit2Text_(r['Approval Status']).toLowerCase() === 'approved' && audit2Text_(r['Evidence URL']) && audit2Text_(r['Reviewer']) && r['Reviewed At'];
  return ok ? {required:'Yes',status:'Approved',reason:''} : {required:'Yes',status:audit2Text_(r['Approval Status'])||'Pending',reason:'需填入特殊申請核准紀錄、佐證連結、覆核者與日期'};
}
function audit2Share_(rows, qx, reviews) {
  const ids = [...new Set(rows.map(r => audit2Text_(audit2Get_(r.values, qx, 'Share Plan ID'))).filter(Boolean))]; if (!ids.length) return {result:'Not Applicable',reason:''};
  const ok = ids.every(id => { const r = reviews[id] || {}; return audit2Pass_(r['Member Check']) && audit2Pass_(r['Tax ID Check']) && audit2Pass_(r['Contract Check']) && audit2Pass_(r['Overage Check']) && audit2Pass_(r['Status']); });
  return ok ? {result:'Pass',reason:''} : {result:'Need Check',reason:'Share Plan 尚未確認完整成員、統編、合約期間與超額條件'};
}
function audit2Decision_(missing, contract, plan, special, share) {
  if (missing) return {status:'Need Renewal Data',reason:'Renewal DB 找不到或資料不足，已保留原始 TPR 方案。',note:'Renewal DB 資料不足，已保留原始 TPR 方案，需補齊資料後再檢核。'};
  if (contract.result === 'Need Review') return {status:'Need Contract',reason:contract.reason,note:'需補齊合約／信件覆核：' + contract.reason + '。'};
  if (contract.result === 'Need Dual Seal') return {status:'Need Dual Seal',reason:contract.reason,note:contract.reason + '。'};
  if (contract.result === 'Fail') return {status:'Contract Mismatch',reason:contract.reason,note:contract.reason + '。'};
  if (plan.result !== 'Pass') return {status:'Need Check',reason:plan.reason,note:plan.reason + '。'};
  if (!['Not Required','Grandfathered','Approved'].includes(special.status)) return {status:'Need Special Approval',reason:special.reason,note:special.reason + '。'};
  if (!['Pass','Not Applicable'].includes(share.result)) return {status:'Need Check',reason:share.reason,note:share.reason + '。'};
  return {status:'Ready',reason:'文件、方案與必要例外覆核皆已通過。',note:'文件、方案與必要例外覆核皆已通過。'};
}
function audit2Family_(v) { v = audit2Text_(v).toLowerCase(); if (v === 'public' || v === '公版' || v === 'lite' || v === 'lite 方案' || v === 'email only' || v === 'email only 方案' || v === 'rsv public' || v === 'rsv public lite' || v === 'rsv public email only') return 'Public'; if (v === 'bd new' || v === 'bd新方案' || v === 'bd') return 'BD New'; if (v === 'special' || v === '特殊') return 'Special'; return ''; }
function audit2Pass_(v) { return v === true || ['true','pass','passed','yes','approved','matched','complete'].includes(audit2Text_(v).toLowerCase()); }
function audit2Group_(items, key) { return items.reduce((o, x) => { const k = key(x); (o[k] || (o[k] = [])).push(x); return o; }, {}); }
function audit2Text_(v) { if (v instanceof Date && !isNaN(v.getTime())) return dateOnlyText_(v); return String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' '); }
function audit2Index_(headers) { return headers.reduce((o, h, i) => (o[String(h).trim()] = i, o), {}); }
function audit2Col_(ix, label, prefix) { if (ix[label] !== undefined) return ix[label]; if (prefix) { const hit = Object.keys(ix).find(h => h.indexOf(label) === 0); if (hit !== undefined) return ix[hit]; } throw new Error('Missing header: ' + label); }
function audit2Get_(row, ix, label, prefix) { return row[audit2Col_(ix, label, prefix)]; }
function audit2Put_(row, ix, label, value) { row[audit2Col_(ix, label)] = value; }
