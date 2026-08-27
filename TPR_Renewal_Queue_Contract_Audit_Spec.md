# TPR 續約 Queue 建立與合約稽核規格書

## 1. 目的與範圍

本流程將 TPR 中標示需續約檢查的分店，依 Renewal DB 的「新方案」轉成正式 TPR 格式的 Queue，並以合約／信件、方案規則、特殊申請及 Share Plan 條件進行稽核。

流程只可寫入經 Script Properties 驗證的 Test 或 Production Audit workbook；**Build Queue／Run Contract Audit 不得寫回原始 TPR、Renewal DB 或任何方案參照表**。Test／Production 必須使用不同 workbook 與 Apps Script project。官方 RSV／RwG 方案表的永久 `Plan Code` 只能在使用者另行授權並明確執行 `maintainPlanCodes()` 時補入空白 cell。

最終輸出為 Queue 前方的：

| 欄位 | 用途 |
| --- | --- |
| A | 保留空白，讓畫面較乾淨 |
| B `Check` | 全部檢核通過時才可為 `TRUE` |
| C `Note` | 單行、清楚說明目前結果或待處理原因 |
| D `Demand` | 從原始 TPR 帶入，決定 Renewal DB 月份 |
| E `Comment` | 從原始 TPR 帶入 |
| F `合約` | 從原始 TPR 帶入的合約／信件連結 |

## 2. 系統與資料來源

| 名稱 | 角色 | 寫入權限 |
| --- | --- | --- |
| 原始 TPR | 選取分店、舊方案、Demand、Comment、合約連結、後段更新欄位來源 | 唯讀 |
| Renewal DB | 續約月份及新方案資料來源 | 唯讀 |
| 方案參照表 | 公版、BD 新方案、訂金方案與方案家族判斷來源 | 唯讀 |
| Audit 工作簿 | Control、設定表、Queue、快照、覆核表、Audit Log | 只可寫目前環境明確指定的 workbook |

目前測試工作表 ID：`1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4`。

Production target 不得硬編碼。Apps Script 必須以 `ENVIRONMENT`、`TARGET_WORKBOOK_ID`、
`EXPECTED_WORKBOOK_NAME` 與四個 source ID Script Properties 做首次寫入前的 fail-closed identity check。
`buildQueue()` 只建立 Queue 與 review schemas；Review Batch 與 current-batch rows 由後續明確 action 建立，
不得產生 blank-batch historical rows。

## 3. 批次選取規則

1. 原始 TPR 的欄位標題 `Check Box` 值為 `TRUE` 的列，為本批需處理資料。
2. 不需要指定 Branch ID；`Control!Selected Branch IDs` 只是舊的手動備援，不在此模式使用。
3. 每列的 `Demand` 決定 Renewal DB 分頁：
   - `2026/8月續約` → `202608`
   - `202607` → `202607`
4. 同一 Branch ID 不應同時有不同的 Demand 月份；若有，必須停止處理並要求人工釐清。
5. 依 Demand 收集月份後，只讀取 Renewal DB 對應的 `YYYYMM` 分頁。

## 4. Queue 建立規則

### 4.1 Queue 基底

1. 先複製原始 TPR 被勾選的產品列作為 Queue 基底，不可只生成方案欄位。
2. 必須保留分店名稱、AM、Sales、Demand、Comment、合約連結與原始 TPR 後段欄位。
3. 原始 TPR 的 `H:AO` 更新資訊必須一併帶到 Queue。
4. 日期必須與 Renewal DB 完全相同，不得因時區轉換少一天。Queue 以目標工作簿時區寫入不含時間成分的日期值；所有日期判斷先正規化為 `yyyy-MM-dd`，只比較年月日並忽略時、分、秒。
5. 合約贈送組數格式至少為小數點後 2 位；超額每組單價至少為小數點後 3 位。

### 4.2 Renewal DB 新方案覆寫

新方案欄位必須依「欄位標題／設定表」定位，不得依欄位字母或固定欄位位置讀取。

主要覆寫資料如下：

