const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const logs = [];
const accesses = [];
const context = { console:{ log:message => logs.push(message) } };
// Any service access fails, including reads: the cloud entrypoint must depend
// exclusively on synthetic objects and the existing pure comparison helpers.
[
  'SpreadsheetApp', 'DriveApp', 'PropertiesService', 'Sheets', 'Drive',
  'UrlFetchApp', 'ScriptApp', 'CacheService', 'Session', 'Utilities'
].forEach(name => Object.defineProperty(context, name, {
  get() { accesses.push(name); throw new Error('Forbidden service access: ' + name); }
}));
vm.createContext(context);
vm.runInContext(fs.readFileSync('RenewalQueue.gs', 'utf8') + '\n' +
  fs.readFileSync('tests/renewal_queue_deposit_cloud_smoke.gs', 'utf8'), context);
['buildQueue', 'buildQueueDryRun', 'runContractAudit', 'prepareContractReviewBatch',
  'maintainPlanCodes', 'initializeProductionPlanReferences', 'syncPlanCatalog'].forEach(name => {
  context[name] = () => { accesses.push(name); throw new Error('Forbidden entrypoint: ' + name); };
});
const report = JSON.parse(JSON.stringify(vm.runInContext('runDepositCloudSmokeTest()', context)));
assert.strictEqual(report.result, 'PASS');
assert.deepStrictEqual(report.cases.map(row => [row.name, row.expected, row.actual, row.pass]), [
  ['Deposit / B2B', 'MATCH', 'MATCH', true],
  ['Deposit / B2C', 'MATCH', 'MATCH', true],
  ['Deposit-Commission / Credit Card', 'MATCH', 'MATCH', true],
  ['Deposit-Commission / Virtual ATM', 'MATCH', 'MATCH', true],
  ['Deposit / Credit Card', 'NEEDS_REVIEW', 'NEEDS_REVIEW', true],
  ['Deposit / Virtual ATM', 'NEEDS_REVIEW', 'NEEDS_REVIEW', true],
  ['Deposit-Commission / B2B', 'NEEDS_REVIEW', 'NEEDS_REVIEW', true],
  ['Deposit-Commission / B2C', 'NEEDS_REVIEW', 'NEEDS_REVIEW', true]
]);
assert.strictEqual(report.preservation.length, 8);
assert.ok(report.preservation.every(row => row.pass));
assert.deepStrictEqual(accesses, []);
assert.strictEqual(logs.filter(line => line.startsWith('DEPOSIT_SMOKE_SUMMARY ')).length, 1);
console.log('PASS Deposit cloud smoke equivalent: 8/8 cases, 8 preservation checks, zero service/Build/Audit/Batch access.');
