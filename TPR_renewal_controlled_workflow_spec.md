# TPR 續約受控更新與合約稽核規格

> 狀態：受控實作基準（只允許測試工作簿與明確授權的 Plan Code 欄寫入）
> 本文件整合「TPR 續約測試工作區規格書」與「TPR 續約更新與合約稽核規格」。兩者有範圍差異時，以本文件的階段邊界為準。

## 1. 目的、範圍與不可違反原則

本規格定義從舊 TPR、Renewal DB、文件證據與方案參照表產生 `TPR Update Queue` 的未來受控流程。目標是建立可追溯、可審核、以 Branch ID 為原子單位的續約更新機制。

本階段允許經使用者要求修改 Google Apps Script，並寫入測試工作簿的 Queue、覆核表與方案管理表。不得寫入正式 TPR、Renewal DB 或方案數值；官方 RSV／RwG 方案表唯一可寫欄位為經授權的永久 `Plan Code`。

後續實作必須遵守：

1. 正式 TPR 是舊方案與歷史資料，不是本次續約的事實來源。
2. Renewal DB 是新方案初稿；有效的文件才可修正 Queue 最終值。
3. 有效文件優先序為：雙方用印的正式合約／增補協議 > 合格的完整維持方案同意信 > Renewal DB 初稿 > 原始 TPR。
4. `Branch ID` 是檢查、Ready 與正式寫回的原子交易單位；不得部分更新。
5. 欄位一律依 header label、header group 與 occurrence 解析；禁止依欄位字母定位。
6. 原 TPR 有產品而 Renewal DB 對應值空白時，必須 `Need Check`；不得推論為不續。
7. RSV 與 Deposit 都必須匹配同一個完整方案組合；不得拼湊不同欄／列的值。
8. 取得獨立、明確的寫回授權之前，任何流程均不得回寫正式 TPR。

## 2. 資料來源、角色與權限

| 來源 | ID / 分頁 | 角色 | 本階段存取限制 |
| --- | --- | --- | --- |
| 正式 TPR | `1rZVU-n85eDh_ueaRyQojP8dSm4-MTeBz8frIyZynnb4` / `TPR` | 目前生效的舊方案、產品列、文件連結與原始列識別 | 唯讀 |
| Renewal DB | `1tUOct-cJJY8854EAph9D0cxfiKz4qD1HFR2nXkPKWnc` / `{YYYYMM}` | 本次新方案初稿 | 唯讀 |
| RSV／RwG 方案參照表 | `10ECF2b0yu6loRZqDl_4ynHOuc2yz-IAUjPirCj-dxvM` / `TMS 方案` | 公版、BD 新方案、Lite、Email Only 合規目錄 | 唯讀 |
| Deposit 方案參照表 | `1QhNSdtg5TueFSoNBY8lFxXbtp_UktY1g8l7EUQWJ5kU` / `訂金方案` | Deposit 合規目錄 | 唯讀 |
| 測試工作簿 | `1ziGxJPwHpKAG8k6wVTQ8EobadNcEkE1RiJ4Eq9ZROw4` | 唯一可寫入的測試與稽核區 | Queue、覆核表與方案管理表可依受控流程寫入 |
| G 欄文件／信件 | 原始 TPR 的文件連結 | 客戶同意、用印與實際方案事實 | 唯讀；掃描件須逐頁目視覆核 |
| 特殊申請核准紀錄 | 待指定 | 例外方案的授權證據 | 未指定即 `Unknown` |

來源資料原則上必須經 Google Sheets API 或等效唯讀介面擷取。不得寫入正式 TPR、Renewal DB 或方案數值；經使用者授權後，唯一例外是官方 RSV／RwG 方案表的永久 `Plan Code` 欄。已知測試基準為 `TEST-202607-001`（31 Branch ID／34 個 TPR 產品列）及 `TEST-202608-001`（3 Branch ID／5 個 TPR 產品列）；每一個月份必須是獨立 Batch，不得合併。

## 3. 未來測試工作簿與批次模型

