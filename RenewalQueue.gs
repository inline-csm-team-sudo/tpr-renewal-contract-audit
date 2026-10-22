/**
 * Renewal DB -> TPR Queue converter.
 *
 * Test and Production use the same business logic, but every cloud project
 * must declare its identity through Script Properties.  The validated Test
 * workbook ID remains only as a production-safety sentinel and as the
 * one-time Deposit golden-fixture source; it is never a writable runtime
 * target in Production.
 */
const RENEWAL_QUEUE_VALIDATED_TEST_WORKBOOK_ID = '1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4';
const RENEWAL_QUEUE_ENVIRONMENT_KEYS = [
  'ENVIRONMENT', 'TARGET_WORKBOOK_ID', 'EXPECTED_WORKBOOK_NAME',
  'ORIGINAL_TPR_SPREADSHEET_ID', 'RENEWAL_DB_SPREADSHEET_ID',
  'RSV_PLAN_REFERENCE_SPREADSHEET_ID', 'DEPOSIT_PLAN_REFERENCE_SPREADSHEET_ID',
  'CHARGEBEE_IMPORT_SPREADSHEET_ID'
];
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
  'Contract Period Match', 'Full Plan Match', 'Manual Plan Veto', 'Customer Explicit Consent',
  'Agreement Confirmation Text', 'Confirmation Sender', 'Inline Seal',
  'Customer Seal', 'Reviewer', 'Reviewed At', 'Status', 'Notes',
  'Annual Payment Amount (NTD)', 'Billing Cycle Match',
  'Contract Start Date', 'Contract End Date',
  'Deposit Commission Rate (%)', 'Deposit Buy-in Price (%)',
  'Document Restaurant Name', 'Document Legal Entity Name',
  'Restaurant Name Match Result', 'Restaurant Alias Evidence',
  'Reviewed Evidence File ID', 'Reviewed Evidence Modified At',
  'Annual Payment Evidence Quote', 'Annual Payment Evidence Location',
  'Structured Review Version', 'Structured Contract Data',
  'Document Match Result', 'Document Match Detail'
];
const STRUCTURED_EVIDENCE_POPULATION_HEADERS = [
  'Evidence Type', 'Customer Explicit Consent', 'Agreement Confirmation Text',
  'Confirmation Sender', 'Inline Seal', 'Customer Seal', 'Contract Start Date',
  'Contract End Date', 'Annual Payment Amount (NTD)',
  'Annual Payment Evidence Quote', 'Annual Payment Evidence Location'
];
const STRUCTURED_ANNUAL_PAYMENT_HEADERS = [
  'Annual Payment Amount (NTD)', 'Annual Payment Evidence Quote',
  'Annual Payment Evidence Location'
];
const STRUCTURED_PRODUCT_COMPARISON_FIELDS = [
  ['billing', '付款週期'], ['sets', '使用組數'], ['bonus', '贈送組數'], ['price', '價格'],
  ['share', 'Share Plan ID'], ['overageMethod', '超額計算方式'], ['overagePrice', '超額單價']
];
const STRUCTURED_PRODUCT_FIELD_APPLICABILITY = {
  'Deposit-Commission':['bonus', 'overageMethod'],
  'Survey':['billing', 'price'],
  'Voice':['billing', 'price']
};
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
  'Overage Check', 'Status', 'Reviewer', 'Reviewed At', 'Notes',
  'Automated Check Detail', 'Review Batch ID'
];
const BRANCH_TAX_ID_REFERENCE_HEADERS = [
  'Branch ID', 'Tax ID', 'Source Spreadsheet ID', 'Source Tab', 'Source Row',
  'Imported At', 'Source Rows', 'Import Status', 'Notes', 'Review Batch ID'
];
const CHARGEBEE_BRANCH_TAX_ID_TAB = 'TW';
const CHARGEBEE_BRANCH_ID_COLUMN = 1;
const CHARGEBEE_TAX_ID_COLUMN = 17;
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
  ['Deposit Plan Reference Tab', '訂金方案', 'Deposit 方案來源分頁；正常 Queue／Audit 流程唯讀。'],
  ['Chargebee Import Spreadsheet ID', '1TPp2_4wo_5VNBdMOLcnFzIA1X1EIhRv5sCMiFlLis6s', 'Branch Tax ID 權威來源；所有 Queue／Audit 流程永久唯讀。'],
  ['Legacy Branch Master Tab', 'Legacy Branch Master', 'Legacy cohort 主檔；正常流程不得重新掃描 Raw : TPR。'],
  ['Legacy Branch ID Header', 'Branch ID', 'Legacy Branch Master 的 Branch ID 欄位標題。']
];
const PLAN_REFERENCE_SNAPSHOT_HEADERS = [
  'Snapshot ID', 'Plan Family', 'Source Spreadsheet ID', 'Source Tab',
  'Source Row', 'Imported At', 'Raw Values JSON', 'Normalized Combination ID',
  'Special Plan Flag'
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

function renewalEnvironmentConfig_() {
  if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) {
    throw new Error('Renewal environment Script Properties are unavailable. Zero writes performed.');
  }
  const properties = PropertiesService.getScriptProperties().getProperties();
  const missing = RENEWAL_QUEUE_ENVIRONMENT_KEYS.filter(key => !auditText_(properties[key]));
  if (missing.length) {
    throw new Error('Renewal environment Script Properties are incomplete: ' + missing.join(', ') +
      '. Zero writes performed.');
  }
  const environment = auditText_(properties.ENVIRONMENT).toLowerCase();
  if (environment !== 'test' && environment !== 'production') {
    throw new Error('ENVIRONMENT must be test or production; received ' + properties.ENVIRONMENT +
      '. Zero writes performed.');
  }
  const targetWorkbookId = auditText_(properties.TARGET_WORKBOOK_ID);
  if (environment === 'production' && targetWorkbookId === RENEWAL_QUEUE_VALIDATED_TEST_WORKBOOK_ID) {
    throw new Error('Production TARGET_WORKBOOK_ID points to the validated Test workbook. Zero writes performed.');
  }
  if (environment === 'test' && targetWorkbookId !== RENEWAL_QUEUE_VALIDATED_TEST_WORKBOOK_ID) {
    throw new Error('Test TARGET_WORKBOOK_ID does not match the validated Test workbook. Zero writes performed.');
  }
  return {
    environment,
    targetWorkbookId,
    expectedWorkbookName:auditText_(properties.EXPECTED_WORKBOOK_NAME),
    originalTprSpreadsheetId:auditText_(properties.ORIGINAL_TPR_SPREADSHEET_ID),
    renewalDbSpreadsheetId:auditText_(properties.RENEWAL_DB_SPREADSHEET_ID),
    rsvPlanReferenceSpreadsheetId:auditText_(properties.RSV_PLAN_REFERENCE_SPREADSHEET_ID),
    depositPlanReferenceSpreadsheetId:auditText_(properties.DEPOSIT_PLAN_REFERENCE_SPREADSHEET_ID),
    chargebeeImportSpreadsheetId:auditText_(properties.CHARGEBEE_IMPORT_SPREADSHEET_ID)
  };
}

function openConfiguredRenewalWorkbook_() {
  const config = renewalEnvironmentConfig_();
  const ss = SpreadsheetApp.openById(config.targetWorkbookId);
  const actualId = auditText_(ss.getId());
  const actualName = auditText_(ss.getName());
  if (actualId !== config.targetWorkbookId || actualName !== config.expectedWorkbookName) {
    throw new Error('Renewal target identity mismatch: expected ' + config.expectedWorkbookName +
      ' (' + config.targetWorkbookId + '), received ' + actualName + ' (' + actualId +
      '). Zero writes performed.');
  }
  return { ss, config };
}

function assertConfiguredSourceIds_(runtime, control) {
  const checks = [
    ['Original TPR Spreadsheet ID', runtime.config.originalTprSpreadsheetId],
    ['Renewal DB Spreadsheet ID', runtime.config.renewalDbSpreadsheetId],
    ['RSV Plan Reference Spreadsheet ID', runtime.config.rsvPlanReferenceSpreadsheetId],
    ['Plan Reference Spreadsheet ID', runtime.config.depositPlanReferenceSpreadsheetId],
    ['Chargebee Import Spreadsheet ID', runtime.config.chargebeeImportSpreadsheetId]
  ];
  const errors = checks.filter(item => auditText_(control[item[0]]) !== item[1])
    .map(item => item[0] + '：Control=' + (auditText_(control[item[0]]) || '空白') +
      '、Script Properties=' + item[1]);
  const sourceIds = checks.map(item => item[1]);
  if (sourceIds.some(id => id === runtime.config.targetWorkbookId)) {
    errors.push('TARGET_WORKBOOK_ID 不得等於任何正式 source ID');
  }
  if (new Set(sourceIds).size !== sourceIds.length) {
    errors.push('正式 source IDs 必須彼此唯一');
  }
  if (errors.length) {
    throw new Error('Renewal source identity preflight failed: ' + errors.join('；') +
      '. Zero writes performed.');
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Renewal Queue')
    .addItem('Build Queue Dry Run', 'buildQueueDryRun')
    .addItem('Build Queue', 'buildQueue')
    .addItem('Prepare Contract Review Batch', 'prepareContractReviewBatch')
    .addItem('Sync Plan Catalog', 'syncPlanCatalog')
    .addItem('Maintain Plan Codes', 'maintainPlanCodes')
    .addItem('Run Contract Audit', 'runContractAudit')
    .addItem('Validate configuration', 'validateConfiguration')
    .addToUi();
}

// Run once from Apps Script to show the Renewal Queue menu in the configured workbook.
function installWorkbookMenu() {
  const runtime = openConfiguredRenewalWorkbook_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onOpen')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(runtime.ss)
    .onOpen()
    .create();
}

function installTestWorkbookMenu() {
  return installWorkbookMenu();
}

function buildQueue() {
  return buildQueueWithMode_(false);
}

function buildQueueDryRun() {
  return buildQueueWithMode_(true);
}

function buildQueueWithMode_(dryRun) {
  const runtime = openConfiguredRenewalWorkbook_();
  const ss = runtime.ss;
  const queueTimeZone = ss.getSpreadsheetTimeZone();
  const controlSheet = ss.getSheetByName('Control');
  let control = readSettings_(controlSheet);
  if (!dryRun) {
    ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
    control = readSettings_(controlSheet);
  }
  assertConfiguredSourceIds_(runtime, control);
  if (dryRun) {
    validatePlanReferenceSourcesReadOnly_(ss, control);
  } else {
    syncPlanCatalog_(ss, control);
  }
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
    const data = transformRow_(base, queueIndex, renewalRow.values, renewalSet.indexes, planRules, renewalSet.timeZone, queueTimeZone);
    setExact_(data, queueIndex, 'Check', false);
    output.push([...data, batchId, 'TPR!' + source.row, renewalMonth + '!' + renewalRow.row, data._status || 'Converted — review required']);
  });

  const missingTpr = useCheckBox ? [] : manualIds.filter(id => !foundSourceIds.has(id));
  const missingRenewal = [...new Set(sourceRows
    .filter(x => !renewalByMonth[x.renewalMonth].byBranch[String(x.values[branchCol]).trim()])
    .map(x => x.renewalMonth + ':' + String(x.values[branchCol]).trim()))];
  if (!output.length) {
    if (dryRun) {
      return {
        dryRun:true, branchCount:ids.length, productRowCount:0, renewalMonths:months,
        sourceRows:sourceRows.map(item => item.row), missingTpr, missingRenewal
      };
    }
    appendAudit_(ss.getSheetByName('Audit Log'), batchId, monthLabel, 0, missingTpr, missingRenewal);
    notify_('No Queue rows were built. The existing Queue was kept unchanged.\n' +
      'Check that selected TPR rows have a matching Renewal DB row.');
    return;
  }
  if (dryRun) {
    const result = {
      dryRun:true,
      branchCount:ids.length,
      productRowCount:output.length,
      renewalMonths:months,
      sourceRows:sourceRows.map(item => item.row),
      missingTpr,
      missingRenewal
    };
    console.log(JSON.stringify(result));
    return result;
  }
  writeQueue_(queue, queueHeaders, output, queueIndex);
  setupAuditSheets_(ss, queue);
  assertQueueWriteIntegrity_(queue, queueHeaders, output, 'Build completion');
  appendAudit_(ss.getSheetByName('Audit Log'), batchId, monthLabel, output.length, missingTpr, missingRenewal);
  notify_(
    'Queue built: ' + output.length + ' product rows across ' + monthLabel + '.\n' +
    'Missing original TPR: ' + (missingTpr.join(', ') || 'none') + '\n' +
    'Missing Renewal DB: ' + (missingRenewal.join(', ') || 'none')
  );
}

function validateConfiguration() {
  const runtime = openConfiguredRenewalWorkbook_();
  const ss = runtime.ss;
  assertConfiguredSourceIds_(runtime, readSettings_(ss.getSheetByName('Control')));
  const maps = readTable_(ss.getSheetByName('Field Mapping')).filter(r => isActive_(r['Active']));
  const duplicates = maps.filter((r, i, all) => all.findIndex(x => x['Mapping Key'] === r['Mapping Key']) !== i);
  notify_(duplicates.length ? 'Duplicate Mapping Key: ' + duplicates.map(r => r['Mapping Key']).join(', ') : 'Configuration looks structurally valid.');
}

function syncPlanCatalog() {
  const runtime = openConfiguredRenewalWorkbook_();
  const ss = runtime.ss;
  const controlSheet = ss.getSheetByName('Control');
  assertConfiguredSourceIds_(runtime, readSettings_(controlSheet));
  ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
  const control = readSettings_(controlSheet);
  assertConfiguredSourceIds_(runtime, control);
  const result = syncPlanCatalog_(ss, control);
  notify_('Plan catalog synced. Active plans: ' + result.activePlans.length +
    '; pending changes: ' + result.pendingChanges.length + '.');
}

function maintainPlanCodes() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const runtime = openConfiguredRenewalWorkbook_();
    const ss = runtime.ss;
    const control = readSettings_(ss.getSheetByName('Control'));
    assertConfiguredSourceIds_(runtime, control);
    const sourceSpreadsheetId = auditText_(control['RSV Plan Reference Spreadsheet ID']);
    const sourceTab = auditText_(control['RSV Plan Reference Tab']);
    const codeHeader = auditText_(control['RSV Plan Code Header']) || 'Plan Code';
    if (!sourceSpreadsheetId || !sourceTab) {
      throw new Error('RSV plan-reference source is not configured.');
    }
    const sourceSheet = SpreadsheetApp.openById(sourceSpreadsheetId).getSheetByName(sourceTab);
    if (!sourceSheet) throw new Error('RSV plan-reference tab was not found: ' + sourceTab);
    const result = assignMissingPlanCodes_(sourceSheet, sourceSpreadsheetId, sourceTab, codeHeader);
    notify_('Plan Code maintenance completed. Assigned codes: ' +
      (result.assignments.length
        ? result.assignments.map(item => sourceTab + '!' + item.rowNumber + '=' + item.planCode).join(', ')
        : 'none') + '. Run Sync Plan Catalog or the Audit again to refresh the test Catalog.');
  } finally {
    lock.releaseLock();
  }
}

function transformRow_(row, ix, renewal, mapping, planRules, renewalTimeZone, queueTimeZone) {
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
  setByPrefix_(row, ix, '合約起始日', dateOnlyForQueue_(value('new_start'), renewalTimeZone, queueTimeZone));
  setByPrefix_(row, ix, '合約結束日', dateOnlyForQueue_(value('new_end'), renewalTimeZone, queueTimeZone));
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
  prepareQueueWriteSurface_(sheet, headers);
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length)
    .setValues(rows.map(r => r.slice(0, headers.length).concat(Array(Math.max(0, headers.length - r.length)).fill(''))));
  const check = requiredHeader_(ix, 'Check', 'Queue') + 1;
  const contractStart = requiredHeader_(ix, '合約起始日', 'Queue', true) + 1;
  const contractEnd = requiredHeader_(ix, '合約結束日', 'Queue', true) + 1;
  const bonus = requiredHeader_(ix, '合約贈送組數', 'Queue', true) + 1;
  const overage = requiredHeader_(ix, '超額每組單價', 'Queue', true) + 1;
  if (rows.length) {
    sheet.getRange(2, check, rows.length, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    sheet.getRange(2, contractStart, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, contractEnd, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, bonus, rows.length, 1).setNumberFormat('0.00');
    sheet.getRange(2, overage, rows.length, 1).setNumberFormat('0.000');
  }
  assertQueueWriteIntegrity_(sheet, headers, rows, 'Build writer');
}

// Queue presentation and persistence only. Never filter business inputs or reset Check values.
function prepareQueueWriteSurface_(sheet, headers) {
  const filter = sheet.getFilter();
  if (filter) {
    filter.remove();
    SpreadsheetApp.flush();
  }
  const check = requiredHeader_(headerIndex_(headers), 'Check', 'Queue') + 1;
  const count = sheet.getMaxRows() - 1;
  if (count > 0) {
    sheet.showRows(2, count);
    sheet.getRange(2, check, count, 1).clearDataValidations();
  }
}

function queueWriteCellToken_(value, header, timeZone) {
  if (value === '' || value === null || value === undefined) return 'blank';
  // Persistence comparison only: auditText_ serializes seals, but Sheets may return booleans.
  // Do not coerce Check, policy/status tokens, missing values, or immutable source fields.
  if (['Inline Seal', 'Customer Seal'].map(norm_).indexOf(norm_(header)) >= 0) {
    if (typeof value === 'boolean') return 'boolean:' + value;
    if (typeof value === 'string' && /^(true|false)$/i.test(value)) {
      return 'boolean:' + value.toLowerCase();
    }
  }
  if (norm_(header).indexOf(norm_('合約起始日')) === 0 ||
      norm_(header).indexOf(norm_('合約結束日')) === 0) {
    const date = dateOnlyText_(value, timeZone);
    if (date) return 'date:' + date;
  }
  if (value instanceof Date) return 'datetime:' + value.getTime();
  return typeof value + ':' + String(value);
}

