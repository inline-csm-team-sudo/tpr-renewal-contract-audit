const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('RenewalQueue.gs', 'utf8') + `
globalThis.__test = {
  headerIndex_, structuredDocumentMatchAudit_, structuredReviewForProtectedGates_,
  contractAudit_, decideAuditStatus_, headerNameMigrationPlan_, missingEvidenceReviewRows_,
  ensureReviewSheetHeadersByName_, writeDocumentMatchTraces_, isExplicitStructuredPlanVeto_,
  indexedEvidenceReviews_, normalizeStructuredDocumentProducts_,
  evidenceReviewHeaders:EVIDENCE_REVIEW_HEADERS
};`;
const context = {
  console,
  Utilities: {
    formatDate: () => '2026-08-25',
    parseDate: value => new Date(value)
  },
  Session: { getScriptTimeZone: () => 'Asia/Taipei' }
};
vm.runInNewContext(source, context);
const api = context.__test;

const headers = [
  'Branch ID', '餐廳名稱', '合約', '產品', '付款週期', '合約組數', '合約贈送組數',
  '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'
];
const qx = api.headerIndex_(headers);

function field(state, value) {
  const out = { state };
  if (arguments.length > 1) out.value = value;
  return out;
}

function queueRow(overrides = {}) {
  const value = Object.assign({
    branch:'B1', restaurant:'測試餐廳', evidence:'https://drive.google.com/file/d/FILE1/view',
    product:'RSV', billing:'annual', sets:3600, bonus:'', price:21600, share:'',
    overageMethod:'per unit', overagePrice:7
  }, overrides);
  return [
    value.branch, value.restaurant, value.evidence, value.product, value.billing, value.sets,
    value.bonus, value.price, value.share, value.overageMethod, value.overagePrice
  ];
}

function product(overrides = {}) {
  return Object.assign({
    source_id:'FILE1',
    product:field('Confirmed', 'RSV'),
    billing_period:field('Confirmed', 'annual'),
    usage_sets:field('Confirmed', 3600),
    bonus_sets:field('NotMentioned'),
    price:field('Confirmed', 21600),
    share_plan_id:field('NotApplicable'),
    overage_method:field('Confirmed', 'per unit'),
    overage_unit_price:field('Confirmed', 7)
  }, overrides);
}

function voiceProduct(overrides = {}) {
  return product(Object.assign({
    product:field('Confirmed', 'Voice'),
    billing_period:field('Confirmed', 'annual'),
    usage_sets:field('NotApplicable'),
    bonus_sets:field('NotApplicable'),
    price:field('Confirmed', 9600),
    share_plan_id:field('NotApplicable'),
    overage_method:field('NotApplicable'),
    overage_unit_price:field('NotApplicable')
  }, overrides));
}

function structuredData(products, overrides = {}) {
  return Object.assign({
    schema_version:1,
    evidence_set:{
      state:'Confirmed',
      complete:true,
      relevant_source_ids:['FILE1']
    },
    products
  }, overrides);
}

function reviewFor(data, overrides = {}) {
  return Object.assign({
    'Structured Review Version':'1',
    'Structured Contract Data':JSON.stringify(data),
    'Full Plan Match':true,
    'Evidence Type':'email',
    'Restaurant Name Match':true,
    'Contract Period Match':true,
    'Customer Explicit Consent':true
  }, overrides);
}

function match(data, rows = [queueRow()], reviewOverrides = {}) {
  const review = reviewFor(data, reviewOverrides);
  return api.structuredDocumentMatchAudit_(review, rows.map(values => ({ values })), qx);
}

function contract(review, documentMatch, rows = [queueRow()]) {
  const queueRows = rows.map(values => ({ values }));
  const protectedReview = api.structuredReviewForProtectedGates_(review, documentMatch);
  return api.contractAudit_(
    protectedReview,
    documentMatch,
    false,
    { result:'Pass', requiresDualSeal:false },
    queueRows,
    qx,
    {},
    ''
  );
}

// Case 1: exact match, including provider-neutral input with no provider name.
let data = structuredData([product()]);
let result = match(data);
assert.strictEqual(result.result, 'MATCH');

// Case 2: Wang Hui Suo regression. Manual TRUE cannot hide bonus 300 vs Queue 0.
data = structuredData([product({ bonus_sets:field('Confirmed', 300) })]);
result = match(data);
assert.strictEqual(result.result, 'MISMATCH');
assert.match(result.detail, /RSV 贈送組數：文件 300、Queue 0/);
assert.strictEqual(contract(reviewFor(data), result).result, 'Fail');

// A reader-supplied verdict is ignored; Apps Script still calculates mismatch.
data.document_match_result = 'MATCH';
result = match(data);
assert.strictEqual(result.result, 'MISMATCH');

// Case 3: Unreadable is not blank or zero.
data = structuredData([product({ bonus_sets:field('Unreadable') })]);
result = match(data);
assert.strictEqual(result.result, 'NEEDS_REVIEW');
assert.match(result.reason, /Unreadable/);

// Case 4: extra document product.
data = structuredData([product(), voiceProduct()]);
result = match(data);
assert.strictEqual(result.result, 'MISMATCH');
assert.match(result.detail, /文件多出 Voice/);

