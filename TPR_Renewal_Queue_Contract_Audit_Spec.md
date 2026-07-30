# TPR 續約 Queue 建立與合約稽核規格書

## 1. 目的與範圍

本流程將 TPR 中標示需續約檢查的分店，依 Renewal DB 的「新方案」轉成正式 TPR 格式的 Queue，並以合約／信件、方案規則、特殊申請及 Share Plan 條件進行稽核。

流程只可寫入測試工作表的 `TPR Update Queue` 與覆核表；**不得寫回原始 TPR、Renewal DB 或方案參照來源**。

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
| 測試工作表 | Control、設定表、Queue、快照、覆核表、Audit Log | 可寫 |

目前測試工作表 ID：`1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4`。

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
4. 日期必須與 Renewal DB 完全相同，不得因時區轉換少一天。
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
| `Deposit-Commission` | 帶入 Credit Card／Virtual ATM 等佣金比例；不填不適用的主產品價格與 Share Plan。合約／信件中的抽成或買入價格必須另行與此比例比對 |
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

### 6.2 原方案續約

原方案續約不只限於 Queue 與原始 TPR 每個欄位字面完全一致。下列兩種「續約格式正規化」不視為換方案：

1. 原方案的附加服務付款週期與主產品不同，但續約時依規則統一付款週期。比較時必須先把正費用附加服務換成同一年度基準；例如原始 TPR 的 Deposit 月費 1,500 元，Queue 轉為 annual 18,000 元（1,500 × 12），仍屬原方案續約，不得視為價格或方案變更。
2. 原方案是短約，續約時改回完整一年，因而把年費與主產品組數由 prorate 金額還原為完整年費／完整年組數。
3. RSV／RwG 主產品的「合約贈送組數」空白與數值 `0` 都代表沒有贈送組數，兩者比較時視為相同。此規則只適用於主產品，不可套用到 Deposit-Commission 等具有比例意義的欄位。

符合本節的例外後，才可接受以下任一佐證：

1. 完整信件中客戶有清楚表達同意續約。
2. 寄件者為 `inline-csm-team@inline.tw` 的信件，含指定達成合意文字。
3. 有 inline 與客戶雙方用印的文件。

指定文字為：

`貴我雙方已就「inline Apps 軟體系統租賃合約書」之續約方案達成合意，特此以本信件進行書面確認。`

### 6.3 付款週期與年繳總額判斷

續約 Queue 的預設輸出為：主產品與所有附加服務使用相同付款週期。但原方案可能是 RSV 年繳、附加服務月繳，不能只因 Queue 正規化付款週期就視為換方案。

應從合約／信件中擷取「年繳：乙方需依甲方之指示付款新台幣 OOO 元」的年繳總額，並與 Queue 比對：

| 信件／合約年繳總額 | 判斷 |
| --- | --- |
| 等於主產品年費 + 全部附加服務年費 | 主產品與附加服務均為年繳 |
| 等於主產品年費 | RSV 年繳、附加服務月繳 |
| 兩者皆不相符 | 不可視為原方案續約，需人工確認差異 |

金額為 0 的附加服務不影響總額，無法只靠總額區分年繳或月繳；此時以合約文字為準。合約／信件未能擷取年繳總額時，應顯示待人工覆核，不可直接判定為換方案。

若 Queue 沒有任何正費用附加服務（只有主產品，或附加服務價格皆為 0），年繳總額不再是判斷附加服務付款週期的必要欄位，不得因未填入該欄而阻擋案件。若合約明載「加值服務：無」，應直接視為無附加服務歧義。

Share Plan 的整份合約總額必須用合約附件所列的完整成員合計核對。例如 10 店各 24,000 元，合約總年繳 240,000 元，應判定為整組一致；不得把 240,000 元逐店與單店 24,000 元比較。`Annual Payment Amount (NTD)` 可記錄整組總額，並在 `Billing Cycle Match` 註明成員數、單店金額與合計算式。

### 6.3.1 PDF／信件文字正規化

餐廳名稱比對前必須先做 Unicode NFKC、移除換行與多餘空白，並正規化 PDF／OCR 常見部件字形，例如 `⺠ → 民`、`⽂ → 文`、`⽵ → 竹`。附件表格因欄寬換行造成的店名拆行，不得視為名稱不一致。文字擷取失敗或疑似掃描型 PDF 時，必須逐頁轉成影像目視或 OCR 後再判斷，不得直接把所有比對欄位設為 FALSE。