function assertQueueWriteIntegrity_(sheet, headers, rows, phase) {
  SpreadsheetApp.flush();
  const ix = headerIndex_(headers);
  const branchColumn = requiredHeader_(ix, 'Branch ID', 'Queue');
  const checkColumn = requiredHeader_(ix, 'Check', 'Queue');
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  const expected = rows.map(row => headers.map((header, column) =>
    row[column] === undefined ? '' : row[column]));
  const fail = (row, field, wanted, actual) => {
    throw new Error('Queue integrity ' + phase + ' row ' + row + ' field ' + field +
      ': expected=' + wanted + ', actual=' + actual + '. No retry or corrective write performed.');
  };
  if (sheet.getFilter()) fail(1, 'standard filter', 'none', 'present');
  const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  headers.forEach((header, column) => {
    const wanted = header === null || header === undefined ? '' : header;
    if (actualHeaders[column] !== wanted) fail(1, header || '(blank header)', wanted, actualHeaders[column]);
  });
  if (rows.length) {
    const range = sheet.getRange(2, 1, rows.length, headers.length);
    const actual = range.getValues();
    const displays = range.getDisplayValues();
    const rules = sheet.getRange(2, checkColumn + 1, rows.length, 1).getDataValidations();
    expected.forEach((row, index) => {
      if (!auditText_(row[branchColumn])) fail(index + 2, 'Branch ID', 'nonblank current identity', 'blank');
      if (sheet.isRowHiddenByFilter(index + 2) || sheet.isRowHiddenByUser(index + 2)) {
        fail(index + 2, 'visibility', 'visible', 'hidden');
      }
      if (!rules[index][0] || rules[index][0].getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
        fail(index + 2, 'Check validation', 'CHECKBOX', 'missing or different');
      }
      headers.forEach((header, column) => {
        if (/^#(?:NUM!|VALUE!|N\/A|REF!|DIV\/0!|NAME\?|ERROR!|SPILL!|NULL!)/.test(displays[index][column])) {
          fail(index + 2, header, 'no Sheets error', displays[index][column]);
        }
        const wanted = queueWriteCellToken_(row[column], header, timeZone);
        const found = queueWriteCellToken_(actual[index][column], header, timeZone);
        if (wanted !== found) fail(index + 2, header || '(blank header)', wanted, found);
      });
    });
  }
  const tailCount = sheet.getMaxRows() - rows.length - 1;
  if (tailCount > 0) {
    const first = rows.length + 2;
    const checks = sheet.getRange(first, checkColumn + 1, tailCount, 1);
    const values = checks.getValues();
    const rules = checks.getDataValidations();
    const branches = sheet.getRange(first, branchColumn + 1, tailCount, 1).getValues();
    values.forEach((row, index) => {
      if (row[0] !== '') fail(first + index, 'tail Check', 'blank', row[0]);
      if (rules[index][0]) fail(first + index, 'tail Check validation', 'none', 'present');
      if (auditText_(branches[index][0])) fail(first + index, 'tail Branch ID', 'blank', branches[index][0]);
    });
  }
}