// Case 5: missing document product is mismatch only when the evidence set is confirmed complete.
const queueWithVoice = [
  queueRow(),
  queueRow({ product:'Voice', billing:'annual', sets:'', bonus:'', price:9600,
    overageMethod:'', overagePrice:'' })
];
data = structuredData([product()]);
result = match(data, queueWithVoice);
assert.strictEqual(result.result, 'MISMATCH');
assert.match(result.detail, /Queue 有 Voice/);

data = structuredData([product()], {
  evidence_set:{ state:'Ambiguous', complete:false, relevant_source_ids:['FILE1'] }
});
result = match(data, queueWithVoice);
assert.strictEqual(result.result, 'NEEDS_REVIEW');
assert.match(result.reason, /evidence set.*Ambiguous/i);

// Structured mode cannot silently fall back when JSON is missing or malformed.
let review = reviewFor(structuredData([product()]));
review['Structured Contract Data'] = '';
result = api.structuredDocumentMatchAudit_(review, [{ values:queueRow() }], qx);
assert.strictEqual(result.result, 'NEEDS_REVIEW');
assert.strictEqual(contract(review, result).result, 'Need Review');

review = reviewFor(structuredData([product()]));
review['Structured Contract Data'] = '{broken';
result = api.structuredDocumentMatchAudit_(review, [{ values:queueRow() }], qx);
assert.strictEqual(result.result, 'NEEDS_REVIEW');

// Legacy rows are the only rows allowed to use Full Plan Match fallback.
review = reviewFor(structuredData([product()]));
delete review['Structured Review Version'];
delete review['Structured Contract Data'];
result = api.structuredDocumentMatchAudit_(review, [{ values:queueRow() }], qx);
assert.strictEqual(result.result, 'NO_STRUCTURED_DATA');
assert.strictEqual(contract(review, result).result, 'Pass');

// A nonblank JSON cell enters structured mode even if its review version is missing.
review = reviewFor(structuredData([product()]));
delete review['Structured Review Version'];
result = api.structuredDocumentMatchAudit_(review, [{ values:queueRow() }], qx);
assert.strictEqual(result.result, 'NEEDS_REVIEW');

// Structured mode ignores Full Plan Match and uses only explicit text in Manual Plan Veto.
data = structuredData([product()]);
result = match(data);
review = reviewFor(data, { 'Full Plan Match':false });
assert.strictEqual(contract(review, result).result, 'Pass');
review = reviewFor(data, { 'Manual Plan Veto':false });
assert.strictEqual(contract(review, result).result, 'Pass');
review = reviewFor(data, { 'Manual Plan Veto':'' });
assert.strictEqual(contract(review, result).result, 'Pass');
['Fail', 'Failed', 'FALSE', '不通過', '不一致'].forEach(token => {
  review = reviewFor(data, { 'Manual Plan Veto':token });
  assert.strictEqual(contract(review, result).result, 'Fail', token + ' must veto structured MATCH');
  assert.match(contract(review, result).reason, /Manual Plan Veto/);
});
['No', 'Mismatch', true, 0, null].forEach(value => {
  assert.strictEqual(api.isExplicitStructuredPlanVeto_(value), false,
    JSON.stringify(value) + ' must not be a structured veto');
});

// Legacy mode retains the 402621c Full Plan Match behavior and ignores Manual Plan Veto.
review = reviewFor(data, { 'Full Plan Match':false, 'Manual Plan Veto':'Fail' });
delete review['Structured Review Version'];
delete review['Structured Contract Data'];
result = api.structuredDocumentMatchAudit_(review, [{ values:queueRow() }], qx);
assert.strictEqual(contract(review, result).result, 'Fail');
review['Full Plan Match'] = true;
assert.strictEqual(contract(review, result).result, 'Pass');

// A folder may have multiple relevant files; every product source must belong to that confirmed set.
data = structuredData([product()], {
  evidence_set:{ state:'Confirmed', complete:true, relevant_source_ids:['FILE1', 'EMAIL2'] }
});
assert.strictEqual(match(data).result, 'MATCH');

data = structuredData([product()], {
  evidence_set:{ state:'Confirmed', complete:true, relevant_source_ids:[] }
});
assert.strictEqual(match(data).result, 'NEEDS_REVIEW');

data = structuredData([product({ source_id:'UNKNOWN' })]);
assert.strictEqual(match(data).result, 'NEEDS_REVIEW');

// Duplicate products and document row order are compared as a true multiset.
const duplicateQueue = [
  queueRow(),
  queueRow({ product:'Voice', billing:'annual', sets:'', bonus:'', price:9600,
    overageMethod:'', overagePrice:'' }),
  queueRow({ product:'Voice', billing:'annual', sets:'', bonus:'', price:12000,
    overageMethod:'', overagePrice:'' })
];
data = structuredData([
  voiceProduct({ price:field('Confirmed', 12000) }),
  product(),
  voiceProduct()
]);
assert.strictEqual(match(data, duplicateQueue).result, 'MATCH');

// Existing directional monthly add-on -> annual x12 normalization is preserved.
data = structuredData([
  product(),
  voiceProduct({ billing_period:field('Confirmed', 'monthly'), price:field('Confirmed', 800) })
]);
assert.strictEqual(match(data, queueWithVoice).result, 'MATCH');

