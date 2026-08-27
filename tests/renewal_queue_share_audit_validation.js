const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('RenewalQueue.gs', 'utf8') + `
globalThis.__shareTest = {
  headerIndex_, indexedCurrentBatchReview_, normalizeTaxId_, readChargebeeBranchTaxIds_,
  structuredShareGroupAudits_, queueShareOverageAudit_, writeShareGroupTraces_
};`;
const sourceBooks = {};
const context = {
  console,
  SpreadsheetApp:{ openById:id => sourceBooks[id] }
};
vm.runInNewContext(source, context);
const api = context.__shareTest;

const queueHeaders = [
  'Branch ID', '餐廳名稱', '產品', 'Share Plan ID', '超額每組單價',
  '合約價格', '合約贈送組數'
];
const qx = api.headerIndex_(queueHeaders);
const field = (state, value) => value === undefined ? { state } : { state, value };

function queue(branchId, restaurant, shareId, overage = 7, price = 21600, bonus = 0) {
  return { values:[branchId, restaurant, 'RSV', shareId, overage, price, bonus] };
}

function manifest(id, sourceId, shareId, members) {
  return {
    manifest_id:id,
    source_id:sourceId,
    share_plan_id:field('Confirmed', shareId),
    coverage_complete:field('Confirmed', true),
    covered_members:members.map(member => ({
      branch_id:field('Confirmed', member.id),
      restaurant_name:field('Confirmed', member.name),
      mapping_provenance:{ source_id:sourceId, method:'authoritative branch mapping' }
    })),
    provenance:{ source_id:sourceId, locator:'share member table' }
  };
}

function data(branchId, shareId, overage, manifests, overrides = {}) {
  return {
    schema_version:1,
    evidence_set:{ state:'Confirmed', complete:true, relevant_source_ids:['DOC-' + shareId] },
    products:[{
      source_id:'DOC-' + shareId,
      product:field('Confirmed', 'RSV'),
      billing_period:field('Confirmed', 'annual'),
      usage_sets:field('Confirmed', 3600),
      bonus_sets:field('Confirmed', overrides.bonus === undefined ? 0 : overrides.bonus),
      price:field('Confirmed', overrides.price === undefined ? 21600 : overrides.price),
      share_plan_id:field('Confirmed', shareId),
      overage_method:field('Confirmed', 'per unit'),
      overage_unit_price:field('Confirmed', overage)
    }],
    share_coverage_manifests:manifests
  };
}

function evidenceEntry(branchId, structured) {
  return {
    review:{
      'Structured Review Version':'1',
      'Structured Contract Data':JSON.stringify(structured)
    },
    targetRowNumber:10,
    reviewBatchId:'BATCH'
  };
}

function taxEntry(branchId, taxId) {
  return {
    review:{ 'Branch ID':branchId, 'Tax ID':taxId, 'Import Status':'PASS', 'Review Batch ID':'BATCH' },
    targetRowNumber:20,
    reviewBatchId:'BATCH'
  };
}

function reviewEntry(shareId, overrides = {}) {
  return {
    review:Object.assign({ 'Share Plan ID':shareId, 'Review Batch ID':'BATCH' }, overrides),
    targetRowNumber:30,
    reviewBatchId:'BATCH'
  };
}

function runGroup(label, members, manifestsByBranch, taxes, options = {}) {
  const shareId = label;
  const byBranch = {};
  const evidence = {};
  const tax = {};
  members.forEach((member, index) => {
    byBranch[member.id] = [queue(member.id, member.name, shareId, member.overage || 7,
      member.price === undefined ? 21600 : member.price)];
    evidence[member.id] = evidenceEntry(member.id, data(
      member.id, shareId, member.documentOverage === undefined ? (member.overage || 7) : member.documentOverage,
      manifestsByBranch[member.id] || [], { price:member.documentPrice }
    ));
    tax[member.id] = taxEntry(member.id, taxes[member.id]);
  });
  const reviews = { [shareId]:reviewEntry(shareId, options.review) };
  return api.structuredShareGroupAudits_(byBranch, qx, evidence, tax, reviews, 'BATCH').byGroup[shareId];
}

