# TPR 續約 Queue 與合約覆核規格

本文件是專案內 TPR 續約檢查的主要業務規格。若舊規格、歷史 Queue Note 或舊腳本行為與本文件衝突，以本文件為準，並在修改程式前指出衝突。

## 目錄

1. 系統位置與權限
2. 完整處理流程
3. Queue 建立與欄位規則
4. 產品展開與格式
5. 合約／信件共同必檢項目
6. 原方案續約與方案變更
7. 付款週期與年繳金額
8. 短約 prorate
9. Deposit 規則
10. 方案家族與特殊申請
11. Share Plan
12. 異常阻擋
13. 覆核表與 Check／Note
14. 驗證與回報
15. 維護方式

## 1. 系統位置與權限

### 1.1 目前來源

| 資料 | ID／位置 | 權限 |
| --- | --- | --- |
| 正式 TPR | `1rZVU-n85eDh_ueaRyQojP8dSm4-MTeBz8frIyZynnb4` / `TPR` | 唯讀 |
| Renewal DB | `1tUOct-cJJY8854EAph9D0cxfiKz4qD1HFR2nXkPKWnc` / `{YYYYMM}` | 唯讀 |
| RSV／RwG 方案參照表 | `10ECF2b0yu6loRZqDl_4ynHOuc2yz-IAUjPirCj-dxvM` / `TMS 方案` | 唯讀 |
| Deposit 方案參照表 | `1QhNSdtg5TueFSoNBY8lFxXbtp_UktY1g8l7EUQWJ5kU` / `訂金方案` | 唯讀 |
| 測試工作簿 | `1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4` | 可寫測試分頁 |
| Apps Script | `1ideFb9UwKgQRheGCwInd7fxt5ZklqUrIK7EEbGnCOHOfHi06L1Ty3IfK` | 經使用者要求才修改 |

來源連結或分頁改變時，優先讀取測試工作簿 `Control` 的目前設定；不要把本表視為永遠固定。

### 1.2 寫入邊界

- 可寫：`TPR Update Queue`、`Contract Evidence Review`、`Plan Classification Review`、`Special Approval Review`、`Share Group Review`、`Audit Log` 及明確的設定表。
- 不可自行寫入：正式 TPR、Renewal DB、方案參照數值。唯一例外是經使用者授權後，程式可在 RSV／RwG 官方方案表新增並維護永久 `Plan Code` 欄；不得藉此修改任何方案內容。
- `Check=TRUE` 只代表測試 Queue 通過，不代表已獲授權寫回正式 TPR。

## 2. 完整處理流程

1. 讀取正式 TPR 中選取欄為 `TRUE` 的店家，不要求使用者列 Branch ID。
2. 從每列 `Demand` 解析續約月份，例如：
   - `2026/8月續約` → `202608`
   - `202607` → `202607`
3. 同一 Branch ID 出現互相矛盾的 Demand 月份時停止該店並註明衝突。
4. 只讀取實際需要的 Renewal DB 月份分頁。
5. 建立 Queue 後，以 Branch ID 彙整主產品與全部加購產品。
6. 逐份閱讀合約、信件、照片及資料夾內相關文件。
7. 填寫四張覆核表。
8. 完成 Branch 層級判斷，再將結果套用至該 Branch 的所有產品列。
9. 回填 Queue 的 `Check` 與單行 `Note`。
10. 驗證列數、未勾選原因、覆核者及日期，最後寫入 Audit Log。

## 3. Queue 建立與欄位規則

### 3.1 Queue 基底

- 先複製原始 TPR 的完整被選取資料作為基底，再以 Renewal DB 新方案欄位替換方案資料。
- 保留餐廳名稱、AM、Sales、Demand、Comment、合約連結，以及 TPR 後段更新欄位。
- Queue 前方欄位：

| 欄 | 內容 |
| --- | --- |
| A | 保留空白 |
| B | `Check` |
| C | `Note` |
| D | `Demand` |
| E | `Comment` |
| F | `合約` |

- 日期必須與 Renewal DB 完全相同，不得因時區轉換少一天。
- 原始 TPR 日期如果明顯錯誤，仍須阻擋並註明可能造成重複資料；不能只因 Renewal DB、Queue 與合約一致就忽略。

### 3.2 欄位定位