### 6.4 短約 prorate 與完整一年續約

年繳方案若原合約不是完整一年，年費、主產品組數與有固定年費的附加服務可依 30 天制 prorate。贈送組數**不得** prorate。

設完整年費／完整年組數為 `A`、起始月天數為 `D1`、中間完整月份為 `M`、結束月天數為 `D2`：

`短約金額或組數 = (A / 12) × (D1 / 30 + M + D2 / 30)`

其中：

- `D1 = 30 - 起始日 + 1`
- `D2 = 結束日`
- 每個月固定以 30 天計算；日期為 31 日時以 30 日處理。

例：完整年費 21,600 元，月費 1,800 元；合約期間為 `2026-04-23` 至 `2026-09-15`：

`1,800 / 30 × 8 + 1,800 × 4 + 1,800 / 30 × 15 = 8,580`

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
- `Complete Plan Match`：完整方案是否匹配

判斷規則：

| 舊方案 → 新方案 | 結果 |
| --- | --- |
| Public → Public | 可通過，不需特殊申請 |
| BD New → BD New | 可通過，不需特殊申請 |
| Special → Special，且完全不變 | 既有特殊方案延續，不需重新申請 |
| Public ↔ BD New | 必須特殊申請核准 |
| Special 異動、Special 與其他家族互換、家族未知 | 必須特殊申請或人工釐清 |

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
| `Contract Evidence Review` | 證據類型、名稱／方案一致性、合約實際起訖日、客戶同意、指定文字、雙方用印、年繳總額、付款週期、Deposit 抽成／買入價格、覆核者、日期與狀態 |
| `Plan Classification Review` | 舊／新方案家族、完整方案匹配、覆核者與日期 |
| `Special Approval Review` | 特殊申請核准結果、佐證、覆核者與日期 |
| `Share Group Review` | 成員、統編、期間、超額條件、最終狀態 |

僅有 Queue 的合約連結不代表已完成檢查。若覆核表只有連結、沒有覆核結果，應顯示為待覆核。

自 `Control!Contract Date Detail Required From` 起的新覆核，必須填入 `Contract Start Date` 與 `Contract End Date`。程式會直接與 Queue／Renewal DB 日期比對，不再只依賴人工填寫的 `Contract Period Match`。

若 Queue 有 `Deposit-Commission` 產品列，`Contract Evidence Review` 必須另外填寫文件中實際出現的：

- `Deposit Commission Rate (%)`：文件直接寫明抽成比例時填寫。
- `Deposit Buy-in Price (%)`：文件寫明餐廳買入價格時填寫。

至少必須填寫其中一欄。程式會以 Queue／Renewal DB 的佣金比例為準，檢查：

- 文件抽成比例 = Queue 的 `Deposit-Commission` 比例。
- 文件買入價格 = `100% - Deposit-Commission 比例`。

例如 Queue 為 `Credit Card 5%`，文件抽成應為 `5%`，或買入價格應為 `95%`。若文件寫 `100%`、欄位空白、數值不同或未取得所引用的商業協議增補，均不得通過；`Check = FALSE`，並在 `Note` 列出文件值、Queue／Renewal DB 值與正確應有值。此檢查為獨立必要條件，不得由 `Full Plan Match = TRUE` 取代。

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
5. 檢查／填寫四張覆核表。
6. 執行 `Renewal Queue → Run Contract Audit`。
7. 在 Queue 依 `Check`、`Note`、`Update Status` 篩選後續處理。

### 10.2 可給 AI 的指令

```text
請從頭跑一次續約流程：
1. 依原始 TPR 中 Check Box = TRUE 與 Demand 選取案件；
2. 從 Renewal DB 依月份建立／更新 TPR Update Queue；
3. 保留原始 TPR 資訊與 H:AO 欄位；
4. 依本規格檢查合約、方案家族、特殊申請與 Share Plan；
5. 回填 Queue 的 Check、Note、Update Status 與相關檢核欄位；
6. 不得寫入原始 TPR、Renewal DB 或方案參照來源。
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
