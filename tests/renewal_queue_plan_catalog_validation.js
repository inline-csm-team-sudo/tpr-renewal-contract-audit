const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('RenewalQueue.gs', 'utf8') + `
globalThis.__test = {
  buildQueue,
  buildQueueWithMode_,
  runContractAudit,
  maintainPlanCodes,
  readPlanCatalogSource_,
  assignMissingPlanCodes_:typeof assignMissingPlanCodes_ === 'function' ? assignMissingPlanCodes_ : null,
  syncPlanCatalog_,
  readDepositPlanReferenceSource_,
  assertDepositSnapshotEquivalent_,
  canonicalPlanHeaders:CANONICAL_PLAN_HEADERS,
  planChangeHeaders:PLAN_CHANGE_HEADERS,
  planReferenceMappingHeaders:PLAN_REFERENCE_MAPPING_HEADERS
};`;

const sourceBooks = {};
const context = {
  console,
  SpreadsheetApp: {
    openById:id => sourceBooks[id],
    CopyPasteType:{ PASTE_FORMAT:'PASTE_FORMAT' }
  },
  Utilities: {
    DigestAlgorithm:{ SHA_256:'SHA_256' },
    computeDigest:(_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest())
      .map(byte => byte > 127 ? byte - 256 : byte),
    formatDate:() => '2026-08-27'
  },
  Session:{ getScriptTimeZone:() => 'Asia/Taipei' }
};
vm.runInNewContext(source, context);
const api = context.__test;

const SOURCE_ID = 'TMS-SOURCE';
const SOURCE_TAB = 'TMS 方案';
const DEPOSIT_SOURCE_ID = 'DEPOSIT-SOURCE';
const DEPOSIT_SOURCE_TAB = '訂金方案';
const SOURCE_HEADERS = [
  'Source Tab', '繳款週期', '產品', '使用組數', '贈送組數',
  '月費 / 年費', '每組超額單價', 'Plan Code'
];

function sourceRow(overrides = {}) {
  const value = Object.assign({
    catalog:'公版方案', billing:'年繳', product:'RSV', sets:3600,
    bonus:300, price:21600, overage:7, code:'TMS-0001'
  }, overrides);
  return [value.catalog, value.billing, value.product, value.sets, value.bonus,
    value.price, value.overage, value.code];
}

function sourceSheet(rows) {
  const values = [SOURCE_HEADERS.slice()].concat(rows.map(row => row.slice()));
  const writes = [];
  return {
    values,
    writes,
    getName:() => SOURCE_TAB,
    getLastColumn:() => values[0].length,
    getLastRow:() => values.length,
    getRange:(row, column, rowCount = 1, columnCount = 1) => ({
      getValues:() => values.slice(row - 1, row - 1 + rowCount)
        .map(sourceRowValues => sourceRowValues.slice(column - 1, column - 1 + columnCount)),
      setValue:value => {
        writes.push({ type:'setValue', row, column, value });
        values[row - 1][column - 1] = value;
      },
      setValues:newValues => {
        writes.push({ type:'setValues', row, column, rowCount, columnCount, values:newValues });
        newValues.forEach((newRow, rowOffset) => newRow.forEach((value, columnOffset) => {
          values[row - 1 + rowOffset][column - 1 + columnOffset] = value;
        }));
      }
    })
  };
}