- 依正規化後的欄位標題、header group、occurrence 與 `Field Mapping` 定位。
- 禁止依欄位字母或固定欄序讀取 Renewal DB。
- Renewal DB 插入或新增欄位時，先更新 `Field Mapping`；只有無法以設定表表達的運算才修改程式。
- Renewal DB 每月份最後三欄：
  - `TMS Plan Type`
  - `Booking Notification and Type`
  - `Queuing Notification and Type`
  必須依標題讀取並帶入對應 TPR 欄位。
- `新長約方案` 寫入 `Long-Term Contract Notes`。

### 3.3 Renewal DB 找不到資料

- 原始 TPR 該 Branch 的資料原封不動保留，不可刪除，也不可產生餐廳／AM／Sales 空白列。
- `Check=FALSE`。
- Note 必須寫出缺少的月份、Branch ID 或必要欄位，以及「已保留原始 TPR」。

## 4. 產品展開與格式

- 可能的產品列：`RSV`、`RwG`、`Deposit`、`Deposit-Commission`、`Voice`、`Survey`、`eCoupon`。
- 主產品與加購產品均須帶入正確付款週期。
- 超額每組單價輸出至小數點後 3 位。
- 合約贈送組數最多保留小數點後 2 位。
- RSV 贈送組數為數值 `0` 時，Queue 顯示空白；比較時 RSV 空白與 0 視為沒有贈送。
- `unlimited` 是有效語意，不能轉為 0、空白或一般數值。
- 新增或移除產品都屬實質方案變更並需要人工確認。

## 5. 合約／信件共同必檢項目

每間店都必須檢查：

- 完整餐廳名稱及適用 Branch／群組成員。
- 合約起始日與結束日。
- 主產品和全部加購產品。
- 付款週期。
- 使用組數、贈送組數及價格。
- Share Plan ID 與共享條件。
- 超額計算方式與超額單價。
- Deposit 類型、費率、建立費、抽成或買入價格。
- 是否具有符合案件類型的同意或雙方用印。
- 是否涉及特殊方案、長約、短約或數值異常。

文件名稱、OCR 成功或檔案存在都不等於已確認。掃描 PDF／照片必須逐頁目視；店名換行、空白或常見 OCR 異體字需先正規化再比較。

Queue 的證據連結可以是 Drive 單一檔案或資料夾。資料夾案件必須閱讀其中所有與本次續約相關的檔案；`Reviewed Evidence File ID` 綁定 Queue 連結本身的檔案 ID 或資料夾 ID，並記錄實際覆核內容的檔案版本。`/file/d/<id>`、`/d/<id>`、`/folders/<id>` 與 `?id=<id>` 都是有效 Drive 連結格式。Queue 連結 ID 與覆核 ID 不一致時必須 `Check=FALSE` 並重新閱讀目前連結，不得沿用舊覆核。

## 6. 原方案續約與方案變更

### 6.1 原方案續約可接受的證據

文件仍須完整列出餐廳、期間與方案，並符合以下任一項：

1. 客戶在完整信件串中明確表示同意。
2. `inline-csm-team@inline.tw` 寄出指定書面確認文字：
   `貴我雙方已就「inline Apps 軟體系統租賃合約書」之續約方案達成合意，特此以本信件進行書面確認。`
3. inline 與客戶雙方用印的正式文件。

### 6.2 不視為換方案的正規化

- 原主產品年繳、加購月繳，續約轉換時將加購換成 `月費 × 12` 的年繳表示。這是單向正規化；不得反向將原年繳 add-on 改為月繳並視為原方案。
- 原合約為短約且金額／付費組數經 prorate，續約恢復完整一年與完整年度金額／組數。
- RSV 贈送組數空白與 0。
- Deposit 的不適用數值空白與 0，在合約也沒有對應費用時。

### 6.3 方案變更

以下均屬實質變更：

- 產品新增或移除。
- 使用組數、贈送組數、價格、付款週期或 Deposit 費率有實質改變；但第 6.2 節的 add-on `monthly → annual` 單向正規化除外。
- Share Plan 加入、退出或 ID 改變。
- 方案家族改變。

方案變更原則上必須有 inline 與客戶雙方用印的正式合約／增補協議；單純 Email 同意不足。Note 必須列出舊值、新值及缺少的證據。

## 7. 付款週期與年繳金額

### 7.1 主產品 annual