// Deposit-Commission uses semantic commission/buy-in fields and exact Queue comparison.
const commissionQueue = [
  queueRow(),
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:2.5,
    price:'', overageMethod:'Credit Card', overagePrice:'' })
];
const commissionProduct = product({
  product:field('Confirmed', 'Deposit-Commission'),
  billing_period:field('NotApplicable'),
  usage_sets:field('NotApplicable'),
  bonus_sets:field('NotApplicable'),
  price:field('NotApplicable'),
  share_plan_id:field('NotApplicable'),
  deposit_type:field('Confirmed', 'Credit Card'),
  commission_rate:field('Confirmed', 2.5),
  buy_in_price:field('Confirmed', 97.5)
});
data = structuredData([product(), commissionProduct]);
assert.strictEqual(match(data, commissionQueue).result, 'MATCH');

// Deposit fixed fees keep the existing monthly -> annual x12 normalization,
// while transaction-based Deposit-Commission rows have no recurring cadence.
const travelQueue = [
  queueRow({ sets:7200, bonus:600, price:42000, overagePrice:5.5 }),
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:'', price:18000,
    overageMethod:'B2C', overagePrice:5 }),
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:5, price:'',
    overageMethod:'Credit Card', overagePrice:'' })
];
const travelDeposit = product({
  product:field('Confirmed', 'Deposit'),
  billing_period:field('Confirmed', 'monthly'),
  usage_sets:field('NotApplicable'),
  bonus_sets:field('NotApplicable'),
  price:field('Confirmed', 1500),
  share_plan_id:field('NotApplicable'),
  deposit_type:field('Confirmed', 'B2C'),
  setup_fee:field('Confirmed', 5)
});
const travelRsv = product({
  usage_sets:field('Confirmed', 7200), bonus_sets:field('Confirmed', 600),
  price:field('Confirmed', 42000), overage_unit_price:field('Confirmed', 5.5)
});
function travelCommission(overrides = {}) {
  return product(Object.assign({
    product:field('Confirmed', 'Deposit-Commission'),
    billing_period:field('NotApplicable'),
    usage_sets:field('NotApplicable'),
    bonus_sets:field('NotApplicable'),
    price:field('NotApplicable'),
    share_plan_id:field('NotApplicable'),
    deposit_type:field('Confirmed', 'Credit Card'),
    buy_in_price:field('Confirmed', 95)
  }, overrides));
}

// Deposit clause extraction regression 1: a Credit Card buy-in clause creates
// Deposit-Commission even when the document never uses that product name.
// The structured fact preserves buy-in 95; Apps Script derives commission 5.
const creditCardBuyIn95 = travelCommission({
  commission_rate:field('NotMentioned'),
  buy_in_price:field('Confirmed', 95)
});
let normalizedClauseProducts = api.normalizeStructuredDocumentProducts_(
  structuredData([creditCardBuyIn95])
);
assert.strictEqual(normalizedClauseProducts.errors.length, 0);
assert.strictEqual(normalizedClauseProducts.lines.length, 1);
assert.strictEqual(normalizedClauseProducts.lines[0].product, 'Deposit-Commission');
assert.strictEqual(normalizedClauseProducts.lines[0].overageMethod, 'credit card');
assert.strictEqual(normalizedClauseProducts.lines[0].bonus, '5');
assert.strictEqual(creditCardBuyIn95.buy_in_price.value, 95);
assert.strictEqual(creditCardBuyIn95.commission_rate.state, 'NotMentioned');
const creditCardCommission5Queue = [
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:5, price:'',
    share:'', overageMethod:'Credit Card', overagePrice:'' })
];
assert.strictEqual(match(structuredData([creditCardBuyIn95]), creditCardCommission5Queue).result, 'MATCH');

// Deposit clause extraction regression 2: one canonical row per payment
// method/rate; Credit Card and Virtual ATM buy-ins must not be merged.
const creditCardBuyIn955 = travelCommission({
  commission_rate:field('NotMentioned'),
  buy_in_price:field('Confirmed', 95.5)
});
const virtualAtmBuyIn985 = travelCommission({
  deposit_type:field('Confirmed', 'Virtual ATM'),
  commission_rate:field('NotMentioned'),
  buy_in_price:field('Confirmed', 98.5)
});
normalizedClauseProducts = api.normalizeStructuredDocumentProducts_(
  structuredData([creditCardBuyIn955, virtualAtmBuyIn985])
);
assert.strictEqual(normalizedClauseProducts.errors.length, 0);
assert.strictEqual(normalizedClauseProducts.lines.length, 2);
assert.strictEqual(
  JSON.stringify(normalizedClauseProducts.lines.map(line => [line.overageMethod, line.bonus])),
  JSON.stringify([['credit card', '4.5'], ['virtual atm', '1.5']])
);
const multiMethodCommissionQueue = [
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:4.5, price:'',
    share:'', overageMethod:'Credit Card', overagePrice:'' }),
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:1.5, price:'',
    share:'', overageMethod:'Virtual ATM', overagePrice:'' })
];
assert.strictEqual(
  match(structuredData([creditCardBuyIn955, virtualAtmBuyIn985]), multiMethodCommissionQueue).result,
  'MATCH'
);