| 分頁 | 用途 | 可人工修改 |
| --- | --- | --- |
| `Control` | Batch ID、Renewal Month、Branch ID 清單與唯讀設定 | 僅批次與月份 |
| `Field Mapping` | 來源欄位資料字典 | 經審核後 |
| `TPR Snapshot`、`Renewal DB Snapshot` | 原始值、來源 ID、分頁、列號、擷取時間 | 否 |
| `Plan Reference Mapping`、`Plan Reference Snapshot` | 方案版面解析及本批方案快照 | RSV／RwG Mapping 與 Snapshot 由同步維護；Deposit Mapping 經審核後 |
| `Legacy Branch Master` | Legacy cohort 的 Branch ID membership；首約日若存在只供追溯 | 由業務維護；未來新增 ID 應填 Reason／Notes |
| `Canonical Plan Catalog`、`Plan Catalog Change Review` | 永久 Plan Code、版本、停用與方案異動審核 | Catalog 由同步維護；異動狀態由覆核者確認 |
| `Product Expansion Rules` | Renewal DB 單列展開產品列的規則 | 業務維護 |
| `TPR Update Queue` | 預計寫回資料、檢查結果與稽核資訊 | 流程寫入；修正須留下紀錄 |
| `Audit Log` | 匯入、人工決策、狀態及寫回事項 | 僅新增 |
| `Manual Exception Decisions` | 不續、漏填及例外的人工核准 | 經審核流程 |

匯入時，使用者於 `Control` 指定 `Renewal Month`（如 `202607`）與 Branch ID 清單；流程必須以月份名稱找到同名 Renewal DB 分頁，不能依分頁位置。每筆 Snapshot 均須保存原始值、來源 Spreadsheet、分頁、列號與匯入時間。

Renewal DB 找不到、重複而無法合併，或必要欄位不足時，仍可建立 Queue 稽核項，但必須標記 `Need Renewal Data` 或 `Need Check`，不得猜測或標為 Ready。

## 4. 欄位解析與標準化

TPR `TPR` 與 Renewal DB `{YYYYMM}` 的 header row 目前均為第 2 列，資料自第 3 列開始。欄位 Mapping 的唯一定位鍵依序為：

`source spreadsheet ID` → `tab selector` → `header row` → `header group` → 正規化後 `header label` → `occurrence` → `data start row`。

若欄位找不到，或同名欄位不能以 group 與 occurrence 唯一定位，停止相關判斷並產生 `Need Check`。下列欄位為重要 canonical fields：

| Canonical field | 原始 TPR 標題 | Renewal DB 新方案標題／來源 | 備註 |
| --- | --- | --- | --- |
| `branch_id` | `Branch ID` | `BranchID` | Branch 層級唯一鍵 |
| `restaurant_name` | `餐廳名稱` | `Restaurant` | 正規化後比對 |
| `contract_url` | `合約` | — | 文件來源 |
| `contract_start_date`、`contract_end_date` | 合約起訖日 | `New Contract start/end date` | Share 最終條件 |
| `product` | `產品 (...)` | 由展開規則產生 | 一個 DB 列可產生多個產品列 |
| `billing_period` | `付款週期(...)` | `New Period` | 正規化為 canonical enum |
| `included_reservations`、`free_reservations` | 合約組數、合約贈送組數 | `Sets`、`Bonus Sets` | 金額／組數去除千分位 |
| `plan_price` | `合約價格` | `New Plan Price` | 年繳依明確換算規則比較 |
| `share_plan_id` | `Share Plan ID` | 新方案區塊的 `Share ID` | 取第 2 個同名欄位 |
| `overage_type`、`overage_unit_price` | 超額計算方式、超額每組單價 | 新方案區塊的同名欄位 | 取第 2 個同名欄位 |
| `tax_id` | — | `Tax reg number` | Share 統編唯一來源 |

所有日期欄位在 Queue 以目標工作簿時區的純日期值儲存並顯示為 `yyyy-MM-dd`。跨 TPR、Renewal DB、Queue 與文件比較時，先正規化為 `yyyy-MM-dd`，只比較年月日；不得讓時、分、秒或 UTC offset 影響結果。