- Queue 轉換後的正費用 add-on 原則上寫為 annual，年度金額為月費 × 12；這是原方案續約的單向正規化。
- 從雙方用印合約或合格的完整 Email 串擷取文件明載的「年繳總額」。`Annual Payment Amount (NTD)` 必須是文件字面金額，並同時記錄 `Annual Payment Evidence Quote` 與 `Annual Payment Evidence Location`；不得由 Queue 加總回推。
- 文件年繳總額只與該 Branch 的 Queue 中 `付款週期=annual` 的固定方案合約價格加總比較。只正規化幣別文字、千分位與空白後做精確數值相等比較；不得容許 ±1 元或其他誤差。
- Queue 的 monthly add-on 不納入年繳總額；其月費仍必須在完整方案覆核中與文件逐項精確相等。交易費、抽成、信用卡處理費、超額與用量變動費用不納入固定年繳總額。
- RSV 年繳但任一正費用 add-on 續約後仍為 monthly 時，定義為 split-billing 例外。只有雙方用印合約可以支持，單純 Email 同意不足；Queue 必須保留該 add-on 為 monthly，文件年繳總額只包含 annual rows。
- 文件年繳總額、原文、位置、Queue annual 金額或 split-billing 用印任一缺失，或文件總額與 Queue annual 合計不完全相等，整個 Branch `Check=FALSE`；Note 必須列出文件總額、Queue 年繳合計、各 annual 產品金額與下一步。程式不得自動改寫 Queue 價格或付款週期。
- 價格為 0 的 Deposit／加購不影響年繳總額；例如 RSV 年費 12,000、Deposit 月費 0，總額 12,000 時可維持 Deposit annual。
- 無正費用加購時，不得只因沒有填年繳總額而阻擋。

### 7.2 主產品 monthly

- 加購原則上亦為 monthly。
- 不比年繳總額；逐項比較每月產品、組數與費用。

### 7.3 6mo／3mo

- 主產品為 `6mo` 或 `3mo` 時，一律 `Check=FALSE` 並交由人工確認。

## 8. 短約 prorate

- 按實際日曆月份天數計算，不使用固定 30 天制。
- 首月：`月費 × 首月涵蓋天數 ÷ 首月實際天數`。
- 中間完整月份：`月費 × 完整月份數`。
- 末月：`月費 × 末月涵蓋天數 ÷ 末月實際天數`。
- 同一月份內仍使用該月實際天數；例如 4/23～4/25 為 `月費 × 3 ÷ 30`。
- 日期採首尾日都計入。
- 年費／價格四捨五入為整數。
- prorate 後的付費組數四捨五入並最多保留小數點後 2 位。
- 贈送組數不做 prorate。
- 原短約續約為完整一年並回到完整年費／組數，可視為原方案續約。
- 新續約期間本身仍非完整一年，需特殊申請或人工確認。

## 9. Deposit 規則

### 9.1 B2B

- B2B Deposit 不建立 `Deposit-Commission` 產品列。
- B2B 對應數值直接寫在 Deposit 列的合約贈送組數／指定欄位。
- 不可因缺少 `Deposit-Commission` 列誤判為新增、移除或方案不完整。

### 9.2 空白與 0

- 原始 TPR 的 Deposit 贈送組數或超額單價空白，而 Renewal DB／Queue 為 0，且文件沒有交易服務費或建立費時，空白與 0 視為相同。
- 此等價規則只適用於確定為不適用的 Deposit 欄位，不可泛用至所有欄位。

### 9.3 B2C／Commission

- 合約寫抽成比例時，必須等於 Queue／Renewal DB 的 `Deposit-Commission` 比例。
- 合約寫買入價格時，應等於 `100% - 抽成比例`。
- 例如 Queue 抽成 5%，文件可寫抽成 5% 或買入價格 95%。
- 買入價格 100%、比例空白、數值不同或引用的商業協議缺失，都必須阻擋並列出文件值、Queue 值及正確應有值。

## 10. 方案家族與特殊申請

方案家族至少分為 `Public`、`BD New`、`Special`。