function tableSheet(name, headers, rows = []) {
  const values = [headers.slice()].concat(rows.map(row => row.slice()));
  const writes = [];
  const ensureCell = (row, column) => {
    while (values.length <= row) values.push([]);
    while (values[row].length <= column) values[row].push('');
  };
  return {
    values,
    writes,
    getName:() => name,
    getLastColumn:() => values.reduce((max, row) => Math.max(max, row.length), 0),
    getLastRow:() => values.length,
    getDataRange:() => ({ getValues:() => values.map(row => row.slice()) }),
    getRange:(row, column, rowCount = 1, columnCount = 1) => ({
      getValues:() => values.slice(row - 1, row - 1 + rowCount).map(existingRow =>
        Array.from({ length:columnCount }, (_, offset) => existingRow[column - 1 + offset] ?? '')
      ),
      setValues:newValues => {
        writes.push({ type:'setValues', row, column, rowCount, columnCount, values:newValues });
        newValues.forEach((newRow, rowOffset) => newRow.forEach((value, columnOffset) => {
          ensureCell(row - 1 + rowOffset, column - 1 + columnOffset);
          values[row - 1 + rowOffset][column - 1 + columnOffset] = value;
        }));
      },
      clearContent:() => {
        writes.push({ type:'clearContent', row, column, rowCount, columnCount });
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
          for (let columnOffset = 0; columnOffset < columnCount; columnOffset++) {
            ensureCell(row - 1 + rowOffset, column - 1 + columnOffset);
            values[row - 1 + rowOffset][column - 1 + columnOffset] = '';
          }
        }
      }
    }),
    setFrozenRows:count => writes.push({ type:'setFrozenRows', count })
  };
}

function catalogRow(overrides = {}) {
  const plan = Object.assign({
    code:'TMS-0001', version:1, status:'Active', family:'Public', catalog:'公版方案',
    billing:'annual', product:'RSV', sets:3600, bonus:300, price:21600,
    overage:7, sourceRow:2
  }, overrides);
  const record = JSON.stringify({
    family:plan.family, sourceCatalog:plan.catalog, billing:plan.billing,
    product:plan.product, sets:plan.sets, bonus:plan.bonus,
    price:plan.price, overage:plan.overage
  });
  return [
    plan.code, plan.version, plan.status, plan.family, plan.catalog,
    plan.billing, plan.product, plan.sets, plan.bonus, plan.price, plan.overage,
    SOURCE_ID, SOURCE_TAB, plan.sourceRow, '2026-08-15', '', '2026-08-15', record
  ];
}

const SNAPSHOT_HEADERS = [
  'Snapshot ID', 'Plan Family', 'Source Spreadsheet ID', 'Source Tab',
  'Source Row', 'Imported At', 'Raw Values JSON', 'Normalized Combination ID',
  'Special Plan Flag'
];

const DEPOSIT_MAPPING_ROW = [
  'Plan.Deposit', 'Deposit', DEPOSIT_SOURCE_ID, DEPOSIT_SOURCE_TAB, 'Row package',
  'section header row', 'following rows', 'Section header',
  'B2B/B2C + Prepayment/Pre-Authorisation', 'deposit_package', 'text',
  'normalize type and feature flags', 'Yes', 'Yes', 'See special label', 'Active',
  'Each source row is one inseparable Deposit package'
];
const DEPOSIT_DISPLAY_ROWS = [
  [],
  ['2025 加值訂金功能報價一覽表'],
  ['B2C', 'Prepayment\n預付', '月費', '建立費/組', '信用卡交易手續費',
    '虛擬ATM 交易手續費', 'Pre-order', 'Experience'],
  ['', '', '$1,500', '$0', '4%', '1%', '可使用', '可使用']
];

function depositSourceSheet(rows = DEPOSIT_DISPLAY_ROWS) {
  const values = rows.map(row => row.slice());
  return {
    getName:() => DEPOSIT_SOURCE_TAB,
    getDataRange:() => ({
      getDisplayValues:() => values.map(row => row.slice()),
      getValues:() => values.map(row => row.slice())
    })
  };
}

const depositSourceFixture = depositSourceSheet();
sourceBooks[DEPOSIT_SOURCE_ID] = {
  getSheetByName:name => name === DEPOSIT_SOURCE_TAB ? depositSourceFixture : null
};

function depositControl() {
  return {
    'Plan Reference Spreadsheet ID':DEPOSIT_SOURCE_ID,
    'Deposit Plan Reference Tab':DEPOSIT_SOURCE_TAB
  };
}

function depositBaselineRows() {
  return api.readDepositPlanReferenceSource_(depositControl(), '2026-08-27');
}

