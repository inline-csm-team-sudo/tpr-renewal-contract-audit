const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('RenewalQueue.gs', 'utf8');
let flushCount = 0;
const context = {
  console, Date,
  Utilities: { formatDate: value => value.toISOString().slice(0, 10) },
  SpreadsheetApp: {
    flush: () => { flushCount++; },
    DataValidationCriteria: { CHECKBOX: 'CHECKBOX' },
    newDataValidation: () => ({
      requireCheckbox() { return this; },
      build: () => ({ getCriteriaType: () => 'CHECKBOX' })
    })
  }
};
vm.createContext(context);
vm.runInContext(source, context);
const api = name => context[name];
const headers = ['', 'Check', 'Note', 'Branch ID', '產品', '合約起始日',
  '合約結束日', 'Original TPR Row', 'Renewal DB Row', '付款週期', '合約組數',
  '合約贈送組數', '合約價格', 'Share Plan ID', '超額計算方式', '超額每組單價'];
const ix = api('headerIndex_')(headers);
const rows = Array.from({ length: 55 }, (_, i) => [
  '', false, '', `GENERIC-${i === 14 ? 13 : i}`, i === 14 ? 'Deposit' : 'RSV',
  new Date('2026-10-16T00:00:00Z'), new Date('2027-10-15T00:00:00Z'),
  `TPR!${i === 14 ? 16 : i + 3}`, `202610!${i === 14 ? 15 : i + 2}`,
  'annual', 1200, 0, 12000, '', 'per set', 20
]);
const hidden = [11, 12, ...Array.from({ length: 41 }, (_, i) => i + 16)];
const copy = value => value instanceof Date ? new Date(value) : value;

class Sheet {
  constructor({ filter = true, manual = false, corrupt = null } = {}) {
    this.cells = Array.from({ length: 233 }, () => Array(headers.length).fill(''));
    this.rules = Array.from({ length: 233 }, () => Array(headers.length).fill(null));
    this.cells[0] = headers.slice();
    for (let r = 1; r < 233; r++) this.rules[r][1] = { getCriteriaType: () => 'CHECKBOX' };
    this.filtered = filter ? new Set(hidden) : new Set();
    this.manual = manual ? new Set(hidden) : new Set();
    this.filter = filter ? { remove: () => { this.filter = null; this.filtered.clear(); } } : null;
    this.corrupt = corrupt;
    this.writes = 0;
    this.insertCheckboxCalls = 0;
  }
  getName() { return 'TPR Update Queue'; }
  getLastColumn() { return this.cells[0].length; }
  getMaxRows() { return this.cells.length; }
  getLastRow() {
    let last = 0;
    this.cells.forEach((r, i) => { if (r.some(v => v !== '')) last = i + 1; });
    return last;
  }
  getParent() { return { getSpreadsheetTimeZone: () => 'Asia/Taipei' }; }
  getFilter() { return this.filter; }
  showRows(start, count) { for (let i = start; i < start + count; i++) this.manual.delete(i); }
  isRowHiddenByFilter(row) { return this.filtered.has(row); }
  isRowHiddenByUser(row) { return this.manual.has(row); }
  getRange(row, col, count = 1, width = 1) {
    const sheet = this;
    const each = fn => { for (let r = 0; r < count; r++) for (let c = 0; c < width; c++) fn(row - 1 + r, col - 1 + c); };
    const range = {
      clearContent() { each((r, c) => { sheet.cells[r][c] = ''; }); return this; },
      clearDataValidations() { each((r, c) => { sheet.rules[r][c] = null; }); return this; },
      setValues(values) {
        sheet.writes++;
        each((r, c) => {
          const value = values[r - row + 1][c - col + 1];
          // Inject the observed filter-hidden date-loss fault, not a claim about all Sheets writes.
          sheet.cells[r][c] = value === null || value === undefined || (sheet.filtered.has(r + 1) && value instanceof Date) ? '' : copy(value);
        });
        if (row === 2 && width >= headers.length && sheet.corrupt) sheet.corrupt(sheet);
        return this;
      },
      getValues() { return Array.from({ length: count }, (_, r) => sheet.cells[row - 1 + r].slice(col - 1, col - 1 + width).map(copy)); },
      getDisplayValues() { return this.getValues().map(r => r.map(v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v))); },
      getDataValidations() { return Array.from({ length: count }, (_, r) => sheet.rules[row - 1 + r].slice(col - 1, col - 1 + width)); },
      setDataValidation(rule) { each((r, c) => { sheet.rules[r][c] = rule; }); return this; },
      insertCheckboxes() { sheet.insertCheckboxCalls++; each((r, c) => { sheet.rules[r][c] = { getCriteriaType: () => 'CHECKBOX' }; sheet.cells[r][c] = false; }); return this; },
      setNumberFormat() { return this; }
    };
    return range;
  }
}

const filtered = new Sheet();
api('writeQueue_')(filtered, headers, rows, ix);
assert.strictEqual(filtered.cells.slice(1, 56).filter(r => r[5] instanceof Date).length, 55,
  '55-row regression: filter-hidden dates must survive the real writer');