| Queue 欄位 | Renewal DB 資料 |
| --- | --- |
| 合約起始日 | 新方案開始日 |
| 合約結束日 | 新方案結束日 |
| 付款週期 | 新方案週期，適用於所有產品列 |
| Long-Term Contract Notes | 新長約方案 |
| TMS Plan Type | TMS Plan Type |
| Booking Notification and Type | Booking Notification and Type |
| Queuing Notification and Type | Queuing Notification and Type |

產品列規則：

| 原始產品列 | 轉換規則 |
| --- | --- |
| `RSV`、`RwG` | 新主產品、組數、贈送組數、價格、Share Plan、超額計算與單價均由 Renewal DB 新方案帶入 |
| `Deposit` | 帶入付款週期、訂金費用、B2B/B2C 類型、設定費；B2B 的佣金組數依指定欄位處理 |
| `Deposit-Commission` | 僅用於 B2C，帶入 Credit Card／Virtual ATM 等佣金比例；不填不適用的主產品價格與 Share Plan。合約／信件中的抽成或買入價格必須另行與此比例比對。B2B 交易服務費仍留在 `Deposit` 指定欄位，不建立此產品列 |
| `Voice`、`Survey`、`eCoupon` | 帶入付款週期；金額依付款週期換算後填入合約價格 |

### 4.3 找不到 Renewal DB 資料

若 Renewal DB 找不到該 Branch ID 或資料不足：

1. Queue 仍要保留原始 TPR 的完整產品列，不可刪除分店或留下空白餐廳／AM／Sales 列。
2. `Check = FALSE`。
3. `Note`：`Renewal DB 資料不足，已保留原始 TPR 方案，需補齊資料後再檢核。`
4. `Update Status = Need Renewal Data`。

## 5. 設定表與可維護性

所有欄位、方案與規則必須可設定，不應在程式中硬編欄位字母。

| 設定表 | 用途 | 何時更新 |
| --- | --- | --- |
| `Control` | 資料來源 ID、TPR 分頁、選取模式、Demand 欄位、Renewal DB 分頁樣式 | 來源連結、分頁或選取規則變更時 |
| `Field Mapping` | Renewal DB 欄位標題 → 轉換用 Mapping Key | Renewal DB 插入、改名或新增欄位時 |
| `Plan Value Rules` | Renewal DB 新方案週期 → 主產品與付款週期輸出 | 新增／調整方案週期時 |
| `Product Expansion Rules` | 各 TPR 產品列的展開與輸出規則 | 新增產品、訂金或附加產品時 |
| `Plan Reference Mapping` | 方案名稱／家族／特殊方案分類 | 公版、BD 新方案、特殊方案異動時 |

更新原則：先改設定表，再執行 Build Queue；只有設定表無法表達的新運算規則才修改程式。

## 6. 合約稽核規則

### 6.1 必檢資料

合約、增補協議或信件都必須可確認：

1. 完整餐廳名稱。
2. 合約起訖日。
3. 完整方案內容：產品、付款週期、組數、贈送組數、價格、Share Plan、超額計算方式與單價等適用條件。

PDF 或照片中的雙方用印需要人工目視確認；OCR 或檔案存在本身不可當作用印已確認。

Queue 的合約欄可連到 Drive 單一檔案或資料夾。資料夾必須展開並閱讀所有與本次續約相關的內容；覆核紀錄以 Queue 連結的檔案 ID／資料夾 ID 綁定目前證據，並保存實際覆核檔案的版本資訊。程式必須能解析 `/file/d/<id>`、`/d/<id>`、`/folders/<id>` 與 `?id=<id>`；連結 ID 與 `Reviewed Evidence File ID` 不一致時不得沿用先前結果。

### 6.2 原方案續約

原方案續約不只限於 Queue 與原始 TPR 每個欄位字面完全一致。下列「續約格式正規化」不視為換方案：