// Deposit clause extraction regression 3: a B2B transaction-service rate is
// a field on the B2B Deposit row. It must never create Deposit-Commission.
const b2bDepositServiceFee5 = product({
  product:field('Confirmed', 'Deposit'),
  billing_period:field('Confirmed', 'annual'),
  usage_sets:field('NotApplicable'),
  bonus_sets:field('NotApplicable'),
  price:field('Confirmed', 0),
  share_plan_id:field('NotApplicable'),
  deposit_type:field('Confirmed', 'B2B'),
  setup_fee:field('Confirmed', 0),
  commission_rate:field('Confirmed', 5),
  buy_in_price:field('NotMentioned')
});
normalizedClauseProducts = api.normalizeStructuredDocumentProducts_(
  structuredData([b2bDepositServiceFee5])
);
assert.strictEqual(normalizedClauseProducts.errors.length, 0);
assert.strictEqual(normalizedClauseProducts.lines.length, 1);
assert.strictEqual(normalizedClauseProducts.lines[0].product, 'Deposit');
assert.strictEqual(normalizedClauseProducts.lines[0].overageMethod, 'b2b');
assert.strictEqual(normalizedClauseProducts.lines[0].bonus, '5');
assert.strictEqual(
  normalizedClauseProducts.lines.some(line => line.product === 'Deposit-Commission'),
  false
);
assert.strictEqual(b2bDepositServiceFee5.commission_rate.value, 5);
assert.strictEqual(b2bDepositServiceFee5.buy_in_price.state, 'NotMentioned');
const b2bDepositServiceFee5Queue = [
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:5, price:0,
    share:'', overageMethod:'B2B', overagePrice:0 })
];
assert.strictEqual(
  match(structuredData([b2bDepositServiceFee5]), b2bDepositServiceFee5Queue).result,
  'MATCH'
);

// A missing or ambiguous payment method never inherits Queue's Credit Card.
const unknownMethodCommission5 = travelCommission({
  deposit_type:field('NotMentioned'), commission_rate:field('Confirmed', 5),
  buy_in_price:field('NotMentioned')
});
assert.strictEqual(
  match(structuredData([unknownMethodCommission5]), creditCardCommission5Queue).result,
  'MISMATCH'
);
const ambiguousMethodCommission5 = travelCommission({
  deposit_type:field('Ambiguous'), commission_rate:field('Confirmed', 5),
  buy_in_price:field('NotMentioned')
});
assert.strictEqual(
  match(structuredData([ambiguousMethodCommission5]), creditCardCommission5Queue).result,
  'NEEDS_REVIEW'
);

data = structuredData([travelRsv, travelDeposit, travelCommission()]);
result = match(data, travelQueue);
assert.strictEqual(result.result, 'MATCH');

// Fixed-fee Deposit monthly -> annual normalization requires an explicit
// Confirmed document price. Explicit zero is a real price, while missing or
// unreadable states must never be coerced to zero.
const zeroDepositQueue = [
  queueRow(),
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:'', price:0,
    overageMethod:'B2C', overagePrice:5 })
];
function monthlyDepositWithPrice(priceField) {
  return product({
    product:field('Confirmed', 'Deposit'),
    billing_period:field('Confirmed', 'monthly'),
    usage_sets:field('NotApplicable'),
    bonus_sets:field('NotApplicable'),
    price:priceField,
    share_plan_id:field('NotApplicable'),
    deposit_type:field('Confirmed', 'B2C'),
    setup_fee:field('Confirmed', 5)
  });
}

data = structuredData([travelRsv, monthlyDepositWithPrice(field('Confirmed', 1500))]);
assert.strictEqual(match(data, [travelQueue[0], travelQueue[1]]).result, 'MATCH');

data = structuredData([product(), monthlyDepositWithPrice(field('Confirmed', 0))]);
assert.strictEqual(match(data, zeroDepositQueue).result, 'MATCH');

data = structuredData([product(), monthlyDepositWithPrice(field('NotMentioned'))]);
assert.notStrictEqual(match(data, zeroDepositQueue).result, 'MATCH');

data = structuredData([product(), monthlyDepositWithPrice(field('Unreadable'))]);
assert.strictEqual(match(data, zeroDepositQueue).result, 'NEEDS_REVIEW');

data = structuredData([product(), monthlyDepositWithPrice(field('Ambiguous'))]);
assert.strictEqual(match(data, zeroDepositQueue).result, 'NEEDS_REVIEW');

data = structuredData([
  travelRsv, travelDeposit, travelCommission({ buy_in_price:field('Confirmed', 94) })
]);
assert.strictEqual(match(data, travelQueue).result, 'MISMATCH');

data = structuredData([
  travelRsv, travelDeposit, travelCommission({ deposit_type:field('Confirmed', 'Virtual ATM') })
]);
assert.strictEqual(match(data, travelQueue).result, 'MISMATCH');

data = structuredData([travelRsv, travelDeposit]);
assert.strictEqual(match(data, travelQueue).result, 'MISMATCH');

data = structuredData([travelRsv, travelDeposit, travelCommission(), travelCommission()]);
assert.strictEqual(match(data, travelQueue).result, 'MISMATCH');

