const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const golden = JSON.parse(fs.readFileSync(
  'tests/fixtures/deposit_plan_reference_golden.json', 'utf8'
));
const source = fs.readFileSync('RenewalQueue.gs', 'utf8') + `
globalThis.__test = {
  renewalEnvironmentConfig_, openConfiguredRenewalWorkbook_, assertConfiguredSourceIds_,
  readDepositPlanReferenceSource_, assertDepositSnapshotEquivalent_,
  assertValidatedDepositMapping_,
  buildQueueWithMode_, setupAuditSheets_, prepareContractReviewBatch,
  snapshotHeaders:PLAN_REFERENCE_SNAPSHOT_HEADERS,
  validatedTestWorkbookId:RENEWAL_QUEUE_VALIDATED_TEST_WORKBOOK_ID
};`;

const sourceBooks = {};
let scriptProperties = {};
const context = {
  console,
  PropertiesService:{
    getScriptProperties:() => ({ getProperties:() => Object.assign({}, scriptProperties) })
  },
  SpreadsheetApp:{ openById:id => sourceBooks[id] },
  Session:{ getScriptTimeZone:() => 'Asia/Taipei' }
};
vm.runInNewContext(source, context);
const api = context.__test;

function sourceSheetFromGolden(overrides = {}) {
  const maxRow = Math.max(...golden.rows.map(row => row.sourceRow), overrides.addedRow || 0);
  const values = Array.from({ length:maxRow }, () => []);
  golden.rows.forEach(row => { values[row.sourceRow - 1] = row.displayValues.slice(); });
  if (overrides.removeRow) values[overrides.removeRow - 1] = [];
  if (overrides.changeRow) values[overrides.changeRow.row - 1] = overrides.changeRow.values.slice();
  if (overrides.addedRow) values[overrides.addedRow - 1] = ['新增方案'];
  return {
    getDataRange:() => ({ getDisplayValues:() => values.map(row => row.slice()) })
  };
}

function sourceBook(sheet) {
  return { getSheetByName:name => name === golden.sourceTab ? sheet : null };
}

function control() {
  return {
    'Plan Reference Spreadsheet ID':golden.sourceSpreadsheetId,
    'Deposit Plan Reference Tab':golden.sourceTab
  };
}

function goldenSnapshotRows() {
  return golden.rows.map(row => [
    row.snapshotId, 'Deposit', golden.sourceSpreadsheetId, golden.sourceTab,
    row.sourceRow, '2026-07-17', JSON.stringify({ values:row.displayValues }), '', ''
  ]);
}

const MAPPING_HEADERS = [
  'Mapping ID', 'Plan Family', 'Source Spreadsheet ID', 'Source Tab',
  'Layout Type', 'Header Row', 'Data Start Row', 'Header Group',
  'Header Label', 'Canonical Plan Field', 'Data Type', 'Normalization',
  'Required In Combination', 'Combination Key Part', 'Special Plan Flag Rule',
  'Status', 'Notes'
];
const VALIDATED_DEPOSIT_MAPPING = [
  'Plan.Deposit', 'Deposit', golden.sourceSpreadsheetId, golden.sourceTab,
  'Row package', 'section header row', 'following rows', 'Section header',
  'B2B/B2C + Prepayment/Pre-Authorisation', 'deposit_package', 'text',
  'normalize type and feature flags', 'Yes', 'Yes', 'See special label',
  'Active', 'Each source row is one inseparable Deposit package'
];
function mappingSheet(rows) {
  const values = [MAPPING_HEADERS].concat(rows || []);
  return { getDataRange:() => ({ getValues:() => values.map(row => row.slice()) }) };
}

// Complete 44-row importer golden: source row identity, order and formatted raw values.
sourceBooks[golden.sourceSpreadsheetId] = sourceBook(sourceSheetFromGolden());
let imported = api.readDepositPlanReferenceSource_(control(), '2026-08-27');
assert.strictEqual(imported.length, golden.expectedRowCount);
assert.strictEqual(JSON.stringify(imported.map(row => row[0])),
  JSON.stringify(golden.rows.map(row => row.snapshotId)));
assert.strictEqual(JSON.stringify(imported.map(row => row[4])),
  JSON.stringify(golden.rows.map(row => row.sourceRow)));
assert.strictEqual(JSON.stringify(imported.map(row => JSON.parse(row[6]).values)),
  JSON.stringify(golden.rows.map(row => row.displayValues)));
assert.strictEqual(api.assertDepositSnapshotEquivalent_(
  imported, goldenSnapshotRows(), '44-row golden'
).rowCount, 44);

