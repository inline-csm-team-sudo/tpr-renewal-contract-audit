---
name: tpr-renewal-contract-audit
description: Build and audit the inline TPR renewal Queue from TPR rows whose checkbox is TRUE, resolve Renewal DB months from Demand, convert new-plan data into TPR product rows, read every linked contract or email, and write Check plus a concrete one-line Note. Use for any request mentioning TPR renewals, Renewal DB, Build Queue, TPR Update Queue, contract/email review, Share Plan review, special-plan approval, or rerunning the complete renewal workflow.
---

# TPR Renewal Contract Audit

Use this skill as the authoritative project workflow for TPR renewal conversion and contract review.

## Required reading

Before reading data, changing scripts, building Queue, or reviewing a contract, read
[`references/contract-audit-rules.md`](references/contract-audit-rules.md) completely.
Treat that file as authoritative when older project specifications or historical Queue notes conflict.

## Source of truth and scope

- Read the current source IDs, tab names, writable destinations, and rule settings from the reference and the workbook `Control` sheet.
- Treat original TPR, Renewal DB, plan-reference sheets, contracts, and emails as read-only.
- Write only to the test workbook Queue, review sheets, and Audit Log unless the user separately and explicitly authorizes a formal TPR writeback.
- Do not use `合約後補更新 Tool.xlsx` for this workflow.
- Resolve spreadsheet fields by normalized header title and mapping key, never by fixed column letter.

## Full-run workflow

When the user says「從頭跑一次續約流程」or equivalent:

1. Read TPR rows whose selection checkbox is `TRUE`.
2. Parse each selected row's `Demand` into one or more `YYYYMM` Renewal DB tabs.
3. Run or reproduce Build Queue using only those months.
4. Confirm the Queue preserves TPR identity and context fields and replaces only renewal-plan fields.
5. Build one Branch-level review set from all Queue product rows for that Branch ID.
6. Open every contract, email, image, or folder linked by the selected branches.
7. For PDFs or photographs, inspect every relevant page visually; OCR or extracted text is only an aid.
8. Complete Contract Evidence, Plan Classification, Special Approval, and Share Group reviews.
9. Decide each Branch using all products together, then write the same decision to every Queue product row for that Branch.
10. Write `Check=TRUE` only when every required check passes. Otherwise write `FALSE` and a concrete, one-line Note containing actual values and the required next action.
11. Verify counts, ensure every unchecked row has a nonblank Note, append Audit Log, and visually inspect the Queue.

Running the Apps Script audit alone is not a completed review. Codex must read the linked evidence and fill the review fields before final Check decisions.

## Tools and evidence handling

- Prefer the connected Google Drive/Sheets tools for semantic spreadsheet and Drive reads/writes.
- Use the signed-in Chrome session only when an interactive menu, Apps Script UI, or visible page state is required.
- Use PDF rendering and page screenshots for scanned or image-only contracts.
- Read an entire email thread and all relevant files in a linked folder, not only the first attachment.
- Never mark seals, consent, restaurant name, period, or plan as confirmed merely because a file exists.

## Decision discipline

- Fail closed when required data or evidence cannot be read.
- Do not replace a concrete discrepancy with a generic phrase such as「方案有變更，需人工確認」.
- Distinguish Queue product-row counts from unique Branch counts in the final report.
- Preserve independent decisions for different Branch IDs even when they share one group contract.
- Within one Branch ID, apply the Branch decision consistently to all of its product rows.
- Do not treat a previously checked Queue row as proof; rebuild the judgment from current sources and evidence.

## Maintenance

- Business-rule changes belong in `references/contract-audit-rules.md`.
- Header aliases and new Renewal DB fields belong in `Field Mapping`.
- New plan families belong in the plan-reference configuration.
- Adjustable thresholds belong in `Control`.
- Modify `RenewalQueue.gs` or `ContractAudit.gs` only when the behavior cannot be expressed in workbook configuration.
- After changing this skill, run the skill validator and report the changed rule clearly.
