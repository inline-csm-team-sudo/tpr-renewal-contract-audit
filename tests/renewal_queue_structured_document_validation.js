const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('RenewalQueue.gs', 'utf8') + `
globalThis.__test = {
  headerIndex_, structuredDocumentMatchAudit_, structuredReviewForProtectedGates_,
  structuredContractEvidencePopulation_, structuredAnnualPaymentPopulation_,
  contractAudit_, decideAuditStatus_, headerNameMigrationPlan_, missingEvidenceReviewRows_,
  ensureReviewSheetHeadersByName_, writeDocumentMatchTraces_, isExplicitStructuredPlanVeto_,
  indexedEvidenceReviews_, indexedPlanClassificationReviews_,
  writePlanClassificationTraces_, normalizeStructuredDocumentProducts_, billingCycleAudit_,
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

// Overage classification is document-only. Unsupported Confirmed text must
// stop before commercial comparison, even when Queue contains the same text.
['per unit', 'tier', 'skm tier'].forEach(method => {
  const facts = structuredData([product({ overage_method:field('Confirmed', method) })]);
  assert.strictEqual(match(facts, [queueRow({ overageMethod:method })]).result, 'MATCH', method);
  const normalizedCase = structuredData([product({
    overage_method:field('Confirmed', ' ' + method.toUpperCase() + ' ')
  })]);
  assert.strictEqual(match(normalizedCase, [queueRow({ overageMethod:method })]).result, 'MATCH');
  assert.strictEqual(match(facts, [queueRow({ overageMethod:method, overagePrice:8 })]).result,
    'MISMATCH', 'supported method must retain exact overage-price comparison');
});
['stairstep', 'unknown-method', 'multi-level custom', ''].forEach(method => {
  const facts = structuredData([product({ overage_method:field('Confirmed', method) })]);
  const before = JSON.stringify(facts);
  ['tier', method].forEach(queueMethod => {
    const unresolved = match(facts, [queueRow({ overageMethod:queueMethod })]);
    assert.strictEqual(unresolved.result, 'NEEDS_REVIEW', method);
    assert.match(unresolved.reason, /overage_method/);
    assert.strictEqual(JSON.stringify(facts), before, 'Queue must never rewrite extraction facts');
    assert.strictEqual(contract(reviewFor(facts), unresolved).result, 'Need Review');
  });
});
const multiTierFacts = structuredData([product({
  overage_method:{ state:'Ambiguous', source_id:'FILE1', locator:'page 3 / pricing table' },
  overage_description:'Different usage ranges have different base charges and incremental rates'
})]);
assert.strictEqual(match(multiTierFacts, [queueRow({ overageMethod:'tier' })]).result, 'NEEDS_REVIEW');
assert.strictEqual(match(structuredData([product()]), [queueRow({ overageMethod:'tier' })]).result,
  'MISMATCH', 'different supported methods remain a commercial mismatch');
['NotMentioned', 'NotApplicable'].forEach(state => {
  assert.strictEqual(match(structuredData([product({ overage_method:field(state) })]),
    [queueRow({ overageMethod:'' })]).result, 'MATCH', 'existing absent/non-applicable handling');
});

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

// Contract-evidence extraction regressions are generic document fixtures;
// production Branch IDs and Queue expected values never participate.
function evidenceData(contractEvidence, sourceIds = ['FILE1']) {
  return structuredData([product()], {
    evidence_set:{ state:'Confirmed', complete:true, relevant_source_ids:sourceIds },
    contract_evidence:contractEvidence
  });
}

// 14 known dual-seal shapes: page 2, last page, and a relevant attachment's
// last page all require visual confirmation before either seal becomes true.
const dualSealLocations = [
  'contract.pdf page 2 signature area', 'contract.pdf final page signature area',
  'amendment.pdf page 2 seal block', 'relevant attachment final page',
  'signed renewal.pdf page 3', 'scanned agreement final image',
  'folder/renewal-contract.pdf final page', 'folder/addendum.pdf page 2',
  'contract-part-2.pdf page 1', 'signed quotation final page',
  'renewal letter page 2', 'image attachment 2 of 2',
  'combined PDF final page', 'signature appendix final page'
];
dualSealLocations.forEach(locator => {
  const population = api.structuredContractEvidencePopulation_(evidenceData({
    inline_seal:{ state:'Confirmed', value:true, source_id:'FILE1', locator, verification:'visual' },
    customer_seal:{ state:'Confirmed', value:true, source_id:'FILE1', locator, verification:'visual' }
  }));
  assert.strictEqual(population.fields['Inline Seal'], true, locator);
  assert.strictEqual(population.fields['Customer Seal'], true, locator);
  assert.strictEqual(population.fields['Evidence Type'], 'Contract', locator);
  assert.strictEqual(population.errors.length, 0, locator);
});

// Seal-owner regression fixtures encode visual observations, not Queue values.
// The document reader owns attribution; this checks the provider-neutral facts
// retain separate party outcomes and agreement-scoped provenance on population.
const sealAttributionRules = fs.readFileSync(
  '.agents/skills/tpr-renewal-contract-audit/references/structured-extraction.md', 'utf8');
assert.match(sealAttributionRules, /Seal attribution \/ agreement isolation/);
assert.match(sealAttributionRules, /印章本身可辨識的文字/);
assert.match(sealAttributionRules, /不可跨 section 借用/);
assert.match(sealAttributionRules, /不得只憑左／右位置/);
const sealAttributionFixtures = [
  { name:'customer seal only beside printed inline name', inline:false, customer:true,
    observation:'續約用印區的客戶公司章可讀；旁邊只有印出的 inline 公司名稱，沒有 inline 印章' },
  { name:'inline seal only', inline:true, customer:false,
    observation:'續約用印區的 inline 公司章可讀；客戶簽署欄空白' },
  { name:'both attributable seals', inline:true, customer:true,
    observation:'續約用印區兩枚章文字分別對應 inline 與客戶簽署欄' },
  { name:'visible seal with ambiguous owner', inline:null, customer:null,
    observation:'續約用印區有章，但章文字及簽署欄不足以辨識所有人' },
  { name:'transfer agreement seal cannot fill renewal agreement', inline:false, customer:true,
    observation:'續約用印區只有客戶章；另一份移轉協議的 inline 章不屬於本續約 section' },
  { name:'reversed left-right layout', inline:true, customer:true,
    observation:'inline 章位於左側、客戶章位於右側，章文字與各自簽署欄可辨' }
];
sealAttributionFixtures.forEach(fixture => {
  const sealFact = (value, party) => value === null
    ? { state:'Ambiguous', source_id:'RENEWAL_FILE', page:2,
        locator:'renewal agreement / signature block', verification:'visual',
        visual_description:fixture.observation }
    : { state:'Confirmed', value, source_id:'RENEWAL_FILE', page:2,
        locator:'renewal agreement / signature block', verification:'visual',
        visual_description:`${party}: ${fixture.observation}` };
  const facts = {
    inline_seal:sealFact(fixture.inline, 'inline'),
    customer_seal:sealFact(fixture.customer, 'customer')
  };
  for (const party of ['inline_seal', 'customer_seal']) {
    assert.strictEqual(facts[party].source_id, 'RENEWAL_FILE', fixture.name);
    assert.match(facts[party].locator, /renewal agreement/, fixture.name);
    assert.ok(facts[party].visual_description, fixture.name);
  }
  const result = api.structuredContractEvidencePopulation_(
    evidenceData(facts, ['RENEWAL_FILE']));
  assert.strictEqual(result.fields['Inline Seal'],
    fixture.inline === null ? undefined : fixture.inline, fixture.name);
  assert.strictEqual(result.fields['Customer Seal'],
    fixture.customer === null ? undefined : fixture.customer, fixture.name);
  assert.strictEqual(result.errors.length, 0, fixture.name);
});

// OCR blank or a text-only inference never confirms a visual seal.
['NotMentioned', 'Unreadable', 'Ambiguous'].forEach(state => {
  const population = api.structuredContractEvidencePopulation_(evidenceData({
    inline_seal:{ state, source_id:'FILE1', locator:'final page', verification:'visual' },
    customer_seal:{ state, source_id:'FILE1', locator:'final page', verification:'visual' }
  }));
  assert.strictEqual(population.fields['Inline Seal'], undefined);
  assert.strictEqual(population.fields['Customer Seal'], undefined);
});
let population = api.structuredContractEvidencePopulation_(evidenceData({
  inline_seal:{ state:'Confirmed', value:true, source_id:'FILE1', locator:'OCR text', verification:'text' }
}));
assert.strictEqual(population.fields['Inline Seal'], undefined);
assert.match(population.errors.join('；'), /visual verification/);

// 14 explicit consent/agreement-confirmation forms populate only when quote,
// locator, source identity, and semantic kind are all explicit.
const consentFixtures = Array.from({ length:14 }, (_, index) => index);
consentFixtures.forEach(index => {
  const agreement = index % 3 === 0;
  const contractEvidence = {
    consent_evidence:{
      state:'Confirmed', value:true, source_id:'FILE1',
      locator:'email thread message ' + (index + 1),
      quote:agreement
        ? '貴我雙方已就續約方案達成合意，特此以本信件進行書面確認。'
        : '同意本次續約方案。',
      kind:agreement ? 'agreement_confirmation' : 'explicit_email_consent'
    }
  };
  if (agreement) contractEvidence.consent_evidence.sender = 'inline-csm-team@inline.tw';
  const consentPopulation = api.structuredContractEvidencePopulation_(evidenceData(contractEvidence));
  if (agreement) {
    assert.strictEqual(consentPopulation.fields['Agreement Confirmation Text'], true);
    assert.strictEqual(consentPopulation.fields['Confirmation Sender'], 'inline-csm-team@inline.tw');
  } else {
    assert.strictEqual(consentPopulation.fields['Customer Explicit Consent'], true);
  }
  assert.strictEqual(consentPopulation.fields['Evidence Type'], 'Email');
  assert.strictEqual(consentPopulation.errors.length, 0);
});

// Vague conversation or incomplete provenance stays unpopulated.
population = api.structuredContractEvidencePopulation_(evidenceData({
  consent_evidence:{ state:'Ambiguous', source_id:'FILE1', locator:'email thread', quote:'看起來可以' }
}));
assert.strictEqual(population.fields['Customer Explicit Consent'], undefined);
population = api.structuredContractEvidencePopulation_(evidenceData({
  consent_evidence:{ state:'Confirmed', value:true, source_id:'FILE1', locator:'email thread',
    quote:'收到', kind:'ambiguous_reply' }
}));
assert.strictEqual(population.fields['Customer Explicit Consent'], undefined);

// A reliably readable scanned period is populated after field-local visual
// fallback. Invalid or uncertain dates remain fail closed.
population = api.structuredContractEvidencePopulation_(evidenceData({
  contract_start_date:{ state:'Confirmed', value:'2026-09-01', source_id:'FILE1',
    locator:'scan page 1 date block', verification:'visual' },
  contract_end_date:{ state:'Confirmed', value:'2027-08-31', source_id:'FILE1',
    locator:'scan page 1 date block', verification:'visual' }
}));
assert.strictEqual(population.fields['Contract Start Date'], '2026-09-01');
assert.strictEqual(population.fields['Contract End Date'], '2027-08-31');
population = api.structuredContractEvidencePopulation_(evidenceData({
  contract_start_date:{ state:'Confirmed', value:'2026-02-31', source_id:'FILE1', locator:'scan page 1' }
}));
assert.strictEqual(population.fields['Contract Start Date'], undefined);
['Unreadable', 'Ambiguous'].forEach(state => {
  const periodPopulation = api.structuredContractEvidencePopulation_(evidenceData({
    contract_start_date:{ state, source_id:'FILE1', locator:'scan page 1' }
  }));
  assert.strictEqual(periodPopulation.fields['Contract Start Date'], undefined);
});

function derivedAnnualEvidence(monthlyDeposit = 300, annualRsv = 21600) {
  const total = annualRsv + monthlyDeposit * 12;
  return {
    state:'Confirmed', value:total, derived:true,
    derivation:{
      calculation:'RSV ' + annualRsv + ' + Deposit ' + monthlyDeposit + ' × 12 = ' + total,
      source_product_facts:[
        {
          source_id:'FILE1', quote:'RSV 年費 ' + annualRsv, locator:'page 1 RSV row',
          product:field('Confirmed', 'RSV'), billing_period:field('Confirmed', 'annual'),
          price:field('Confirmed', annualRsv)
        },
        {
          source_id:'FILE1', quote:'Deposit 月費 ' + monthlyDeposit, locator:'page 1 Deposit row',
          product:field('Confirmed', 'Deposit'), billing_period:field('Confirmed', 'monthly'),
          price:field('Confirmed', monthlyDeposit)
        }
      ],
      shared_total_cross_check:{ state:'Confirmed', value:total * 2, source_id:'FILE1',
        quote:'兩店合計 ' + total * 2, locator:'page 1 total' }
    }
  };
}

// 13 annual-payment population shapes all produce an amount plus complete
// quote/location provenance. The shared total is only a cross-check.
const annualFixtures = [
  { state:'Confirmed', value:21600, source_id:'FILE1', quote:'年繳總額 21,600 元', locator:'page 2 payment' },
  { state:'Confirmed', value:25200, source_id:'FILE1', quote:'年繳總額 25,200 元', locator:'page 1 total' },
  derivedAnnualEvidence(), derivedAnnualEvidence(0), derivedAnnualEvidence(500),
  derivedAnnualEvidence(800), derivedAnnualEvidence(1000), derivedAnnualEvidence(1500),
  derivedAnnualEvidence(200), derivedAnnualEvidence(400), derivedAnnualEvidence(600),
  derivedAnnualEvidence(1200), derivedAnnualEvidence(250)
];
annualFixtures.forEach((annualField, index) => {
  const annualPopulation = api.structuredContractEvidencePopulation_(evidenceData(
    annualField.derived
      ? { annualized_economic_amount_ntd:annualField }
      : { annual_payment_amount_ntd:annualField }
  ));
  assert.notStrictEqual(annualPopulation.fields['Annual Payment Amount (NTD)'], undefined,
    'annual fixture ' + index);
  assert.ok(annualPopulation.fields['Annual Payment Evidence Quote'], 'annual quote ' + index);
  assert.ok(annualPopulation.fields['Annual Payment Evidence Location'], 'annual location ' + index);
  assert.strictEqual(annualPopulation.errors.length, 0, 'annual fixture ' + index);
});
population = api.structuredContractEvidencePopulation_(evidenceData({
  annualized_economic_amount_ntd:derivedAnnualEvidence()
}));
assert.strictEqual(population.fields['Annual Payment Amount (NTD)'], 25200);
assert.match(population.fields['Annual Payment Evidence Quote'], /21600.*300.*12.*25200/);
assert.doesNotMatch(population.fields['Annual Payment Evidence Quote'], /50400/);

// Confirmed annual values without provenance, Queue-derived hints, or a
// shared group total alone cannot populate a Branch annual amount.
[
  { state:'Confirmed', value:25200, source_id:'FILE1' },
  { state:'Confirmed', value:25200, source_id:'FILE1', quote:'Queue 預期 25,200', locator:'' },
  { state:'Confirmed', value:50400, derived:true, source_id:'FILE1',
    derivation:{ calculation:'shared total = 50400', source_product_facts:[] } },
  { state:'Unreadable', source_id:'FILE1', locator:'page 1 total' },
  { state:'Ambiguous', source_id:'FILE1', locator:'page 1 total' }
].forEach(annualField => {
  const annualPopulation = api.structuredContractEvidencePopulation_(evidenceData({
    [annualField.derived ? 'annualized_economic_amount_ntd' : 'annual_payment_amount_ntd']:annualField,
    queue_expected_amount:25200
  }));
  assert.strictEqual(annualPopulation.fields['Annual Payment Amount (NTD)'], undefined);
});

// An explicit annual payment is a different semantic fact from annualized
// product economics.  The explicit document value remains authoritative and
// cannot be overwritten by the sidecar economic amount.
let explicitAnnualData = evidenceData({
  annual_payment_amount_ntd:{
    state:'Confirmed', value:18000, source_id:'FILE1',
    quote:'乙方須依甲方指示付款新台幣 18,000 元',
    locator:'page 1 / section 4.1 / 給付方式'
  },
  annualized_economic_amount_ntd:derivedAnnualEvidence(1500, 18000)
});
population = api.structuredContractEvidencePopulation_(explicitAnnualData);
assert.strictEqual(population.fields['Annual Payment Amount (NTD)'], 18000);
assert.match(population.fields['Annual Payment Evidence Quote'], /18,000/);
result = match(explicitAnnualData, [queueRow()], {
  'Annual Payment Amount (NTD)':18000,
  'Annual Payment Evidence Quote':'乙方須依甲方指示付款新台幣 18,000 元',
  'Annual Payment Evidence Location':'page 1 / section 4.1 / 給付方式'
});
assert.strictEqual(result.result, 'MATCH');

// A generic location is not precise provenance for a Confirmed explicit
// annual amount.
population = api.structuredContractEvidencePopulation_(evidenceData({
  annual_payment_amount_ntd:{
    state:'Confirmed', value:18000, source_id:'FILE1',
    quote:'年繳新台幣 18,000 元', locator:'完整合約／Email 給付方式'
  }
}));
assert.strictEqual(population.fields['Annual Payment Amount (NTD)'], undefined);
assert.match(population.errors.join('；'), /precise locator/);

// Structured mode must surface evidence-integrity errors as NEEDS_REVIEW;
// product rows matching the Queue cannot hide missing provenance.
let invalidAnnualData = evidenceData({
  annual_payment_amount_ntd:{ state:'Confirmed', value:30000 }
});
result = match(invalidAnnualData);
assert.strictEqual(result.result, 'NEEDS_REVIEW');
assert.match(result.reason, /annual_payment_amount_ntd/);

// A stale Review row value/quote/location cannot override or disagree with
// the current structured JSON.  The inconsistency must fail closed.
result = match(explicitAnnualData, [queueRow()], {
  'Annual Payment Amount (NTD)':30000,
  'Annual Payment Evidence Quote':'年繳新台幣 30,000 元',
  'Annual Payment Evidence Location':'舊 review row'
});
assert.strictEqual(result.result, 'NEEDS_REVIEW');
assert.match(result.reason, /Review row.*Structured Contract Data.*不一致/);

// rooTi-shaped evidence: the explicit payment clause remains 18,000 even
// though annualized fixed product economics are 36,000.  The billing gate
// must retain the mismatch and report the real document value.
const explicitPayment18000 = api.structuredContractEvidencePopulation_(explicitAnnualData);
const annual36000Queue = [
  queueRow({ product:'RSV', billing:'annual', price:18000 }),
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:'', price:18000,
    overageMethod:'B2C', overagePrice:10 })
].map(values => ({ values }));
const explicitPaymentAudit = api.billingCycleAudit_(explicitPayment18000.fields, annual36000Queue, qx);
assert.strictEqual(explicitPaymentAudit.result, 'Fail');
assert.match(explicitPaymentAudit.reason, /文件 18,000 元/);
assert.match(explicitPaymentAudit.reason, /Queue annual 合約價格合計 36,000 元/);
assert.doesNotMatch(explicitPaymentAudit.reason, /文件 30,000 元/);

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

// Product-field applicability is centralized: Survey and Voice compare only
// subscription price + billing period.  "Unlimited" is an entitlement fact,
// not a commercial usage/bonus/overage value.
[
  { productName:'Survey', monthlyPrice:2000, annualPrice:24000 },
  { productName:'Survey', monthlyPrice:2000, annualPrice:24000 },
  { productName:'Survey', monthlyPrice:1000, annualPrice:12000 },
  { productName:'Survey', monthlyPrice:500, annualPrice:6000 },
  { productName:'Voice', monthlyPrice:1000, annualPrice:12000 }
].forEach((fixture, index) => {
  const documentProduct = product({
    product:field('Confirmed', fixture.productName),
    billing_period:field('Confirmed', 'monthly'),
    usage_sets:field('Confirmed', 'unlimited'),
    bonus_sets:field('NotApplicable'),
    price:field('Confirmed', fixture.monthlyPrice),
    share_plan_id:field('NotApplicable'),
    overage_method:field('Confirmed', 'unlimited'),
    overage_unit_price:field('Confirmed', 0),
    entitlement:field('Confirmed', 'unlimited')
  });
  const queue = [queueRow(), queueRow({
    product:fixture.productName, billing:'annual', sets:'', bonus:'',
    price:fixture.annualPrice, share:'', overageMethod:'', overagePrice:''
  })];
  assert.strictEqual(match(structuredData([product(), documentProduct]), queue).result, 'MATCH',
    fixture.productName + ' applicability fixture ' + index);
});

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
// A structured exact multiset match is authoritative for B2C multi-rate
// Deposit-Commission.  Multiple unique rates alone must not trigger a second
// legacy manual gate.
data = structuredData([creditCardBuyIn955, virtualAtmBuyIn985]);
result = match(data, multiMethodCommissionQueue);
assert.strictEqual(result.result, 'MATCH');
assert.strictEqual(
  contract(reviewFor(data), result, multiMethodCommissionQueue).result,
  'Pass'
);

// Missing method/rate, count mismatch, conflicts, and ambiguous association
// remain fail closed in the structured comparison layer.
assert.strictEqual(
  match(structuredData([creditCardBuyIn955]), multiMethodCommissionQueue).result,
  'MISMATCH'
);
const conflictingCommission = travelCommission({
  deposit_type:field('Confirmed', 'Credit Card'),
  commission_rate:field('Confirmed', 2.5),
  buy_in_price:field('Confirmed', 96)
});
assert.strictEqual(
  match(structuredData([conflictingCommission]), [multiMethodCommissionQueue[0]]).result,
  'NEEDS_REVIEW'
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

// deposit_type has two product-scoped domains. A category/payment-method
// mix-up is invalid extraction, not a commercial mismatch or a matching alias.
[
  { document:travelDeposit, queue:travelQueue[1], invalid:['Credit Card', 'Virtual ATM'] },
  { document:creditCardBuyIn95, queue:creditCardCommission5Queue[0], invalid:['B2B', 'B2C'] }
].forEach(fixture => fixture.invalid.forEach(value => {
  const invalidData = structuredData([Object.assign({}, fixture.document, {
    deposit_type:field('Confirmed', value)
  })]);
  const normalized = api.normalizeStructuredDocumentProducts_(invalidData);
  assert.ok(normalized.errors.some(error => error.includes('products[0].deposit_type')),
    fixture.document.product.value + ' must reject deposit_type=' + value);
  const mismatch = match(invalidData, [fixture.queue]);
  assert.strictEqual(mismatch.result, 'NEEDS_REVIEW');
  // Even if Queue contains the same invalid type, it cannot authorize MATCH.
  const sameInvalidQueue = fixture.queue.slice();
  sameInvalidQueue[headers.indexOf('超額計算方式')] = value;
  assert.strictEqual(match(invalidData, [sameInvalidQueue]).result, 'NEEDS_REVIEW');
}));

// Extend the existing positive fixtures, retaining their output and the
// existing case/whitespace normalization without changing document facts.
[
  [travelDeposit, 'b2c'],
  [b2bDepositServiceFee5, 'b2b'],
  [creditCardBuyIn95, 'credit card'],
  [virtualAtmBuyIn985, 'virtual atm']
].forEach(([document, expectedType]) => {
  const before = JSON.stringify(document);
  const normalized = api.normalizeStructuredDocumentProducts_(structuredData([document]));
  assert.strictEqual(normalized.errors.length, 0);
  assert.strictEqual(normalized.lines[0].overageMethod, expectedType);
  const caseVariant = Object.assign({}, document, {
    deposit_type:field('Confirmed', '  ' + expectedType.toUpperCase().replace(/ /g, '   ') + '  ')
  });
  assert.strictEqual(JSON.stringify(api.normalizeStructuredDocumentProducts_(
    structuredData([caseVariant]))), JSON.stringify(normalized));
  assert.strictEqual(JSON.stringify(document), before, 'normalization must not rewrite extraction');
});
const fixedDepositLine = api.normalizeStructuredDocumentProducts_(structuredData([travelDeposit])).lines[0];
assert.strictEqual(fixedDepositLine.overagePrice, '5', 'Deposit setup_fee keeps its existing mapping');
assert.strictEqual(fixedDepositLine.bonus, '', 'setup fee must not become commission');
assert.strictEqual(api.normalizeStructuredDocumentProducts_(
  structuredData([creditCardBuyIn95])).lines[0].overagePrice, '');

// Unknown/empty Confirmed values are unresolved, not new aliases. Preserve
// existing field-state handling rather than inventing a type from Queue.
['', 'Wire Transfer', 'Credit Card / Virtual ATM'].forEach(value => {
  assert.strictEqual(match(structuredData([travelCommission({
    deposit_type:field('Confirmed', value)
  })]), creditCardCommission5Queue).result, 'NEEDS_REVIEW');
});
['Ambiguous', 'Unreadable'].forEach(state => {
  [travelDeposit, creditCardBuyIn95].forEach(document => {
    assert.strictEqual(match(structuredData([Object.assign({}, document, {
      deposit_type:field(state)
    })])).result, 'NEEDS_REVIEW');
  });
});
['NotMentioned', 'NotApplicable'].forEach(state => {
  const normalized = api.normalizeStructuredDocumentProducts_(structuredData([
    Object.assign({}, travelDeposit, { deposit_type:field(state) })
  ]));
  assert.strictEqual(normalized.errors.length, 0, 'fixed Deposit field-state compatibility');
  assert.strictEqual(normalized.lines[0].overageMethod, '');
});

// A missing or ambiguous payment method never inherits Queue's Credit Card.
const unknownMethodCommission5 = travelCommission({
  deposit_type:field('NotMentioned'), commission_rate:field('Confirmed', 5),
  buy_in_price:field('NotMentioned')
});
assert.strictEqual(
  match(structuredData([unknownMethodCommission5]), creditCardCommission5Queue).result,
  'NEEDS_REVIEW'
);
const ambiguousMethodCommission5 = travelCommission({
  deposit_type:field('Ambiguous'), commission_rate:field('Confirmed', 5),
  buy_in_price:field('NotMentioned')
});
assert.strictEqual(
  match(structuredData([ambiguousMethodCommission5]), creditCardCommission5Queue).result,
  'NEEDS_REVIEW'
);
assert.strictEqual(
  match(structuredData([creditCardBuyIn95, creditCardBuyIn95]), [
    creditCardCommission5Queue[0], creditCardCommission5Queue[0]
  ]).result,
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
assert.strictEqual(match(data, travelQueue).result, 'NEEDS_REVIEW');

// Every B2C multi-rate row is deterministic when payment method + normalized
// commission form an exact multiset match.
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
assert.strictEqual(contract(reviewFor(data), result, multiRateQueue).result, 'Pass');

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

const unresolvedOverageMatch = match(multiTierFacts, [queueRow({ overageMethod:'tier' })]);
const unresolvedOverageGate = contract(reviewFor(multiTierFacts), unresolvedOverageMatch);
const unresolvedOverageDecision = api.decideAuditStatus_(false, base.catalog, base.source,
  base.longTerm, unresolvedOverageGate, base.bonus, base.plan, base.special, base.share);
assert.strictEqual(unresolvedOverageGate.result, 'Need Review');
assert.strictEqual(unresolvedOverageDecision.status, 'Need Contract');
assert.notStrictEqual(unresolvedOverageDecision.status, 'Contract Mismatch');

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

// Evidence population uses the same current-batch row identity and latest
// snapshot preflight as Document Match Result/Detail.
const populationTraceHeaders = traceHeaders.concat([
  'Evidence Type', 'Customer Explicit Consent', 'Agreement Confirmation Text',
  'Confirmation Sender', 'Inline Seal', 'Customer Seal', 'Contract Start Date',
  'Contract End Date', 'Annual Payment Amount (NTD)',
  'Annual Payment Evidence Quote', 'Annual Payment Evidence Location'
]);
function populationEvidenceSheet(rows) {
  const values = [populationTraceHeaders].concat(rows.map(row => row.slice()));
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
function populationEvidenceRow(branchId, batchId) {
  return evidenceRow(branchId, '1', '{"schema_version":1}', '', '', false, batchId)
    .concat(Array(populationTraceHeaders.length - traceHeaders.length).fill(''));
}
let populationTraceSheet = populationEvidenceSheet([
  populationEvidenceRow('B1', 'REVIEW-OLD'),
  populationEvidenceRow('B1', activeBatchId)
]);
let populationIndex = api.indexedEvidenceReviews_(
  populationTraceSheet, 'Branch ID', ['B1'], activeBatchId
);
const projectedFields = {
  'Evidence Type':'Contract', 'Inline Seal':true, 'Customer Seal':true,
  'Contract Start Date':'2026-09-01', 'Contract End Date':'2027-08-31',
  'Annual Payment Amount (NTD)':25200,
  'Annual Payment Evidence Quote':'文件產品費用推導：21600 + 300 × 12 = 25200',
  'Annual Payment Evidence Location':'page 1 RSV row；page 1 Deposit row'
};
let populationTrace = traceFor(populationIndex.B1);
populationTrace[0].evidencePopulation = projectedFields;
populationTrace[0].expectedEvidencePopulation = Object.keys(projectedFields)
  .reduce((out, header) => (out[header] = '', out), {});
api.writeDocumentMatchTraces_(populationTraceSheet, populationTrace, activeBatchId);
assert.deepStrictEqual(writtenRows(populationTraceSheet), [3]);
Object.keys(projectedFields).forEach(header => {
  const column = populationTraceHeaders.indexOf(header);
  assert.strictEqual(populationTraceSheet.values[2][column], projectedFields[header]);
  assert.strictEqual(populationTraceSheet.values[1][column], '');
});

// A concurrent human edit to any target population field causes zero writes.
populationTraceSheet = populationEvidenceSheet([populationEvidenceRow('B1', activeBatchId)]);
populationIndex = api.indexedEvidenceReviews_(populationTraceSheet, 'Branch ID', ['B1'], activeBatchId);
populationTrace = traceFor(populationIndex.B1);
populationTrace[0].evidencePopulation = { 'Inline Seal':true };
populationTrace[0].expectedEvidencePopulation = { 'Inline Seal':'' };
populationTraceSheet.values[1][populationTraceHeaders.indexOf('Inline Seal')] = 'manual edit';
assert.throws(
  () => api.writeDocumentMatchTraces_(populationTraceSheet, populationTrace, activeBatchId),
  /Inline Seal.*indexing snapshot/
);
assert.strictEqual(populationTraceSheet.writes.length, 0);

// Existing billing gate semantics consume the projected document-derived
// Branch amount; the shared group total alone cannot satisfy the gate.
const annualDepositQueue = [
  queueRow({ product:'RSV', billing:'annual', price:21600 }),
  queueRow({ product:'Deposit', billing:'annual', sets:'', bonus:'', price:3600,
    overageMethod:'B2C', overagePrice:0 })
].map(values => ({ values }));
const derivedPopulation = api.structuredContractEvidencePopulation_(evidenceData({
  annualized_economic_amount_ntd:derivedAnnualEvidence()
}));
assert.strictEqual(
  api.billingCycleAudit_(derivedPopulation.fields, annualDepositQueue, qx).result,
  'Pass'
);
const sharedOnlyPopulation = api.structuredContractEvidencePopulation_(evidenceData({
  annualized_economic_amount_ntd:{ state:'Confirmed', value:50400, derived:true,
    derivation:{ calculation:'shared total = 50400', source_product_facts:[] } }
}));
assert.strictEqual(
  api.billingCycleAudit_(sharedOnlyPopulation.fields, annualDepositQueue, qx).result,
  'Need Review'
);

// Plan Classification trace identity is scoped to the Active Contract Review Batch.
const planHeaders = [
  'Branch ID', 'Original Plan Family', 'New Plan Family', 'Complete Plan Match',
  'Reviewer', 'Reviewed At', 'Notes', 'First Contract Start Date', 'Expected Plan Family',
  'Original Plan Code', 'New Plan Code', 'Catalog Match Rule', 'Catalog Exception',
  'Origin Source', 'Review Batch ID'
];
function planRow(branchId, batchId = '', matchRule = '') {
  return [branchId, '', '', '', '', '', '', '', '', '', '', matchRule, '', '', batchId];
}
function planSheet(rows) {
  const values = [planHeaders].concat(rows.map(row => row.slice()));
  const writes = [];
  return {
    values,
    writes,
    getName:() => 'Plan Classification Review',
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
function planTraceFor(entry, branchId = 'B1') {
  return [{
    branchId,
    targetRowNumber:entry.targetRowNumber,
    reviewBatchId:entry.reviewBatchId,
    origin:{ firstContractStart:'2024-01-01', source:'Legacy Branch Master!2' },
    planAudit:{
      oldFamily:'Public', newFamily:'Public', expectedFamily:'Public',
      oldPlanCode:'TMS-0001', newPlanCode:'TMS-0001',
      matchRule:'current trace', reason:''
    }
  }];
}
function planWrittenRows(sheet) {
  return Array.from(new Set(sheet.writes.map(write => write.row))).sort((a, b) => a - b);
}

// Historical row before current row: only the current-batch row is the writer target.
let planTraceSheet = planSheet([
  planRow('B1', '', 'historical-before'),
  planRow('B1', activeBatchId, 'current-before-write')
]);
let planIndex = api.indexedPlanClassificationReviews_(
  planTraceSheet, 'Branch ID', ['B1'], activeBatchId
);
assert.strictEqual(planIndex.B1.targetRowNumber, 3);
const historicalBefore = planTraceSheet.values[1].slice();
api.writePlanClassificationTraces_(planTraceSheet, planTraceFor(planIndex.B1), activeBatchId);
assert.deepStrictEqual(planWrittenRows(planTraceSheet), [3]);
assert.deepStrictEqual(planTraceSheet.values[1], historicalBefore);
assert.strictEqual(planTraceSheet.values[2][11], 'current trace');

// Historical row after current row: the current row still remains the only target.
planTraceSheet = planSheet([
  planRow('B1', activeBatchId, 'current-before-write'),
  planRow('B1', 'REVIEW-OLD', 'historical-after')
]);
planIndex = api.indexedPlanClassificationReviews_(
  planTraceSheet, 'Branch ID', ['B1'], activeBatchId
);
assert.strictEqual(planIndex.B1.targetRowNumber, 2);
const historicalAfter = planTraceSheet.values[2].slice();
api.writePlanClassificationTraces_(planTraceSheet, planTraceFor(planIndex.B1), activeBatchId);
assert.deepStrictEqual(planWrittenRows(planTraceSheet), [2]);
assert.deepStrictEqual(planTraceSheet.values[2], historicalAfter);

// Missing or duplicate current-batch rows fail closed before any trace write.
planTraceSheet = planSheet([planRow('B1', 'REVIEW-OLD')]);
assert.throws(
  () => api.indexedPlanClassificationReviews_(planTraceSheet, 'Branch ID', ['B1'], activeBatchId),
  /REVIEW-CURRENT.*缺少 Branch rows.*B1/
);
assert.strictEqual(planTraceSheet.writes.length, 0);

planTraceSheet = planSheet([
  planRow('B1', activeBatchId),
  planRow('B1', activeBatchId)
]);
assert.throws(
  () => api.indexedPlanClassificationReviews_(planTraceSheet, 'Branch ID', ['B1'], activeBatchId),
  /REVIEW-CURRENT.*B1 rows 2, 3/
);
assert.strictEqual(planTraceSheet.writes.length, 0);

// Latest-snapshot identity changes or duplicates cause zero writes.
['branch', 'batch', 'duplicate'].forEach(change => {
  planTraceSheet = planSheet([
    planRow('B1', activeBatchId),
    planRow('B1', 'REVIEW-OLD', 'historical')
  ]);
  planIndex = api.indexedPlanClassificationReviews_(
    planTraceSheet, 'Branch ID', ['B1'], activeBatchId
  );
  const traces = planTraceFor(planIndex.B1);
  if (change === 'branch') planTraceSheet.values[1][0] = 'CHANGED';
  if (change === 'batch') planTraceSheet.values[1][14] = 'REVIEW-CHANGED';
  if (change === 'duplicate') planTraceSheet.values.push(planRow('B1', activeBatchId));
  assert.throws(
    () => api.writePlanClassificationTraces_(planTraceSheet, traces, activeBatchId),
    /preflight/i
  );
  assert.strictEqual(planTraceSheet.writes.length, 0, change + ' failure must write nothing');
});

// One stale target in a multi-Branch batch prevents every otherwise valid write.
planTraceSheet = planSheet([
  planRow('B1', activeBatchId),
  planRow('B2', activeBatchId)
]);
planIndex = api.indexedPlanClassificationReviews_(
  planTraceSheet, 'Branch ID', ['B1', 'B2'], activeBatchId
);
const multiBranchTraces = planTraceFor(planIndex.B1, 'B1').concat(
  planTraceFor(planIndex.B2, 'B2')
);
planTraceSheet.values[2][14] = 'REVIEW-CHANGED';
assert.throws(
  () => api.writePlanClassificationTraces_(planTraceSheet, multiBranchTraces, activeBatchId),
  /preflight/i
);
assert.strictEqual(planTraceSheet.writes.length, 0);

// Blank Active Batch preserves the legacy first-matching-row read/write behavior.
planTraceSheet = planSheet([
  planRow('B1', 'REVIEW-OLD', 'legacy-first'),
  planRow('B1', 'REVIEW-CURRENT', 'later-row')
]);
planIndex = api.indexedPlanClassificationReviews_(planTraceSheet, 'Branch ID', ['B1'], '');
assert.strictEqual(planIndex.B1.targetRowNumber, 2);
const laterLegacyRow = planTraceSheet.values[2].slice();
api.writePlanClassificationTraces_(planTraceSheet, planTraceFor(planIndex.B1), '');
assert.deepStrictEqual(planWrittenRows(planTraceSheet), [2]);
assert.deepStrictEqual(planTraceSheet.values[2], laterLegacyRow);

console.log('Structured document comparison regression: all cases passed.');