- 新方案參照的 `公版方案`、`Lite 方案`、`Email Only 方案` 均屬 `Public` 合規家族；來源方案名稱仍須保留供追溯。
- `BD 新方案` 屬 `BD New` 合規家族。
- 方案參照必須以同一來源列的產品、付款週期、使用組數、贈送組數、價格與超額單價作為不可拆分的完整組合，不得跨列拼湊。
- 正常流程只從測試工作簿的 `Legacy Branch Master` 讀取 Legacy cohort membership；`Build Queue` 與 `Run Contract Audit` 均不得掃描正式工作簿的 `Raw : TPR`。
- `Legacy Branch Master` 的 `Branch ID` 是方案世代的 membership 權威。`first contract date` 若存在只供追溯，不參與 Public／BD New 的 runtime 分類；日期空白或無法判讀不阻擋，但 Duplicate Branch ID 必須讓受影響 Branch `Check=FALSE`，Note 列出重複 rows。
- 舊方案完整組合只匹配 Public 時，不論是否列在 Legacy，均判為 `Public` 並以 Public 家族續約。
- 舊方案完整組合只匹配 BD New 時，Branch 不在 Legacy 才判為 `BD New`；若已列入 Legacy，membership 與方案家族衝突，必須人工確認。
- 舊方案完整組合同時匹配 Public／BD New 時，列在 Legacy 選擇 `Public`，不在 Legacy 選擇 `BD New`，並在 trace 說明是由 membership 解決重複組合。
- 新方案若同時匹配 Public／BD New，依已確認的舊方案家族選擇，確保續約維持原家族。Public ↔ BD New 不得自動轉換，須特殊申請／人工確認。
- 舊方案為 Special 或完全無法匹配時原則上需人工確認；舊／新完整商業方案相同的 `Special → Special` 可依既有特殊方案延續規則判斷。Special 改為標準方案時，列在 Legacy 的目標為完整 Public，不在 Legacy 的目標為完整 BD New；符合目標且有雙方用印時不需額外特殊申請。
- 合約起訖日不屬於方案身分；期間另由合約日期檢核。比較 Special 是否為同一方案時須比較主產品、全部 add-on、付款週期正規化、使用／贈送組數、價格、Share、超額及 Deposit 條件。
- 人工案件先寫 `Check=FALSE` 與具體 Note；使用者可直接在 Queue 勾選，但下次重跑會重新計算並覆蓋。不要建立永久人工世代 Override。
- `Plan Classification Review!Complete Plan Match` 明確填入 `FALSE`／`Fail` 時是人工 veto，Branch 不得 Ready；空白或 TRUE 仍繼續自動 Catalog 判斷，TRUE 不得覆蓋自動 conflict。
- `Canonical Plan Catalog` 以永久 `Plan Code` 及版本保存已確認方案；既有方案異動沿用原代碼並新增版本，新方案才建立新代碼。
- RSV／RwG 的 `Plan Reference Mapping` 必須由同步流程依官方 `TMS 方案` 的 row-package 欄位重建；不得再保留舊公版／BD 分頁的 column-package Mapping。Deposit Mapping 原封保留。
- 官方方案表的既有方案修改或刪除，必須進入 `Plan Catalog Change Review`。尚未核准時沿用上一個已確認版本，受影響 Branch 不得通過；其他 Branch 不受影響。刪除核准後標為 `Inactive`，不得刪除歷史版本。

| 舊方案 → 新方案 | 特殊申請 |
| --- | --- |
| Public → 完整 Public | 不需；若內容有變仍須雙方用印 |
| BD New → 完整 BD New | 不需；若內容有變仍須雙方用印 |
| Public ↔ BD New | 需特殊申請／人工確認 |
| Special → 完全相同 Special | 既有特殊方案延續，不需重新申請 |
| Special → Legacy membership 對應的完整 Public／BD New | 已有雙方用印合約時，不需額外特殊申請 |
| Special 有實質異動或新方案仍非完整公版／BD 組合 | 需特殊申請 |
| 無法確認方案家族或完整組合 | 不得通過，Note 說明缺少哪個對應 |

需要特殊申請時，必須有核准狀態、佐證連結、覆核者及日期；缺一不可。

兩年長約或 `Long-Term Contract Notes` 顯示長約時，一律另交人工確認，即使合約、Renewal DB 與 Queue 一致。

## 11. Share Plan

- 依續約後 Share Plan ID 組成群組。
- 共享超額單價使用群組所有方案中的最高值。
- 因「組內取最高值」造成超額單價變動，不視為特殊方案變更。
- 仍須確認所有成員、Renewal DB、Queue 與合約都使用相同最高單價。
- 檢查完整成員、統編、期間、方案與超額條件。
- Share Plan ID 由有值變成空白，需人工確認共享關係是否確實解除。
- 同一份群組合約可覆蓋多個 Branch，但各 Branch 可依自身問題分別通過或不通過；不要因一店失敗而自動讓所有店失敗。