Renewal DB 文件中曾以欄位字母描述資料位置，僅能作為目前觀察紀錄，**不可成為實作定位方式**。同名欄位（如 `Share ID`、`Overage type`、`Deposit`、`Voice`）必須同時滿足目標標題、`新合約方案` group 與第二次 occurrence。

正規化時，方案表未列出的 RSV 贈送組數視為 `0`；但 `unlimited`、`-`、`未列`、`可使用`、`不可使用` 是不同語意，除明確規則外不得互換。

## 5. Queue 欄位契約

Queue 的 A:W 必須完整沿用正式 TPR 的欄位順序、格式與必要識別欄位，但只保存續約後「預計寫回」的新資料：B 為 Branch 層級檢查結果、D 為本批 Note、G 為本次文件識別、H 為 Branch ID。舊值不得放入 A:W，只能存於快照／稽核欄位。

| 欄位 | 名稱 | 用途 |
| --- | --- | --- |
| X:AA | Queue Row ID、Batch ID、Renewal Month、Branch Group ID | 不可變列識別與批次控制 |
| AB:AI | Product Key、Source Row Role、Original TPR Row/Snapshot、Renewal DB Row/Snapshot、Contract Snapshot、Queue Correction Log | 列來源與修正可追溯性 |
| AJ:AO | Update Action、Plan Change、Original/New RSV Family、Deposit Plan Match、Plan Compliance | 差異與合規判斷 |
| AP:AX | Required Evidence、Evidence Type、Inline Seal、Customer Seal、Contract Check、Renewal DB Check、Special Approval Required/Status/Evidence、Difference | 文件與例外證據 |
| AZ:BG | Branch Check Result、Update Status、Status Reason、Reviewed At/By、Updated At、Committed TPR Row、Commit Transaction ID | Branch 結果與交易稽核 |
| BH:BN | Share Group ID、Share Group Branch IDs、Tax ID／End Date／Overage／Contract Check、Share Group Status | 跨店 Share 檢查 |

同一 Branch ID 的所有列必須重複保存 Branch 層級結果；判斷必須先於 Branch 彙總，再回填每一列。

## 6. 產品展開、差異分類與人工例外

預設產品鍵為 `RSV`、`Deposit`、`Deposit-Commission / Credit Card`、`Deposit-Commission / Virtual ATM`、`Voice`、`Survey`、`eCoupon`、`RwG`。每個 `Product Expansion Rule` 至少須定義啟用條件、來源 canonical fields、Queue 產品列、Blank／Zero／FALSE 語意、明確不續訊號、價格／週期欄位、合約必填欄位與合規範圍。

在業務規則尚未確認前，預設為：所有產品 blank 均 `NEED_MANUAL_REVIEW`；Deposit、兩種 Deposit-Commission 與 RwG 的 `0` 是有效值且保留產品；Virtual ATM 的 `FALSE` 最多是 `Close Candidate`；任何 `Close/Remove` 僅能由已核准人工例外確認。

| 原始產品與新資料關係 | Update Action | 最低處理 |
| --- | --- | --- |
| 同產品且所有關鍵條件一致 | `Maintain` | 仍須完成文件、合規及完整性檢查 |
| 同產品、任一關鍵條件不同 | `Update` | `Plan Change=Yes`，需雙方用印 |
| 新資料有、原始無 | `Add` | `Plan Change=Yes`，需雙方用印 |
| 原始有、新資料無且有核准明確不續訊號 | `Close/Remove` | 不刪歷史列，依正式結束規則處理 |
| 原始有、新資料無但無明確訊號 | `Need Check` | 不得關閉 |

關鍵條件至少包括產品、付款週期、組數、贈送組數、價格、Share ID、超額方式／單價、Deposit 類型、月費、建立費、費率與功能組合。