// Every multi-rate row may match the document while the existing protected
// Deposit-Commission policy still keeps the Branch in Need Review.
const multiRateQueue = [
  queueRow({ sets:1200, price:12000, overagePrice:10 }),
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:'', price:0,
    overageMethod:'B2C', overagePrice:5 }),
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:4.5, price:'',
    overageMethod:'Credit Card', overagePrice:'' }),
  queueRow({ product:'Deposit-Commission', billing:'annual', sets:'', bonus:1.5, price:'',
    overageMethod:'Virtual ATM', overagePrice:'' })
];
const zeroDeposit = product({
  product:field('Confirmed', 'Deposit'), billing_period:field('Confirmed', 'annual'),
  usage_sets:field('NotApplicable'), bonus_sets:field('NotApplicable'),
  price:field('Confirmed', 0), share_plan_id:field('NotApplicable'),
  deposit_type:field('Confirmed', 'B2C'), setup_fee:field('Confirmed', 5)
});
const creditCardCommission = travelCommission({ buy_in_price:field('Confirmed', 95.5) });
const virtualAtmCommission = travelCommission({
  deposit_type:field('Confirmed', 'Virtual ATM'), buy_in_price:field('Confirmed', 98.5)
});
data = structuredData([
  product({ usage_sets:field('Confirmed', 1200), price:field('Confirmed', 12000),
    overage_unit_price:field('Confirmed', 10) }),
  zeroDeposit, creditCardCommission, virtualAtmCommission
]);
result = match(data, multiRateQueue);
assert.strictEqual(result.result, 'MATCH');
assert.strictEqual(contract(reviewFor(data), result, multiRateQueue).result, 'Need Review');

// Protected downstream policy cases: structured MATCH does not bypass later gates.
const pass = { result:'Pass', reason:'' };
const base = {
  catalog:pass,
  source:pass,
  longTerm:pass,
  contract:pass,
  bonus:pass,
  plan:pass,
  special:{ status:'Not Required', reason:'' },
  share:{ result:'Not Applicable', reason:'' }
};

let decision = api.decideAuditStatus_(false, base.catalog, base.source, base.longTerm,
  base.contract, base.bonus, base.plan, { status:'Pending', reason:'特殊申請未核准' }, base.share);
assert.strictEqual(decision.status, 'Need Special Approval');

decision = api.decideAuditStatus_(false, base.catalog, base.source, base.longTerm,
  base.contract, base.bonus, base.plan, base.special, { result:'Fail', reason:'Share 不一致' });
assert.strictEqual(decision.status, 'Need Check');

decision = api.decideAuditStatus_(false, base.catalog, { result:'Fail', reason:'歷史 TPR 日期異常' },
  base.longTerm, base.contract, base.bonus, base.plan, base.special, base.share);
assert.strictEqual(decision.status, 'Need Check');

decision = api.decideAuditStatus_(false, base.catalog, base.source, base.longTerm,
  { result:'Need Dual Seal', reason:'需雙方用印' }, base.bonus, base.plan, base.special, base.share);
assert.strictEqual(decision.status, 'Need Dual Seal');

// Live old header layout: reuse all 35 columns and append only the four missing structured fields.
const liveOldHeaders = [
  'Branch ID', 'Evidence URL', 'Evidence Type', 'Restaurant Name Match',
  'Contract Period Match', 'Full Plan Match', 'Customer Explicit Consent',
  'Agreement Confirmation Text', 'Confirmation Sender', 'Inline Seal',
  'Customer Seal', 'Reviewer', 'Reviewed At', 'Status', 'Notes',
  'Annual Payment Amount (NTD)', 'Billing Cycle Match',
  'Contract Start Date', 'Contract End Date',
  'Deposit Commission Rate (%)', 'Deposit Buy-in Price (%)',
  'Document Restaurant Name',
  'Document Legal Entity Name', 'Restaurant Name Match Result',
  'Restaurant Alias Evidence', 'Reviewed Evidence File ID',
  'Reviewed Evidence Modified At', 'Annual Payment Evidence Quote',
  'Annual Payment Evidence Location', 'Review Batch ID', 'Queue Plan Signature',
  'Evidence Set Complete', 'Manual Plan Veto', 'Calculated Full Plan Match',
  'Calculated Plan Difference'
];
const migration = api.headerNameMigrationPlan_(liveOldHeaders, api.evidenceReviewHeaders,
  'Contract Evidence Review');
assert.deepStrictEqual(Array.from(migration.missing), [
  'Structured Review Version', 'Structured Contract Data',
  'Document Match Result', 'Document Match Detail'
]);
assert.strictEqual(migration.positions['Full Plan Match'], 5);
assert.strictEqual(migration.positions['Manual Plan Veto'], 32);
assert.strictEqual(liveOldHeaders[17], 'Contract Start Date');
assert.strictEqual(liveOldHeaders[18], 'Contract End Date');
assert.strictEqual(liveOldHeaders[19], 'Deposit Commission Rate (%)');
assert.strictEqual(liveOldHeaders[20], 'Deposit Buy-in Price (%)');
assert.strictEqual(migration.headers[17], 'Contract Start Date');
assert.strictEqual(migration.headers[18], 'Contract End Date');
assert.strictEqual(migration.headers[19], 'Deposit Commission Rate (%)');
assert.strictEqual(migration.headers[20], 'Deposit Buy-in Price (%)');
assert.strictEqual(migration.positions['Structured Review Version'], 35);
assert.strictEqual(migration.positions['Structured Contract Data'], 36);
assert.strictEqual(migration.positions['Document Match Result'], 37);
assert.strictEqual(migration.positions['Document Match Detail'], 38);
assert.strictEqual(migration.headers[29], 'Review Batch ID');
assert.strictEqual(migration.headers[34], 'Calculated Plan Difference');
assert.strictEqual(migration.headers.length, 39);