function writeQueueAuditResults_(sheet, headers, beforeRows, resultRows) {
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  const writable = ['Check', 'Note'].concat(QUEUE_AUDIT_HEADERS).map(norm_);
  const sourceToken = row => JSON.stringify(headers.map((header, column) =>
    writable.indexOf(norm_(header)) >= 0 ? null : queueWriteCellToken_(row[column], header, timeZone)));
  const before = beforeRows.map(sourceToken).sort();
  const after = resultRows.map(sourceToken).sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Queue Audit source fields changed in output array; zero Queue writes performed.');
  }
  prepareQueueWriteSurface_(sheet, headers);
  if (resultRows.length) {
    sheet.getRange(2, 1, resultRows.length, headers.length).setValues(resultRows);
    const check = requiredHeader_(headerIndex_(headers), 'Check', 'Queue') + 1;
    sheet.getRange(2, check, resultRows.length, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
  assertQueueWriteIntegrity_(sheet, headers, resultRows, 'Audit writer');
}

function assertDocumentMatchTraceReadBack_(sheet, traces) {
  if (!traces.length) return;
  SpreadsheetApp.flush();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const ix = headerIndex_(headers);
  const result = requiredHeader_(ix, 'Document Match Result', sheet.getName());
  const detail = requiredHeader_(ix, 'Document Match Detail', sheet.getName());
  traces.forEach(trace => {
    const row = sheet.getRange(trace.targetRowNumber, 1, 1, headers.length).getValues()[0];
    const expected = [trace.result, trace.detail || trace.reason || ''];
    [result, detail].forEach((column, index) => {
      if (row[column] !== expected[index]) {
        throw new Error('Audit trace read-back row ' + trace.targetRowNumber + ' field ' + headers[column] +
          ': expected=' + expected[index] + ', actual=' + row[column] + '. No corrective write performed.');
      }
    });
  });
}

function appendAudit_(sheet, batchId, month, count, missingTpr, missingRenewal, operation) {
  sheet.appendRow([new Date(), batchId, month, operation || 'Build Queue', count, missingTpr.join(', '), missingRenewal.join(', '), 'Audit workbook only; no formal source writeback']);
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
function dateOnlyForQueue_(value, sourceTimeZone, destinationTimeZone) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return value;
  const dateText = Utilities.formatDate(value, sourceTimeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  // A Sheets date is local midnight in the destination spreadsheet. Parsing
  // the source Y-M-D in that time zone keeps the stored value date-only and
  // avoids the hidden 08:00 produced by writing UTC midnight to Asia/Taipei.
  return Utilities.parseDate(dateText, destinationTimeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
  const runtime = openConfiguredRenewalWorkbook_();
  const ss = runtime.ss;
  const controlSheet = ss.getSheetByName('Control');
  let control = readSettings_(controlSheet);
  ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
  control = readSettings_(controlSheet);
  assertConfiguredSourceIds_(runtime, control);
  const queue = ss.getSheetByName('TPR Update Queue');
  if (!queue || queue.getLastRow() < 2) throw new Error('TPR Update Queue has no data. Build Queue first.');
  setupAuditSheets_(ss, queue);
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
  const shareOverageSource = queueShareOverageAudit_(byBranch, qx);
  const activeContractReviewBatchId = auditText_(control['Active Contract Review Batch ID']);
  const evidence = indexedEvidenceReviews_(
    ss.getSheetByName('Contract Evidence Review'), 'Branch ID', Object.keys(byBranch),
    activeContractReviewBatchId
  );
  const planReviewSheet = ss.getSheetByName('Plan Classification Review');
  const plans = indexedPlanClassificationReviews_(
    planReviewSheet, 'Branch ID', Object.keys(byBranch), activeContractReviewBatchId
  );
  const approvals = indexedReview_(ss.getSheetByName('Special Approval Review'), 'Branch ID');
  const queueShareIds = queueSharePlanIds_(byBranch, qx);
  const shares = indexedCurrentBatchReview_(
    ss.getSheetByName('Share Group Review'), 'Share Plan ID', queueShareIds,
    activeContractReviewBatchId
  );
  const branchTaxIds = indexedCurrentBatchReview_(
    ss.getSheetByName('Branch Tax ID Reference'), 'Branch ID', Object.keys(byBranch),
    activeContractReviewBatchId
  );
  const shareAudits = structuredShareGroupAudits_(
    byBranch, qx, evidence, branchTaxIds, shares, activeContractReviewBatchId
  );
  const bonusReference = loadRsvBonusReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const familyReference = loadRsvFamilyReference_(ss.getSheetByName('Plan Reference Snapshot'));
  const resultRows = [];
  const documentMatchTraces = [];
  const planClassificationTraces = [];
  const shareGroupTraces = Object.keys(shareAudits.byGroup)
    .map(shareId => shareAudits.byGroup[shareId].trace).filter(Boolean);
  const affectedCatalogChanges = {};
  let readyBranches = 0;

  Object.keys(byBranch).forEach(branchId => {
    const queueRows = byBranch[branchId];
    const oldRows = queueRows.map(r => originalTprRow_(r.values, qx, tprValues, tx)).filter(Boolean);
    const shareOverage = shareOverageSource.byBranch[branchId] || { result: 'Not Applicable', reason: '' };
    const comparison = classifyAction_(oldRows, queueRows, tx, qx, shareOverage);
    const action = comparison.action;
    const planChange = comparison.planChange;
    const evidenceEntry = evidence[branchId] || null;
    const ev = evidenceEntry ? evidenceEntry.review : {};
    const planEntry = plans[branchId] || null;
    const plan = planEntry ? planEntry.review : {};
    const approval = approvals[branchId] || {};
    const share = shareAudit_(queueRows, qx, shareAudits.byGroup);
    const renewalDataMissing = queueRows.some(r => auditText_(auditGet_(r.values, qx, 'Transformation Status')).indexOf('Need Renewal Data') === 0);
    let documentMatch = structuredDocumentMatchAudit_(ev, queueRows, qx);
    if (evidenceEntry && evidenceEntry.currentBatchMode && documentMatch.result === 'NO_STRUCTURED_DATA') {
      const reason = '目前 Active Contract Review Batch「' + evidenceEntry.reviewBatchId + '」row ' +
        evidenceEntry.rowNumber + ' 已進入 structured review，但 Structured Review Version／' +
        'Structured Contract Data 缺失；不得 fallback 到 historical Full Plan Match';
      documentMatch = { result:'NEEDS_REVIEW', hasInput:true, reason, detail:reason };
    }
    const evidencePopulation = documentMatch && documentMatch.evidencePopulation ||
      structuredContractEvidencePopulation_(documentMatch && documentMatch.structuredData);
    const contractReview = structuredReviewForProtectedGates_(ev, documentMatch, evidencePopulation);
    const billing = billingCycleAudit_(contractReview, queueRows, qx);
    const contract = contractAudit_(contractReview, documentMatch, planChange, billing, queueRows, qx, control, comparison.reason);
    if (evidenceEntry && evidenceEntry.targetRowNumber !== null) {
      documentMatchTraces.push(Object.assign({}, documentMatch, {
        branchId,
        targetRowNumber:evidenceEntry.targetRowNumber,
        reviewBatchId:evidenceEntry.reviewBatchId,
        expectedStructuredReviewVersion:auditText_(ev['Structured Review Version']),
        expectedStructuredContractData:auditText_(ev['Structured Contract Data']),
        evidencePopulation:evidencePopulation.fields,
        expectedEvidencePopulation:Object.keys(evidencePopulation.fields).reduce((out, header) => {
          out[header] = ev[header];
          return out;
        }, {})
      }));
    }
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
      auditSet_(output, qx, 'Evidence Type', auditText_(contractReview['Evidence Type']));
      auditSet_(output, qx, 'Inline Seal', auditText_(contractReview['Inline Seal']));
      auditSet_(output, qx, 'Customer Seal', auditText_(contractReview['Customer Seal']));
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
    if (planEntry) {
      planClassificationTraces.push({
        branchId,
        targetRowNumber:planEntry.targetRowNumber,
        reviewBatchId:planEntry.reviewBatchId,
        origin,
        planAudit
      });
    }
  });

  recordPlanChangeAffectedBranches_(ss.getSheetByName('Plan Catalog Change Review'), affectedCatalogChanges);
  writePlanClassificationTraces_(
    planReviewSheet, planClassificationTraces, activeContractReviewBatchId
  );
  writeDocumentMatchTraces_(
    ss.getSheetByName('Contract Evidence Review'), documentMatchTraces,
    activeContractReviewBatchId
  );
  writeShareGroupTraces_(
    ss.getSheetByName('Share Group Review'), shareGroupTraces,
    activeContractReviewBatchId
  );

  assertDocumentMatchTraceReadBack_(ss.getSheetByName('Contract Evidence Review'), documentMatchTraces);
  writeQueueAuditResults_(queue, queueHeaders, queueValues.slice(1), resultRows);
  appendAudit_(ss.getSheetByName('Audit Log'), 'AUDIT-' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss'), '', resultRows.length, [], [], 'Contract Audit');
  notify_('Contract audit completed. Ready branches: ' + readyBranches + ' / ' + Object.keys(byBranch).length +
    '. Review tabs must explicitly confirm document, plan, special approval and Share evidence before Check can be TRUE.');
}

function setupAuditSheets_(ss, queue) {
  ensureReviewSheetHeadersByName_(ss, 'Contract Evidence Review', EVIDENCE_REVIEW_HEADERS.concat(['Review Batch ID']));
  ensureReviewSheetHeadersByName_(ss, 'Plan Classification Review', PLAN_REVIEW_HEADERS.concat(['Review Batch ID']));
  ensureReviewSheet_(ss, 'Special Approval Review', SPECIAL_REVIEW_HEADERS);
  ensureReviewSheetHeadersByName_(ss, 'Share Group Review', SHARE_REVIEW_HEADERS);
  ensureReviewSheetHeadersByName_(ss, 'Branch Tax ID Reference', BRANCH_TAX_ID_REFERENCE_HEADERS);
}

function prepareContractReviewBatch() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const runtime = openConfiguredRenewalWorkbook_();
    const ss = runtime.ss;
    const controlSheet = ss.getSheetByName('Control');
    ensureSettings_(controlSheet, PLAN_ORIGIN_SETTINGS.concat(BONUS_AUDIT_SETTINGS));
    const control = readSettings_(controlSheet);
    assertConfiguredSourceIds_(runtime, control);
    if (auditText_(control['Active Contract Review Batch ID'])) {
      throw new Error('Active Contract Review Batch ID 已有值；不得覆蓋既有 active batch。');
    }
    const queue = ss.getSheetByName('TPR Update Queue');
    if (!queue || queue.getLastRow() < 2) throw new Error('TPR Update Queue has no data. Build Queue first.');
    setupAuditSheets_(ss, queue);
    const queueValues = queue.getDataRange().getValues();
    const qx = headerIndex_(queueValues[0].map(String));
    const branchColumn = requiredHeader_(qx, 'Branch ID', 'Queue');
    const evidenceColumn = requiredHeader_(qx, '合約', 'Queue');
    const shareColumn = findHeader_(qx, 'Share Plan ID');
    const branches = {};
    queueValues.slice(1).forEach(row => {
      const branchId = auditText_(row[branchColumn]);
      if (!branchId) return;
      const evidenceUrl = auditText_(row[evidenceColumn]);
      if (branches[branchId] !== undefined && branches[branchId] !== evidenceUrl) {
        throw new Error('Queue Branch ' + branchId + ' 有不同 Evidence URL，無法建立唯一 review identity。');
      }
      branches[branchId] = evidenceUrl;
    });
    const branchIds = Object.keys(branches);
    if (!branchIds.length) throw new Error('Queue has no Branch IDs.');
    const prefix = runtime.config.environment === 'production' ? 'REVIEW-PROD-' : 'REVIEW-';
    const batchId = prefix + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss');
    const evidenceSheet = ss.getSheetByName('Contract Evidence Review');
    const planSheet = ss.getSheetByName('Plan Classification Review');
    appendCurrentBatchRows_(evidenceSheet, branchIds, batchId, branchId => ({
      'Branch ID':branchId,
      'Evidence URL':branches[branchId],
      'Review Batch ID':batchId,
      'Structured Review Version':'1'
    }));
    appendCurrentBatchRows_(planSheet, branchIds, batchId, branchId => ({
      'Branch ID':branchId,
      'Review Batch ID':batchId
    }));
    appendMissingReviewRows_(ss.getSheetByName('Special Approval Review'), branchIds, id => [id]);
    const shareIds = shareColumn === null ? [] : [...new Set(queueValues.slice(1)
      .map(row => auditText_(row[shareColumn])).filter(Boolean))];
    const taxSnapshot = readChargebeeBranchTaxIds_(runtime.config, branchIds, new Date());
    const shareSheet = ss.getSheetByName('Share Group Review');
    appendCurrentBatchKeyRows_(shareSheet, 'Share Plan ID', shareIds, batchId, shareId => ({
      'Share Plan ID':shareId,
      'Review Batch ID':batchId
    }));
    appendBranchTaxIdReferenceRows_(
      ss.getSheetByName('Branch Tax ID Reference'), taxSnapshot.rows, batchId
    );
    assertCurrentBatchRows_(evidenceSheet, branchIds, batchId);
    assertCurrentBatchRows_(planSheet, branchIds, batchId);
    assertCurrentBatchKeyRows_(shareSheet, 'Share Plan ID', shareIds, batchId);
    assertCurrentBatchKeyRows_(
      ss.getSheetByName('Branch Tax ID Reference'), 'Branch ID', branchIds, batchId
    );
    setControlSettingsAtomically_(controlSheet, {
      'Active Contract Review Batch ID':batchId,
      'Active Contract Review Created At':new Date()
    });
    notify_('Contract review batch created: ' + batchId + '；Branches: ' + branchIds.length + '.');
    return { batchId, branchCount:branchIds.length };
  } finally {
    lock.releaseLock();
  }
}

function appendCurrentBatchRows_(sheet, branchIds, batchId, makeValues) {
  return appendCurrentBatchKeyRows_(sheet, 'Branch ID', branchIds, batchId, makeValues);
}

function appendCurrentBatchKeyRows_(sheet, keyHeader, ids, batchId, makeValues) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const plan = headerNameMigrationPlan_(headers, [keyHeader, 'Review Batch ID'], sheet.getName());
  if (plan.missing.length) throw new Error(sheet.getName() + ' missing headers: ' + plan.missing.join(', '));
  const keyColumn = plan.positions[keyHeader];
  const batchColumn = plan.positions['Review Batch ID'];
  const existing = {};
  values.slice(1).forEach((row, index) => {
    if (auditText_(row[batchColumn]) !== batchId) return;
    const id = auditText_(row[keyColumn]);
    if (!id) return;
    (existing[id] || (existing[id] = [])).push(index + 2);
  });
  const conflicts = ids.filter(id => existing[id] && existing[id].length)
    .map(id => id + ': rows ' + existing[id].join(', '));
  if (conflicts.length) throw new Error(sheet.getName() + ' batch rows already exist: ' + conflicts.join('；'));
  const rows = ids.map(id => {
    const row = headers.map(() => '');
    const fields = makeValues(id);
    Object.keys(fields).forEach(header => {
      const position = headerNameMigrationPlan_(headers, [header], sheet.getName()).positions[header];
      row[position] = fields[header];
    });
    return row;
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function assertCurrentBatchRows_(sheet, branchIds, batchId) {
  return assertCurrentBatchKeyRows_(sheet, 'Branch ID', branchIds, batchId);
}

function assertCurrentBatchKeyRows_(sheet, keyHeader, ids, batchId) {
  const values = sheet.getDataRange().getValues();
  const plan = headerNameMigrationPlan_(values[0].map(String), [keyHeader, 'Review Batch ID'], sheet.getName());
  const rowsById = {};
  values.slice(1).forEach((row, index) => {
    if (auditText_(row[plan.positions['Review Batch ID']]) !== batchId) return;
    const id = auditText_(row[plan.positions[keyHeader]]);
    if (!id) return;
    (rowsById[id] || (rowsById[id] = [])).push(index + 2);
  });
  const errors = ids.filter(id => !rowsById[id] || rowsById[id].length !== 1)
    .map(id => id + ': ' + (rowsById[id] ? rowsById[id].join(', ') : 'missing'));
  if (errors.length) throw new Error(sheet.getName() + ' current-batch identity failed: ' + errors.join('；'));
}

function setControlSettingsAtomically_(sheet, updates) {
  const values = sheet.getDataRange().getValues();
  const rows = {};
  values.slice(1).forEach((row, index) => { if (row[0]) rows[auditText_(row[0])] = index + 2; });
  const missing = Object.keys(updates).filter(key => !rows[key]);
  if (missing.length) throw new Error('Control settings missing: ' + missing.join(', '));
  const rowNumbers = Object.keys(updates).map(key => rows[key]);
  const start = Math.min.apply(null, rowNumbers);
  const end = Math.max.apply(null, rowNumbers);
  const range = sheet.getRange(start, 2, end - start + 1, 1);
  const output = range.getValues();
  Object.keys(updates).forEach(key => { output[rows[key] - start][0] = updates[key]; });
  range.setValues(output);
}

function normalizeTaxId_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function readChargebeeBranchTaxIds_(config, branchIds, importedAt) {
  const sourceId = auditText_(config && config.chargebeeImportSpreadsheetId);
  if (!sourceId) throw new Error('CHARGEBEE_IMPORT_SPREADSHEET_ID is not configured. Zero writes performed.');
  const sourceBook = SpreadsheetApp.openById(sourceId);
  const sourceSheet = sourceBook.getSheetByName(CHARGEBEE_BRANCH_TAX_ID_TAB);
  if (!sourceSheet) throw new Error('Chargebee source tab not found: ' + CHARGEBEE_BRANCH_TAX_ID_TAB + '. Zero writes performed.');
  const wanted = new Set(branchIds.map(auditText_).filter(Boolean));
  const display = sourceSheet.getRange(
    1, CHARGEBEE_BRANCH_ID_COLUMN, sourceSheet.getLastRow(), CHARGEBEE_TAX_ID_COLUMN
  ).getDisplayValues();
  const hits = {};
  display.slice(1).forEach((row, index) => {
    const branchId = auditText_(row[CHARGEBEE_BRANCH_ID_COLUMN - 1]);
    if (!branchId || !wanted.has(branchId)) return;
    (hits[branchId] || (hits[branchId] = [])).push({
      rowNumber:index + 2,
      taxId:normalizeTaxId_(row[CHARGEBEE_TAX_ID_COLUMN - 1])
    });
  });
  const rows = branchIds.map(branchId => {
    const matches = hits[branchId] || [];
    const taxIds = [...new Set(matches.map(match => match.taxId).filter(Boolean))];
    let status = 'PASS';
    let notes = '';
    if (!matches.length) {
      status = 'NEEDS_REVIEW';
      notes = 'Chargebee TW 找不到 Branch ID。';
    } else if (taxIds.length === 0) {
      status = 'NEEDS_REVIEW';
      notes = 'Chargebee TW 的 Tax ID 為空白。';
    } else if (taxIds.length > 1) {
      status = 'NEEDS_REVIEW';
      notes = 'Chargebee TW duplicate Branch ID 的 normalized Tax ID 不一致：' + taxIds.join(', ');
    } else if (matches.length > 1) {
      notes = 'Chargebee TW duplicate Branch ID 但 normalized Tax ID 一致；source rows ' +
        matches.map(match => match.rowNumber).join(', ') + '。';
    }
    return {
      branchId,
      taxId:taxIds.length === 1 ? taxIds[0] : '',
      sourceSpreadsheetId:sourceId,
      sourceTab:CHARGEBEE_BRANCH_TAX_ID_TAB,
      sourceRow:matches.length ? matches[0].rowNumber : '',
      importedAt:importedAt || new Date(),
      sourceRows:matches.map(match => match.rowNumber).join(', '),
      status,
      notes
    };
  });
  return { rows, sourceSpreadsheetId:sourceId, sourceTab:CHARGEBEE_BRANCH_TAX_ID_TAB };
}

function appendBranchTaxIdReferenceRows_(sheet, references, batchId) {
  const byBranch = {};
  references.forEach(reference => { byBranch[reference.branchId] = reference; });
  appendCurrentBatchKeyRows_(sheet, 'Branch ID', Object.keys(byBranch), batchId, branchId => {
    const reference = byBranch[branchId];
    return {
      'Branch ID':branchId,
      'Tax ID':reference.taxId,
      'Source Spreadsheet ID':reference.sourceSpreadsheetId,
      'Source Tab':reference.sourceTab,
      'Source Row':reference.sourceRow,
      'Imported At':reference.importedAt,
      'Source Rows':reference.sourceRows,
      'Import Status':reference.status,
      'Notes':reference.notes,
      'Review Batch ID':batchId
    };
  });
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

function initializeProductionPlanReferences() {
  const runtime = openConfiguredRenewalWorkbook_();
  if (runtime.config.environment !== 'production') {
    throw new Error('Production reference initialization requires ENVIRONMENT=production. Zero writes performed.');
  }
  const ss = runtime.ss;
  const control = readSettings_(ss.getSheetByName('Control'));
  assertConfiguredSourceIds_(runtime, control);
  const depositRows = readDepositPlanReferenceSource_(control, new Date());
  const golden = readValidatedDepositGoldenRows_();
  assertDepositSnapshotEquivalent_(depositRows, golden, '正式訂金方案 vs validated Test golden');
  assertValidatedDepositMapping_(ss.getSheetByName('Plan Reference Mapping'), control);
  const result = syncPlanCatalog_(ss, control, {
    allowDepositInitialization:true,
    depositSourceRows:depositRows,
    validatedDepositGoldenRows:golden
  });
  notify_('Production plan references initialized. TMS active plans: ' + result.activePlans.length +
    '; Deposit snapshots: ' + result.depositRows.length + '.');
  return result;
}

function validatePlanReferenceSourcesReadOnly_(ss, control) {
  const sourceSpreadsheetId = auditText_(control['RSV Plan Reference Spreadsheet ID']);
  const sourceTab = auditText_(control['RSV Plan Reference Tab']);
  const codeHeader = auditText_(control['RSV Plan Code Header']) || 'Plan Code';
  const sourceSheet = SpreadsheetApp.openById(sourceSpreadsheetId).getSheetByName(sourceTab);
  if (!sourceSheet) throw new Error('RSV plan-reference tab was not found: ' + sourceTab);
  const plans = readPlanCatalogSource_(sourceSheet, sourceSpreadsheetId, sourceTab, codeHeader);
  const depositRows = readDepositPlanReferenceSource_(control, new Date());
  const existingDepositRows = readDepositSnapshotRows_(ss.getSheetByName('Plan Reference Snapshot'));
  if (!existingDepositRows.length) {
    throw new Error('Production Deposit baseline is not initialized. Run initializeProductionPlanReferences() first.');
  }
  assertDepositSnapshotEquivalent_(depositRows, existingDepositRows, '正式訂金方案 vs current workbook baseline');
  return { activePlans:plans, depositRows };
}

function syncPlanCatalog_(ss, control, options) {
  options = options || {};
  const sourceSpreadsheetId = auditText_(control['RSV Plan Reference Spreadsheet ID']);
  const sourceTab = auditText_(control['RSV Plan Reference Tab']);
  const codeHeader = auditText_(control['RSV Plan Code Header']) || 'Plan Code';
  if (!sourceSpreadsheetId || !sourceTab) throw new Error('RSV plan-reference source is not configured.');

  const sourceSheet = SpreadsheetApp.openById(sourceSpreadsheetId).getSheetByName(sourceTab);
  if (!sourceSheet) throw new Error('RSV plan-reference tab was not found: ' + sourceTab);
  const sourcePlans = readPlanCatalogSource_(sourceSheet, sourceSpreadsheetId, sourceTab, codeHeader);
  const snapshotSheet = ss.getSheetByName('Plan Reference Snapshot');
  if (!snapshotSheet) throw new Error('Plan Reference Snapshot sheet was not found.');
  const depositSourceRows = options.depositSourceRows || readDepositPlanReferenceSource_(control, new Date());
  const existingDepositRows = readDepositSnapshotRows_(snapshotSheet);
  let depositRows = existingDepositRows;
  if (!existingDepositRows.length) {
    if (!options.allowDepositInitialization) {
      throw new Error('Deposit baseline is missing. Run initializeProductionPlanReferences() before Build Queue or Audit.');
    }
    const goldenRows = options.validatedDepositGoldenRows || readValidatedDepositGoldenRows_();
    assertDepositSnapshotEquivalent_(depositSourceRows, goldenRows, '正式訂金方案 vs validated Test golden');
    depositRows = depositSourceRows;
  } else {
    assertDepositSnapshotEquivalent_(depositSourceRows, existingDepositRows,
      '正式訂金方案 vs current workbook Deposit baseline');
  }
  const catalogSheet = ensureReviewSheet_(ss, 'Canonical Plan Catalog', CANONICAL_PLAN_HEADERS);
  const changeSheet = ensureReviewSheet_(ss, 'Plan Catalog Change Review', PLAN_CHANGE_HEADERS);
  const existingCatalog = readTable_(catalogSheet);
  const existingChanges = readTable_(changeSheet);
  const now = new Date();

  if (!existingCatalog.length) {
    const baseline = sourcePlans.map(plan => canonicalPlanRowObject_(plan, 1, 'Active', now, '', now));
    replaceManagedTable_(catalogSheet, CANONICAL_PLAN_HEADERS, baseline.map(objectRow_(CANONICAL_PLAN_HEADERS)));
    syncPlanReferenceMapping_(ss.getSheetByName('Plan Reference Mapping'), sourceSpreadsheetId, sourceTab, codeHeader);
    syncPlanReferenceSnapshot_(snapshotSheet, baseline, depositRows);
    return { activePlans: baseline, pendingChanges: [], depositRows };
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
  syncPlanReferenceSnapshot_(snapshotSheet, active, depositRows);
  return { activePlans: active, pendingChanges: pending, depositRows };
}

function readDepositPlanReferenceSource_(control, importedAt) {
  const sourceSpreadsheetId = auditText_(control['Plan Reference Spreadsheet ID']);
  const sourceTab = auditText_(control['Deposit Plan Reference Tab']) || '訂金方案';
  if (!sourceSpreadsheetId || !sourceTab) throw new Error('Deposit plan-reference source is not configured.');
  const sourceSheet = SpreadsheetApp.openById(sourceSpreadsheetId).getSheetByName(sourceTab);
  if (!sourceSheet) throw new Error('Deposit plan-reference tab was not found: ' + sourceTab);
  const values = sourceSheet.getDataRange().getDisplayValues();
  const rows = [];
  values.forEach((sourceRow, index) => {
    const displayValues = depositDisplayValues_(sourceRow);
    if (!displayValues.some(value => value !== null)) return;
    const rowNumber = index + 1;
    rows.push([
      'PLAN-Deposit-' + rowNumber,
      'Deposit',
      sourceSpreadsheetId,
      sourceTab,
      rowNumber,
      importedAt,
      JSON.stringify({ values:displayValues }),
      '',
      ''
    ]);
  });
  return rows;
}

function depositDisplayValues_(row) {
  const values = (row || []).map(value => auditText_(value) === '' ? null : String(value));
  while (values.length && values[values.length - 1] === null) values.pop();
  return values;
}

function readDepositSnapshotRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const plan = headerNameMigrationPlan_(values[0].map(String), PLAN_REFERENCE_SNAPSHOT_HEADERS, sheet.getName());
  if (plan.missing.length) throw new Error(sheet.getName() + ' missing headers: ' + plan.missing.join(', '));
  return values.slice(1).filter(row => auditText_(row[plan.positions['Plan Family']]) === 'Deposit')
    .map(row => PLAN_REFERENCE_SNAPSHOT_HEADERS.map(header => row[plan.positions[header]]));
}

function readValidatedDepositGoldenRows_() {
  const goldenWorkbook = SpreadsheetApp.openById(RENEWAL_QUEUE_VALIDATED_TEST_WORKBOOK_ID);
  const sheet = goldenWorkbook.getSheetByName('Plan Reference Snapshot');
  const rows = readDepositSnapshotRows_(sheet);
  if (!rows.length) throw new Error('Validated Test Deposit golden fixture is empty.');
  return rows;
}

function depositSnapshotComparable_(row) {
  const ix = headerIndex_(PLAN_REFERENCE_SNAPSHOT_HEADERS);
  const raw = auditText_(row[requiredHeader_(ix, 'Raw Values JSON', 'Deposit snapshot')]);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) {
    throw new Error('Deposit snapshot Raw Values JSON is invalid: ' + error.message);
  }
  return {
    snapshotId:auditText_(row[requiredHeader_(ix, 'Snapshot ID', 'Deposit snapshot')]),
    planFamily:auditText_(row[requiredHeader_(ix, 'Plan Family', 'Deposit snapshot')]),
    sourceSpreadsheetId:auditText_(row[requiredHeader_(ix, 'Source Spreadsheet ID', 'Deposit snapshot')]),
    sourceTab:auditText_(row[requiredHeader_(ix, 'Source Tab', 'Deposit snapshot')]),
    sourceRow:Number(row[requiredHeader_(ix, 'Source Row', 'Deposit snapshot')]),
    rawValues:depositDisplayValues_(parsed.values || []),
    normalizedCombinationId:auditText_(row[requiredHeader_(ix, 'Normalized Combination ID', 'Deposit snapshot')]),
    specialPlanFlag:auditText_(row[requiredHeader_(ix, 'Special Plan Flag', 'Deposit snapshot')])
  };
}

function assertDepositSnapshotEquivalent_(actualRows, expectedRows, scope) {
  const actual = (actualRows || []).map(depositSnapshotComparable_);
  const expected = (expectedRows || []).map(depositSnapshotComparable_);
  const byRow = rows => rows.reduce((out, row) => (out[row.sourceRow] = row, out), {});
  const actualByRow = byRow(actual);
  const expectedByRow = byRow(expected);
  const rowNumbers = [...new Set(Object.keys(actualByRow).concat(Object.keys(expectedByRow)))].map(Number)
    .sort((a, b) => a - b);
  const differences = [];
  rowNumbers.forEach(rowNumber => {
    const actualRow = actualByRow[rowNumber];
    const expectedRow = expectedByRow[rowNumber];
    if (!actualRow) differences.push('source row ' + rowNumber + ' missing from importer output');
    else if (!expectedRow) differences.push('source row ' + rowNumber + ' added in importer output');
    else if (JSON.stringify(actualRow) !== JSON.stringify(expectedRow)) {
      differences.push('source row ' + rowNumber + ' changed：expected ' + JSON.stringify(expectedRow) +
        '、actual ' + JSON.stringify(actualRow));
    }
  });
  if (differences.length || actual.length !== expected.length) {
    throw new Error(scope + ' failed (' + actual.length + '/' + expected.length + ' rows): ' +
      (differences.length ? differences.join('；') : 'row count mismatch') + '. Zero writes performed.');
  }
  return { rowCount:actual.length };
}

function assertValidatedDepositMapping_(sheet, control) {
  if (!sheet) throw new Error('Plan Reference Mapping sheet was not found.');
  const matches = readTable_(sheet).filter(row => auditText_(row['Mapping ID']) === 'Plan.Deposit');
  if (matches.length !== 1) {
    throw new Error('Plan Reference Mapping must contain exactly one validated Plan.Deposit row; found ' +
      matches.length + '. Zero writes performed.');
  }
  const row = matches[0];
  const expected = {
    'Plan Family':'Deposit',
    'Source Spreadsheet ID':auditText_(control['Plan Reference Spreadsheet ID']),
    'Source Tab':auditText_(control['Deposit Plan Reference Tab']) || '訂金方案',
    'Layout Type':'Row package',
    'Header Row':'section header row',
    'Data Start Row':'following rows',
    'Header Group':'Section header',
    'Header Label':'B2B/B2C + Prepayment/Pre-Authorisation',
    'Canonical Plan Field':'deposit_package',
    'Data Type':'text',
    'Normalization':'normalize type and feature flags',
    'Required In Combination':'Yes',
    'Combination Key Part':'Yes',
    'Special Plan Flag Rule':'See special label',
    'Status':'Active'
  };
  const differences = Object.keys(expected).filter(key => auditText_(row[key]) !== expected[key]);
  if (differences.length) {
    throw new Error('Validated Plan.Deposit mapping differs at: ' + differences.join(', ') +
      '. Zero writes performed.');
  }
}

function readPlanCatalogSource_(sheet, spreadsheetId, sourceSheet, codeHeader) {
  const snapshot = planSourceSnapshot_(sheet, sourceSheet, codeHeader);
  const analysis = analyzePlanSourceSnapshot_(snapshot, spreadsheetId);
  assertValidPlanSourceAnalysis_(analysis);
  if (analysis.missingPlanCodes.length) {
    throw new Error('TMS plan source contains supported rows without Plan Code: ' +
      analysis.missingPlanCodes.map(item => item.description).join('；') +
      '。請先明確執行 maintainPlanCodes()。');
  }
  if (!analysis.plans.length) throw new Error('TMS plan source contains no supported Public／BD New RSV／RwG plans.');
  return analysis.plans;
}

function assignMissingPlanCodes_(sheet, spreadsheetId, sourceSheet, codeHeader) {
  const initial = planSourceSnapshot_(sheet, sourceSheet, codeHeader);
  const initialAnalysis = analyzePlanSourceSnapshot_(initial, spreadsheetId);
  assertValidPlanSourceAnalysis_(initialAnalysis);
  if (!initialAnalysis.missingPlanCodes.length) return { assignments:[] };

  const latest = planSourceSnapshot_(sheet, sourceSheet, codeHeader);
  if (planSourceSnapshotSignature_(latest) !== planSourceSnapshotSignature_(initial)) {
    throw new Error('TMS plan source changed during Plan Code maintenance preflight; zero writes performed.');
  }
  const latestAnalysis = analyzePlanSourceSnapshot_(latest, spreadsheetId);
  assertValidPlanSourceAnalysis_(latestAnalysis);
  const usedCodes = latest.values.map(row => auditText_(row[latest.codeColumn])).filter(Boolean);
  let next = usedCodes.reduce((max, code) => {
    const match = code.match(/^TMS-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const assignments = latestAnalysis.missingPlanCodes.map(item => ({
    rowNumber:item.rowNumber,
    planCode:'TMS-' + ('0000' + next++).slice(-4)
  }));

  assignments.forEach(item => {
    sheet.getRange(item.rowNumber, latest.codeColumn + 1).setValue(item.planCode);
  });

  const verified = planSourceSnapshot_(sheet, sourceSheet, codeHeader);
  const verifiedAnalysis = analyzePlanSourceSnapshot_(verified, spreadsheetId);
  assertValidPlanSourceAnalysis_(verifiedAnalysis);
  if (verifiedAnalysis.missingPlanCodes.length) {
    throw new Error('Plan Code maintenance read-back failed; supported rows remain blank: ' +
      verifiedAnalysis.missingPlanCodes.map(item => item.description).join('；'));
  }
  latest.values.forEach((row, index) => {
    const priorCode = auditText_(row[latest.codeColumn]);
    if (!priorCode) return;
    const actualCode = auditText_(verified.values[index][verified.codeColumn]);
    if (actualCode !== priorCode) {
      throw new Error(sourceSheet + '!' + (index + 2) + ' existing Plan Code changed during maintenance: ' +
        priorCode + ' → ' + actualCode);
    }
  });
  assignments.forEach(item => {
    const actualCode = auditText_(verified.values[item.rowNumber - 2][verified.codeColumn]);
    if (actualCode !== item.planCode) {
      throw new Error(sourceSheet + '!' + item.rowNumber + ' Plan Code read-back mismatch: expected ' +
        item.planCode + ', actual ' + (actualCode || 'blank'));
    }
  });
  return { assignments };
}

function planSourceSnapshot_(sheet, sourceSheet, codeHeader) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('TMS plan source has no header row.');
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const codeColumn = headers.findIndex(header => norm_(header) === norm_(codeHeader));
  if (codeColumn < 0) throw new Error('TMS plan source is missing required Plan Code header: ' + codeHeader);
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
  return {
    sourceSheet, headers, codeColumn, columns,
    values:sheet.getRange(2, 1, rowCount, lastColumn).getValues()
  };
}

function analyzePlanSourceSnapshot_(snapshot, spreadsheetId) {
  const usedCodes = snapshot.values.map(row => auditText_(row[snapshot.codeColumn])).filter(Boolean);
  const duplicates = usedCodes.filter((code, index) => usedCodes.indexOf(code) !== index);
  const plans = [];
  const invalidRows = [];
  const missingPlanCodes = [];
  snapshot.values.forEach((row, index) => {
    const columns = snapshot.columns;
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
      invalidRows.push(sourcePlanFactDescription_(snapshot.sourceSheet, index + 2, row, columns) +
        '：' + problems.join('、'));
      return;
    }
    const planCode = auditText_(row[snapshot.codeColumn]);
    if (!planCode) {
      missingPlanCodes.push({
        rowNumber:index + 2,
        description:sourcePlanFactDescription_(snapshot.sourceSheet, index + 2, row, columns)
      });
      return;
    }
    plans.push({
      planCode, family, sourceCatalog, billing, product, sets,
      bonus: auditNumber_(row[columns.bonus]) === null ? 0 : auditNumber_(row[columns.bonus]),
      price, overage: auditNumber_(row[columns.overage]),
      sourceSpreadsheetId: spreadsheetId, sourceSheet:snapshot.sourceSheet, sourceRow:index + 2
    });
  });
  return { plans, invalidRows, missingPlanCodes, duplicates:[...new Set(duplicates)] };
}

function assertValidPlanSourceAnalysis_(analysis) {
  if (analysis.duplicates.length) {
    throw new Error('Duplicate Plan Code in TMS plan source: ' + analysis.duplicates.join(', '));
  }
  if (analysis.invalidRows.length) {
    throw new Error('TMS plan source contains invalid official Catalog rows: ' +
      analysis.invalidRows.join('；'));
  }
}

function planSourceSnapshotSignature_(snapshot) {
  return JSON.stringify({ headers:snapshot.headers, values:snapshot.values });
}

function sourcePlanFactDescription_(sourceSheet, rowNumber, row, columns) {
  return sourceSheet + '!' + rowNumber + '（' + [
    'Source Tab=' + (auditText_(row[columns.catalog]) || '空白'),
    '繳款週期=' + (auditText_(row[columns.billing]) || '空白'),
    '產品=' + (auditText_(row[columns.product]) || '空白'),
    '使用組數=' + (auditText_(row[columns.sets]) || '空白'),
    '贈送組數=' + (auditText_(row[columns.bonus]) || '空白'),
    '月費 / 年費=' + (auditText_(row[columns.price]) || '空白'),
    '每組超額單價=' + (auditText_(row[columns.overage]) || '空白')
  ].join('、') + '）';
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

function syncPlanReferenceSnapshot_(sheet, activePlans, depositRows) {
  if (!sheet) throw new Error('Plan Reference Snapshot sheet was not found.');
  const headers = PLAN_REFERENCE_SNAPSHOT_HEADERS;
  const existing = readTable_(sheet).filter(row => {
    const family = auditText_(row['Plan Family']);
    return !/^RSV\b/i.test(family) && family !== 'Deposit';
  });
  const importedAt = new Date();
  const rsvRows = activePlans.map(plan => [
    plan.planCode + '-V' + plan.version,
    plan.family === 'BD New' ? 'RSV BD New' : 'RSV Public',
    plan.sourceSpreadsheetId, plan.sourceSheet, plan.sourceRow, importedAt,
    JSON.stringify({ values: [plan.sourceCatalog, plan.billing, plan.product, plan.sets, plan.bonus, plan.price, plan.overage], sourceRows: [plan.sourceRow] }),
    plan.planCode, ''
  ]);
  const preserved = existing.map(row => headers.map(header => row[header] === undefined ? '' : row[header]));
  replaceManagedTable_(sheet, headers, rsvRows.concat(depositRows || [], preserved));
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

/**
 * Contract Evidence Review may contain columns from an older structured
 * implementation.  Preserve every existing column and append only missing
 * required headers after a duplicate/ambiguity preflight has passed.
 */
function ensureReviewSheetHeadersByName_(ss, name, requiredHeaders) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  const plan = headerNameMigrationPlan_(headers, requiredHeaders, name);
  if (plan.missing.length) {
    const requiredLastColumn = lastColumn + plan.missing.length;
    if (requiredLastColumn > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
    }
    sheet.getRange(1, lastColumn + 1, 1, plan.missing.length).setValues([plan.missing]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function headerNameMigrationPlan_(headers, requiredHeaders, scope) {
  const actualHeaders = headers.map(value => auditText_(value));
  const requiredNames = requiredHeaders.map(value => auditText_(value));
  const requiredByNormalized = {};
  requiredNames.forEach(name => {
    const key = norm_(name);
    if (requiredByNormalized[key]) {
      throw new Error(scope + ' required header definition is ambiguous: ' + name);
    }
    requiredByNormalized[key] = name;
  });

  const actualByNormalized = {};
  actualHeaders.forEach((name, index) => {
    if (!name) return;
    const key = norm_(name);
    (actualByNormalized[key] || (actualByNormalized[key] = [])).push({ name, index });
  });

  const positions = {};
  const missing = [];
  requiredNames.forEach(name => {
    const matches = actualByNormalized[norm_(name)] || [];
    if (matches.length > 1) {
      throw new Error(scope + ' required header is duplicated: ' + name +
        ' at columns ' + matches.map(match => match.index + 1).join(', '));
    }
    if (!matches.length) {
      positions[name] = actualHeaders.length + missing.length;
      missing.push(name);
      return;
    }
    if (matches[0].name !== name) {
      throw new Error(scope + ' header mapping is ambiguous: expected "' + name +
        '", found "' + matches[0].name + '" at column ' + (matches[0].index + 1));
    }
    positions[name] = matches[0].index;
  });
  return { headers:actualHeaders.concat(missing), positions, missing };
}

function appendMissingEvidenceReviewRows_(sheet, branches) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error(sheet.getName() + ' has no header row.');
  const headers = values[0].map(String);
  const rows = missingEvidenceReviewRows_(headers, values.slice(1), branches, sheet.getName());
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function missingEvidenceReviewRows_(headers, existingRows, branches, scope) {
  const plan = headerNameMigrationPlan_(headers, EVIDENCE_REVIEW_HEADERS, scope);
  if (plan.missing.length) {
    throw new Error(scope + ' required headers were not appended before row creation: ' + plan.missing.join(', '));
  }
  const existing = new Set(existingRows.map(row => auditText_(row[plan.positions['Branch ID']])).filter(Boolean));
  return Object.keys(branches).filter(id => !existing.has(id)).map(id => {
    const row = headers.map(() => '');
    row[plan.positions['Branch ID']] = id;
    row[plan.positions['Evidence URL']] = branches[id];
    row[plan.positions['Structured Review Version']] = '1';
    return row;
  });
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

function indexedCurrentBatchReview_(sheet, keyHeader, relevantIds, activeBatchId) {
  const currentBatchId = auditText_(activeBatchId);
  if (!currentBatchId) {
    const legacy = indexedReview_(sheet, keyHeader);
    return Object.keys(legacy).reduce((out, id) => {
      out[id] = { review:legacy[id], targetRowNumber:null, reviewBatchId:'', legacyMode:true };
      return out;
    }, {});
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const plan = headerNameMigrationPlan_(headers, [keyHeader, 'Review Batch ID'], sheet.getName());
  if (plan.missing.length) throw new Error(sheet.getName() + ' current-batch index missing headers: ' + plan.missing.join(', '));
  const relevant = new Set((relevantIds || []).map(auditText_).filter(Boolean));
  const matches = {};
  values.slice(1).forEach((row, index) => {
    if (auditText_(row[plan.positions['Review Batch ID']]) !== currentBatchId) return;
    const id = auditText_(row[plan.positions[keyHeader]]);
    if (!id || relevant.size && !relevant.has(id)) return;
    (matches[id] || (matches[id] = [])).push({
      rowNumber:index + 2,
      review:headers.reduce((out, header, column) => (out[header] = row[column], out), {})
    });
  });
  const out = {};
  relevant.forEach(id => {
    const entries = matches[id] || [];
    if (entries.length !== 1) {
      out[id] = {
        review:{}, targetRowNumber:null, reviewBatchId:currentBatchId,
        identityError:entries.length
          ? 'current batch 有重複 rows：' + entries.map(entry => entry.rowNumber).join(', ')
          : 'current batch 缺少 row'
      };
      return;
    }
    out[id] = {
      review:entries[0].review,
      targetRowNumber:entries[0].rowNumber,
      reviewBatchId:currentBatchId,
      legacyMode:false
    };
  });
  return out;
}

function indexedPlanClassificationReviews_(sheet, keyHeader, relevantIds, activeBatchId) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return {};
  const headers = values[0].map(String);
  const currentBatchId = auditText_(activeBatchId);
  const requiredHeaders = [keyHeader];
  if (currentBatchId) requiredHeaders.push('Review Batch ID');
  const plan = headerNameMigrationPlan_(headers, requiredHeaders, sheet.getName());
  if (plan.missing.length) {
    throw new Error(sheet.getName() + ' plan review index missing headers: ' + plan.missing.join(', '));
  }
  const keyColumn = plan.positions[keyHeader];
  const batchColumn = currentBatchId ? plan.positions['Review Batch ID'] : null;
  const relevant = Array.isArray(relevantIds)
    ? relevantIds.reduce((out, id) => (out[auditText_(id)] = true, out), {})
    : null;
  const entriesById = {};

  values.slice(1).forEach((row, index) => {
    const id = auditText_(row[keyColumn]);
    if (!id || relevant && !relevant[id]) return;
    if (!entriesById[id]) entriesById[id] = [];
    entriesById[id].push({
      rowNumber:index + 2,
      review:headers.reduce((out, header, column) => (out[header] = row[column], out), {}),
      reviewBatchId:batchColumn === null ? '' : auditText_(row[batchColumn])
    });
  });

  const duplicateErrors = [];
  const missingErrors = [];
  const out = {};
  const ids = currentBatchId
    ? (relevant ? Object.keys(relevant) : Object.keys(entriesById).filter(id =>
      entriesById[id].some(entry => entry.reviewBatchId === currentBatchId)))
    : Object.keys(entriesById);
  ids.forEach(id => {
    const entries = entriesById[id] || [];
    if (!currentBatchId) {
      if (!entries.length) return;
      const selected = entries[0];
      out[id] = {
        review:selected.review,
        rowNumber:selected.rowNumber,
        targetRowNumber:selected.rowNumber,
        reviewBatchId:selected.reviewBatchId,
        currentBatchMode:false
      };
      return;
    }
    const currentEntries = entries.filter(entry => entry.reviewBatchId === currentBatchId);
    if (!currentEntries.length) {
      missingErrors.push(id);
      return;
    }
    if (currentEntries.length > 1) {
      duplicateErrors.push(id + ' rows ' + currentEntries.map(entry => entry.rowNumber).join(', '));
      return;
    }
    const selected = currentEntries[0];
    out[id] = {
      review:selected.review,
      rowNumber:selected.rowNumber,
      targetRowNumber:selected.rowNumber,
      reviewBatchId:currentBatchId,
      currentBatchMode:true
    };
  });
  if (currentBatchId && (duplicateErrors.length || missingErrors.length)) {
    const errors = [];
    if (duplicateErrors.length) {
      errors.push('Active Contract Review Batch「' + currentBatchId + '」有重複 Branch rows：' +
        duplicateErrors.join('；'));
    }
    if (missingErrors.length) {
      errors.push('Active Contract Review Batch「' + currentBatchId + '」缺少 Branch rows：' +
        missingErrors.join(', '));
    }
    throw new Error(sheet.getName() + ' plan review identity failed: ' + errors.join('；'));
  }
  return out;
}

function indexedEvidenceReviews_(sheet, keyHeader, relevantIds, activeBatchId) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return {};
  const headers = values[0].map(String);
  const currentBatchId = auditText_(activeBatchId);
  const requiredHeaders = [keyHeader, 'Structured Review Version', 'Structured Contract Data'];
  if (currentBatchId) requiredHeaders.push('Review Batch ID');
  const plan = headerNameMigrationPlan_(headers, requiredHeaders, sheet.getName());
  if (plan.missing.length) {
    throw new Error(sheet.getName() + ' evidence index missing headers: ' + plan.missing.join(', '));
  }
  const keyColumn = plan.positions[keyHeader];
  const versionColumn = plan.positions['Structured Review Version'];
  const dataColumn = plan.positions['Structured Contract Data'];
  const batchColumn = currentBatchId ? plan.positions['Review Batch ID'] : null;
  const relevant = Array.isArray(relevantIds)
    ? relevantIds.reduce((out, id) => (out[auditText_(id)] = true, out), {})
    : null;
  const entriesById = {};

  values.slice(1).forEach((row, index) => {
    const id = auditText_(row[keyColumn]);
    if (!id || relevant && !relevant[id]) return;
    if (!entriesById[id]) entriesById[id] = [];
    entriesById[id].push({
      rowNumber:index + 2,
      review:headers.reduce((out, header, column) => (out[header] = row[column], out), {}),
      reviewBatchId:batchColumn === null ? '' : auditText_(row[batchColumn]),
      structuredIntent:auditText_(row[versionColumn]) !== '' || auditText_(row[dataColumn]) !== '',
      activeStructured:auditText_(row[versionColumn]) === '1' && auditText_(row[dataColumn]) !== ''
    });
  });

  const duplicateErrors = [];
  const missingErrors = [];
  const out = {};
  const ids = currentBatchId
    ? (relevant ? Object.keys(relevant) : Object.keys(entriesById).filter(id =>
      entriesById[id].some(entry => entry.reviewBatchId === currentBatchId)))
    : Object.keys(entriesById);
  ids.forEach(id => {
    const entries = entriesById[id];
    if (currentBatchId) {
      const currentEntries = (entries || []).filter(entry => entry.reviewBatchId === currentBatchId);
      if (!currentEntries.length) {
        missingErrors.push(id);
        return;
      }
      if (currentEntries.length > 1) {
        duplicateErrors.push(id + ' rows ' + currentEntries.map(entry => entry.rowNumber).join(', '));
        return;
      }
      const selected = currentEntries[0];
      out[id] = {
        review:selected.review,
        rowNumber:selected.rowNumber,
        targetRowNumber:selected.activeStructured ? selected.rowNumber : null,
        reviewBatchId:currentBatchId,
        currentBatchMode:true,
        structuredIntent:true
      };
      return;
    }

    const structured = entries.filter(entry => entry.activeStructured);
    const structuredIntent = entries.filter(entry => entry.structuredIntent);
    if (structured.length > 1) {
      duplicateErrors.push(id + ' rows ' + structured.map(entry => entry.rowNumber).join(', '));
      return;
    }
    const selected = structured.length === 1
      ? structured[0]
      : (structuredIntent.length ? structuredIntent[0] : entries[0]);
    out[id] = {
      review:selected.review,
      rowNumber:selected.rowNumber,
      targetRowNumber:structured.length === 1 ? selected.rowNumber : null,
      reviewBatchId:selected.reviewBatchId,
      currentBatchMode:false,
      structuredIntent:selected.structuredIntent
    };
  });
  if (!currentBatchId && duplicateErrors.length) {
    throw new Error(sheet.getName() + ' has duplicate active structured review rows: ' +
      duplicateErrors.join('；'));
  }
  if (currentBatchId && (duplicateErrors.length || missingErrors.length)) {
    const errors = [];
    if (duplicateErrors.length) {
      errors.push('Active Contract Review Batch「' + currentBatchId + '」有重複 Branch rows：' +
        duplicateErrors.join('；'));
    }
    if (missingErrors.length) {
      errors.push('Active Contract Review Batch「' + currentBatchId + '」缺少 Branch rows：' +
        missingErrors.join(', '));
    }
    throw new Error(sheet.getName() + ' evidence identity failed: ' + errors.join('；'));
  }
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
  const dateText = dateOnlyText_(value);
  const m = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
function dateOnlyText_(value, timeZone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const match = auditText_(value).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:\s+.*)?$/);
  if (!match) return '';
  return match[1] + '-' + ('0' + Number(match[2])).slice(-2) + '-' + ('0' + Number(match[3])).slice(-2);
}
function auditDateText_(value) {
  return dateOnlyText_(value);
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

/**
 * Contract product facts are provider-neutral JSON.  A review enters the new
 * mode when either the review version or JSON cell has a value; once that
 * happens, missing or invalid structured data must fail closed instead of
 * falling back to a legacy Full Plan Match=TRUE checkbox.
 */
function structuredDocumentMatchAudit_(review, queueRows, qx) {
  const parsed = parseStructuredContractData_(review);
  if (parsed.result === 'NO_STRUCTURED_DATA') {
    return {
      result:'NO_STRUCTURED_DATA', hasInput:false,
      reason:'Legacy review has no structured contract data.', detail:'Legacy Full Plan Match fallback applies.'
    };
  }
  if (parsed.result !== 'OK') {
    return { result:'NEEDS_REVIEW', hasInput:true, reason:parsed.reason, detail:parsed.reason };
  }

  const normalized = normalizeStructuredDocumentProducts_(parsed.data);
  const queueCommissionErrors = structuredDepositCommissionQueueErrors_(queueRows, qx);
  const productErrors = normalized.errors.concat(queueCommissionErrors);
  if (productErrors.length) {
    const reason = 'Structured Contract Data 尚無法可靠比較：' + [...new Set(productErrors)].join('；');
    return {
      result:'NEEDS_REVIEW', hasInput:true, reason, detail:reason,
      structuredData:parsed.data
    };
  }

  const evidencePopulation = structuredContractEvidencePopulation_(parsed.data);
  const evidenceErrors = evidencePopulation.errors.concat(
    structuredEvidencePopulationConsistencyErrors_(review, parsed.data, evidencePopulation)
  );
  if (evidenceErrors.length) {
    const reason = 'Structured Contract Data evidence integrity 尚無法可靠確認：' +
      [...new Set(evidenceErrors)].join('；');
    return {
      result:'NEEDS_REVIEW', hasInput:true, reason, detail:reason,
      structuredData:parsed.data, evidencePopulation
    };
  }

  const comparison = compareStructuredDocumentProducts_(normalized.lines, queueRows, qx);
  return {
    result:comparison.result,
    hasInput:true,
    reason:comparison.reason,
    detail:comparison.detail,
    structuredData:parsed.data,
    evidencePopulation
  };
}

function parseStructuredContractData_(review) {
  const reviewVersion = auditText_(review['Structured Review Version']);
  const raw = review['Structured Contract Data'];
  const rawText = typeof raw === 'string' ? raw.trim() : auditText_(raw);
  if (!reviewVersion && !rawText) return { result:'NO_STRUCTURED_DATA' };
  if (reviewVersion !== '1') {
    return {
      result:'NEEDS_REVIEW',
      reason:'Structured review mode 已啟用，但 Structured Review Version 必須為 1（目前為「' +
        (reviewVersion || '空白') + '」）'
    };
  }
  if (!rawText) {
    return {
      result:'NEEDS_REVIEW',
      reason:'Structured review mode 已啟用，但 Structured Contract Data 缺失；不得沿用 Full Plan Match'
    };
  }

  let data;
  try {
    data = typeof raw === 'object' && raw !== null ? raw : JSON.parse(rawText);
  } catch (error) {
    return { result:'NEEDS_REVIEW', reason:'Structured Contract Data 不是有效 JSON：' + error.message };
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    return { result:'NEEDS_REVIEW', reason:'Structured Contract Data 必須是 JSON object' };
  }
  if (String(data.schema_version || '') !== '1') {
    return {
      result:'NEEDS_REVIEW',
      reason:'Structured Contract Data schema_version 必須為 1（目前為「' +
        auditText_(data.schema_version) + '」）'
    };
  }

  const evidenceSet = data.evidence_set;
  if (!evidenceSet || typeof evidenceSet !== 'object' || Array.isArray(evidenceSet)) {
    return { result:'NEEDS_REVIEW', reason:'Structured Contract Data 缺少 evidence_set' };
  }
  const evidenceState = structuredState_(evidenceSet.state);
  if (evidenceState === 'ambiguous' || evidenceState === 'unreadable') {
    return {
      result:'NEEDS_REVIEW',
      reason:'Branch relevant evidence set 為 ' + displayStructuredState_(evidenceSet.state) +
        '，無法確認文件集合是否完整'
    };
  }
  if (evidenceState !== 'confirmed' || evidenceSet.complete !== true) {
    return {
      result:'NEEDS_REVIEW',
      reason:'document_set_complete 尚未確認：必須完成 Branch relevant evidence set 盤點，不是只讀取單一檔案'
    };
  }
  if (!Array.isArray(evidenceSet.relevant_source_ids)) {
    return { result:'NEEDS_REVIEW', reason:'evidence_set.relevant_source_ids 必須列出本 Branch 的 relevant files' };
  }
  const relevantSourceIds = [...new Set(evidenceSet.relevant_source_ids.map(auditText_).filter(Boolean))];
  if (!relevantSourceIds.length) {
    return { result:'NEEDS_REVIEW', reason:'evidence_set 沒有列出任何 relevant source，無法確認完整方案證據' };
  }
  if (!Array.isArray(data.products)) {
    return { result:'NEEDS_REVIEW', reason:'Structured Contract Data products 必須是 array' };
  }
  data.evidence_set.relevant_source_ids = relevantSourceIds;
  return { result:'OK', data };
}

function structuredState_(value) {
  return auditText_(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function displayStructuredState_(value) {
  return auditText_(value) || '空白';
}

function normalizeStructuredDocumentProducts_(data) {
  const relevantSourceIds = data.evidence_set.relevant_source_ids;
  const errors = [];
  const lines = [];
  data.products.forEach((row, index) => {
    const label = 'products[' + index + ']';
    if (!row || Array.isArray(row) || typeof row !== 'object') {
      errors.push(label + ' 必須是 object');
      return;
    }
    const sourceId = auditText_(row.source_id);
    if (!sourceId) errors.push(label + '.source_id 缺失');
    else if (relevantSourceIds.indexOf(sourceId) < 0) {
      errors.push(label + '.source_id「' + sourceId + '」不在 evidence_set.relevant_source_ids');
    }

    const productField = structuredField_(row, 'product', label, { confirmedRequired:true, type:'product' });
    if (productField.error) {
      errors.push(productField.error);
      return;
    }
    const product = canonicalDocumentProduct_(productField.value);
    if (!isSupportedDocumentProduct_(product)) {
      errors.push(label + '.product「' + displayStructuredValue_(productField.value) + '」不是目前支援的 canonical Product');
      return;
    }

    const values = {};
    const common = [
      ['billing_period', 'billing', 'billing'],
      ['usage_sets', 'sets', 'sets'],
      ['bonus_sets', 'bonus', 'number'],
      ['price', 'price', 'number'],
      ['share_plan_id', 'share', 'identifier']
    ];
    common.forEach(spec => {
      const field = structuredField_(row, spec[0], label, {
        type:spec[2], notMentionedAsZero:spec[0] === 'bonus_sets' && isMainProduct_(product)
      });
      if (field.error) errors.push(field.error);
      else {
        values[spec[1]] = field.value;
        if (spec[0] === 'price') values.priceState = structuredState_(row.price.state);
      }
    });

    if (product === 'Deposit' || product === 'Deposit-Commission') {
      const depositType = structuredField_(row, 'deposit_type', label, { type:'text' });
      const allowedTypes = product === 'Deposit' ? ['b2b', 'b2c'] : ['credit card', 'virtual atm'];
      if (depositType.error) errors.push(depositType.error);
      else if (structuredState_(row.deposit_type.state) === 'confirmed' &&
          allowedTypes.indexOf(depositType.value) < 0) {
        errors.push(label + '.deposit_type「' + displayStructuredValue_(depositType.value) +
          '」不適用於 ' + product + '；允許值：' + allowedTypes.join(', '));
      } else values.overageMethod = depositType.value;
    } else {
      const overageMethod = structuredField_(row, 'overage_method', label, { type:'text' });
      if (overageMethod.error) errors.push(overageMethod.error);
      else values.overageMethod = overageMethod.value;
    }

    if (product === 'Deposit') {
      const setupFee = structuredField_(row, 'setup_fee', label, { type:'number' });
      if (setupFee.error) errors.push(setupFee.error);
      else values.overagePrice = setupFee.value;
      const commission = structuredCommissionValue_(row, label, false);
      if (commission.error) errors.push(commission.error);
      else if (commission.present) values.bonus = commission.value;
    } else if (product === 'Deposit-Commission') {
      const commission = structuredCommissionValue_(row, label, true);
      if (commission.error) errors.push(commission.error);
      else values.bonus = commission.value;
      values.overagePrice = '';
      if (!values.overageMethod) {
        errors.push(label + '.deposit_type 必須明確記錄 Deposit-Commission payment method');
      }
    } else {
      const overagePrice = structuredField_(row, 'overage_unit_price', label, { type:'number' });
      if (overagePrice.error) errors.push(overagePrice.error);
      else values.overagePrice = overagePrice.value;
    }

    if (isMainProduct_(product) && (values.bonus === '' || values.bonus === '0')) values.bonus = '0';
    if (product === 'Deposit' && values.overageMethod === 'b2b' && (values.bonus === '' || values.bonus === '0')) {
      values.bonus = '0';
    }
    if (product === 'Deposit' && (values.overagePrice === '' || values.overagePrice === '0')) {
      values.overagePrice = '0';
    }
    if (isMainProduct_(product) && values.sets === 'unlimited' &&
        (values.overagePrice === '' || values.overagePrice === '0')) {
      values.overagePrice = '0';
    }
    lines.push(Object.assign({ product, sourceId, index }, values));
  });
  const commissionMethods = {};
  lines.filter(line => line.product === 'Deposit-Commission').forEach(line => {
    const method = line.overageMethod;
    if (!method) return;
    if (!commissionMethods[method]) commissionMethods[method] = [];
    commissionMethods[method].push(line.index);
  });
  Object.keys(commissionMethods).forEach(method => {
    if (commissionMethods[method].length > 1) {
      errors.push('Deposit-Commission payment method「' + method + '」在文件中有 duplicate rows：products[' +
        commissionMethods[method].join('], products[') + ']');
    }
  });
  return { lines, errors:[...new Set(errors)] };
}

function structuredDepositCommissionQueueErrors_(queueRows, qx) {
  const byMethod = {};
  const errors = [];
  queueRows.forEach((row, index) => {
    const normalized = normalizeQueueDocumentProduct_(row.values, qx);
    if (normalized.product !== 'Deposit-Commission') return;
    if (!normalized.overageMethod) {
      errors.push('Queue Deposit-Commission row ' + (index + 1) + ' 缺少 payment method');
    }
    if (normalized.bonus === '') {
      errors.push('Queue Deposit-Commission row ' + (index + 1) + ' 缺少 commission rate');
    }
    if (!normalized.overageMethod) return;
    if (!byMethod[normalized.overageMethod]) byMethod[normalized.overageMethod] = [];
    byMethod[normalized.overageMethod].push(index + 1);
  });
  Object.keys(byMethod).forEach(method => {
    if (byMethod[method].length > 1) {
      errors.push('Queue Deposit-Commission payment method「' + method + '」有 duplicate rows：' +
        byMethod[method].join(', '));
    }
  });
  return errors;
}

function structuredField_(row, fieldName, rowLabel, options) {
  const field = row[fieldName];
  const label = rowLabel + '.' + fieldName;
  if (!field || Array.isArray(field) || typeof field !== 'object') {
    return { error:label + ' 必須包含 state 與 value' };
  }
  const state = structuredState_(field.state);
  if (state === 'unreadable' || state === 'ambiguous') {
    return { error:label + ' 為 ' + displayStructuredState_(field.state) + '，需人工確認文件' };
  }
  if (options && options.confirmedRequired && state !== 'confirmed') {
    return { error:label + ' 必須為 Confirmed' };
  }
  if (state === 'notmentioned') {
    return { value:options && options.notMentionedAsZero ? '0' : '', state };
  }
  if (state === 'notapplicable') return { value:'', state };
  if (state !== 'confirmed') {
    return { error:label + ' state 必須為 Confirmed、NotMentioned、Unreadable、Ambiguous 或 NotApplicable' };
  }
  return normalizeStructuredValue_(field.value, options && options.type, label);
}

function normalizeStructuredValue_(value, type, label) {
  if (type === 'product') return { value:auditText_(value) };
  if (type === 'identifier') return { value:auditText_(value) };
  if (type === 'text') return { value:auditText_(value).toLowerCase() };
  if (type === 'billing') {
    const text = auditText_(value).toLowerCase();
    const aliases = { '年繳':'annual', '月繳':'monthly' };
    return { value:aliases[text] || text };
  }
  if (type === 'sets' && auditText_(value).toLowerCase() === 'unlimited') return { value:'unlimited' };
  if (type === 'number' || type === 'sets') {
    const number = auditNumber_(value);
    if (number === null) return { error:label + ' state=Confirmed 但 value 不是有效數字' };
    return { value:String(number) };
  }
  return { value:auditText_(value) };
}

function structuredCommissionValue_(row, rowLabel, required) {
  const commission = structuredOptionalNumberField_(row, 'commission_rate', rowLabel);
  const buyIn = structuredOptionalNumberField_(row, 'buy_in_price', rowLabel);
  if (commission.error) return commission;
  if (buyIn.error) return buyIn;
  if (!commission.present && !buyIn.present) {
    return required
      ? { error:rowLabel + ' 必須以 commission_rate 或 buy_in_price 明確記錄 Deposit-Commission 費率' }
      : { present:false };
  }
  const commissionNumber = commission.present ? Number(commission.value) : 100 - Number(buyIn.value);
  if (commission.present && buyIn.present && Math.abs(commissionNumber - (100 - Number(buyIn.value))) > 0.000001) {
    return { error:rowLabel + ' 的 commission_rate 與 buy_in_price 互相矛盾' };
  }
  return { present:true, value:String(commissionNumber) };
}

function structuredOptionalNumberField_(row, fieldName, rowLabel) {
  if (row[fieldName] === undefined) return { present:false };
  const field = structuredField_(row, fieldName, rowLabel, { type:'number' });
  if (field.error) return field;
  return field.value === '' ? { present:false } : { present:true, value:field.value };
}

function canonicalDocumentProduct_(value) {
  const text = auditText_(value);
  const known = {
    'rsv':'RSV', 'rwg':'RwG', 'deposit':'Deposit', 'deposit-commission':'Deposit-Commission',
    'voice':'Voice', 'survey':'Survey', 'ecoupon':'eCoupon'
  };
  return known[text.toLowerCase()] || text;
}

function isSupportedDocumentProduct_(product) {
  return ['RSV', 'RwG', 'Deposit', 'Deposit-Commission', 'Voice', 'Survey', 'eCoupon'].indexOf(product) >= 0;
}

function normalizeQueueDocumentProduct_(row, qx) {
  const product = canonicalDocumentProduct_(auditGet_(row, qx, '產品', true));
  const overageMethod = auditText_(auditGet_(row, qx, '超額計算方式', true)).toLowerCase();
  const setsRaw = auditGet_(row, qx, '合約組數', true);
  let bonus = normalizeQueueComparableScalar_(auditGet_(row, qx, '合約贈送組數', true), false);
  let overagePrice = normalizeQueueComparableScalar_(auditGet_(row, qx, '超額每組單價', true), false);
  if (isMainProduct_(product) && (bonus === '' || bonus === '0')) bonus = '0';
  if (product === 'Deposit' && overageMethod === 'b2b' && (bonus === '' || bonus === '0')) bonus = '0';
  if (product === 'Deposit' && (overagePrice === '' || overagePrice === '0')) overagePrice = '0';
  if (isMainProduct_(product) && auditText_(setsRaw).toLowerCase() === 'unlimited' &&
      (overagePrice === '' || overagePrice === '0')) overagePrice = '0';
  return {
    product,
    billing:auditText_(auditGet_(row, qx, '付款週期', true)).toLowerCase(),
    sets:normalizeQueueComparableScalar_(setsRaw, true),
    bonus,
    price:normalizeQueueComparableScalar_(auditGet_(row, qx, '合約價格', true), false),
    share:auditText_(auditGet_(row, qx, 'Share Plan ID')),
    overageMethod,
    overagePrice
  };
}

function normalizeQueueComparableScalar_(value, allowUnlimited) {
  const text = auditText_(value);
  if (!text) return '';
  if (allowUnlimited && text.toLowerCase() === 'unlimited') return 'unlimited';
  const number = auditNumber_(value);
  return number === null ? text.toLowerCase() : String(number);
}

function compareStructuredDocumentProducts_(documentLines, queueRows, qx) {
  const queueLines = queueRows.map(r => normalizeQueueDocumentProduct_(r.values, qx));
  const allowMonthlyAddOnAnnualization = queueLines.some(line =>
    isMainProduct_(line.product) && line.billing === 'annual'
  );
  const documentByProduct = groupBy_(documentLines, line => line.product.toLowerCase());
  const queueByProduct = groupBy_(queueLines, line => line.product.toLowerCase());
  const productKeys = [...new Set(Object.keys(documentByProduct).concat(Object.keys(queueByProduct)))].sort();
  const differences = [];

  productKeys.forEach(key => {
    const documents = (documentByProduct[key] || []).slice();
    const queues = (queueByProduct[key] || []).slice();
    const product = documents[0] && documents[0].product || queues[0] && queues[0].product || key;
    const matching = maximumStructuredLineMatching_(documents, queues, allowMonthlyAddOnAnnualization);
    const unmatchedDocuments = documents.filter((line, index) => matching.documentMatches[index] < 0)
      .sort((a, b) => structuredLineSignature_(a).localeCompare(structuredLineSignature_(b)));
    const unmatchedQueues = queues.filter((line, index) => matching.queueMatches[index] < 0)
      .sort((a, b) => structuredLineSignature_(a).localeCompare(structuredLineSignature_(b)));
    const pairCount = Math.min(unmatchedDocuments.length, unmatchedQueues.length);
    for (let i = 0; i < pairCount; i++) {
      differences.push.apply(differences, structuredDocumentLineDifferences_(
        unmatchedDocuments[i], unmatchedQueues[i], allowMonthlyAddOnAnnualization
      ));
    }
    unmatchedDocuments.slice(pairCount).forEach(line => {
      differences.push('文件多出 ' + product + ' 產品列（source ' + line.sourceId + '）');
    });
    unmatchedQueues.slice(pairCount).forEach(() => {
      differences.push('Queue 有 ' + product + ' 產品列，但完整文件集合未列出對應產品');
    });
  });

  if (differences.length) {
    const detail = '文件方案與 Queue 不一致：' + differences.join('；');
    return { result:'MISMATCH', reason:detail, detail };
  }
  const detail = 'Structured Contract Data 與 Queue 的 ' + queueLines.length + ' 個產品列逐項一致。';
  return { result:'MATCH', reason:'', detail };
}

function maximumStructuredLineMatching_(documents, queues, allowAnnualization) {
  const queueMatches = queues.map(() => -1);
  function assign(documentIndex, seenQueues) {
    for (let queueIndex = 0; queueIndex < queues.length; queueIndex++) {
      if (seenQueues[queueIndex] || !structuredDocumentLineEqual_(
        documents[documentIndex], queues[queueIndex], allowAnnualization
      )) continue;
      seenQueues[queueIndex] = true;
      if (queueMatches[queueIndex] < 0 || assign(queueMatches[queueIndex], seenQueues)) {
        queueMatches[queueIndex] = documentIndex;
        return true;
      }
    }
    return false;
  }
  documents.forEach((line, index) => assign(index, queues.map(() => false)));
  const documentMatches = documents.map(() => -1);
  queueMatches.forEach((documentIndex, queueIndex) => {
    if (documentIndex >= 0) documentMatches[documentIndex] = queueIndex;
  });
  return { documentMatches, queueMatches };
}

function structuredDocumentLineEqual_(documentLine, queueLine, allowAnnualization) {
  return structuredDocumentLineDifferences_(documentLine, queueLine, allowAnnualization).length === 0;
}

function structuredDocumentLineDifferences_(documentLine, queueLine, allowAnnualization) {
  const adjusted = Object.assign({}, documentLine);
  const monthlyPrice = Number(documentLine.price);
  const product = queueLine.product || documentLine.product;
  const positiveAddOnPrice = monthlyPrice > 0;
  const confirmedZeroDepositPrice = product === 'Deposit' && monthlyPrice === 0 &&
    documentLine.priceState === 'confirmed';
  if (allowAnnualization && !isMainProduct_(queueLine.product) &&
      documentLine.billing === 'monthly' && queueLine.billing === 'annual' &&
      documentLine.price !== '' && isFinite(monthlyPrice) &&
      (positiveAddOnPrice || confirmedZeroDepositPrice)) {
    adjusted.billing = 'annual';
    adjusted.price = String(monthlyPrice * 12);
  }
  const applicable = STRUCTURED_PRODUCT_FIELD_APPLICABILITY[product] ||
    STRUCTURED_PRODUCT_COMPARISON_FIELDS.map(pair => pair[0]);
  const fields = STRUCTURED_PRODUCT_COMPARISON_FIELDS.filter(pair =>
    applicable.indexOf(pair[0]) >= 0
  );
  return fields.filter(pair => adjusted[pair[0]] !== queueLine[pair[0]]).map(pair =>
    product + ' ' + pair[1] + '：文件 ' + displayStructuredValue_(documentLine[pair[0]]) +
      '、Queue ' + displayStructuredValue_(queueLine[pair[0]])
  );
}

function structuredEvidencePopulationConsistencyErrors_(review, data, population) {
  const evidence = data && data.contract_evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];
  const annual = evidence.annual_payment_amount_ntd || evidence.annual_payment_amount ||
    evidence.annualized_economic_amount_ntd;
  if (!annual) return [];
  const fields = population && population.fields || {};
  const errors = [];
  STRUCTURED_ANNUAL_PAYMENT_HEADERS.forEach(header => {
    const existing = review && review[header];
    if (auditText_(existing) === '') return;
    const current = fields[header];
    const same = header === 'Annual Payment Amount (NTD)'
      ? exactCurrencyAmount_(existing) !== null &&
        exactCurrencyAmount_(existing) === exactCurrencyAmount_(current)
      : auditText_(existing) === auditText_(current);
    if (!same) {
      errors.push('Review row「' + header + '」與 current Structured Contract Data 不一致');
    }
  });
  return errors;
}

function structuredLineSignature_(line) {
  return [line.product, line.billing, line.sets, line.bonus, line.price, line.share,
    line.overageMethod, line.overagePrice].map(value => String(value === undefined ? '' : value)).join('¦');
}

function displayStructuredValue_(value) {
  return value === '' || value === null || value === undefined ? '空白／不適用' : String(value);
}

/**
 * Projects provider-neutral document facts into the existing Contract
 * Evidence Review interface.  This adapter deliberately accepts no Queue
 * rows: every populated value must be supported by the frozen document JSON.
 */
function structuredContractEvidencePopulation_(data) {
  const result = { fields:{}, errors:[] };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result;
  const evidence = data.contract_evidence;
  if (evidence === undefined || evidence === null) return result;
  if (typeof evidence !== 'object' || Array.isArray(evidence)) {
    result.errors.push('contract_evidence 必須是 object');
    return result;
  }
  const relevantSourceIds = data.evidence_set && Array.isArray(data.evidence_set.relevant_source_ids)
    ? data.evidence_set.relevant_source_ids.map(auditText_).filter(Boolean)
    : [];
  const relevant = relevantSourceIds.reduce((out, id) => (out[id] = true, out), {});

  function confirmedFact(field, label, options) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return null;
    const state = structuredState_(field.state);
    if (state !== 'confirmed') return null;
    const sourceId = auditText_(field.source_id);
    if (!sourceId || !relevant[sourceId]) {
      result.errors.push(label + ' Confirmed 但 source_id 不在 relevant evidence set');
      return null;
    }
    const locator = auditText_(field.locator || field.location);
    if (options && options.locatorRequired && !locator) {
      result.errors.push(label + ' Confirmed 但缺少 locator');
      return null;
    }
    const quote = auditText_(field.quote);
    if (options && options.quoteRequired && !quote) {
      result.errors.push(label + ' Confirmed 但缺少 quote');
      return null;
    }
    return { field, sourceId, locator, quote };
  }

  function confirmedBoolean(field, label, visualRequired) {
    const fact = confirmedFact(field, label, { locatorRequired:true });
    if (!fact) return null;
    if (visualRequired && auditText_(field.verification).toLowerCase() !== 'visual') {
      result.errors.push(label + ' 只有 visual verification 才能 Confirmed');
      return null;
    }
    if (field.value !== true && field.value !== false) {
      result.errors.push(label + ' Confirmed value 必須是 boolean');
      return null;
    }
    return field.value;
  }

  const startFact = confirmedFact(evidence.contract_start_date, 'contract_start_date', {
    locatorRequired:true
  });
  const endFact = confirmedFact(evidence.contract_end_date, 'contract_end_date', {
    locatorRequired:true
  });
  if (startFact) {
    const value = strictStructuredDateText_(startFact.field.value);
    if (value) result.fields['Contract Start Date'] = value;
    else result.errors.push('contract_start_date Confirmed 但不是有效日期');
  }
  if (endFact) {
    const value = strictStructuredDateText_(endFact.field.value);
    if (value) result.fields['Contract End Date'] = value;
    else result.errors.push('contract_end_date Confirmed 但不是有效日期');
  }

  const inlineSeal = confirmedBoolean(evidence.inline_seal, 'inline_seal', true);
  const customerSeal = confirmedBoolean(evidence.customer_seal, 'customer_seal', true);
  if (inlineSeal !== null) result.fields['Inline Seal'] = inlineSeal;
  if (customerSeal !== null) result.fields['Customer Seal'] = customerSeal;
  if (inlineSeal !== null || customerSeal !== null) result.fields['Evidence Type'] = 'Contract';

  const consent = evidence.consent_evidence || evidence.customer_explicit_consent;
  const consentFact = confirmedFact(consent, 'consent_evidence', {
    locatorRequired:true, quoteRequired:true
  });
  if (consentFact && consent.value === true) {
    const kind = auditText_(consent.kind || consent.type).toLowerCase().replace(/[\s_-]+/g, '');
    if (['explicitconsent', 'explicitemailconsent', 'customerexplicitconsent'].includes(kind)) {
      result.fields['Customer Explicit Consent'] = true;
      result.fields['Evidence Type'] = 'Email';
    } else if (['agreementconfirmation', 'writtenagreementconfirmation'].includes(kind)) {
      const sender = auditText_(consent.sender).toLowerCase();
      if (sender === 'inline-csm-team@inline.tw') {
        result.fields['Agreement Confirmation Text'] = true;
        result.fields['Confirmation Sender'] = sender;
        result.fields['Evidence Type'] = 'Email';
      } else {
        result.errors.push('agreement confirmation 的 sender 不是指定信箱');
      }
    } else {
      result.errors.push('consent_evidence Confirmed 但 kind 無法唯一映射');
    }
  }

  const explicitAnnual = evidence.annual_payment_amount_ntd || evidence.annual_payment_amount;
  const derivedAnnual = evidence.annualized_economic_amount_ntd;
  let explicitAnnualValid = true;
  let derivedAnnualValid = true;
  if (explicitAnnual && explicitAnnual.derived === true) {
    result.errors.push('explicit annual_payment_amount_ntd 不得標記 derived；請使用 annualized_economic_amount_ntd');
    explicitAnnualValid = false;
  }
  if (derivedAnnual && derivedAnnual.derived !== true) {
    result.errors.push('annualized_economic_amount_ntd 必須明確標記 derived=true');
    derivedAnnualValid = false;
  }
  const explicitPopulation = explicitAnnualValid
    ? structuredAnnualPaymentPopulation_(explicitAnnual, relevant) : {};
  if (explicitPopulation.error) result.errors.push(explicitPopulation.error);
  else if (explicitPopulation.fields) Object.assign(result.fields, explicitPopulation.fields);
  const derivedPopulation = derivedAnnualValid
    ? structuredAnnualPaymentPopulation_(derivedAnnual, relevant) : {};
  if (derivedPopulation.error) result.errors.push(derivedPopulation.error);
  else if (!explicitAnnual && derivedPopulation.fields) Object.assign(result.fields, derivedPopulation.fields);

  return result;
}

function strictStructuredDateText_(value) {
  const text = dateOnlyText_(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? text : '';
}

function structuredAnnualPaymentPopulation_(field, relevantSourceIds) {
  if (!field || typeof field !== 'object' || Array.isArray(field) ||
      structuredState_(field.state) !== 'confirmed') return {};
  const amount = exactCurrencyAmount_(field.value);
  if (amount === null) return { error:'annual_payment_amount_ntd Confirmed 但 value 不是有效金額' };
  const quote = auditText_(field.quote);
  const locator = auditText_(field.locator || field.location);
  const sourceId = auditText_(field.source_id);
  const derived = field.derived === true;

  if (!derived) {
    if (field.derivation) {
      return { error:'explicit annual_payment_amount_ntd 不得混用 derived derivation' };
    }
    if (!sourceId || !relevantSourceIds[sourceId]) {
      return { error:'annual_payment_amount_ntd Confirmed 但 source_id 不在 relevant evidence set' };
    }
    if (!quote || !locator) {
      return { error:'annual_payment_amount_ntd Confirmed 時 quote／locator 不得遺漏' };
    }
    if (!isPreciseEvidenceLocator_(locator)) {
      return { error:'annual_payment_amount_ntd Confirmed 時必須提供 precise locator' };
    }
    if (!evidenceQuoteContainsAmount_(quote, amount)) {
      return { error:'annual_payment_amount_ntd quote 必須明確包含文件金額 ' + amount };
    }
    return { fields:{
      'Annual Payment Amount (NTD)':amount,
      'Annual Payment Evidence Quote':quote,
      'Annual Payment Evidence Location':locator
    } };
  }

  const derivation = field.derivation;
  const facts = derivation && Array.isArray(derivation.source_product_facts)
    ? derivation.source_product_facts : [];
  const calculation = auditText_(derivation && derivation.calculation);
  if (!facts.length || !calculation) {
    return { error:'derived annual payment 必須保存 calculation 與 source_product_facts' };
  }
  let calculated = 0;
  const locators = [];
  for (let index = 0; index < facts.length; index++) {
    const fact = facts[index];
    const label = 'annual payment source_product_facts[' + index + ']';
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
      return { error:label + ' 必須是 object' };
    }
    const factSourceId = auditText_(fact.source_id);
    const factQuote = auditText_(fact.quote);
    const factLocator = auditText_(fact.locator || fact.location);
    if (!factSourceId || !relevantSourceIds[factSourceId] || !factQuote || !factLocator) {
      return { error:label + ' 缺少 relevant source_id、quote 或 locator' };
    }
    if (!isPreciseEvidenceLocator_(factLocator)) {
      return { error:label + ' 必須提供 precise locator' };
    }
    const product = fact.product;
    const billing = fact.billing_period;
    const price = fact.price;
    if (!product || structuredState_(product.state) !== 'confirmed' ||
        !billing || structuredState_(billing.state) !== 'confirmed' ||
        !price || structuredState_(price.state) !== 'confirmed') {
      return { error:label + ' 的 product／billing_period／price 必須全部 Confirmed' };
    }
    const priceValue = exactCurrencyAmount_(price.value);
    const billingValue = auditText_(billing.value).toLowerCase();
    if (priceValue === null || (billingValue !== 'annual' && billingValue !== 'monthly')) {
      return { error:label + ' 的 price 或 billing_period 無法計算年度金額' };
    }
    if (!evidenceQuoteContainsAmount_(factQuote, priceValue)) {
      return { error:label + ' 的 quote 必須明確包含文件價格 ' + priceValue };
    }
    calculated += billingValue === 'monthly' ? priceValue * 12 : priceValue;
    locators.push(factLocator);
  }
  if (calculated !== amount) {
    return { error:'derived annual payment 計算結果 ' + calculated + ' 與 value ' + amount + ' 不一致' };
  }
  const evidenceQuote = '文件產品費用推導：' + calculation;
  if (!evidenceQuoteContainsAmount_(evidenceQuote, amount)) {
    return { error:'derived annual payment calculation 必須明確包含計算後金額 ' + amount };
  }
  return { fields:{
    'Annual Payment Amount (NTD)':amount,
    'Annual Payment Evidence Quote':evidenceQuote,
    'Annual Payment Evidence Location':[...new Set(locators)].join('；')
  } };
}

function isPreciseEvidenceLocator_(value) {
  const text = auditText_(value).toLowerCase();
  if (!text) return false;
  return /(?:page\s*\d+|section\s*[\w.-]+|§\s*[\w.-]+|第\s*[\d一二三四五六七八九十百]+\s*(?:頁|條)|(?:頁|table|表格|row|列|cell|儲存格|附件|message|訊息)\s*[#:]?\s*[\w.-]+)/i.test(text);
}

/**
 * Project single-value structured facts for legacy-compatible review display.
 * Structured Deposit-Commission authority remains the product-row multiset;
 * these scalar columns never replace that comparison.
 */
function structuredReviewForProtectedGates_(review, documentMatch, evidencePopulation) {
  const out = Object.assign({}, review);
  if (!documentMatch || !documentMatch.structuredData) return out;
  const population = evidencePopulation || structuredContractEvidencePopulation_(documentMatch.structuredData);
  const evidence = documentMatch.structuredData.contract_evidence;
  if (evidence && (evidence.annual_payment_amount_ntd || evidence.annual_payment_amount ||
      evidence.annualized_economic_amount_ntd)) {
    STRUCTURED_ANNUAL_PAYMENT_HEADERS.forEach(header => { out[header] = ''; });
  }
  Object.assign(out, population.fields || {});
  const products = documentMatch.structuredData.products.filter(row => {
    if (!row || typeof row !== 'object') return false;
    const field = row.product;
    return field && structuredState_(field.state) === 'confirmed' &&
      canonicalDocumentProduct_(field.value) === 'Deposit-Commission';
  });
  const commissions = uniqueConfirmedStructuredNumbers_(products, 'commission_rate');
  const buyIns = uniqueConfirmedStructuredNumbers_(products, 'buy_in_price');
  if (commissions.length === 1) out['Deposit Commission Rate (%)'] = commissions[0];
  if (buyIns.length === 1) out['Deposit Buy-in Price (%)'] = buyIns[0];
  return out;
}

function uniqueConfirmedStructuredNumbers_(rows, fieldName) {
  const values = rows.map(row => row[fieldName]).filter(field =>
    field && structuredState_(field.state) === 'confirmed'
  ).map(field => auditNumber_(field.value)).filter(value => value !== null);
  return [...new Set(values)];
}

function writeDocumentMatchTraces_(sheet, traces, activeBatchId) {
  if (!sheet || !traces || !traces.length) return;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const currentBatchId = auditText_(activeBatchId);
  const requiredHeaders = [
    'Branch ID', 'Structured Review Version', 'Structured Contract Data',
    'Document Match Result', 'Document Match Detail'
  ];
  const populationHeaders = [...new Set(traces.reduce((out, trace) =>
    out.concat(Object.keys(trace && trace.evidencePopulation || {})), []))];
  const unsupportedPopulationHeaders = populationHeaders.filter(header =>
    STRUCTURED_EVIDENCE_POPULATION_HEADERS.indexOf(header) < 0
  );
  if (unsupportedPopulationHeaders.length) {
    throw new Error(sheet.getName() + ' Document Match writer received unsupported evidence population headers: ' +
      unsupportedPopulationHeaders.join(', ') + '. Zero writes performed.');
  }
  requiredHeaders.push.apply(requiredHeaders, populationHeaders);
  if (currentBatchId) requiredHeaders.push('Review Batch ID');
  const plan = headerNameMigrationPlan_(values[0].map(String), requiredHeaders, sheet.getName());
  if (plan.missing.length) {
    throw new Error(sheet.getName() + ' cannot write Document Match trace; missing headers: ' + plan.missing.join(', '));
  }
  const branchColumn = plan.positions['Branch ID'];
  const versionColumn = plan.positions['Structured Review Version'];
  const dataColumn = plan.positions['Structured Contract Data'];
  const resultColumn = plan.positions['Document Match Result'];
  const detailColumn = plan.positions['Document Match Detail'];
  const batchColumn = currentBatchId ? plan.positions['Review Batch ID'] : null;
  const preflightErrors = [];
  const targetRows = {};
  const targetBranches = {};
  const updates = traces.map((trace, index) => {
    const label = 'trace ' + (index + 1);
    const branchId = auditText_(trace && trace.branchId);
    const rowNumber = Number(trace && trace.targetRowNumber);
    const traceBatchId = auditText_(trace && trace.reviewBatchId);
    const expectedVersion = auditText_(trace && trace.expectedStructuredReviewVersion);
    const expectedData = auditText_(trace && trace.expectedStructuredContractData);
    if (!branchId) preflightErrors.push(label + ' 缺少 Branch ID');
    if (currentBatchId && traceBatchId !== currentBatchId) {
      preflightErrors.push(label + ' Review Batch ID 不一致：預期 ' + currentBatchId +
        '，trace 為 ' + (traceBatchId || '空白'));
    }
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > values.length) {
      preflightErrors.push(label + ' targetRowNumber 無效：' + auditText_(trace && trace.targetRowNumber));
      return null;
    }
    if (targetRows[rowNumber]) {
      preflightErrors.push('target row ' + rowNumber + ' 同時被 ' + targetRows[rowNumber] + ' 與 ' + branchId + ' 指定');
    } else {
      targetRows[rowNumber] = branchId;
    }
    if (targetBranches[branchId]) {
      preflightErrors.push('Branch ' + branchId + ' 有多個 writer targets：' +
        targetBranches[branchId] + ', ' + rowNumber);
    } else if (branchId) {
      targetBranches[branchId] = rowNumber;
    }
    const row = values[rowNumber - 1];
    const actualBranchId = auditText_(row[branchColumn]);
    if (actualBranchId !== branchId) {
      preflightErrors.push('row ' + rowNumber + ' Branch ID 已變更：預期 ' + branchId + '，目前 ' + actualBranchId);
    }
    const actualVersion = auditText_(row[versionColumn]);
    const actualData = auditText_(row[dataColumn]);
    if (currentBatchId && auditText_(row[batchColumn]) !== currentBatchId) {
      preflightErrors.push('row ' + rowNumber + ' Review Batch ID 已變更：預期 ' + currentBatchId +
        '，目前 ' + (auditText_(row[batchColumn]) || '空白'));
    }
    if (actualVersion !== '1') {
      preflightErrors.push('row ' + rowNumber + ' Structured Review Version 不是 1');
    }
    if (actualData === '') {
      preflightErrors.push('row ' + rowNumber + ' Structured Contract Data 已清空');
    }
    if (actualVersion !== expectedVersion) {
      preflightErrors.push('row ' + rowNumber + ' Structured Review Version 與 indexing snapshot 不一致');
    }
    if (actualData !== expectedData) {
      preflightErrors.push('row ' + rowNumber + ' Structured Contract Data 與 indexing snapshot 不一致');
    }
    const evidencePopulation = trace && trace.evidencePopulation || {};
    const expectedPopulation = trace && trace.expectedEvidencePopulation || {};
    Object.keys(evidencePopulation).forEach(header => {
      const actual = auditText_(row[plan.positions[header]]);
      const expected = auditText_(expectedPopulation[header]);
      if (actual !== expected) {
        preflightErrors.push('row ' + rowNumber + ' ' + header + ' 與 indexing snapshot 不一致');
      }
    });
    return {
      rowNumber,
      result:trace.result,
      detail:trace.detail || trace.reason || '',
      evidencePopulation
    };
  });
  Object.keys(targetBranches).forEach(branchId => {
    const activeRows = [];
    values.slice(1).forEach((row, index) => {
      if (auditText_(row[branchColumn]) !== branchId) return;
      if (currentBatchId) {
        if (auditText_(row[batchColumn]) === currentBatchId) activeRows.push(index + 2);
      } else if (auditText_(row[versionColumn]) === '1' && auditText_(row[dataColumn]) !== '') {
        activeRows.push(index + 2);
      }
    });
    const expectedRow = targetBranches[branchId];
    if (activeRows.length !== 1 || activeRows[0] !== expectedRow) {
      preflightErrors.push('Branch ' + branchId + ' 的最新 Sheet snapshot 必須只有 target row ' +
        expectedRow + (currentBatchId ? ' 屬於 Active Contract Review Batch「' + currentBatchId + '」' :
          ' 是完整 active structured row') + '；目前 rows：' +
        (activeRows.length ? activeRows.join(', ') : '無'));
    }
  });
  if (preflightErrors.length) {
    throw new Error(sheet.getName() + ' Document Match writer preflight failed: ' +
      preflightErrors.join('；'));
  }
  updates.forEach(update => {
    sheet.getRange(update.rowNumber, resultColumn + 1, 1, 1).setValues([[update.result]]);
    sheet.getRange(update.rowNumber, detailColumn + 1, 1, 1).setValues([[update.detail]]);
    Object.keys(update.evidencePopulation).forEach(header => {
      sheet.getRange(update.rowNumber, plan.positions[header] + 1, 1, 1)
        .setValues([[update.evidencePopulation[header]]]);
    });
  });
}

function contractAudit_(review, documentMatch, planChange, billing, queueRows, qx, control, planDifference) {
  const evidenceType = auditText_(review['Evidence Type']).toLowerCase();
  const name = restaurantNameAudit_(review, queueRows, qx, control);
  const period = contractPeriodAudit_(review, queueRows, qx, control);
  const dates = period.result === 'Pass';
  const structuredMode = documentMatch && documentMatch.result !== 'NO_STRUCTURED_DATA';
  const plan = structuredMode ? documentMatch.result === 'MATCH' : isPass_(review['Full Plan Match']);
  const depositCommission = depositCommissionAudit_(review, queueRows, qx, control, documentMatch);
  const seals = isPass_(review['Inline Seal']) && isPass_(review['Customer Seal']);
  const directConsent = isPass_(review['Customer Explicit Consent']);
  const agreementEmail = isPass_(review['Agreement Confirmation Text']) &&
    auditText_(review['Confirmation Sender']).toLowerCase() === 'inline-csm-team@inline.tw';
  // Evidence URL is prefilled from Queue when the review row is created.  It
  // is not, by itself, a completed document review: otherwise a fresh queue
  // would incorrectly be reported as a contract mismatch instead of pending.
  const evidenceExists = !!evidenceType || name.hasInput || period.hasInput || plan ||
    (documentMatch && documentMatch.hasInput) || seals || directConsent || agreementEmail ||
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
  if (structuredMode && documentMatch.result === 'NEEDS_REVIEW') {
    return { result:'Need Review', required, reason:documentMatch.reason };
  }
  if (structuredMode && documentMatch.result === 'MISMATCH') {
    return { result:'Fail', required, reason:documentMatch.reason };
  }
  if (structuredMode && isExplicitStructuredPlanVeto_(review['Manual Plan Veto'])) {
    return { result:'Fail', required, reason:'Contract Evidence Review 已明確標記 Manual Plan Veto 不通過' };
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
function depositCommissionAudit_(review, queueRows, qx, control, documentMatch) {
  const rows = queueRows.filter(r =>
    auditText_(auditGet_(r.values, qx, '產品', true)).toLowerCase() === 'deposit-commission'
  );
  if (!rows.length) return { result: 'Pass', reason: '' };

  // Structured comparison already performs the authoritative B2C row-level
  // multiset check on payment method + normalized commission.  Do not apply
  // the legacy single-rate review-field gate a second time.
  if (documentMatch && documentMatch.result !== 'NO_STRUCTURED_DATA') {
    return { result:'Pass', reason:'' };
  }

  const expectedRates = [...new Set(rows.map(r =>
    auditNumber_(auditGet_(r.values, qx, '合約贈送組數', true))
  ).filter(v => v !== null))];
  if (!expectedRates.length) {
    return {
      result: 'Need Review',
      reason: 'Queue 的 Deposit-Commission 比例缺漏，需人工確認 Renewal DB 來源'
    };
  }
  if (expectedRates.length > 1) {
    return {
      result: 'Need Review',
      reason: 'Legacy Contract Evidence 欄位無法表示多 payment-method Deposit-Commission；請改用 structured row-level review'
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

function queueSharePlanIds_(byBranch, qx) {
  const ids = [];
  Object.keys(byBranch).forEach(branchId => {
    byBranch[branchId].forEach(row => {
      if (!isMainProduct_(auditText_(auditGet_(row.values, qx, '產品', true)))) return;
      const shareId = auditText_(auditGet_(row.values, qx, 'Share Plan ID'));
      if (shareId) ids.push(shareId);
    });
  });
  return [...new Set(ids)].sort();
}

function queueShareOverageAudit_(byBranch, qx) {
  const byBranchResult = {};
  const groups = {};
  Object.keys(byBranch).forEach(branchId => {
    byBranch[branchId].forEach(row => {
      const product = auditText_(auditGet_(row.values, qx, '產品', true));
      const shareId = auditText_(auditGet_(row.values, qx, 'Share Plan ID'));
      if (!isMainProduct_(product) || !shareId) return;
      (groups[shareId] || (groups[shareId] = [])).push({
        branchId,
        price:auditNumber_(auditGet_(row.values, qx, '超額每組單價', true))
      });
    });
  });
  const byGroup = {};
  Object.keys(groups).forEach(shareId => {
    const members = groups[shareId];
    const first = members[0] && members[0].price;
    const pass = first !== null && members.every(member => numbersEqual_(member.price, first));
    const audit = pass
      ? { result:'Pass', highest:first, reason:'本批 Queue Share Plan「' + shareId + '」超額單價一致：' + auditFormatNumber_(first) }
      : { result:'Need Check', reason:'本批 Queue Share Plan「' + shareId + '」超額單價缺失或不一致' };
    byGroup[shareId] = audit;
    members.forEach(member => { byBranchResult[member.branchId] = audit; });
  });
  return { byBranch:byBranchResult, byGroup };
}

function structuredShareGroupAudits_(byBranch, qx, evidence, taxReferences, shareReviews, activeBatchId) {
  const currentBatchId = auditText_(activeBatchId);
  const groups = {};
  Object.keys(byBranch).forEach(branchId => {
    byBranch[branchId].forEach(row => {
      if (!isMainProduct_(auditText_(auditGet_(row.values, qx, '產品', true)))) return;
      const shareId = auditText_(auditGet_(row.values, qx, 'Share Plan ID'));
      if (!shareId) return;
      const member = {
        branchId,
        restaurant:auditText_(auditGet_(row.values, qx, '餐廳名稱', true)),
        queueOverage:auditNumber_(auditGet_(row.values, qx, '超額每組單價', true))
      };
      (groups[shareId] || (groups[shareId] = [])).push(member);
    });
  });
  const byGroup = {};
  Object.keys(groups).forEach(shareId => {
    const members = groups[shareId];
    const reviewEntry = shareReviews[shareId] || {
      review:{}, targetRowNumber:null, reviewBatchId:currentBatchId,
      identityError:'current batch 缺少 row'
    };
    if (!currentBatchId) {
      const review = reviewEntry.review || {};
      const pass = isPass_(review['Member Check']) && isPass_(review['Tax ID Check']) &&
        isPass_(review['Contract Check']) && isPass_(review['Overage Check']) && isPass_(review['Status']);
      byGroup[shareId] = {
        result:pass ? 'Pass' : 'Need Check',
        reason:pass ? 'Legacy Share Group Review 已人工確認。' : 'Legacy Share Group Review 尚未完成人工確認。',
        trace:null
      };
      return;
    }
    const audit = structuredShareGroupAudit_(
      shareId, members, evidence, taxReferences, reviewEntry, currentBatchId
    );
    byGroup[shareId] = audit;
  });
  return { byGroup };
}

function structuredShareGroupAudit_(shareId, queueMembers, evidence, taxReferences, reviewEntry, batchId) {
  const reasons = [];
  if (reviewEntry.identityError) reasons.push('Share Group Review ' + reviewEntry.identityError);
  const queueIds = [...new Set(queueMembers.map(member => member.branchId))].sort();
  const manifestByIdentity = {};
  const manifestSignatures = {};
  const shareIdErrors = [];
  let confirmedShareIdMismatch = false;
  const overageErrors = [];
  let confirmedOverageMismatch = false;

  queueMembers.forEach(member => {
    const evidenceEntry = evidence[member.branchId];
    if (!evidenceEntry || evidenceEntry.identityError) {
      shareIdErrors.push('Queue Branch ' + member.branchId + ' 缺少唯一 current-batch structured evidence row');
      overageErrors.push('Queue Branch ' + member.branchId + ' 缺少 structured overage evidence');
      return;
    }
    const parsed = parseStructuredContractData_(evidenceEntry.review || {});
    if (parsed.result !== 'OK') {
      shareIdErrors.push('Queue Branch ' + member.branchId + ' structured evidence 無法使用：' + parsed.reason);
      overageErrors.push('Queue Branch ' + member.branchId + ' structured overage 無法使用');
      return;
    }
    const manifests = Array.isArray(parsed.data.share_coverage_manifests)
      ? parsed.data.share_coverage_manifests : [];
    manifests.forEach((manifest, index) => {
      const sourceId = auditText_(manifest && manifest.source_id);
      const manifestId = auditText_(manifest && manifest.manifest_id) || sourceId + '¦' + index;
      if (!sourceId || parsed.data.evidence_set.relevant_source_ids.indexOf(sourceId) < 0) {
        shareIdErrors.push('Share coverage manifest ' + manifestId + ' 缺少 relevant source provenance');
        return;
      }
      const signature = JSON.stringify(manifest);
      if (manifestSignatures[manifestId] && manifestSignatures[manifestId] !== signature) {
        shareIdErrors.push('Share coverage manifest ' + manifestId + ' 在不同 Branch projection 內容不一致');
        return;
      }
      manifestSignatures[manifestId] = signature;
      if (!manifestByIdentity[manifestId]) manifestByIdentity[manifestId] = manifest;
    });

    const matchingProducts = parsed.data.products.filter(product => {
      if (!product || typeof product !== 'object' || Array.isArray(product)) return false;
      const productField = product.product;
      const productShare = product.share_plan_id;
      return productField && structuredState_(productField.state) === 'confirmed' &&
        isMainProduct_(canonicalDocumentProduct_(productField.value)) &&
        productShare && structuredState_(productShare.state) === 'confirmed' &&
        auditText_(productShare.value) === shareId;
    });
    if (!matchingProducts.length) {
      overageErrors.push('Queue Branch ' + member.branchId + ' 找不到 Share ID ' + shareId + ' 的 structured main-product overage');
      return;
    }
    const overages = matchingProducts.map(product => {
      const field = product.overage_unit_price;
      if (!field || structuredState_(field.state) !== 'confirmed') return null;
      return auditNumber_(field.value);
    }).filter(value => value !== null);
    if (overages.length !== 1 || member.queueOverage === null || !numbersEqual_(overages[0], member.queueOverage)) {
      if (overages.length === 1 && member.queueOverage !== null) confirmedOverageMismatch = true;
      overageErrors.push('Queue Branch ' + member.branchId + ' 超額單價：文件 ' +
        (overages.length === 1 ? auditFormatNumber_(overages[0]) : '無法唯一確認') +
        '、Queue ' + auditFormatNumber_(member.queueOverage));
    }
  });

  const covered = {};
  Object.keys(manifestByIdentity).forEach(manifestId => {
    const manifest = manifestByIdentity[manifestId];
    const shareField = manifest && manifest.share_plan_id;
    const shareState = structuredState_(shareField && shareField.state);
    if (shareState !== 'confirmed') {
      shareIdErrors.push('Share coverage manifest ' + manifestId + ' 的 Share Plan ID 為 ' +
        displayStructuredState_(shareField && shareField.state));
      return;
    }
    if (auditText_(shareField.value) !== shareId) {
      confirmedShareIdMismatch = true;
      shareIdErrors.push('Document Share ID「' + auditText_(shareField.value) + '」與 Queue「' + shareId + '」不一致');
      return;
    }
    const complete = manifest.coverage_complete;
    if (!complete || structuredState_(complete.state) !== 'confirmed' || complete.value !== true) {
      shareIdErrors.push('Share coverage manifest ' + manifestId + ' 未確認完整 member set');
      return;
    }
    if (!Array.isArray(manifest.covered_members)) {
      shareIdErrors.push('Share coverage manifest ' + manifestId + ' 缺少 covered_members');
      return;
    }
    const provenance = manifest.provenance;
    if (!provenance || auditText_(provenance.source_id) !== auditText_(manifest.source_id) ||
        !auditText_(provenance.locator || provenance.location)) {
      shareIdErrors.push('Share coverage manifest ' + manifestId + ' 缺少 source／locator provenance');
      return;
    }
    manifest.covered_members.forEach((coveredMember, index) => {
      const branchField = coveredMember && coveredMember.branch_id;
      const restaurantField = coveredMember && coveredMember.restaurant_name;
      if (!restaurantField || structuredState_(restaurantField.state) !== 'confirmed' ||
          !auditText_(restaurantField.value)) {
        shareIdErrors.push('Share coverage manifest ' + manifestId + ' member[' + index +
          '] restaurant name 無法確認');
        return;
      }
      if (!branchField || structuredState_(branchField.state) !== 'confirmed' || !auditText_(branchField.value)) {
        shareIdErrors.push('Share coverage manifest ' + manifestId + ' member[' + index +
          '] Branch ID 無法由文件店名唯一 mapping');
        return;
      }
      const mapping = coveredMember.mapping_provenance;
      if (!mapping || !auditText_(mapping.source_id) || !auditText_(mapping.method)) {
        shareIdErrors.push('Share coverage manifest ' + manifestId + ' member[' + index +
          '] 缺少 Branch mapping provenance');
        return;
      }
      const branchId = auditText_(branchField.value);
      covered[branchId] = auditText_(restaurantField && restaurantField.value) || branchId;
    });
  });
  if (!Object.keys(manifestByIdentity).length) shareIdErrors.push('current relevant evidence 未提供完整 share_coverage_manifests');

  const coveredIds = Object.keys(covered).sort();
  const documentExtra = coveredIds.filter(id => queueIds.indexOf(id) < 0);
  const queueExtra = queueIds.filter(id => coveredIds.indexOf(id) < 0);
  const coverageReasons = [];
  documentExtra.forEach(id => coverageReasons.push('Document contains Branch ' + id + ' not present in current Queue.'));
  queueExtra.forEach(id => coverageReasons.push('Queue Branch ' + id + ' is not covered by current Share evidence.'));
  const memberStatus = shareIdErrors.length || coverageReasons.length ? 'NEEDS_REVIEW' : 'PASS';
  const contractStatus = confirmedShareIdMismatch ? 'FAIL'
    : shareIdErrors.length || coverageReasons.length ? 'NEEDS_REVIEW' : 'PASS';
  reasons.push.apply(reasons, shareIdErrors.concat(coverageReasons));

  const taxValues = [];
  const taxErrors = [];
  queueIds.forEach(branchId => {
    const entry = taxReferences[branchId];
    const review = entry && entry.review || {};
    if (!entry || entry.identityError || auditText_(review['Import Status']).toUpperCase() !== 'PASS' ||
        !normalizeTaxId_(review['Tax ID'])) {
      taxErrors.push('Queue Branch ' + branchId + ' Tax ID snapshot 缺失、空白或有衝突');
      return;
    }
    taxValues.push(normalizeTaxId_(review['Tax ID']));
  });
  const uniqueTaxIds = [...new Set(taxValues)];
  let taxStatus;
  if (taxErrors.length) taxStatus = 'NEEDS_REVIEW';
  else if (uniqueTaxIds.length === 1) taxStatus = 'PASS';
  else if (hasExplicitShareTaxApproval_(reviewEntry.review || {})) taxStatus = 'PASS';
  else taxStatus = 'MANUAL REVIEW';
  if (taxErrors.length) reasons.push.apply(reasons, taxErrors);
  else if (uniqueTaxIds.length > 1 && taxStatus !== 'PASS') reasons.push('Share Plan current Queue members 的 Tax ID 不一致，需人工確認跨統編例外：' + uniqueTaxIds.join(', '));

  const overageStatus = confirmedOverageMismatch ? 'FAIL' : overageErrors.length ? 'NEEDS_REVIEW' : 'PASS';
  reasons.push.apply(reasons, overageErrors);
  const statuses = [memberStatus, taxStatus, contractStatus, overageStatus];
  const status = statuses.indexOf('FAIL') >= 0 ? 'FAIL'
    : statuses.indexOf('NEEDS_REVIEW') >= 0 ? 'NEEDS_REVIEW'
    : statuses.indexOf('MANUAL REVIEW') >= 0 ? 'MANUAL REVIEW' : 'PASS';
  const reason = status === 'PASS'
    ? 'Share Plan「' + shareId + '」current Queue coverage、文件 Share ID、Tax ID 與超額單價皆已確認。'
    : [...new Set(reasons)].join('；');
  return {
    result:status === 'PASS' ? 'Pass' : 'Need Check',
    reason,
    trace:{
      sharePlanId:shareId,
      targetRowNumber:reviewEntry.targetRowNumber,
      reviewBatchId:batchId,
      expectedFields:{
        'Member Check':memberStatus,
        'Tax ID Check':taxStatus,
        'Contract Check':contractStatus,
        'Overage Check':overageStatus,
        'Status':status,
        'Automated Check Detail':reason
      },
      queueMemberIds:queueIds,
      documentMemberIds:coveredIds,
      manifestIds:Object.keys(manifestByIdentity).sort()
    }
  };
}

function hasExplicitShareTaxApproval_(review) {
  return isPass_(review['Tax ID Check']) && !!auditText_(review['Reviewer']) &&
    !!auditText_(review['Reviewed At']) && !!auditText_(review['Notes']);
}

function numbersEqual_(a, b) {
  return a !== null && b !== null && isFinite(a) && isFinite(b) && Math.abs(Number(a) - Number(b)) <= 0.000001;
}

function shareAudit_(rows, qx, groupAudits) {
  const shareIds = [...new Set(rows.map(r => auditText_(auditGet_(r.values, qx, 'Share Plan ID'))).filter(Boolean))];
  if (!shareIds.length) return { result: 'Not Applicable', reason: '' };
  const audits = shareIds.map(id => groupAudits[id]).filter(Boolean);
  if (audits.length !== shareIds.length) {
    return { result:'Need Check', reason:'Share Plan current-batch deterministic audit 缺失；不得 fallback 到歷史人工 Pass' };
  }
  const blockers = audits.filter(audit => audit.result !== 'Pass');
  return blockers.length
    ? { result:'Need Check', reason:blockers.map(audit => audit.reason).join('；') }
    : { result:'Pass', reason:audits.map(audit => audit.reason).filter(Boolean).join('；') };
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

function writePlanClassificationTraces_(sheet, traces, activeBatchId) {
  if (!sheet || !traces || !traces.length) return;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const currentBatchId = auditText_(activeBatchId);
  const requiredHeaders = [
    'Branch ID', 'Original Plan Family', 'New Plan Family', 'First Contract Start Date',
    'Expected Plan Family', 'Original Plan Code', 'New Plan Code', 'Catalog Match Rule',
    'Catalog Exception', 'Origin Source'
  ];
  if (currentBatchId) requiredHeaders.push('Review Batch ID');
  const plan = headerNameMigrationPlan_(values[0].map(String), requiredHeaders, sheet.getName());
  if (plan.missing.length) {
    throw new Error(sheet.getName() + ' cannot write Plan Classification trace; missing headers: ' +
      plan.missing.join(', '));
  }
  const branchColumn = plan.positions['Branch ID'];
  const batchColumn = currentBatchId ? plan.positions['Review Batch ID'] : null;
  const preflightErrors = [];
  const targetRows = {};
  const targetBranches = {};
  const updates = traces.map((trace, index) => {
    const label = 'trace ' + (index + 1);
    const branchId = auditText_(trace && trace.branchId);
    const rowNumber = Number(trace && trace.targetRowNumber);
    const traceBatchId = auditText_(trace && trace.reviewBatchId);
    if (!branchId) preflightErrors.push(label + ' 缺少 Branch ID');
    if (currentBatchId && traceBatchId !== currentBatchId) {
      preflightErrors.push(label + ' Review Batch ID 不一致：預期 ' + currentBatchId +
        '，trace 為 ' + (traceBatchId || '空白'));
    }
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > values.length) {
      preflightErrors.push(label + ' targetRowNumber 無效：' + auditText_(trace && trace.targetRowNumber));
      return null;
    }
    if (targetRows[rowNumber]) {
      preflightErrors.push('target row ' + rowNumber + ' 同時被 ' + targetRows[rowNumber] +
        ' 與 ' + branchId + ' 指定');
    } else {
      targetRows[rowNumber] = branchId;
    }
    if (targetBranches[branchId]) {
      preflightErrors.push('Branch ' + branchId + ' 有多個 writer targets：' +
        targetBranches[branchId] + ', ' + rowNumber);
    } else if (branchId) {
      targetBranches[branchId] = rowNumber;
    }
    const row = values[rowNumber - 1];
    const actualBranchId = auditText_(row[branchColumn]);
    if (actualBranchId !== branchId) {
      preflightErrors.push('row ' + rowNumber + ' Branch ID 已變更：預期 ' + branchId +
        '，目前 ' + actualBranchId);
    }
    if (currentBatchId && auditText_(row[batchColumn]) !== currentBatchId) {
      preflightErrors.push('row ' + rowNumber + ' Review Batch ID 已變更：預期 ' + currentBatchId +
        '，目前 ' + (auditText_(row[batchColumn]) || '空白'));
    }
    const origin = trace && trace.origin || {};
    const planAudit = trace && trace.planAudit || {};
    const output = row.slice();
    const put = (header, value) => { output[plan.positions[header]] = value; };
    put('Original Plan Family', planAudit.oldFamily || '');
    put('New Plan Family', planAudit.newFamily || '');
    put('First Contract Start Date', origin.firstContractStart || '');
    put('Expected Plan Family', planAudit.expectedFamily || planAudit.oldFamily || '');
    put('Original Plan Code', planAudit.oldPlanCode || '');
    put('New Plan Code', planAudit.newPlanCode || '');
    put('Catalog Match Rule', planAudit.matchRule || '');
    put('Catalog Exception', planAudit.reason || '');
    put('Origin Source', origin.source || '');
    return { rowNumber, values:output };
  });

  Object.keys(targetBranches).forEach(branchId => {
    const candidateRows = [];
    values.slice(1).forEach((row, index) => {
      if (auditText_(row[branchColumn]) !== branchId) return;
      if (!currentBatchId || auditText_(row[batchColumn]) === currentBatchId) {
        candidateRows.push(index + 2);
      }
    });
    const expectedRow = targetBranches[branchId];
    const identityMatches = currentBatchId
      ? candidateRows.length === 1 && candidateRows[0] === expectedRow
      : candidateRows.length > 0 && candidateRows[0] === expectedRow;
    if (!identityMatches) {
      preflightErrors.push('Branch ' + branchId + ' 的最新 Sheet snapshot ' +
        (currentBatchId
          ? '在 Active Contract Review Batch「' + currentBatchId + '」必須只有 target row '
          : '的 legacy first matching row 必須仍為 target row ') +
        expectedRow + '；目前 rows：' + (candidateRows.length ? candidateRows.join(', ') : '無'));
    }
  });
  if (preflightErrors.length) {
    throw new Error(sheet.getName() + ' Plan Classification writer preflight failed: ' +
      preflightErrors.join('；'));
  }
  updates.forEach(update => {
    sheet.getRange(update.rowNumber, 1, 1, values[0].length).setValues([update.values]);
  });
}

function writeShareGroupTraces_(sheet, traces, activeBatchId) {
  const currentBatchId = auditText_(activeBatchId);
  if (!sheet || !traces || !traces.length || !currentBatchId) return;
  const values = sheet.getDataRange().getValues();
  const outputHeaders = [
    'Member Check', 'Tax ID Check', 'Contract Check', 'Overage Check',
    'Status', 'Automated Check Detail'
  ];
  const requiredHeaders = ['Share Plan ID', 'Review Batch ID'].concat(outputHeaders);
  const plan = headerNameMigrationPlan_(values[0].map(String), requiredHeaders, sheet.getName());
  if (plan.missing.length) throw new Error(sheet.getName() + ' Share writer missing headers: ' + plan.missing.join(', '));
  const preflightErrors = [];
  const targetRows = {};
  const targets = traces.map((trace, index) => {
    const shareId = auditText_(trace && trace.sharePlanId);
    const rowNumber = Number(trace && trace.targetRowNumber);
    if (!shareId) preflightErrors.push('trace ' + (index + 1) + ' 缺少 Share Plan ID');
    if (auditText_(trace && trace.reviewBatchId) !== currentBatchId) {
      preflightErrors.push('Share Plan ' + shareId + ' trace batch 不等於 Active Batch');
    }
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > values.length) {
      preflightErrors.push('Share Plan ' + shareId + ' targetRowNumber 無效');
      return null;
    }
    if (targetRows[rowNumber]) preflightErrors.push('Share writer target row 重複：' + rowNumber);
    targetRows[rowNumber] = shareId;
    const row = values[rowNumber - 1];
    if (auditText_(row[plan.positions['Share Plan ID']]) !== shareId) {
      preflightErrors.push('row ' + rowNumber + ' Share Plan ID 已變更');
    }
    if (auditText_(row[plan.positions['Review Batch ID']]) !== currentBatchId) {
      preflightErrors.push('row ' + rowNumber + ' Review Batch ID 已變更');
    }
    return { trace, shareId, rowNumber };
  }).filter(Boolean);

  targets.forEach(target => {
    const currentRows = [];
    values.slice(1).forEach((row, index) => {
      if (auditText_(row[plan.positions['Share Plan ID']]) === target.shareId &&
          auditText_(row[plan.positions['Review Batch ID']]) === currentBatchId) currentRows.push(index + 2);
    });
    if (currentRows.length !== 1 || currentRows[0] !== target.rowNumber) {
      preflightErrors.push('Share Plan ' + target.shareId + ' current-batch row identity 已改變；目前 rows：' +
        (currentRows.length ? currentRows.join(', ') : '無'));
    }
  });
  if (preflightErrors.length) {
    throw new Error(sheet.getName() + ' Share writer preflight failed: ' + preflightErrors.join('；'));
  }
  targets.forEach(target => {
    outputHeaders.forEach(header => {
      sheet.getRange(target.rowNumber, plan.positions[header] + 1)
        .setValue(target.trace.expectedFields[header]);
    });
  });
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
function isExplicitStructuredPlanVeto_(value) {
  if (typeof value !== 'string') return false;
  return ['false', 'fail', 'failed', '不通過', '不一致']
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