1. 原方案的附加服務付款週期與年繳主產品不同，但續約時依規則統一為年繳。比較時必須把原正費用附加服務的月費換成年度基準；例如原始 TPR 的 Deposit 月費 1,500 元，Queue 轉為 annual 18,000 元（1,500 × 12），仍屬原方案續約。此例外只允許 `monthly → annual`；`annual → monthly` 仍是方案變更。
2. 原方案是短約，續約時改回完整一年，因而把年費與主產品組數由 prorate 金額還原為完整年費／完整年組數。
3. RSV／RwG 主產品的「合約贈送組數」空白與數值 `0` 都代表沒有贈送組數，兩者比較時視為相同。此規則只適用於主產品，不可套用到 Deposit-Commission 等具有比例意義的欄位。

RwG structured comparison／normalization 暫不屬本次自動化優化範圍；RwG 是否可通過仍必須經既有 Special Approval gate。

符合本節的例外後，才可接受以下任一佐證：

1. 完整信件中客戶有清楚表達同意續約。
2. 寄件者為 `inline-csm-team@inline.tw` 的信件，含指定達成合意文字。
3. 有 inline 與客戶雙方用印的文件。

指定文字為：

`貴我雙方已就「inline Apps 軟體系統租賃合約書」之續約方案達成合意，特此以本信件進行書面確認。`

### 6.3 付款週期與年繳總額判斷

續約 Queue 的預設輸出為：RSV 為 annual 時，正費用 add-on 也正規化為 annual，金額為月費 × 12。這個單向正規化不視為換方案。

覆核者必須從合約／完整信件串擷取文件明載的年繳總額，並記錄原文與位置。若文件沒有單一總額欄，但同一 Branch 的產品固定費均為文件內 Confirmed facts，可以從這些 document facts 推導年度總額；必須保存計算式、逐項 quote／location／source，不得由 Queue 加總回推。程式只比較：

`Document annual payment amount = SUM(Queue 固定費用 rows 中 billing period = annual 的合約價格)`

比較前只移除幣別、千分位與空白，不得容許 ±1 元或其他誤差。Monthly add-on 不納入年繳總額；其月費由完整方案覆核逐項與文件比較。交易費、抽成、超額、信用卡處理費與用量變動費用不納入固定金額加總。

RSV annual 但正費用 add-on 續約後仍為 monthly 時，是 split-billing 例外：Queue 必須保留該 add-on 為 monthly，年繳總額只包含 annual rows，並必須有 inline 與客戶雙方用印合約；Email 同意不足。若 Queue 反而把該 add-on 寫為 annual，文件與 Queue 總額不一致，整個 Branch `Check=FALSE`。

金額為 0 的附加服務不影響總額。有正費用 add-on 時，年繳總額、證據原文或位置任一缺失即待人工覆核；文件金額與 Queue annual 合計不完全相等時為合約不一致。程式只寫 `Check` 與具體 Note，不自動修正 Queue 金額或付款週期。

若 Queue 沒有任何正費用附加服務（只有主產品，或附加服務價格皆為 0），年繳總額不再是判斷附加服務付款週期的必要欄位，不得因未填入該欄而阻擋案件。若合約明載「加值服務：無」，應直接視為無附加服務歧義。

Share／多店合約必須先依文件店別方案列建立各 Branch 的 document-based annual amount，再用完整成員合計核對 group total。例如 10 店各 24,000 元、合約總年繳 240,000 元時，每個 Branch 的 `Annual Payment Amount (NTD)` 仍是 24,000；240,000 只作 shared total cross-check，不得取代單店證據或逐店寫入。

### 6.3.1 PDF／信件文字正規化

餐廳名稱比對前必須先做 Unicode NFKC、移除換行與多餘空白，並正規化 PDF／OCR 常見部件字形，例如 `⺠ → 民`、`⽂ → 文`、`⽵ → 竹`。附件表格因欄寬換行造成的店名拆行，不得視為名稱不一致。文字擷取失敗或疑似掃描型 PDF 時，必須逐頁轉成影像目視或 OCR 後再判斷，不得直接把所有比對欄位設為 FALSE。

### 6.4 短約 prorate 與完整一年續約