// Chargebee is read with display values, preserving leading zeroes; duplicate
// conflicts and blanks fail closed without writing to the source.
sourceBooks.CHARGEBEE = {
  getSheetByName:name => name === 'TW' ? {
    getLastRow:() => 6,
    getRange:() => ({ getDisplayValues:() => [
      ['Branch ID', ...Array(15).fill(''), 'Tax Reg Number (billing)'],
      ['A', ...Array(15).fill(''), '01234567'],
      ['B', ...Array(15).fill(''), '99887766'],
      ['B', ...Array(15).fill(''), '99887766'],
      ['C', ...Array(15).fill(''), '11111111'],
      ['C', ...Array(15).fill(''), '22222222']
    ] })
  } : null
};
const imported = api.readChargebeeBranchTaxIds_(
  { chargebeeImportSpreadsheetId:'CHARGEBEE' }, ['A', 'B', 'C', 'D'], 'NOW'
).rows;
assert.strictEqual(imported[0].taxId, '01234567');
assert.strictEqual(imported[0].status, 'PASS');
assert.strictEqual(imported[1].status, 'PASS');
assert.match(imported[1].notes, /duplicate.*一致/i);
assert.strictEqual(imported[2].status, 'NEEDS_REVIEW');
assert.strictEqual(imported[3].status, 'NEEDS_REVIEW');

const two = [{ id:'A', name:'Alpha' }, { id:'B', name:'Beta' }];
const full = manifest('M1', 'DOC-GROUP', 'GROUP', two);

// One Share contract can cover multiple Branches. Repeated references to the
// same evidence manifest are deduplicated, proving read-once/reuse semantics.
let result = runGroup('GROUP', two, { A:[full], B:[full] }, { A:'123', B:'123' });
assert.strictEqual(result.result, 'Pass');
assert.strictEqual(JSON.stringify(result.trace.manifestIds), JSON.stringify(['M1']));

// One Share ID may be covered by multiple current contracts; union is authority.
const partA = manifest('MA', 'DOC-SPLIT', 'SPLIT', [two[0]]);
const partB = manifest('MB', 'DOC-SPLIT', 'SPLIT', [two[1]]);
result = runGroup('SPLIT', two, { A:[partA], B:[partB] }, { A:'123', B:'123' });
assert.strictEqual(result.result, 'Pass');

// Document extra member and Queue extra member both fail closed; neither is
// interpreted as proof that a renewal was omitted.
const three = two.concat([{ id:'C', name:'Gamma' }]);
result = runGroup('DOC-EXTRA', two, {
  A:[manifest('ME', 'DOC-DOC-EXTRA', 'DOC-EXTRA', three)],
  B:[manifest('ME', 'DOC-DOC-EXTRA', 'DOC-EXTRA', three)]
}, { A:'123', B:'123' });
assert.strictEqual(result.result, 'Need Check');
assert.match(result.reason, /Document contains Branch C not present in current Queue/);

result = runGroup('QUEUE-EXTRA', three, {
  A:[manifest('MQ', 'DOC-QUEUE-EXTRA', 'QUEUE-EXTRA', two)],
  B:[manifest('MQ', 'DOC-QUEUE-EXTRA', 'QUEUE-EXTRA', two)],
  C:[manifest('MQ', 'DOC-QUEUE-EXTRA', 'QUEUE-EXTRA', two)]
}, { A:'123', B:'123', C:'123' });
assert.match(result.reason, /Queue Branch C is not covered by current Share evidence/);

