# Weekly Production Renewal Audit

Use this prompt for each new weekly Production Renewal Audit. Business rules are defined by the repository Skill and authority references; this prompt only controls execution workflow and safety boundaries.

```text
請使用 repository 內的 `$tpr-renewal-contract-audit` skill，從頭執行本週正式 Production Renewal Audit。

這是全新的稽核批次，不是延續上一批結果。

執行前請先確認：

- repository 使用最新正式 `main`
- `git fetch origin` 後 local main == origin/main
- working tree clean
- 不在 diagnostic / feature branch 上執行正式 Audit
- Production workbook / Production Apps Script project identity 正確

若上述任一項不符合，立即停止並回報。

執行前完整讀取：

- `AGENTS.md`（若存在）
- `.agents/skills/tpr-renewal-contract-audit/SKILL.md`
- `.agents/skills/tpr-renewal-contract-audit/references/structured-extraction.md`
- `.agents/skills/tpr-renewal-contract-audit/references/contract-audit-rules.md`

不要重新定義或自行收緊 business rules；完全依 repository 目前正式 Skill、authority references 與 regression-defined behavior 執行。

## Production workflow

請使用「TPR Renewal Audit - Production」，完整執行 mandatory workflow：

1. 執行環境與 write-scope preflight。
2. 從目前 Original TPR 的 `Check Box=TRUE` 與 Demand 重新執行正式 `buildQueue()`。
3. 完成 Queue integrity validation，確認：
   - Branch / Product / source identity 正確
   - Contract Start / End 完整
   - deterministic commercial fields 與寫入前 expected values 一致
   - Sheets error values = 0
   - Build post-write integrity guard = PASS
   - standard filter = none
   - current Queue rows 全部 visible
   - current rows checkbox validation 完整
   - current Queue 最後一列以下 tail checkbox validation = 0
4. 保留所有 historical batches，不得刪除、清空或覆寫歷史資料。
5. 依既有安全 rollover 流程建立全新的 Production Review Batch。
6. 每個 current Queue Branch 在新 Batch 中只能有一筆 current-batch review identity。
7. 重新開啟目前 Queue 全部 Branch 的完整 evidence：
   - 合約
   - Email
   - 圖片／掃描文件
   - Folder 內所有 relevant files
8. 依 mandatory visual fallback 與 evidence completeness 規則逐頁檢查：
   - 餐廳／Branch identity
   - 產品方案與費用
   - 合約期間
   - 年繳金額與 provenance
   - 雙方用印／簽名與 seal ownership
   - Email consent / agreement confirmation
   - Share coverage
   - Deposit / Deposit-Commission
   - 其他目前 authority 定義的必要 evidence
9. 重新產生 provider-neutral Structured Contract Data。
10. 執行 Share、Tax ID、Deposit、Survey／Voice、Annual Payment、Contract Evidence、Special Approval、Long-term 及其他既有 Protected Policies。
11. 執行完整 `runContractAudit()`。
12. 回讀 Queue、current-batch review rows、Structured Contract Data、Document Match、Final Check、Check、Note、Update Status 與 Audit Log，完成 Final validation。

## 從頭開始的必要限制

- 不得沿用上一批 Structured Contract Data。
- 不得沿用上一批 extraction、OCR、visual findings 或 Document Match Result。
- 不得把 historical review values 當成 current evidence。
- 不得因 Drive File ID、modified time 或 evidence URL 沒變，就跳過重新開啟與閱讀。
- 不得使用 Queue expected value 反推文件內容。
- 無法確認時使用 `Ambiguous / Unreadable / NEEDS_REVIEW`，不得猜測。
- Wrong-Confirmed 必須為 0。

## Evidence access

Evidence 優先透過直接 read-only 方式開啟：

- Browser / Chrome
- Google Drive viewer
- read-only Drive connector

不要將合約／PDF／evidence 下載或保存到我的本機作為正式 Audit fallback。

若無法可靠完整閱讀，使用 `Unreadable / NEEDS_REVIEW`，不要沿用歷史結果或猜值。

## Upstream safety

以下正式 upstream sources 全程 read-only：

- Original TPR
- Renewal DB
- TMS 方案
- Deposit 方案
- Chargebee Import Master Sheets

不得執行 `maintainPlanCodes()`。

所有正常 mutation 只能發生於「TPR Renewal Audit - Production」及其 Production Apps Script project。

## Stop conditions

若確認發生以下任一項，立即停止並回報，不要自行修補或放寬規則：

- repository / Production environment identity 不符
- Queue post-write integrity guard FAIL
- external source write risk
- Active Batch conflict
- historical overwrite
- duplicate / missing current-batch identity
- Wrong-Confirmed
- confirmed wrong MATCH / MISMATCH / Ready
- Protected Policy unexpected behavior change

以下屬於正常 Audit outcome，不需要中止整批：

- Hard FALSE
- Manual Review
- NEEDS_REVIEW
- Ambiguous / Unreadable evidence

## 完成後回報

請回報：

- Current `origin/main` SHA
- Previous Active Batch ID
- New Active Batch ID
- Branch count
- product row count
- Build guard result
- Contract Start / End completeness
- filter state
- current checkbox validation count
- tail checkbox validation count
- Evidence file count
- full-document reread count
- visual fallback cases / fields
- Document MATCH / MISMATCH / NEEDS_REVIEW
- Ready / Hard FALSE / Manual Review
- 每筆 Hard FALSE / Manual Review 的 Branch + 具體 Note
- Wrong-Confirmed count
- historical overwrite count
- external source writes
- duplicate / missing current-batch identity count
- Audit post-write guard result
- structured extraction elapsed time
- `runContractAudit()` execution time
- total elapsed time

不要修改 Skill、business rules 或 runtime code；本次只是依正式 repository 執行新一批 Production Audit。
```