年繳方案若原合約不是完整一年，年費、主產品組數與有固定年費的附加服務依實際日曆月份天數 prorate。贈送組數**不得** prorate。

設完整年費／完整年組數為 `A`、起始月實際天數為 `L1`、起始月涵蓋天數為 `D1`、中間完整月份為 `M`、結束月實際天數為 `L2`、結束月涵蓋天數為 `D2`：

`短約金額或組數 = (A / 12) × (D1 / L1 + M + D2 / L2)`

日期首尾日都計入；若起訖日在同一月份，直接使用 `A / 12 × 涵蓋天數 / 該月實際天數`，不得重複計算首月與末月。價格與付費組數只在最終結果四捨五入，日期不得套用固定 30 天或把 31 日改為 30 日。

例：完整年費 21,600 元，月費 1,800 元；合約期間為 `2026-04-23` 至 `2026-09-15`：

`1,800 × 8 / 30 + 1,800 × 4 + 1,800 × 15 / 30 = 8,580`（本例的 4 月與 9 月都恰為 30 天；其他月份必須使用各自的實際天數）

若原方案的短約金額／主產品組數符合上述公式，而 Renewal DB 的續約期間為完整一年、金額／組數回到完整年度數值，應判定為**原方案續約**，不要求雙方用印作為換方案佐證。

「完整一年」定義為：結束日等於起始日隔年同日的前一天，例如 `2026-08-16` 至 `2027-08-15`。若年繳續約本身仍非完整一年，無論金額是否 prorate，均須特殊申請核准；未核准時 `Check = FALSE`。

### 6.5 換方案／增減產品續約

除 6.3、6.4 定義的原方案續約正規化外，產品、期間、價格、組數、贈送組數、Share Plan、超額條件等變更，均視為方案變更。

若 `Share Plan ID` 從原始 TPR 的有值變成 Renewal DB／Queue 空白，代表可能移除 Share Plan，必須維持 `Check = FALSE` 並人工確認，不得當成原方案續約自動通過。

方案變更必須有：

- 雙方用印的正式合約或增補協議；且
- 餐廳名稱、期間與完整方案均一致。

單純 Email 同意不可取代方案變更所需的雙方用印。

## 7. 方案家族、特殊申請與 Share Plan

### 7.1 方案家族

每個 Branch ID 必須在 `Plan Classification Review` 填入：

- `Original Plan Family`：`Public`、`BD New` 或 `Special`
- `New Plan Family`：`Public`、`BD New` 或 `Special`
- `Complete Plan Match`：完整方案是否匹配；明確填入 FALSE／Fail 時是人工 veto，空白或 TRUE 仍繼續自動 Catalog 判斷，TRUE 不得覆蓋自動 conflict

新方案參照的 `公版方案`、`Lite 方案`、`Email Only 方案` 均歸入 `Public` 合規家族；`BD 新方案` 歸入 `BD New`。每一來源列代表一個不可拆分的完整方案組合，產品、付款週期、使用組數、贈送組數、價格與超額單價不得跨列拼湊。

方案世代只讀測試工作簿 `Legacy Branch Master` 的 Branch ID membership，正常流程不得掃描 `Raw : TPR`。`first contract date` 若存在只供追溯，不參與 runtime 分類；日期空白／無效不阻擋，但 Duplicate Branch ID 必須阻擋受影響 Branch 並在 Note 列出 rows。舊方案只匹配 Public 時不論 membership 均屬 Public；只匹配 BD New 時須同時不在 Legacy 才屬 BD New，若已列入 Legacy則為 conflict；同時匹配 Public／BD New 時，列在 Legacy 選 Public，不在 Legacy 選 BD New。新方案重複匹配時維持舊方案家族，Public ↔ BD New 不得自動轉換。Special 完全不變可依既有方案延續；Special 改為標準方案時，列在 Legacy 的目標為 Public，不在 Legacy 的目標為 BD New。合約日期另行檢核，不列入方案身分比較。