// Cross-Tax-ID groups require a real manual approval. A legacy/manual Pass
// without reviewer, timestamp and note cannot silently auto-pass.
const crossManifest = manifest('MC', 'DOC-CROSS', 'CROSS', two);
result = runGroup('CROSS', two, { A:[crossManifest], B:[crossManifest] }, { A:'111', B:'222' });
assert.strictEqual(result.trace.expectedFields['Tax ID Check'], 'MANUAL REVIEW');
assert.strictEqual(result.result, 'Need Check');
result = runGroup('CROSS', two, { A:[crossManifest], B:[crossManifest] }, { A:'111', B:'222' }, {
  review:{ 'Tax ID Check':'Pass', Reviewer:'Reviewer', 'Reviewed At':'2026-08-27', Notes:'approved exception' }
});
assert.strictEqual(result.result, 'Pass');

// Share ID mismatch and Share-specific overage mismatch fail closed.
const wrongId = manifest('MW', 'DOC-WRONG-ID', 'OTHER', two);
result = runGroup('WRONG-ID', two, { A:[wrongId], B:[wrongId] }, { A:'123', B:'123' });
assert.match(result.reason, /Document Share ID.*OTHER.*Queue.*WRONG-ID/);
const overageManifest = manifest('MO', 'DOC-OVERAGE', 'OVERAGE', two);
result = runGroup('OVERAGE', [two[0]], { A:[overageManifest] }, { A:'123' });
assert.match(result.reason, /Queue Branch B is not covered|Document contains Branch B/);
result = runGroup('OVERAGE-ONLY', [two[0]], {
  A:[manifest('MO2', 'DOC-OVERAGE-ONLY', 'OVERAGE-ONLY', [two[0]])]
}, { A:'123' }, {});
assert.strictEqual(result.result, 'Pass');
const mismatchMember = [{ id:'A', name:'Alpha', overage:7, documentOverage:9 }];
result = runGroup('OVERAGE-MISMATCH', mismatchMember, {
  A:[manifest('MO3', 'DOC-OVERAGE-MISMATCH', 'OVERAGE-MISMATCH', mismatchMember)]
}, { A:'123' });
assert.match(result.reason, /超額單價：文件 9、Queue 7/);

// An unrelated Branch-level price mismatch must not contaminate the Share gate.
const isolated = [{ id:'A', name:'Alpha', price:99999, documentPrice:1 }, { id:'B', name:'Beta' }];
const isolatedManifest = manifest('MI', 'DOC-ISOLATED', 'ISOLATED', isolated);
result = runGroup('ISOLATED', isolated, { A:[isolatedManifest], B:[isolatedManifest] }, { A:'123', B:'123' });
assert.strictEqual(result.result, 'Pass');

// The eight production shapes remain fixture-only expectations; names do not
// appear in production logic.
const expectedProductionShapes = {
  '金車':'PASS', '蘇杭':'PASS', '臺虎2':'PASS', 'KOI':'NEEDS_REVIEW',
  '海德威':'PASS', '樂釜':'MANUAL REVIEW', '達邁餐飲店':'PASS', 'JK STUDIO2':'PASS'
};
Object.keys(expectedProductionShapes).forEach((fixtureName, fixtureIndex) => {
  const fixtureShareId = 'FIXTURE-' + fixtureIndex;
  const fixtureMembers = [
    { id:'F' + fixtureIndex + '-A', name:fixtureName + ' A' },
    { id:'F' + fixtureIndex + '-B', name:fixtureName + ' B' }
  ];
  const coveredMembers = fixtureName === 'KOI'
    ? fixtureMembers.concat([{ id:'F' + fixtureIndex + '-EXTRA', name:fixtureName + ' Extra' }])
    : fixtureMembers;
  const fixtureManifest = manifest(
    'FIXTURE-MANIFEST-' + fixtureIndex, 'DOC-' + fixtureShareId, fixtureShareId, coveredMembers
  );
  const fixtureTaxes = {};
  fixtureMembers.forEach((member, memberIndex) => {
    fixtureTaxes[member.id] = fixtureName === '樂釜' ? 'TAX-' + memberIndex : 'SAME-TAX';
  });
  const fixtureResult = runGroup(
    fixtureShareId,
    fixtureMembers,
    fixtureMembers.reduce((out, member) => (out[member.id] = [fixtureManifest], out), {}),
    fixtureTaxes
  );
  assert.strictEqual(fixtureResult.trace.expectedFields.Status, expectedProductionShapes[fixtureName], fixtureName);
});

