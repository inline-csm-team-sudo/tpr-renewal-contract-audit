/** No-write smoke: real snapshot helpers, synthetic sheet only. No workbook is opened. */
function runTaxIdSnapshotCloudSmokeTest() {
  const headers = BRANCH_TAX_ID_REFERENCE_HEADERS.slice();
  const values = [headers];
  const textCells = {};
  let ignoreTextFormat = false;
  const sheet = {
    getName:() => 'Branch Tax ID Reference',
    getLastRow:() => values.length,
    getDataRange:() => ({ getValues:() => values.map(row => row.slice()) }),
    getRange:(row, column, count, width) => ({
      setNumberFormat:format => {
        for (let r = row; r < row + count; r++) textCells[r + ':' + column] = format;
      },
      setValues:rows => rows.forEach((input, r) => input.forEach((value, c) => {
        const rr = row + r;
        const cc = column + c;
        if (!values[rr - 1]) values[rr - 1] = [];
        values[rr - 1][cc - 1] =
          (ignoreTextFormat || textCells[rr + ':' + cc] !== '@') &&
          typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      })),
      getValues:() => values.slice(row - 1, row - 1 + count)
        .map(input => input.slice(column - 1, column - 1 + width))
    })
  };
  const identifiers = ['00885820', '00558488', '12345678', '00001234', '0', ''];
  const references = identifiers.map((taxId, index) => ({
    branchId:'SYNTHETIC-' + index, taxId, sourceSpreadsheetId:'SYNTHETIC-SOURCE',
    sourceTab:'TW', sourceRow:index + 2, importedAt:'SYNTHETIC-TIME',
    sourceRows:String(index + 2), status:taxId ? 'PASS' : 'NEEDS_REVIEW', notes:''
  }));
  appendBranchTaxIdReferenceRows_(sheet, references, 'SYNTHETIC-BATCH');
  assertBranchTaxIdSnapshotIntegrity_(sheet, references, 'SYNTHETIC-BATCH');
  const taxColumn = headers.indexOf('Tax ID');
  const pass = values.slice(1).every((row, index) =>
    typeof row[taxColumn] === 'string' && row[taxColumn] === identifiers[index]);
  if (!pass) throw new Error('Tax ID smoke exact-string persistence FAIL.');
  let mismatchRejected = false;
  values[1][taxColumn] = '885820';
  try { assertBranchTaxIdSnapshotIntegrity_(sheet, references, 'SYNTHETIC-BATCH'); }
  catch (error) { mismatchRejected = String(error).indexOf('Tax ID snapshot integrity') >= 0; }
  if (!mismatchRejected || values[1][taxColumn] !== '885820') {
    throw new Error('Tax ID smoke mismatch guard or no-retry FAIL.');
  }
  let numericRejected = false;
  values[1][taxColumn] = 885820;
  try {
    assertBranchTaxIdSnapshotIntegrity_(sheet,
      references.map(({ branchId }) => ({ branchId })), 'SYNTHETIC-BATCH');
  } catch (error) { numericRejected = String(error).indexOf('Tax ID snapshot integrity') >= 0; }
  if (!numericRejected) throw new Error('Tax ID smoke numeric read-back guard FAIL.');
  ignoreTextFormat = true;
  let coercionRejected = false;
  try { appendBranchTaxIdReferenceRows_(sheet, [references[0]], 'FAULTY-SYNTHETIC-BATCH'); }
  catch (error) { coercionRejected = String(error).indexOf('Tax ID snapshot integrity') >= 0; }
  if (!coercionRejected) throw new Error('Tax ID smoke coercion guard FAIL.');
  const report = { result:'PASS', exactStringCases:identifiers.length,
    mismatchRejected, numericRejected, coercionRejected, workbookWrites:0 };
  console.log('TAX_ID_SMOKE ' + JSON.stringify(report));
  return report;
}