唯一的付款週期正規化例外是：原方案為年繳主產品搭配正費用月繳 add-on，續約 Queue 將該 add-on 改為 `月費 × 12` 的 annual 表示。此 `monthly → annual` 是單向正規化，不視為 `Update`；反向 `annual → monthly`、RSV 週期變更或其他付款週期改變仍是實質變更。

`Manual Exception Decisions` 至少包含 Batch ID、Branch ID、Product Key、Decision、Reason、Evidence URL、Reviewer、Reviewed At、Queue Action、Status。只有 `Close/Remove` 且 Evidence URL、Reviewer、Reviewed At 完整、Status=`Approved` 時，才可確認不續；`Missing Renewal Data` 會使整個 Branch ID 不可 Ready。人工決策不得覆寫 Snapshot。

## 7. 文件、合約與 Queue 最終值

完全維持方案可由完整信件中客戶的明確同意、雙方用印文件或既定有效確認方式支持；任何 `Update`、`Add`、`Close/Remove` 或實質條件變更，都必須由雙方用印的正式合約／增補協議支持。inline 的「請回覆同意」不是同意；若採既定的「達成合意」確認文字，寄件者必須是 `inline-csm-team@inline.tw`。

掃描或拍照 PDF 需逐頁目視餐廳名稱，以及必要時 inline／客戶雙方印章；OCR 僅能輔助。應閱讀完整信件串，並以最新、明確內容覆核。

文件連結可以是 Drive 單一檔案或資料夾；資料夾必須展開並閱讀全部相關檔案。覆核 ID 綁定 Queue 連結本身的檔案 ID／資料夾 ID，且 `/file/d/<id>`、`/d/<id>`、`/folders/<id>` 與 `?id=<id>` 均須正確解析。Queue 連結與覆核 ID 不一致時必須 fail closed，不能沿用舊結論。

當 RSV／RwG 主產品為 annual 且存在正費用 add-on 時，`Contract Evidence Review` 必須保存文件明載的年繳總額、逐字原文與文件／Email 位置；不得由 Queue 加總回推。文件年繳總額必須與該 Branch 的 Queue 全部 annual 固定方案價格加總完全相等；monthly add-on 另由完整方案覆核比對月費，不納入年繳總額。交易費、抽成、超額、信用卡處理費與用量變動費用不納入固定金額。比較不允許金額誤差。

RSV annual 但正費用 add-on 續約後仍為 monthly 時，屬 split-billing 例外。Queue 必須保留 monthly 週期與月費，文件年繳總額只包含 annual rows，並必須有雙方用印合約；完整 Email 同意不足。程式僅可將不一致寫為 Branch 層級 `Check=FALSE` 與具體 Note，不得自動改寫 Queue 價格或週期。

| 合約與 Renewal DB 比較結果 | Queue 行為 |
| --- | --- |
| `Pass`：產品及必填條件一致 | 保留 DB 初稿，繼續合規檢查 |
| `Fail`：有明確不一致 | 在 Difference、Status Reason 與 Queue Note 記錄雙方實際值；保持 `Check=FALSE`，不得由 audit 自動修正 Queue |
| `Missing`：DB 必填資料不足 | `Need Renewal Data`，不可由合約靜默補成 Ready |
| `Duplicate`：同 Branch ID DB 重複且無法判斷 | `Need Renewal Data`／`Need Check` |
| `Need Check`：文件或資料無法辨識 | 不得推測 |

Renewal DB 是初稿而非最終真實來源。若使用者在 audit 之外另行授權依有效文件修正 Queue 方案欄位，必須記錄 Renewal DB 原值、合約值、修正欄位、理由、檢查者與時間，並重新執行文件、合約一致性、方案合規、特殊申請與雙方用印檢查；`runContractAudit` 本身只寫稽核結果，不自動改寫方案值。

## 8. Share Group 跨店家檢查

新 Share Group 只能依 Renewal DB 的**新** Share ID 與 Queue 最終值建立。原始 TPR 的舊 Share Plan ID 僅供判斷加入、退出或變更，不得用於界定續約後群組。

只要新 Share ID 非空，必須取得該 ID 的全部 Branch ID，不限於本批剛選取的店家，並檢查：