assert.strictEqual(filtered.getFilter(), null);
assert.strictEqual(filtered.rules.slice(1, 56).filter(r => r[1]).length, 55);
assert.strictEqual(filtered.rules.slice(56).filter(r => r[1]).length, 0);
assert.ok(filtered.cells[14][5] instanceof Date);
assert.ok(filtered.cells[15][5] instanceof Date);
assert.ok(flushCount > 0);

// Blank fixture headers serialize as null; Sheets persists them as empty cells.
const blankHeaders = headers.slice();
blankHeaders[0] = null;
api('writeQueue_')(new Sheet(), blankHeaders, rows, api('headerIndex_')(blankHeaders));

// No filter, manual hidden rows: still keep every current data row visible.
const manuallyHidden = new Sheet({ filter: false, manual: true });
api('writeQueue_')(manuallyHidden, headers, rows, ix);
assert.strictEqual(manuallyHidden.manual.size, 0);

// A subsequent shorter/empty Queue must remove validation from every former data row.
api('writeQueue_')(filtered, headers, rows.slice(0, 2), ix);
assert.strictEqual(filtered.rules.slice(3).filter(r => r[1]).length, 0);
api('writeQueue_')(filtered, headers, [], ix);
assert.strictEqual(filtered.rules.slice(1).filter(r => r[1]).length, 0);

// Real Audit output writer: Ready, hard FALSE, manual review and multi-product decisions.
const auditHeaders = headers.concat(['Update Status']);
const before = rows.slice(0, 4).map(r => r.concat(''));
before[1][3] = before[0][3];
before[1][4] = 'Deposit';
const statuses = ['Ready', 'Ready', 'Contract Mismatch', 'Need Check'];
const results = before.map((r, i) => r.map((v, c) => c === 1 ? i < 2 : c === 2 ? `Outcome ${i}` : c === headers.length ? statuses[i] : v));
const auditSheet = new Sheet();
auditSheet.cells.forEach(r => r.push(''));
auditSheet.rules.forEach(r => r.push(null));
auditSheet.cells[0] = auditHeaders.slice();
api('writeQueue_')(auditSheet, auditHeaders, before, api('headerIndex_')(auditHeaders));
api('writeQueueAuditResults_')(auditSheet, auditHeaders, before, results);
assert.deepStrictEqual(auditSheet.cells.slice(1, 5).map(r => r[1]), [true, true, false, false]);
assert.strictEqual(auditSheet.insertCheckboxCalls, 0, 'validation must never reset Audit values');
assert.strictEqual(auditSheet.rules.slice(5).filter(r => r[1]).length, 0);
assert.strictEqual(auditSheet.getFilter(), null);

// Silent post-write faults must fail closed, with no retries or corrective writes.
for (const field of ['合約起始日', '合約價格', 'Branch ID', 'Original TPR Row']) {
  const column = headers.indexOf(field);
  const broken = new Sheet({ corrupt: sheet => { sheet.cells[15][column] = ''; } });
  assert.throws(() => api('writeQueue_')(broken, headers, rows, ix), new RegExp(`row 16.*${field}`));
  assert.strictEqual(broken.writes, 2, 'one header and one data write; never retry');
}
const errorSheet = new Sheet({ corrupt: sheet => { sheet.cells[10][12] = '#NUM!'; } });
assert.throws(() => api('writeQueue_')(errorSheet, headers, rows, ix), /row 11.*合約價格/);
const auditBroken = new Sheet({ filter: false, corrupt: sheet => { sheet.cells[1][1] = false; } });
auditBroken.cells.forEach(r => r.push(''));
auditBroken.rules.forEach(r => r.push(null));
auditBroken.cells[0] = auditHeaders.slice();
assert.throws(() => api('writeQueueAuditResults_')(auditBroken, auditHeaders, before, results), /row 2.*Check/);

// Immutable source/commercial fields cannot be changed by an Audit output array.
const changed = results.map(r => r.slice());
changed[0][12]++;
assert.throws(() => api('writeQueueAuditResults_')(auditSheet, auditHeaders, before, changed), /source.*changed/i);

// Read-back guards check trace persistence, never recalculate or overwrite Document Match.
const traceSheet = new Sheet({ filter: false });
traceSheet.cells[0] = ['Branch ID', 'Document Match Result', 'Document Match Detail'];
traceSheet.cells[1] = ['GENERIC-TRACE', 'MATCH', 'Exact document comparison'];
const traces = [{ targetRowNumber: 2, result: 'MATCH', detail: 'Exact document comparison' }];
api('assertDocumentMatchTraceReadBack_')(traceSheet, traces);
assert.strictEqual(traceSheet.writes, 0);
traceSheet.cells[1][2] = 'Stale detail';
assert.throws(() => api('assertDocumentMatchTraceReadBack_')(traceSheet, traces), /row 2.*Document Match Detail/);
assert.strictEqual(traceSheet.writes, 0);
api('assertDocumentMatchTraceReadBack_')(null, []);

// Guards remain at both completion boundaries; no diagnostic-only hook is required.
assert.match(source, /assertQueueWriteIntegrity_\(queue, queueHeaders, output, 'Build completion'\)/);
assert.match(source, /writeQueueAuditResults_\(queue, queueHeaders, queueValues\.slice\(1\), resultRows\)/);
console.log('PASS Queue writer integrity: 55-row filter fault, tail validation, checkbox preservation, fail-closed guards');

module.exports = { Sheet, headers, rows, context };