// New rows use the migrated Sheet width and named positions; every unrelated old column stays blank.
const existingRow = migration.headers.map(() => '');
existingRow[migration.positions['Branch ID']] = 'EXISTING';
const newRows = api.missingEvidenceReviewRows_(migration.headers, [existingRow], {
  EXISTING:'https://drive.google.com/file/d/OLD/view',
  NEW_BRANCH:'https://drive.google.com/folders/NEW'
}, 'Contract Evidence Review');
assert.strictEqual(newRows.length, 1);
assert.strictEqual(newRows[0].length, 39);
assert.strictEqual(newRows[0][migration.positions['Branch ID']], 'NEW_BRANCH');
assert.strictEqual(newRows[0][migration.positions['Evidence URL']], 'https://drive.google.com/folders/NEW');
assert.strictEqual(newRows[0][migration.positions['Structured Review Version']], '1');
assert.deepStrictEqual(Array.from(newRows[0].filter(value => value !== '')), [
  'NEW_BRANCH', 'https://drive.google.com/folders/NEW', '1'
]);

// Required duplicate or case-ambiguous headers fail before a migration/write plan can be used.
assert.throws(() => api.headerNameMigrationPlan_(
  liveOldHeaders.concat('Full Plan Match'), api.evidenceReviewHeaders, 'Contract Evidence Review'
), /duplicated/);
assert.throws(() => api.headerNameMigrationPlan_(
  liveOldHeaders.concat('Manual Plan Veto'), api.evidenceReviewHeaders, 'Contract Evidence Review'
), /duplicated/);
const caseAmbiguousHeaders = liveOldHeaders.map(header =>
  header === 'Full Plan Match' ? 'full plan match' : header
);
assert.throws(() => api.headerNameMigrationPlan_(
  caseAmbiguousHeaders, api.evidenceReviewHeaders, 'Contract Evidence Review'
), /ambiguous/);

function migrationSheet(headers) {
  const writes = [];
  return {
    writes,
    getName:() => 'Contract Evidence Review',
    getLastColumn:() => headers.length,
    getMaxColumns:() => 100,
    getRange:(row, column, rowCount, columnCount) => ({
      getValues:() => [headers.slice(column - 1, column - 1 + columnCount)],
      setValues:values => writes.push({ type:'setValues', row, column, rowCount, columnCount, values })
    }),
    insertColumnsAfter:(column, count) => writes.push({ type:'insertColumnsAfter', column, count }),
    setFrozenRows:count => writes.push({ type:'setFrozenRows', count })
  };
}

// Existing-sheet duplicate preflight performs zero writes.
let fakeSheet = migrationSheet(liveOldHeaders.concat('Manual Plan Veto'));
let fakeSpreadsheet = { getSheetByName:() => fakeSheet };
assert.throws(() => api.ensureReviewSheetHeadersByName_(
  fakeSpreadsheet, 'Contract Evidence Review', api.evidenceReviewHeaders
), /duplicated/);
assert.strictEqual(fakeSheet.writes.length, 0);

// Successful migration performs one append-only header write at column 36.
fakeSheet = migrationSheet(liveOldHeaders);
fakeSpreadsheet = { getSheetByName:() => fakeSheet };
api.ensureReviewSheetHeadersByName_(fakeSpreadsheet, 'Contract Evidence Review', api.evidenceReviewHeaders);
const headerWrite = fakeSheet.writes.find(write => write.type === 'setValues');
assert.strictEqual(headerWrite.column, 36);
assert.deepStrictEqual(Array.from(headerWrite.values[0]), [
  'Structured Review Version', 'Structured Contract Data',
  'Document Match Result', 'Document Match Detail'
]);

// Evidence row identity and writer targeting are row-specific, not Branch-only.
const traceHeaders = [
  'Old Extra', 'Document Match Detail', 'Structured Contract Data', 'Branch ID',
  'Document Match Result', 'Structured Review Version', 'Full Plan Match', 'Review Batch ID'
];
function evidenceRow(branchId, version, json, result = '', detail = '', fullPlanMatch = false,
  reviewBatchId = '') {
  return ['keep', detail, json, branchId, result, version, fullPlanMatch, reviewBatchId];
}
function evidenceSheet(rows) {
  const values = [traceHeaders].concat(rows.map(row => row.slice()));
  const writes = [];
  return {
    values,
    writes,
    getName:() => 'Contract Evidence Review',
    getDataRange:() => ({ getValues:() => values.map(row => row.slice()) }),
    getRange:(row, column, rowCount, columnCount) => ({
      setValues:newValues => {
        writes.push({ row, column, rowCount, columnCount, values:newValues });
        newValues.forEach((newRow, rowOffset) => newRow.forEach((value, columnOffset) => {
          values[row - 1 + rowOffset][column - 1 + columnOffset] = value;
        }));
      }
    })
  };
}
function traceFor(entry, result = 'MATCH', detail = 'calculated detail') {
  return [{
    branchId:entry.review['Branch ID'],
    targetRowNumber:entry.targetRowNumber,
    reviewBatchId:entry.reviewBatchId,
    expectedStructuredReviewVersion:entry.review['Structured Review Version'],
    expectedStructuredContractData:entry.review['Structured Contract Data'],
    result,
    detail
  }];
}
function writtenRows(sheet) {
  return Array.from(new Set(sheet.writes.map(write => write.row))).sort((a, b) => a - b);
}