// Imported At is intentionally excluded from equivalence.
const laterImport = imported.map(row => row.map((value, index) => index === 5 ? 'later' : value));
assert.strictEqual(api.assertDepositSnapshotEquivalent_(
  laterImport, goldenSnapshotRows(), 'timestamp-independent golden'
).rowCount, 44);

// Production initialization must reuse the one validated static Plan.Deposit
// mapping. It must not infer or silently replace Deposit business semantics.
assert.doesNotThrow(() => api.assertValidatedDepositMapping_(
  mappingSheet([VALIDATED_DEPOSIT_MAPPING]), control()
));
assert.throws(() => api.assertValidatedDepositMapping_(mappingSheet([
  VALIDATED_DEPOSIT_MAPPING.map((value, index) => index === 11 ? 'invent new semantics' : value)
]), control()), /differs at: Normalization/);
assert.throws(() => api.assertValidatedDepositMapping_(mappingSheet([]), control()),
  /exactly one validated Plan.Deposit row/);

// Any formatted-value change, removal or addition fails closed with its source row.
const changedValues = golden.rows.find(row => row.sourceRow === 4).displayValues.slice();
changedValues[2] = '$1,501';
sourceBooks[golden.sourceSpreadsheetId] = sourceBook(sourceSheetFromGolden({
  changeRow:{ row:4, values:changedValues }
}));
imported = api.readDepositPlanReferenceSource_(control(), '2026-08-27');
assert.throws(() => api.assertDepositSnapshotEquivalent_(imported, goldenSnapshotRows(), 'changed'),
  /source row 4 changed/);

sourceBooks[golden.sourceSpreadsheetId] = sourceBook(sourceSheetFromGolden({ removeRow:56 }));
imported = api.readDepositPlanReferenceSource_(control(), '2026-08-27');
assert.throws(() => api.assertDepositSnapshotEquivalent_(imported, goldenSnapshotRows(), 'removed'),
  /source row 56 missing/);

sourceBooks[golden.sourceSpreadsheetId] = sourceBook(sourceSheetFromGolden({ addedRow:57 }));
imported = api.readDepositPlanReferenceSource_(control(), '2026-08-27');
assert.throws(() => api.assertDepositSnapshotEquivalent_(imported, goldenSnapshotRows(), 'added'),
  /source row 57 added/);

// Production target identity is property-driven and cannot point to Test.
const productionId = 'PRODUCTION-WORKBOOK';
sourceBooks[productionId] = {
  getId:() => productionId,
  getName:() => 'TPR Renewal Audit - Production'
};
scriptProperties = {
  ENVIRONMENT:'production',
  TARGET_WORKBOOK_ID:productionId,
  EXPECTED_WORKBOOK_NAME:'TPR Renewal Audit - Production',
  ORIGINAL_TPR_SPREADSHEET_ID:'TPR',
  RENEWAL_DB_SPREADSHEET_ID:'RENEWAL',
  RSV_PLAN_REFERENCE_SPREADSHEET_ID:'TMS',
  DEPOSIT_PLAN_REFERENCE_SPREADSHEET_ID:'DEPOSIT'
};
assert.strictEqual(api.openConfiguredRenewalWorkbook_().ss.getId(), productionId);
assert.doesNotThrow(() => api.assertConfiguredSourceIds_(api.openConfiguredRenewalWorkbook_(), {
  'Original TPR Spreadsheet ID':'TPR',
  'Renewal DB Spreadsheet ID':'RENEWAL',
  'RSV Plan Reference Spreadsheet ID':'TMS',
  'Plan Reference Spreadsheet ID':'DEPOSIT'
}));
assert.throws(() => api.assertConfiguredSourceIds_(api.openConfiguredRenewalWorkbook_(), {
  'Original TPR Spreadsheet ID':'WRONG',
  'Renewal DB Spreadsheet ID':'RENEWAL',
  'RSV Plan Reference Spreadsheet ID':'TMS',
  'Plan Reference Spreadsheet ID':'DEPOSIT'
}), /source identity preflight failed/);

scriptProperties.TARGET_WORKBOOK_ID = api.validatedTestWorkbookId;
assert.throws(() => api.renewalEnvironmentConfig_(), /validated Test workbook/);

// Build/Audit setup no longer creates blank-batch review rows.
assert.doesNotMatch(api.setupAuditSheets_.toString(), /appendMissingEvidenceReviewRows_|appendMissingReviewRows_/);
assert.match(api.buildQueueWithMode_.toString(), /setupAuditSheets_\s*\(/);
assert.match(api.prepareContractReviewBatch.toString(), /appendCurrentBatchRows_/);

console.log('Production environment / 44-row Deposit importer regression: all cases passed.');
