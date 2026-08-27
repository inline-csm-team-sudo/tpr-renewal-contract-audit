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

Before producing or evaluating any new `Structured Contract Data`, including an
extraction-only shadow test, read
[`references/structured-extraction.md`](references/structured-extraction.md) completely and use
its first-pass and field-local fallback contracts. Finish first-pass extraction from the documents
without exposing Queue plan values to the reader; compare with Queue only after the extraction is frozen.

## Source of truth and scope

- Read the current source IDs, tab names, writable destinations, and rule settings from the reference and the workbook `Control` sheet.
- Treat original TPR, Renewal DB, plan-reference sheets, contracts, and emails as read-only during
  Build Queue and Audit. Maintain official RSV／RwG `Plan Code` values only through the explicit
  `maintainPlanCodes()` maintenance action after separate user authorization.
- Write only to the environment workbook identified by validated Script Properties. Test and Production
  must use different workbook and Apps Script project IDs. Even in Production, formal TPR, Renewal DB,
  TMS and Deposit sources remain read-only unless the user separately authorizes the explicit
  `maintainPlanCodes()` exception; normal audit output never means formal TPR writeback is authorized.
- Do not use `合約後補更新 Tool.xlsx` for this workflow.
- Resolve spreadsheet fields by normalized header title and mapping key, never by fixed column letter.

## Full-run workflow

When the user says「從頭跑一次續約流程」or equivalent:

1. Read TPR rows whose selection checkbox is `TRUE`.
2. Parse each selected row's `Demand` into one or more `YYYYMM` Renewal DB tabs.
3. Run or reproduce Build Queue using only those months. `buildQueue()` creates Queue data and sheet
   schemas only; it must not create blank-batch review rows.
4. Confirm the Queue preserves TPR identity and context fields and replaces only renewal-plan fields.
5. Explicitly create a new Review Batch after Queue build, then build one Branch-level review set from all
   Queue product rows for that Branch ID. Every current-batch Branch must have exactly one Contract
   Evidence and one Plan Classification identity row before extraction starts.
6. Open every contract, email, image, or folder linked by the selected branches and inventory the complete relevant evidence set for each Branch.
7. For PDFs or photographs, inspect every relevant page visually; OCR or extracted text is only an aid.
8. Before freezing Structured Contract Data, complete the evidence checklist for every Branch: inspect every relevant signature/seal page (including page 2, the final page and relevant folder attachments), locate explicit consent or designated written agreement evidence, confirm the renewal period, and preserve annual-payment amount plus quote/location or a document-only derivation with provenance. Text extraction alone cannot close a visual seal/signature field; run the field-local visual fallback defined by `references/structured-extraction.md` whenever the field requires visual evidence.
9. For a new structured review, follow `references/structured-extraction.md`, set `Structured Review Version=1`, and write provider-neutral `Structured Contract Data` containing the confirmed evidence set plus one structured object per document product. Freeze the document extraction before reading Queue plan values. Do not write `Document Match Result` or `Document Match Detail`; Apps Script calculates those fields. Do not use legacy `Full Plan Match` in structured mode; `Manual Plan Veto` is optional and only explicit text tokens defined by the authoritative reference can veto a calculated MATCH.
10. Complete Contract Evidence, Plan Classification, Special Approval, and Share Group reviews.
11. Decide each Branch using all products together, then write the same decision to every Queue product row for that Branch.
12. Write `Check=TRUE` only when every required check passes. Otherwise write `FALSE` and a concrete, one-line Note containing actual values and the required next action.
13. Verify counts, ensure every unchecked row has a nonblank Note, append Audit Log, and visually inspect the Queue.

Running the Apps Script audit alone is not a completed review. Codex must read the linked evidence, confirm the Branch's complete relevant evidence set, and fill the review facts before final Check decisions. Once structured mode is enabled, missing or invalid structured data is `NEEDS_REVIEW` and must never fall back to a legacy manual TRUE.

## Tools and evidence handling

- Prefer the connected Google Drive/Sheets tools for semantic spreadsheet and Drive reads/writes.
- Use the signed-in Chrome session only when an interactive menu, Apps Script UI, or visible page state is required.
- Use PDF rendering and page screenshots for scanned or image-only contracts.
- Read an entire email thread and all relevant files in a linked folder, not only the first attachment.
- Treat seal/signature pages, explicit consent, renewal dates and annual-payment provenance as mandatory evidence-completeness fields. OCR silence is not `NotMentioned`; inspect the relevant visual page or leave the field `Unreadable`/`Ambiguous`.
- Structured extraction may use Gemini or another document reader, but its output must follow the provider-neutral schema. The reader reports document facts and field states only; it does not decide MATCH/MISMATCH.
- Extraction safety is ordered `correct Confirmed` first, `Ambiguous` or `Unreadable` second, and guessed `Confirmed` last. A completed extraction has zero wrong-Confirmed fields; first-pass usability never justifies guessing.
- Normal passing products do not require page, location, or raw text. Preserve a source locator for mismatches, unreadable or ambiguous fields, bonus values, annual totals, Deposit rates, consent, seals, special evidence, or other manual-review exceptions when available.
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