`Legacy Branch Master` 是 Legacy cohort membership 的唯一主檔；`Canonical Plan Catalog` 以永久 Plan Code 及版本保存方案。Build／Audit 每次唯讀最新 `TMS 方案` 做 Catalog diff；supported row 缺 Plan Code 時 fail closed。新方案只由另行授權的 `maintainPlanCodes()` 對空白 cell 配發永久代碼，完成後重新同步才建立 Catalog v1 Active。既有方案異動沿用代碼並留下版本。同步時一併把 RSV／RwG 的 `Plan Reference Mapping` 改為官方 `TMS 方案` 的逐列完整方案版型，並保留 Deposit Mapping。官方方案修改／刪除若尚未在 `Plan Catalog Change Review` 核准，受影響 Branch 不得通過；核准刪除後保留歷史並標為 Inactive。

判斷規則：

| 舊方案 → 新方案 | 結果 |
| --- | --- |
| Public → Public | 可通過，不需特殊申請 |
| BD New → BD New | 可通過，不需特殊申請 |
| Special → Special，且完全不變 | 既有特殊方案延續，不需重新申請 |
| Public ↔ BD New | 必須特殊申請核准 |
| Special → Legacy membership 對應的完整 Public／BD New | 有雙方用印時不需額外特殊申請 |
| Special 異動、Special 改為非 membership 對應家族、家族未知 | 必須特殊申請或人工釐清 |

### 7.2 特殊申請

若需特殊申請，`Special Approval Review` 必須有：

- `Approval Status = Approved`
- 核准佐證連結
- 覆核者
- 覆核日期

否則 `Check` 必須維持 `FALSE`。

### 7.3 Share Plan

若 Queue 有 `Share Plan ID`，`Share Group Review` 必須確認：

- 完整成員店家
- 統編
- 合約期間
- 超額條件
- 覆核狀態

AI 覆核時應以 Share Plan ID 為單位一次處理整組，不得等使用者逐店指出。若同一份合約附件已列出完整成員、公司統編、各店期間、價格與超額條件，應直接回填一次 `Share Group Review`，並把結果套用到該 Share ID 的全部 Queue 分店。

任一項未確認，該 Share Plan 所屬分店不可通過。

### 7.4 贈送組數合理性

原方案續約只代表不需要重新判定為換方案，不代表歷史方案數值一定正確。RSV 贈送組數必須另外通過合理性檢查：

- 先以相同使用組數比對公版方案及 BD 新方案的最高贈送組數。
- 預設容許上限為參照贈送組數加上 `MAX(參照 × 20%, 50 組)`。
- 贈送比例超過 12%，或超過參照容許上限：需人工確認，`Check = FALSE`。
- 贈送比例超過 30%，或超過參照贈送組數 2 倍：嚴重異常，`Check = FALSE`。
- 找不到相同使用組數的參照時，仍以贈送比例判斷。
- 即使原始 TPR、Renewal DB 與合約三者一致，超出上述門檻仍不得自動通過；應確認歷史資料是否誤植，或取得特殊核准。

門檻由 `Control` 的下列設定控制，不必修改程式：

- `Bonus Warning Ratio`
- `Bonus Critical Ratio`
- `Bonus Warning Multiplier`
- `Bonus Critical Multiplier`
- `Bonus Minimum Extra Groups`

## 8. 覆核表

| 表單 | 人工輸入內容 |
| --- | --- |
| `Contract Evidence Review` | 證據類型、名稱／期間、合約實際起訖日、客戶同意、指定文字、雙方用印、年繳總額及其逐字原文／位置、付款週期、Deposit 抽成／買入價格、Structured Review Version、provider-neutral Structured Contract Data、structured-only Manual Plan Veto，以及 Apps Script 計算的 Document Match Result／Detail、覆核者、日期與狀態 |
| `Plan Classification Review` | Legacy membership、選填首約日、預期家族、舊／新方案家族、舊／新 Plan Code、匹配規則、例外、覆核者與日期；明確 FALSE／Fail 為人工 veto |
| `Special Approval Review` | 特殊申請核准結果、佐證、覆核者與日期 |
| `Share Group Review` | 成員、統編、期間、超額條件、最終狀態 |