// Writer updates only the unique current-batch row; historical rows stay byte-for-byte unchanged.
function fakeSheet(initial) {
  const values = initial.map(row => row.slice());
  return {
    getName:() => 'Share Group Review',
    getDataRange:() => ({ getValues:() => values.map(row => row.slice()) }),
    getRange:(row, column) => ({ setValue:value => { values[row - 1][column - 1] = value; } }),
    values
  };
}
const shareHeaders = [
  'Share Plan ID','Member Check','Tax ID Check','Contract Check','Overage Check','Status',
  'Reviewer','Reviewed At','Notes','Automated Check Detail','Review Batch ID'
];
const sheet = fakeSheet([
  shareHeaders,
  ['GROUP','OLD','OLD','OLD','OLD','OLD','','','','OLD DETAIL',''],
  ['GROUP','','','','','','','','','','BATCH']
]);
api.writeShareGroupTraces_(sheet, [{
  sharePlanId:'GROUP', targetRowNumber:3, reviewBatchId:'BATCH',
  expectedFields:{
    'Member Check':'PASS','Tax ID Check':'PASS','Contract Check':'PASS',
    'Overage Check':'PASS','Status':'PASS','Automated Check Detail':'current'
  }
}], 'BATCH');
assert.deepStrictEqual(sheet.values[1], ['GROUP','OLD','OLD','OLD','OLD','OLD','','','','OLD DETAIL','']);
assert.strictEqual(sheet.values[2][5], 'PASS');

const duplicate = fakeSheet([
  shareHeaders,
  ['GROUP','','','','','','','','','','BATCH'],
  ['GROUP','','','','','','','','','','BATCH']
]);
assert.throws(() => api.writeShareGroupTraces_(duplicate, [{
  sharePlanId:'GROUP', targetRowNumber:2, reviewBatchId:'BATCH', expectedFields:{}
}], 'BATCH'), /preflight failed/);
assert.strictEqual(duplicate.values[1][1], '');
assert.strictEqual(duplicate.values[2][1], '');

// Current-batch indexing ignores historical rows and fails closed on missing or
// duplicate current identities. Active Batch blank preserves legacy first-row behavior.
let indexed = api.indexedCurrentBatchReview_(sheet, 'Share Plan ID', ['GROUP'], 'BATCH');
assert.strictEqual(indexed.GROUP.targetRowNumber, 3);
assert.strictEqual(indexed.GROUP.review.Status, 'PASS');
indexed = api.indexedCurrentBatchReview_(duplicate, 'Share Plan ID', ['GROUP'], 'BATCH');
assert.match(indexed.GROUP.identityError, /重複 rows：2, 3/);
indexed = api.indexedCurrentBatchReview_(sheet, 'Share Plan ID', ['MISSING'], 'BATCH');
assert.match(indexed.MISSING.identityError, /缺少 row/);
indexed = api.indexedCurrentBatchReview_(sheet, 'Share Plan ID', ['GROUP'], '');
assert.strictEqual(indexed.GROUP.review.Status, 'OLD');

// Static regression: current Share runtime may not reopen Renewal DB or require
// five manually-entered Pass fields.
assert.doesNotMatch(api.structuredShareGroupAudits_.toString(), /Renewal DB/);
assert.doesNotMatch(api.structuredShareGroupAudits_.toString(), /\['Status'\].*isPass/);

console.log('Deterministic current-batch Share audit regression: all cases passed.');