function catalogWorkbook(catalogRows) {
  const sheets = {
    'Canonical Plan Catalog':tableSheet('Canonical Plan Catalog', api.canonicalPlanHeaders, catalogRows),
    'Plan Catalog Change Review':tableSheet('Plan Catalog Change Review', api.planChangeHeaders),
    'Plan Reference Mapping':tableSheet('Plan Reference Mapping', api.planReferenceMappingHeaders,
      [DEPOSIT_MAPPING_ROW]),
    'Plan Reference Snapshot':tableSheet('Plan Reference Snapshot', SNAPSHOT_HEADERS,
      depositBaselineRows())
  };
  return { sheets, getSheetByName:name => sheets[name] || null };
}

function rowsAsObjects(sheet) {
  const headers = sheet.values[0];
  return sheet.values.slice(1).filter(row => row.some(value => value !== '')).map(row =>
    headers.reduce((out, header, index) => (out[header] = row[index], out), {})
  );
}

// Regression 1: an Audit-path read with complete Plan Codes is source-read-only.
let sourceSheetFixture = sourceSheet([
  sourceRow(),
  sourceRow({ catalog:'BD 新方案', sets:7200, bonus:600, price:45000,
    overage:6, code:'TMS-0002' })
]);
let plans = api.readPlanCatalogSource_(sourceSheetFixture, SOURCE_ID, SOURCE_TAB, 'Plan Code');
assert.strictEqual(plans.length, 2);
assert.strictEqual(sourceSheetFixture.writes.length, 0);

// Regression 2: a supported new plan with a blank code fails closed and names
// the source row plus business facts without writing the source.
sourceSheetFixture = sourceSheet([
  sourceRow(),
  sourceRow({ catalog:'BD 新方案', sets:7200, bonus:600, price:45000,
    overage:6, code:'' })
]);
assert.throws(
  () => api.readPlanCatalogSource_(sourceSheetFixture, SOURCE_ID, SOURCE_TAB, 'Plan Code'),
  /TMS 方案!3.*Source Tab=BD 新方案.*產品=RSV.*使用組數=7200.*maintainPlanCodes/
);
assert.strictEqual(sourceSheetFixture.writes.length, 0);

// Regression 3/4: explicit maintenance assigns only blank cells and leaves
// every existing stable identity untouched.
sourceSheetFixture = sourceSheet([
  sourceRow(),
  sourceRow({ catalog:'BD 新方案', sets:7200, bonus:600, price:45000,
    overage:6, code:'TMS-0004' }),
  sourceRow({ catalog:'Lite 方案', sets:9600, bonus:800, price:45600,
    overage:5.5, code:'' })
]);
let maintenance = api.assignMissingPlanCodes_(
  sourceSheetFixture, SOURCE_ID, SOURCE_TAB, 'Plan Code'
);
assert.strictEqual(JSON.stringify(maintenance.assignments), JSON.stringify([
  { rowNumber:4, planCode:'TMS-0005' }
]));
assert.strictEqual(JSON.stringify(sourceSheetFixture.writes), JSON.stringify([
  { type:'setValue', row:4, column:8, value:'TMS-0005' }
]));
assert.strictEqual(sourceSheetFixture.values[1][7], 'TMS-0001');
assert.strictEqual(sourceSheetFixture.values[2][7], 'TMS-0004');

// Regression 5: invalid official rows never receive a Plan Code.
sourceSheetFixture = sourceSheet([
  sourceRow(),
  sourceRow({ billing:'weekly', sets:'', code:'' })
]);
assert.throws(
  () => api.assignMissingPlanCodes_(sourceSheetFixture, SOURCE_ID, SOURCE_TAB, 'Plan Code'),
  /invalid official Catalog rows.*TMS 方案!3/
);
assert.strictEqual(sourceSheetFixture.writes.length, 0);
assert.strictEqual(sourceSheetFixture.values[2][7], '');