// Structured row + historical row: only the structured row is selected and written.
let traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}'),
  evidenceRow('B1', '', '')
]);
let evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
assert.strictEqual(evidenceIndex.B1.rowNumber, 2);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, 2);
api.writeDocumentMatchTraces_(traceSheet, traceFor(evidenceIndex.B1));
assert.deepStrictEqual(writtenRows(traceSheet), [2]);
assert.strictEqual(traceSheet.values[2][4], '');
assert.strictEqual(traceSheet.values[2][1], '');

// Historical row before structured row: the unique structured row still wins.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', ''),
  evidenceRow('B1', '1', '{"schema_version":1}')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, 3);
api.writeDocumentMatchTraces_(traceSheet, traceFor(evidenceIndex.B1));
assert.deepStrictEqual(writtenRows(traceSheet), [3]);
assert.strictEqual(traceSheet.values[1][4], '');

// Historical Full Plan Match must not hide an incomplete structured-intent row.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', '', '', '', true),
  evidenceRow('B1', '1', '')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, null);
let incompleteResult = api.structuredDocumentMatchAudit_(evidenceIndex.B1.review, [
  { values:queueRow() }
], qx);
assert.strictEqual(incompleteResult.result, 'NEEDS_REVIEW');
assert.match(incompleteResult.reason, /Structured Contract Data.*缺失/);

// JSON without Version is also structured intent and cannot fall back to legacy.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', ''),
  evidenceRow('B1', '', '{"schema_version":1}')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, null);
incompleteResult = api.structuredDocumentMatchAudit_(evidenceIndex.B1.review, [
  { values:queueRow() }
], qx);
assert.strictEqual(incompleteResult.result, 'NEEDS_REVIEW');
assert.match(incompleteResult.reason, /Version.*必須為 1/);

// Two active structured rows are ambiguous and fail before any write.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}'),
  evidenceRow('B1', '1', '{"schema_version":1}')
]);
assert.throws(() => api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']), /B1.*rows 2, 3/);
assert.strictEqual(traceSheet.writes.length, 0);

// One structured row plus multiple historical rows writes only the structured row.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', ''),
  evidenceRow('B1', '1', '{"schema_version":1}'),
  evidenceRow('B1', '', ''),
  evidenceRow('B1', '', '')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
api.writeDocumentMatchTraces_(traceSheet, traceFor(evidenceIndex.B1));
assert.deepStrictEqual(writtenRows(traceSheet), [3]);
[2, 4, 5].forEach(rowNumber => {
  assert.strictEqual(traceSheet.values[rowNumber - 1][4], '');
  assert.strictEqual(traceSheet.values[rowNumber - 1][1], '');
});

// Atomic preflight: stale Branch ID, Version, or JSON produces zero writes.
['branch', 'version', 'json'].forEach(change => {
  traceSheet = evidenceSheet([evidenceRow('B1', '1', '{"schema_version":1}')]);
  evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
  const traces = traceFor(evidenceIndex.B1);
  if (change === 'branch') traceSheet.values[1][3] = 'CHANGED';
  if (change === 'version') traceSheet.values[1][5] = '';
  if (change === 'json') traceSheet.values[1][2] = '';
  assert.throws(() => api.writeDocumentMatchTraces_(traceSheet, traces), /preflight/i);
  assert.strictEqual(traceSheet.writes.length, 0, change + ' failure must write nothing');
});

// A second active structured row inserted after indexing is caught by the latest-snapshot preflight.
traceSheet = evidenceSheet([evidenceRow('B1', '1', '{"schema_version":1}')]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
const staleUniqueTrace = traceFor(evidenceIndex.B1);
traceSheet.values.push(evidenceRow('B1', '1', '{"schema_version":1}'));
assert.throws(
  () => api.writeDocumentMatchTraces_(traceSheet, staleUniqueTrace),
  /最新 Sheet snapshot.*rows.*2, 3/
);
assert.strictEqual(traceSheet.writes.length, 0);

// Duplicate target rows or duplicate Branch targets fail as one atomic preflight.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}'),
  evidenceRow('B2', '1', '{"schema_version":1}')
]);
assert.throws(() => api.writeDocumentMatchTraces_(traceSheet, [
  { branchId:'B1', targetRowNumber:2, result:'MATCH', detail:'' },
  { branchId:'B2', targetRowNumber:2, result:'MATCH', detail:'' }
]), /target row 2/);
assert.strictEqual(traceSheet.writes.length, 0);
assert.throws(() => api.writeDocumentMatchTraces_(traceSheet, [
  { branchId:'B1', targetRowNumber:2, result:'MATCH', detail:'' },
  { branchId:'B1', targetRowNumber:3, result:'MATCH', detail:'' }
]), /Branch B1.*writer targets/);
assert.strictEqual(traceSheet.writes.length, 0);