僅有 Queue 的合約連結不代表已完成檢查。若覆核表只有連結、沒有覆核結果，應顯示為待覆核。

新版 structured review 使用 `Structured Review Version=1`。`Control!Active Contract Review Batch ID` 有值時，只讀取 `Review Batch ID` 相同的 current-batch rows；每個 Queue Branch 必須恰好一列，缺列或重複列均 fail closed，其他／blank batch rows 一律是 historical。Current-batch row 本身即代表 structured intent；Version 或 `Structured Contract Data` 任一缺失、JSON 無效、schema 不支援或 extraction 無法完成，必須 `NEEDS_REVIEW`，不得靜默沿用 historical `Full Plan Match=TRUE`。只有 Active Batch ID 空白的 legacy mode 才保留原本 selection／fallback。

Active Batch mode 的 structured intent 只由 current-batch row 決定；其他 batch／blank-batch historical rows不得遮蔽、補足或與 current row 形成 duplicate。Active Batch ID 空白的 legacy mode 才在原本 eligible rows 中套用既有 structured-intent 規則：任一列只要 Version 或 JSON 任一有值即不得回讀較早的 legacy `Full Plan Match`。

`Structured Contract Data` 只記錄 reader 從文件擷取的事實，schema 不綁定 Gemini。Gemini、其他 PDF reader 或 image/scanned-file reader 均輸出相同 schema；`Document Match Result` 與 `Document Match Detail` 只能由 Apps Script 計算並寫入，reader／skill 不得直接填入 MATCH／MISMATCH 作為 authority。

Structured mode 不使用 `Full Plan Match`。人工否決只讀 `Manual Plan Veto`，且僅接受明確文字 `Fail`、`Failed`、`FALSE`、`不通過` 或 `不一致`；blank、boolean `false` 或其他文字都不否決。Legacy mode 則完全保留既有 `Full Plan Match` 判斷。

`Contract Evidence Review` 的 schema migration 全部依 header name 執行：既有欄 reuse，缺少的新版欄 append 到最右側，舊版額外欄保留且不重新排序。新增 review row 依 Sheet 實際 headers／column count 建立，只填 Branch ID、Evidence URL 與 `Structured Review Version=1`。必要 header duplicate 或 mapping 不明確時，在任何 write 前 fail closed；Document Match Result／Detail 也只能依 header name 定位寫入。

Document Match writer 只能依 index 傳遞的 `targetRowNumber`、Review Batch ID、Version 與 JSON snapshot 寫入。Active Batch mode 下，真正寫入前必須以最新 Sheet snapshot 重新確認 target Branch／Batch identity、current-batch row 唯一性，以及 Version／JSON 與 indexing snapshot 完全一致；任一改變均 zero writes 並 fail closed。其他 batch／blank-batch historical rows不參與 current uniqueness，亦不得被更新。Active Batch ID 空白時才沿用原本 legacy writer preflight。

`Plan Classification Review` 的人工輸入與 trace writer 也必須使用同一個 Active Batch identity。Active Batch ID 有值時，每個 Queue Branch 只讀取 `Review Batch ID` 相同且唯一的 current row；缺列或 duplicate 均 fail closed，不得 fallback 或寫入同 Branch 的 historical row。Trace writer 必須使用 indexing 傳遞的 `targetRowNumber`，並在任何寫入前以最新 Sheet snapshot 原子檢查 Branch ID、Review Batch ID、current-batch 唯一性與 row number；任一不符即全批 zero writes。Active Batch ID 空白時才維持 legacy first-matching-row 行為。

Schema 必須包含 `evidence_set.state`、`complete` 與 `relevant_source_ids`。`complete=true` 代表已盤點該 Branch 的完整 relevant evidence set，不是只讀完單一 PDF。Folder 不要求每個檔案都做完整產品 extraction，但必須先辨識全部 relevant files；無法確認完整性時標記 `Ambiguous` 並回傳 `NEEDS_REVIEW`。

