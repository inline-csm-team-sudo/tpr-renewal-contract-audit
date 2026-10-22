/**
 * Manual, no-write Apps Script smoke entrypoint. Uses synthetic objects only;
 * no workbook, Drive, Properties, Build, Audit or Batch entrypoint is accessed.
 */
function runDepositCloudSmokeTest() {
  const cases = [];
  const preservation = [];
  const headers = ['Branch ID', '產品', '付款週期', '合約組數', '合約贈送組數',
    '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
  const qx = headerIndex_(headers);
  const field = (state, value) => value === undefined ? { state } : { state, value };
  const document = (product, type) => ({
    source_id:'SYNTHETIC_SOURCE', product:field('Confirmed', product),
    billing_period:product === 'Deposit' ? field('Confirmed', 'annual') : field('NotApplicable'),
    usage_sets:field('NotApplicable'), bonus_sets:field('NotApplicable'),
    price:product === 'Deposit' ? field('Confirmed', 1500) : field('NotApplicable'),
    share_plan_id:field('NotApplicable'), deposit_type:field('Confirmed', type),
    ...(product === 'Deposit' ? { setup_fee:field('Confirmed', 5) } : {}),
    commission_rate:product === 'Deposit-Commission' || type === 'B2B'
      ? field('Confirmed', 4.5) : field('NotMentioned'),
    buy_in_price:field('NotMentioned')
  });
  const dataFor = products => ({
    schema_version:1,
    evidence_set:{ state:'Confirmed', complete:true, relevant_source_ids:['SYNTHETIC_SOURCE'] },
    products
  });
  const queue = (product, type, bonus, price, setup) =>
    ['SYNTHETIC_BRANCH', product, 'annual', '', bonus, price, '', type, setup];
  function compare(data, rows) {
    return structuredDocumentMatchAudit_({
      'Structured Review Version':1, 'Structured Contract Data':JSON.stringify(data)
    }, rows.map(values => ({ values })), qx);
  }
  function expect(name, expected, actual, results) {
    const result = { name, expected, actual, pass:actual === expected };
    results.push(result);
    console.log('DEPOSIT_SMOKE ' + JSON.stringify(result));
    if (!result.pass) throw new Error('Deposit smoke FAIL: ' + JSON.stringify(result));
  }

  [
    ['Deposit', 'B2B', true], ['Deposit', 'B2C', true],
    ['Deposit-Commission', 'Credit Card', true], ['Deposit-Commission', 'Virtual ATM', true],
    ['Deposit', 'Credit Card', false], ['Deposit', 'Virtual ATM', false],
    ['Deposit-Commission', 'B2B', false], ['Deposit-Commission', 'B2C', false]
  ].forEach(([product, type, accepted]) => {
    const data = dataFor([document(product, type)]);
    const frozen = JSON.stringify(data);
    const normalized = normalizeStructuredDocumentProducts_(data);
    const fixed = product === 'Deposit';
    const rows = [queue(product, type, !fixed || type === 'B2B' ? 4.5 : '',
      fixed ? 1500 : '', fixed ? 5 : '')];
    const actual = compare(data, rows).result;
    if (accepted ? normalized.errors.length !== 0 :
        !normalized.errors.some(error => error.indexOf('products[0].deposit_type') >= 0)) {
      throw new Error('Deposit smoke validator path FAIL: ' + product + ' / ' + type);
    }
    if (JSON.stringify(data) !== frozen || normalized.lines.length !== 1 ||
        normalized.lines[0].product !== product) {
      throw new Error('Deposit smoke input/product mutation: ' + product + ' / ' + type);
    }
    expect(product + ' / ' + type, accepted ? 'MATCH' : 'NEEDS_REVIEW', actual, cases);
  });

  const fixed = document('Deposit', 'B2C');
  const b2b = normalizeStructuredDocumentProducts_(dataFor([document('Deposit', 'B2B')]));
  expect('Deposit.setup_fee mapping', '5',
    normalizeStructuredDocumentProducts_(dataFor([fixed])).lines[0].overagePrice, preservation);
  expect('B2B remains one Deposit row', 'Deposit',
    b2b.lines.map(line => line.product).join(','), preservation);
  expect('B2B transaction service rate', '4.5', b2b.lines[0].bonus, preservation);
  const card = document('Deposit-Commission', 'Credit Card');
  expect('commission_rate unchanged', '4.5',
    normalizeStructuredDocumentProducts_(dataFor([card])).lines[0].bonus, preservation);
  const atm = document('Deposit-Commission', 'Virtual ATM');
  atm.commission_rate = field('NotMentioned');
  atm.buy_in_price = field('Confirmed', 98.5);
  expect('buy_in_price 98.5 -> commission 1.5', '1.5',
    normalizeStructuredDocumentProducts_(dataFor([atm])).lines[0].bonus, preservation);
  expect('B2C multi-method rows', 'MATCH', compare(dataFor([fixed, card, atm]), [
    queue('Deposit', 'B2C', '', 1500, 5),
    queue('Deposit-Commission', 'Credit Card', 4.5, '', ''),
    queue('Deposit-Commission', 'Virtual ATM', 1.5, '', '')
  ]).result, preservation);

  const main = {
    source_id:'SYNTHETIC_SOURCE', product:field('Confirmed', 'RSV'),
    billing_period:field('Confirmed', 'annual'), usage_sets:field('Confirmed', 3600),
    bonus_sets:field('NotMentioned'), price:field('Confirmed', 21600),
    share_plan_id:field('NotApplicable'), overage_method:field('Confirmed', 'per unit'),
    overage_unit_price:field('Confirmed', 7)
  };
  const mainQueue = ['SYNTHETIC_BRANCH', 'RSV', 'annual', 3600, '', 21600, '', 'per unit', 7];
  fixed.billing_period = field('Confirmed', 'monthly');
  expect('Deposit monthly 1500 -> annual 18000', 'MATCH', compare(dataFor([main, fixed]),
    [mainQueue, queue('Deposit', 'B2C', '', 18000, 5)]).result, preservation);
  fixed.price = field('Confirmed', 0);
  expect('Deposit explicit monthly 0 -> annual 0', 'MATCH', compare(dataFor([main, fixed]),
    [mainQueue, queue('Deposit', 'B2C', '', 0, 5)]).result, preservation);

  const report = { result:'PASS', cases, preservation };
  console.log('DEPOSIT_SMOKE_SUMMARY ' + JSON.stringify({
    result:report.result, casesPassed:cases.length, casesTotal:8,
    preservationPassed:preservation.length
  }));
  return report;
}