// Legacy-only Branch keeps first-row review behavior and has no structured writer target.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', ''),
  evidenceRow('B1', '', '')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1']);
assert.strictEqual(evidenceIndex.B1.rowNumber, 2);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, null);
api.writeDocumentMatchTraces_(traceSheet, []);
assert.strictEqual(traceSheet.writes.length, 0);

// Active Batch identity scopes structured selection to the current review batch only.
const activeBatchId = 'REVIEW-CURRENT';
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', true, ''),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, 'REVIEW-OLD')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, 3);
assert.strictEqual(evidenceIndex.B1.reviewBatchId, activeBatchId);
assert.strictEqual(evidenceIndex.B1.currentBatchMode, true);
api.writeDocumentMatchTraces_(traceSheet, traceFor(evidenceIndex.B1), activeBatchId);
assert.deepStrictEqual(writtenRows(traceSheet), [3]);
[2, 4].forEach(rowNumber => {
  assert.strictEqual(traceSheet.values[rowNumber - 1][4], '');
  assert.strictEqual(traceSheet.values[rowNumber - 1][1], '');
});

// A current-batch row with either Version or JSON missing remains structured intent.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', '', '', '', true, ''),
  evidenceRow('B1', '1', '', '', '', false, activeBatchId)
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, null);
assert.strictEqual(evidenceIndex.B1.structuredIntent, true);
incompleteResult = api.structuredDocumentMatchAudit_(evidenceIndex.B1.review, [
  { values:queueRow() }
], qx);
assert.strictEqual(incompleteResult.result, 'NEEDS_REVIEW');
assert.match(incompleteResult.reason, /Structured Contract Data.*缺失/);

traceSheet = evidenceSheet([
  evidenceRow('B1', '', '', '', '', true, ''),
  evidenceRow('B1', '', '{"schema_version":1}', '', '', false, activeBatchId)
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, null);
incompleteResult = api.structuredDocumentMatchAudit_(evidenceIndex.B1.review, [
  { values:queueRow() }
], qx);
assert.strictEqual(incompleteResult.result, 'NEEDS_REVIEW');
assert.match(incompleteResult.reason, /Version.*必須為 1/);

// Current-batch duplicate or missing Branch identity fails closed before any write.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId),
  evidenceRow('B1', '', '', '', '', false, activeBatchId),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, 'REVIEW-OLD')
]);
assert.throws(
  () => api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId),
  /REVIEW-CURRENT.*B1 rows 2, 3/
);
assert.strictEqual(traceSheet.writes.length, 0);

traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId),
  evidenceRow('B2', '1', '{"schema_version":1}', '', '', false, 'REVIEW-OLD')
]);
assert.throws(
  () => api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1', 'B2'], activeBatchId),
  /REVIEW-CURRENT.*缺少 Branch rows.*B2/
);
assert.strictEqual(traceSheet.writes.length, 0);

// Active Batch blank keeps the exact legacy selection behavior.
traceSheet = evidenceSheet([
  evidenceRow('B1', '', '', '', '', true, 'REVIEW-OLD'),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, 'REVIEW-CURRENT')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], '');
assert.strictEqual(evidenceIndex.B1.rowNumber, 3);
assert.strictEqual(evidenceIndex.B1.targetRowNumber, 3);
assert.strictEqual(evidenceIndex.B1.currentBatchMode, false);

// Writer latest-snapshot preflight fails atomically if current-batch identity changes.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, 'REVIEW-OLD')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
const activeBatchTrace = traceFor(evidenceIndex.B1);
traceSheet.values[1][7] = 'REVIEW-CHANGED';
assert.throws(
  () => api.writeDocumentMatchTraces_(traceSheet, activeBatchTrace, activeBatchId),
  /preflight.*Review Batch ID|Review Batch ID.*preflight/i
);
assert.strictEqual(traceSheet.writes.length, 0);

// A second current-batch row added after indexing conflicts; another-batch row never does.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId),
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, 'REVIEW-OLD')
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
const currentBatchTrace = traceFor(evidenceIndex.B1);
traceSheet.values.push(evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId));
assert.throws(
  () => api.writeDocumentMatchTraces_(traceSheet, currentBatchTrace, activeBatchId),
  /最新 Sheet snapshot.*REVIEW-CURRENT.*rows.*2, 4/
);
assert.strictEqual(traceSheet.writes.length, 0);

// A nonblank JSON replacement after indexing is also rejected as stale state.
traceSheet = evidenceSheet([
  evidenceRow('B1', '1', '{"schema_version":1}', '', '', false, activeBatchId)
]);
evidenceIndex = api.indexedEvidenceReviews_(traceSheet, 'Branch ID', ['B1'], activeBatchId);
const staleJsonTrace = traceFor(evidenceIndex.B1);
traceSheet.values[1][2] = '{"schema_version":1,"changed":true}';
assert.throws(
  () => api.writeDocumentMatchTraces_(traceSheet, staleJsonTrace, activeBatchId),
  /Structured Contract Data.*indexing snapshot/
);
assert.strictEqual(traceSheet.writes.length, 0);

console.log('Structured document comparison regression: all cases passed.');