每個文件產品至少保存 Product、Billing Period、Usage Sets、Bonus Sets、Price、Share Plan ID、Overage Method／Unit Price，以及 Deposit 類實際適用的 Type、Setup Fee、Commission Rate／Buy-in Price。每個 comparison field 使用 `Confirmed`、`NotMentioned`、`Unreadable`、`Ambiguous` 或 `NotApplicable`；正常 match 不強制 page、location 或 raw text。程式以完整 multiset 比較 Queue，產品多出、缺少、duplicate 數量或任何適用欄位不同都不得通過。`Deposit-Commission` 僅用於 B2C，是逐筆交易費率產品；其 `billing_period` 固定為 `NotApplicable` 且不參與 Document Comparison，不得由 Queue、主產品或年繳總額猜成 monthly／annual。其 canonical product、payment method／deposit type、commission rate／buy-in price 與產品列數仍須精確一致。B2B 的交易服務費文字依既有 B2B／Deposit 欄位語意處理，不建立 `Deposit-Commission`。固定費 Deposit 的 `monthly → annual ×12` 正規化不變。

每次 structured extraction 都要完成 Contract Evidence completeness check：實際目視 relevant PDF／附件的第 2 頁、末頁與簽署頁；讀完整 Email 串確認明確同意或指定達成合意文字；掃描日期文字不可靠時只對日期區塊做 visual fallback；年繳 Amount、Quote、Location 不得缺一。OCR 沒有印章文字不等於 `NotMentioned`。只有文件本身支持的 facts 可 Confirmed，Queue expected value 不得作 extraction hint。

自 `Control!Contract Date Detail Required From` 起的新覆核，必須填入 `Contract Start Date` 與 `Contract End Date`。程式會將文件、Queue 與 Renewal DB 日期正規化為 `yyyy-MM-dd` 後只比較年月日，不再只依賴人工填寫的 `Contract Period Match`，也不以時、分、秒差異判定不一致。

若 Queue 有 `Deposit-Commission` 產品列，`Contract Evidence Review` 必須另外填寫文件中實際出現的：

- `Deposit Commission Rate (%)`：文件直接寫明抽成比例時填寫。
- `Deposit Buy-in Price (%)`：文件寫明餐廳買入價格時填寫。

至少必須填寫其中一欄。程式會以 Queue／Renewal DB 的佣金比例為準，檢查：

- `Deposit-Commission.billing_period` 不參與比較；交易費率本身沒有 recurring billing cadence。

- 文件抽成比例 = Queue 的 `Deposit-Commission` 比例。
- 文件買入價格 = `100% - Deposit-Commission 比例`。

例如 Queue 為 `Credit Card 5%`，文件抽成應為 `5%`，或買入價格應為 `95%`。若文件寫 `100%`、欄位空白、數值不同或未取得所引用的商業協議增補，均不得通過；`Check = FALSE`，並在 `Note` 列出文件值、Queue／Renewal DB 值與正確應有值。此檢查為獨立必要條件，不得由 `Full Plan Match = TRUE` 取代。

同 Branch 有多個 Deposit-Commission 比例時，即使 structured Document Match 為 `MATCH`，既有 protected Deposit-Commission gate 仍回傳 `Need Review`；本輪不自動放行多費率案件。

為避免新增欄位後讓已完成的歷史覆核全部失效，強制填寫日由 `Control!Deposit Commission Detail Required From` 控制；預設為 `2026-07-25`。早於該日且兩個新欄位皆空白的既有覆核沿用舊結果，但只要已填入任一比例，仍會立即進行一致性檢查。

## 9. Check 與 Note 決策順序

每個 Branch 的所有產品列採相同最終狀態。