| 項目 | 來源 | 通過條件 |
| --- | --- | --- |
| 成員 | 新 Share ID、Queue、合約附件 | 全部店家已納入 Queue，且附件名單一致 |
| 統編 | Renewal DB `Tax reg number` | 同一群組正規化後完全一致 |
| 最終結束日 | Renewal DB、Queue、合約 | 全部店家三方一致 |
| 超額條件 | Renewal DB、Queue、合約 | 超額方式與單價全數一致 |

任一成員缺漏或不一致時，該新 Share Group 下所有 Branch ID 都不可 Ready。退出該新群組的店家不受該群組結果連帶阻擋；但加入、退出或變更 Share ID 本身屬 `Plan Change=Yes`，仍需雙方用印文件。

## 9. 方案合規與特殊申請

RSV 需以同一方案欄／列的完整組合比對付款週期、方案型態、組數、贈送、價格、超額單價及方案表定義的其他條件。Deposit 需以 `訂金方案` 同一資料列的 B2B/B2C、付款機制、週期／月費或年費換算、建立費、信用卡／ATM 費率、ATM、Pre-order、Experience 與其他條件比對。兩者都禁止跨組合拼湊。

RSV 家族與特殊申請判定：

舊方案家族先依官方 Catalog 的完整組合判斷。只匹配 Public 時不論 Legacy membership 均屬 Public；只匹配 BD New 時須同時不在 Legacy，若已列入 Legacy 則為 conflict；同時匹配兩個家族時，列在 Legacy 選 Public，不在 Legacy 選 BD New。新方案重複匹配時維持舊家族。`first contract date` 不參與 runtime 分類，Duplicate Legacy Branch ID 必須阻擋受影響 Branch。`Complete Plan Match` 明確為 FALSE／Fail 時是人工 veto；TRUE 不得覆蓋自動 conflict。

| 原方案分類 | 新方案分類／完整比對結果 | 特殊申請 |
| --- | --- | --- |
| Public | 完整匹配 Public | Not Required |
| BD New | 完整匹配 BD New | Not Required |
| Public ↔ BD New | 即使完整匹配新體系 | Required |
| Special | 全部關鍵條件不變 | Grandfathered |
| Special | 列在 Legacy 改為完整 Public；不在 Legacy 改為完整 BD New | Not Required；仍須雙方用印 |
| Special | 任一關鍵條件改變 | Required 或 Unknown |
| 任意 | 無法完整匹配同一組合 | Required |
| 任意 | 關鍵欄位或 Share 規則無法辨識 | Unknown／Need Check |

Deposit 方案表的 2025 與 Existing Discount/Expansion 兩個區段都應匯入同一份不可拆分的組合目錄；來源區段只作稽核資訊。完整匹配標示「特殊方案」的 Deposit 組合，必須取得 `Special Approval Approved`；找不到同一列、欄位無法判斷或跨列拼湊，都不得 Ready。

| 特殊申請狀態 | 是否可 Ready |
| --- | --- |
| `Not Required` | 可以，仍須通過其他條件 |
| `Grandfathered` | 僅 RSV 原特殊方案完全不變時可以 |
| `Approved` | 可以，仍須通過其他條件 |
| `Pending`、`Rejected`、`Unknown` | 不可以 |

RSV 方案表未列的贈送組數一律正規化為 `0`。BD 月繳 `1,500` 未提供完整價格／使用組數，不得自動建立或比對。Deposit 由 monthly 正規化為 annual 時使用月費 × 12；任何不同的固定年繳金額都必須有文件明載並與 Queue 精確一致，不得自行推測折扣。

## 10. Note、狀態與 Ready 條件

Queue C 欄 `Note` 使用單行文字，不加 `[文件檢查]` 等分類前綴；必須直接記錄具體值、差異原因與下一步，例如 `Renewal DB RSV 使用組數為 3,600 組，合約為 7,200 組，請確認並修正 Renewal DB／Queue。`，不得只寫「無法確認」。技術追溯可另存於 `Difference` 與 `Status Reason`。