// Regression 6: after explicit maintenance, the next read-only Audit sync can
// create the new coded plan as Catalog v1 Active without another source write.
sourceSheetFixture = sourceSheet([
  sourceRow(),
  sourceRow({ catalog:'BD 新方案', sets:7200, bonus:600, price:45000,
    overage:6, code:'' })
]);
maintenance = api.assignMissingPlanCodes_(sourceSheetFixture, SOURCE_ID, SOURCE_TAB, 'Plan Code');
assert.strictEqual(maintenance.assignments[0].planCode, 'TMS-0002');
const writesAfterMaintenance = sourceSheetFixture.writes.length;
sourceBooks[SOURCE_ID] = { getSheetByName:name => name === SOURCE_TAB ? sourceSheetFixture : null };
let testWorkbook = catalogWorkbook([catalogRow()]);
let syncResult = api.syncPlanCatalog_(testWorkbook, {
  'RSV Plan Reference Spreadsheet ID':SOURCE_ID,
  'RSV Plan Reference Tab':SOURCE_TAB,
  'RSV Plan Code Header':'Plan Code',
  ...depositControl()
});
assert.strictEqual(sourceSheetFixture.writes.length, writesAfterMaintenance);
let catalogRows = rowsAsObjects(testWorkbook.sheets['Canonical Plan Catalog']);
const newCatalogPlan = catalogRows.find(row => row['Plan Code'] === 'TMS-0002');
assert.strictEqual(newCatalogPlan.Version, 1);
assert.strictEqual(newCatalogPlan.Status, 'Active');
const addChange = rowsAsObjects(testWorkbook.sheets['Plan Catalog Change Review'])
  .find(row => row['Plan Code'] === 'TMS-0002');
assert.strictEqual(addChange['Change Type'], 'Add');
assert.strictEqual(addChange['Approval Status'], 'Auto Approved');
assert.strictEqual(syncResult.pendingChanges.length, 0);

// Regression 7: changed business values under an existing stable Plan Code
// still create the existing governed Pending Modify change.
sourceSheetFixture = sourceSheet([
  sourceRow({ price:24000 })
]);
sourceBooks[SOURCE_ID] = { getSheetByName:name => name === SOURCE_TAB ? sourceSheetFixture : null };
testWorkbook = catalogWorkbook([catalogRow()]);
syncResult = api.syncPlanCatalog_(testWorkbook, {
  'RSV Plan Reference Spreadsheet ID':SOURCE_ID,
  'RSV Plan Reference Tab':SOURCE_TAB,
  'RSV Plan Code Header':'Plan Code',
  ...depositControl()
});
assert.strictEqual(sourceSheetFixture.writes.length, 0);
assert.strictEqual(syncResult.pendingChanges.length, 1);
assert.strictEqual(syncResult.pendingChanges[0].changeType, 'Modify');
assert.strictEqual(syncResult.pendingChanges[0].approvalStatus, 'Pending');
catalogRows = rowsAsObjects(testWorkbook.sheets['Canonical Plan Catalog']);
assert.strictEqual(catalogRows.length, 1);
assert.strictEqual(catalogRows[0].Price, 21600);

// External write-scope guard: Build/Audit must enter the live Catalog through
// the read-only adapter. The source writer remains reachable only from the
// explicit maintenance entry point.
const buildSource = api.buildQueueWithMode_.toString();
const auditSource = api.runContractAudit.toString();
const syncSource = api.syncPlanCatalog_.toString();
const readerSource = api.readPlanCatalogSource_.toString();
const maintenanceSource = api.maintainPlanCodes.toString();
const sourceWriterToken = 'assignMissingPlanCodes_(';
const sourceMutationPattern = /\.(?:setValue|setValues|clear|clearContent|deleteRow|deleteRows|appendRow|insertRow|insertRows|copyTo)\s*\(/;

assert.match(buildSource, /syncPlanCatalog_\s*\(/);
assert.match(auditSource, /syncPlanCatalog_\s*\(/);
assert.match(syncSource, /readPlanCatalogSource_\s*\(/);
assert.doesNotMatch(syncSource, /assignMissingPlanCodes_\s*\(/);
assert.doesNotMatch(readerSource, sourceMutationPattern);
assert.match(maintenanceSource, /assignMissingPlanCodes_\s*\(/);
assert.strictEqual(source.split(sourceWriterToken).length - 1, 2,
  'assignMissingPlanCodes_ must appear only in its declaration and explicit maintenance caller');

console.log('Plan catalog read-only / maintenance regression: all cases passed.');