| 優先順序 | 條件 | `Check` | `Note`／狀態 |
| --- | --- | --- | --- |
| 1 | Renewal DB 缺資料 | FALSE | `Need Renewal Data` |
| 2 | 尚未填合約／信件覆核 | FALSE | `需補齊合約／信件覆核：尚未填寫合約／信件覆核結果。` |
| 3 | 合約名稱、期間、Deposit 抽成／買入價格或完整方案不一致 | FALSE | 清楚說明文件值、Queue／Renewal DB 值及正確應有值 |
| 4 | 變更方案但未確認雙方用印 | FALSE | 先逐欄列出原始 TPR 與 Renewal DB／Queue 的實際差異（例如 `Share Plan ID：原始 TPR「吃冰」→ Renewal DB／Queue「空白」`），再提示需人工目視確認雙方用印 |
| 5 | 贈送組數超過提醒或嚴重異常門檻 | FALSE | 列出使用組數、贈送組數、比例及方案參照值 |
| 6 | 方案家族或完整方案未確認 | FALSE | `尚未由方案參照表確認舊／新方案家族與完整組合。` |
| 7 | 特殊申請未核准 | FALSE | 說明缺少核准佐證、覆核者或日期 |
| 8 | Share Plan 未完成確認 | FALSE | 說明尚未確認成員、統編、期間或超額條件 |
| 9 | 全部條件通過 | TRUE | `文件、方案與必要例外覆核皆已通過。` |

`Note` 不加 `[合約檢查]` 等前綴；因欄位本身即為檢核結果。

## 10. 執行流程

### 10.1 每批標準流程

1. 在原始 TPR 勾選 `Check Box = TRUE` 的分店。
2. 確認每間店的 `Demand` 格式正確，且 Renewal DB 已有相應月份資料。
3. 在測試工作表執行 `Renewal Queue → Build Queue`。
4. Queue 會從原始 TPR 複製產品列，再依 Renewal DB 新方案覆寫。
5. 盤點每個 Branch 的完整 relevant evidence set；新版案件以 schema version 1 填寫 provider-neutral Structured Contract Data，不填 Document Match 結果。
6. 檢查／填寫四張覆核表。
7. 執行 `Renewal Queue → Run Contract Audit`，由 Apps Script 計算 Document Match。
8. 確認 Audit Log 新增 `Operation=Contract Audit` 的紀錄。
9. 在 Queue 依 `Check`、`Note`、`Update Status` 篩選後續處理。

### 10.2 可給 AI 的指令

```text
請使用 $tpr-renewal-contract-audit，從頭跑一次目前勾選案件的完整續約流程：
1. 依原始 TPR 中 Check Box = TRUE 與 Demand 選取案件；
2. 從 Renewal DB 依月份建立／更新 TPR Update Queue；
3. 保留原始 TPR 資訊與 H:AO 欄位；
4. 逐一閱讀每個 Branch 目前連結的完整合約、Email 及資料夾內容；
5. 盤點每個 Branch 的完整 relevant evidence set，依 provider-neutral schema 記錄文件逐產品事實；不要自行填入 MATCH／MISMATCH；
6. 依權威規格檢查店名、期間、年繳總額、方案家族、特殊申請與 Share Plan；
7. 填寫覆核表後執行 runContractAudit，由 Apps Script 比較 Structured Contract Data 與 Queue，並將同 Branch 的相同決策回填至所有產品列；
8. 回報 Branch 數、product row 數、Ready／非 Ready 數及每個 FALSE 的具體 Note；
9. 只寫測試工作簿，不得寫入正式 TPR、Renewal DB 或方案數值；僅可依另行授權維護官方方案表的 Plan Code 欄。
```

如來源連結或分頁改變，補充：

```text
原始 TPR：<連結>，分頁：<名稱>
Renewal DB：<連結>，分頁規則：<YYYYMM 或其他規則>
```

## 11. 已知限制與安全原則

1. AI 不可將檔案可開啟、OCR 文字或連結存在，當成雙方用印已確認。
2. 所有不確定、無法開啟或不完整的佐證，必須保守地維持 `Check = FALSE`。
3. 未填人工覆核資料是 `Need Review`，不是「不一致」。
4. 任何來源資料缺失應保留原始 TPR 方案，並明確標示人工處理原因。
5. 所有轉換與稽核輸出只存在測試工作表，正式寫回需另行授權與設計。