每個 Branch ID 同一時間只能有一個主狀態；其他原因保存於 Status Reason、Difference 與 Note。優先序如下：

`Rejected` > `Error` > `Need Renewal Data` > `Need Contract` > `Need Dual Seal` > `Need Special Approval` > `Contract Mismatch` > `Plan Mismatch` > `Need Check` > `Blocked` > `Pending` > `Ready` > `Committed`。

| 狀態 | 進入條件 |
| --- | --- |
| `Pending` | Queue 已建立，尚未完成必要檢查 |
| `Need Renewal Data` | DB 缺失、重複或必要欄位不足 |
| `Need Contract` | 找不到、無法開啟或無法識別適用文件 |
| `Need Dual Seal` | 換方案文件少任一方用印 |
| `Need Special Approval` | 已知需要申請但尚未取得可接受狀態 |
| `Contract Mismatch` | 有效文件與 Queue 最終值仍不一致 |
| `Plan Mismatch` | 無法完整匹配適用參照組合 |
| `Need Check` | 資料、規則或文件無法辨識／未定義 |
| `Blocked` | 已知外部阻擋而無法由流程解除 |
| `Ready` | 以下所有條件均成立 |
| `Committed` | 已完整寫回正式 TPR 並記錄交易結果 |
| `Error` | 寫回或資料處理失敗，含部分寫回風險 |
| `Rejected` | 特殊申請被拒、客戶明確拒絕或案件撤回 |

`Ready` 必須同時符合：唯一、完整、可辨識的 Renewal DB（或有效文件的可追溯修正）；符合案件類型的可讀文件；所有變更均雙方用印；文件與 Queue A:W 一致；RSV／Deposit 完整合規且特殊申請合格；同 Branch 的所有產品完整；Share Group 通過；沒有任何未決或阻擋狀態。只有這時全組 Queue B 才可為 `TRUE`、Update Status 才可為 `Ready`。Ready 不代表可以自行寫回。

## 11. 未來寫回交易規格與驗收門檻

經獨立授權後，正式 TPR 寫回流程只可選取 `Ready` 的完整 Branch ID；先驗證所有列，再一次執行 `Maintain`、`Update`、`Add`、`Close/Remove` 的完整集合。`Close/Remove` 不得刪除歷史列。任一列失敗不可留下半套更新，應標為 `Error` 並記錄交易識別與補償結果；全組成功後才可標為 `Committed` 並記錄寫回時間、TPR 列號與 transaction ID。

實作前必須通過下列驗收：

1. 新增或插入來源欄後，Mapping 仍能唯一定位正確欄位。
2. Mapping 歧義、缺來源、重複 DB 或必填欄位不足時，系統從不猜測。
3. 每批都有不可變 Snapshot 與只新增的 Audit Log；Build Queue 記為 `Operation=Build Queue`，合約稽核記為 `Operation=Contract Audit`。
4. 原 TPR 有產品而新資料空白時，永不自動 `Close/Remove`。
5. 方案驗證無法跨欄或跨列拼湊。
6. Branch 或 Share Group 任一成員未通過時，交易單位不會 Ready。
7. 測試工作簿只在使用者要求執行 Build Queue／audit 時寫入；未取得獨立明確授權前，流程不會寫回正式 TPR。

## 12. 待確認規則（預設阻擋）

下列問題未取得正式答案前，相關案例必須為 `Need Check` 或 `Special Approval Unknown`：

1. RwG 是否為 RSV 的零元方案或獨立 Add-on，以及其必填欄位。
2. 特殊申請核准紀錄的來源、必要欄位與有效期間。
3. Renewal DB 的明確不續欄位／值，以及各產品的展開規則。
4. 正式 TPR 對 `Close/Remove` 的結束日、解約原因與歷史列處理方式。
5. 是否存在由法務明定、可替代雙方用印的文件形式。
6. 同一 Branch ID 的產品期間不同時是否支援。
7. Deposit-Commission 的信用卡與 Virtual ATM 是否必須是獨立產品列。