## 12. 異常阻擋

即使原始 TPR、Renewal DB、Queue 與合約一致，下列情況仍不得自動通過：

- RSV 贈送組數／使用組數超過警示門檻；目前預設警示比例為 12%，一般參考約 8.3%。
- 贈送組數明顯超過相同使用組數的公版或 BD 新方案。
- 買入價格 100% 或其他不合理費率。
- 合約標示暫停、作廢，或所附文件不是本次續約文件。
- Renewal DB／Queue 與合約付款週期或日期不同。
- 原始 TPR 日期明顯錯誤，可能造成歷史資料重複。
- 兩年長約。
- 方案需要特殊申請但尚未核准。
- 無法讀取完整文件、完整信件串、餐廳名稱、期間或完整方案。

贈送比例門檻應從 `Control` 讀取；要調整時先改設定，不要硬改程式。

## 13. 覆核表與 Check／Note

### 13.1 覆核表

| 分頁 | 必填內容 |
| --- | --- |
| Contract Evidence Review | 證據類型、名稱／期間／完整方案、客戶同意、指定信箱、雙方用印、付款週期、文件日期、Deposit 費率、文件年繳總額及其逐字原文／位置、覆核者、日期、狀態、Notes |
| Plan Classification Review | Legacy membership、選填首約日、預期家族、舊／新方案家族、舊／新 Plan Code、匹配規則、例外、覆核者、日期、Notes；明確 FALSE／Fail 為人工 veto |
| Special Approval Review | 是否需要、核准狀態、佐證、覆核者、日期、Notes |
| Share Group Review | 成員、統編、合約、超額單價、狀態、覆核者、日期、Notes |

只有合約連結而沒有覆核內容，不算完成。

### 13.2 Check

- Branch 的所有產品列採同一 Branch 結果。
- 所有必要條件通過才填 `TRUE`。
- 任一必要條件缺失、矛盾或需要人工確認時填 `FALSE`。
- 不同 Branch 即使共用同一合約，仍可分別判斷。

### 13.3 Note

- 使用一列文字，不加 `[合約檢查]` 前綴。
- 通過時簡短說明已確認的證據類型。
- 未通過時寫明：
  1. 檢查項目；
  2. 原始 TPR、Renewal DB／Queue、文件的實際值；
  3. 為什麼不符合；
  4. 使用者下一步需補什麼或確認什麼。
- 禁止只寫「方案有變更，需人工確認」或「尚未確認完整方案」而不指出卡點。

## 14. 驗證與回報

每次完整流程完成後必須驗證：

- selected Branch 數與 Queue Branch 數。
- Queue 產品列總數。
- 通過／未通過的 Branch 數。
- 勾選／未勾選的產品列數。
- 所有 `Check=FALSE` 列的 Note 均非空白。
- 每個 Branch 的合約證據都已覆核。
- 所有特殊申請與 Share Plan 都有對應狀態。
- Audit Log 已新增本次批次紀錄；Build Queue 的 Operation 為 `Build Queue`，合約稽核的 Operation 為 `Contract Audit`，不得混用。
- Queue 畫面重新整理後，Check 與 Note 可見且格式正常。

回報時同時列出 Branch 數與產品列數，避免將兩者混為一談。

## 15. 維護方式

| 變動 | 優先更新位置 |
| --- | --- |
| Renewal DB 插入、改名或新增欄位 | `Field Mapping` |
| 新公版、BD、Deposit 方案 | 方案參照及 Plan Reference Mapping |
| RSV／RwG 既有方案修改、刪除或新增 | 官方方案表 `Plan Code`、`Canonical Plan Catalog`、`Plan Catalog Change Review`；既有修改／刪除須核准 |
| Legacy cohort 分頁／Branch ID 欄名 | `Control` 的 `Legacy Branch Master Tab`、`Legacy Branch ID Header`；首約日期只供選填追溯 |
| 新產品或展開方式 | Product Expansion Rules |
| 贈送比例等門檻 | `Control` |
| 新的業務判斷規則 | 本文件 |
| 設定表無法表達的演算法 | `RenewalQueue.gs` 或 `ContractAudit.gs` |

修改任何規則後，先以測試 Queue 驗證，不得直接寫回正式 TPR。
