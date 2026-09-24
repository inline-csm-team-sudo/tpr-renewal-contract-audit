# Structured Contract Data Extraction

本文件是 schema version 1 的唯一 extraction 操作規格。它約束 Gemini 或其他 document
reader 如何把 Branch 的完整文件集合轉為 provider-neutral facts；Apps Script 仍是
`Document Match Result`、`Document Match Detail` 與最終 Audit decision 的唯一 authority。

## Safety invariant

Extraction safety priority：

`correct Confirmed > Ambiguous/Unreadable > guessed Confirmed`

`Final wrong-Confirmed count = 0` 是最高優先完成條件。提高 first-pass usable rate、減少 fallback
或縮短閱讀時間，都不能交換錯誤的 `Confirmed`。Reader 只輸出文件事實與狀態，不輸出摘要、
MATCH／MISMATCH、Ready、Check、政策判斷或修正 Queue 的建議。

## Reader isolation

First pass 只提供：

- Queue evidence link 指向的檔案或資料夾及其 relevant children。
- 每個 source 的穩定 `source_id`、檔名、類型與頁數。

First pass 不提供 Queue 的 Product、Billing Period、Usage Sets、Bonus Sets、Price、Share Plan ID、
Overage、Deposit 欄位、annual total、既有 Document Match、歷史 review 值或 expected answer。
也不提供 Queue 餐廳名稱或 target restaurant hint。Branch ID 不必出現在合約；不得因文件沒有
Branch ID 降低 extraction state。

多店／共用文件先抽取文件明示的所有 restaurant scopes，並在對應 product rows 保存選填的
`applicable_restaurant_names`。First-pass JSON 凍結後，Skill 才能用 Queue 餐廳名稱做 deterministic
Branch projection；projection 只選取既有 facts，不得改值或補值。文件名稱正規化後仍無法唯一投影時，
該 Branch 使用 `Ambiguous`，不得讓 reader 依 expected Branch 重讀或猜測。

完成 evidence extraction 並凍結 JSON 後，才可把 JSON 交給 Apps Script 與 Queue 比較。Comparison
結果不得反向提示 reader 重寫文件事實；只有文件 locator 本身不清楚時才啟動 field-local fallback。

## First-pass workflow

1. 盤點 Queue link 本身及資料夾內所有檔案，列出每個 `source_id`、檔名、類型與頁數。
2. 將與本次續約的方案、同意、用印或附件有關的檔案列入 `relevant_source_ids`。資料夾 children
   尚未列完，或無法判斷某檔案是否 relevant 時，`evidence_set.state=Ambiguous` 且
   `complete=false`。
3. 逐頁檢查所有 relevant sources。文字層／OCR 是定位輔助；掃描、照片、表格、合併儲存格、
   用印與簽名以視覺內容為準。
4. 先建立文件中的 product-row boundaries，再依 canonical taxonomy 拆列所有主產品與 add-ons。
5. 依序抽取 Priority 1 產品比較欄位、Priority 2 餐廳／期間／年繳總額、Priority 3 視覺證據。
6. 對每個欄位套用 field-state gate；保存例外 locator，並列出需要的 field-local fallback。
7. 只有 relevant evidence set 已完整盤點時，才可輸出 `state=Confirmed`、`complete=true`。
8. 輸出的 JSON 必須通過本文件的 schema checklist；到此 first pass 才算完成並可凍結。

## Field-state gate

每個 comparison field 使用 `{ "state": "...", "value": ... }`；無值的 state 不得虛構
`value`。允許的 state：

- `Confirmed`：來源可讀，而且值、產品歸屬與語意都能唯一確認。明確寫 `0` 是
  `Confirmed`、`value=0`。
- `NotMentioned`：已完整檢查該產品的整個相關區塊，包括 row／column header、合併儲存格、
  相鄰表格、註腳、附件與相關文字，確認文件確實沒有記載該欄位。OCR 空白、文字層缺值、
  extraction 沒回傳值或只看局部 crop，都不足以使用 `NotMentioned`。
- `Unreadable`：欄位或相關區塊存在，但影像、掃描或文字無法可靠讀清。
- `Ambiguous`：有多個可能值、canonical product、row association、付款週期或適用範圍。
- `NotApplicable`：該欄位在已確認的產品類型與商業語意下確實不適用；它不是 missing-value
  shortcut。

無法確認是「真的沒寫」或「reader 沒讀到」時，選 `Unreadable` 或 `Ambiguous`。產品區塊存在但
Product 無法辨識時，仍輸出 placeholder product row，並令 `product.state=Unreadable` 或
`Ambiguous`；不可省略該 row 或輸出空 products array。

## Canonical product taxonomy

`product.state=Confirmed` 時，`value` 只可為：

- `RSV`：訂位、候位、訂候位，或同一產品 row 明確具有預約組數／超額預約等 RSV 語意。
  單獨出現 generic「inline Apps 軟體系統」不足以確認；若同一方案條款同時明載訂候位、
  預約組數或對應超額條件，直接 canonicalize 為 `RSV`。
- `RwG`：文件明確記載 Reserve with Google、Google 預訂／預約等對應服務。
- `Deposit`：訂金功能／系統的固定月費或年費、Deposit type、setup fee。
- `Deposit-Commission`：B2C 訂金交易抽成、commission rate、信用卡／Virtual ATM 等買入價格或
  payment-method transaction rate。B2B 的交易服務費不使用此 canonical product。
- `Voice`、`Survey`、`eCoupon`：文件能唯一對應該 add-on 時使用。

Ocard、generic add-on 或其他未支援名稱不可硬套 taxonomy；無法唯一對應時輸出 `Ambiguous`。

### Deposit decomposition

- B2C「訂金月費／年費 + 信用卡買入價格／抽成」拆成一列 `Deposit` 與至少一列
  `Deposit-Commission`。
- B2C 不同 payment method 或不同 rate 各自建立 `Deposit-Commission` row；不得合併成一個範圍、
  平均值或任選其中一個。
- Setup Fee 是 `Deposit.setup_fee`，不是獨立產品。
- B2B 只建立 `Deposit`，不建立 `Deposit-Commission`。B2B 條文中的 transaction service fee／
  交易服務費百分比是 clause-recognition fact，依既有 B2B／Deposit 欄位語意保留在 `Deposit` row，
  不是 Commission row trigger。
- `commission_rate` 與 `buy_in_price` 按文件字面擷取。文件只寫買入價格時，不由 reader 改寫成
  抽成；B2C `Deposit-Commission` 由 Apps Script 負責 `100 - buy_in_price` 的一致性計算。

### Deposit clause-semantic triggers

以下是 semantic mapping，不是 exact phrase matching。只要 Deposit 或 payment-method 相關條文的
商業語意相同，即使措辭、換行或標題不同，也必須產生相同的 canonical product rows。

**B2C mandatory row-creation trigger：**只有在 B2C Deposit／payment-method context 下，相關條文明確
出現 buy-in price／買入價格、B2C commission／抽成比例，或 payment-method transaction rate 時，
才必須建立 `Deposit-Commission` row；文件不需要直接出現 `Deposit-Commission` 產品名稱。B2C 費率
不得只存在 Branch-level evidence sidecar 而省略 product row。

B2B 不適用此 trigger。B2B 文件即使明載 transaction service fee／交易服務費百分比，也只把它視為
B2B Deposit 條文事實，依既有 B2B／Deposit audit 欄位語意保存；不得建立 `Deposit-Commission` row，
也不得因文字中含有 commission、transaction fee 或百分比而套用 B2C canonical mapping。

- B2C buy-in price 保存文件原始事實於 `buy_in_price`。Reader 不填補衍生的 `commission_rate`；
  文件未直接寫抽成時使用 `NotMentioned`。Apps Script 再以
  `commission_rate = 100 - buy_in_price` 正規化後與 Queue 比較。
- B2C 文件直接明載 commission rate 或 payment-method transaction rate 時，保存於
  `commission_rate`；未直接寫 buy-in price 時使用 `NotMentioned`。直接抽成不得套用
  `100 - commission_rate`。
- Payment method 只從能唯一連結該費率的標題、段落或表格欄位擷取。文件未寫時使用
  `NotMentioned`；有多種可能時使用 `Ambiguous`；看不清時使用 `Unreadable`。不得猜成
  `Credit Card` 或 `Virtual ATM`。
- 每一種 payment method／rate combination 各建一列 `Deposit-Commission`。例如 Credit Card
  buy-in 95.5% 與 Virtual ATM buy-in 98.5% 必須是兩列，不得合併成 `4.5%, 1.5%`、省略其中一列，
  或只存在 Branch-level evidence。
- 固定費與交易費率保持不同產品。文件同時明載月度訂閱費 1,500、transaction setup／creation fee
  10、Credit Card 與 buy-in 95% 時，至少建立：`Deposit`（monthly、price 1500、setup_fee 10）及
  `Deposit-Commission`（Credit Card、buy_in_price 95、billing_period `NotApplicable`）。
- 不使用 Queue 值補足文件事實。文件 buy-in 95% 本身足以讓 Apps Script 計算等價 commission 5%；
  Queue commission 5% 不能反向證明文件 buy-in 是 95%。

代表性條文與預期 extraction：

| 文件語意 | 必須建立的 Structured Contract Data | Apps Script 正規化 |
| --- | --- | --- |
| Credit Card／信用卡預綁卡號；「inline 將以零售價格的95%購買座位」 | 一列 `Deposit-Commission`；`deposit_type=Confirmed("Credit Card")`；`buy_in_price=Confirmed(95)`；`commission_rate=NotMentioned`；`billing_period=NotApplicable` | commission 5 |
| 信用卡支付 buy-in 95.5%；虛擬帳號轉帳 buy-in 98.5% | 兩列 `Deposit-Commission`：Credit Card／95.5 與 Virtual ATM／98.5；兩列的 `commission_rate=NotMentioned`、`billing_period=NotApplicable` | 分別為 commission 4.5、1.5 |
| B2B「交易服務費 5%」 | 只建立／保留 `Deposit` row；將 5% 視為 B2B clause-recognition fact，依既有 B2B／Deposit 欄位語意保存；不得建立 `Deposit-Commission` | 不套用 B2C buy-in／commission row normalization |

多費率 B2C 文件只影響 product-row 數與逐列 Document Comparison。若每列 payment method、commission／
buy-in 與 Queue 均可唯一配對，Document Match 與 Deposit-Commission gate 均可通過；多個 unique rate
本身不是人工覆核條件。Payment method 或 rate 缺漏、同一 method duplicate／conflict、row count 不一致，
或無法唯一連結 method 與 rate 時，必須 fail closed／`NEEDS_REVIEW`，不得任選一列或合併費率。

## Share document coverage manifest

Share extraction 必須保存 document／evidence-level 的完整 coverage，不能只留下目前 Branch 的
`contract_evidence.restaurant_name` projection。每份 relevant evidence 只讀一次，建立一個可被多個
Branch structured rows 共同引用、以 `manifest_id` 去重的 provider-neutral manifest：

- `source_id`：必須存在於 `evidence_set.relevant_source_ids`。
- `share_plan_id`：只由文件明示的 Share ID 建立 field-state object；合約必須明確提到 Share ID。
- `coverage_complete`：只有完整檢查該 evidence 的成員表、店名範圍、附件與註腳後才可
  `Confirmed(true)`。
- `covered_members`：保存文件列出的完整店名集合；每個 member 保存 `restaurant_name`、
  `branch_id` 與 mapping provenance。
- `provenance`：保存 source ID 與 page／table／section locator；例外另保留 quote。

同一 Share ID 可以由多份合約覆蓋；reader 各自建立 manifest，Audit 再取 current relevant evidence
coverage 的 union。不得要求每份文件單獨涵蓋整組。若同一份文件涵蓋多店，先讀一次完整文件，之後
讓各 covered Branch 引用同一 manifest；不得為每店重複 reader extraction。

Branch ID 不要求出現在合約文字中。只有文件餐廳名稱可透過 authoritative Branch mapping 唯一對應時，
才可將 `branch_id` 設為 `Confirmed`，並保存 mapping provenance。名稱有多個可能、找不到唯一 mapping、
或文件文字不清時，分別使用 `Ambiguous`／`Unreadable`；不得利用 Queue 預期成員、Renewal DB 完整群組、
歷史 review 或已知 Production 店名猜 Branch ID。

建議形狀：

```json
{
  "share_coverage_manifests": [
    {
      "manifest_id": "drive-file-id#share-members",
      "source_id": "drive-file-id",
      "share_plan_id": {"state":"Confirmed","value":"GROUP-ID"},
      "coverage_complete": {"state":"Confirmed","value":true},
      "covered_members": [
        {
          "restaurant_name": {"state":"Confirmed","value":"Restaurant A"},
          "branch_id": {"state":"Confirmed","value":"branch-a"},
          "mapping_provenance": {
            "source_id":"drive-file-id",
            "method":"document restaurant name → authoritative Branch mapping"
          }
        }
      ],
      "provenance": {"source_id":"drive-file-id","locator":"page 1 / Share member table"}
    }
  ]
}
```

Share manifest 只陳述文件 facts，不輸出 PASS／FAIL。下列情況保留 field uncertainty 並交 deterministic
Audit fail closed：Share ID 不清、coverage 是否完整不清、restaurant-to-Branch mapping 不唯一、或 relevant
evidence 無法完整讀取。

## Product field semantics

每個 product row 都要有 `source_id`，且必須屬於 `evidence_set.relevant_source_ids`。

- `billing_period`：只取能唯一連結到該產品的明示週期，正規值使用 `annual`、`monthly`、
  `6mo`、`3mo`。合約起訖期間不等於付款週期。不得由年繳總額、`price × 12` 或 Queue 值推測。
  文件月費 800 應保留 `price=800`、`billing_period=monthly`；年繳主產品與月繳 add-on 必須分列。
  `Deposit-Commission` 是逐筆交易費率產品，沒有 monthly／annual recurring billing cadence；其
  `billing_period` 必須使用 `NotApplicable`，不得由主產品、固定 Deposit、年繳總額或 Queue 值猜測。
  Apps Script 的 Document Comparison 不比較 `Deposit-Commission.billing_period`。
- `usage_sets`：保留文件列出的付費／使用組數；`unlimited` 是字面有效值，不轉為 0。
- `bonus_sets`：先檢查欄位標題、合併儲存格、該產品 row、註腳與相關方案文字。明示 0 是
  `Confirmed(0)`；完成全部檢查且未記載才是 `NotMentioned`。
- `price`：只記錄該 product row 的字面固定價格，正規化幣別符號與千分位但不年化、不分攤、
  不從 annual total 回推。
- `share_plan_id`：只在文件明示共享方案名稱／ID 或能唯一連結的群組時 `Confirmed`。店名相似、
  多店共用文件或 Queue 既有值不能代替明示 Share ID。
- `overage_method`、`overage_unit_price`：擷取同一 product row 或能唯一引用它的超額條款；
  tier／stairstep 不能簡化成 per-unit。
- `deposit_type`：保存文件明示的 B2B／B2C 或支付方式語意。
- `setup_fee`：Deposit 固定建立費。
- `commission_rate`、`buy_in_price`：B2C `Deposit-Commission` 的交易抽成或買入價格；多種 payment
  method 分列。B2B 交易服務費依既有 B2B／Deposit row 語意保存，不產生 `Deposit-Commission`。

### Product-field applicability matrix

Reader 必須依 product semantics 決定欄位 state，不得把條文 entitlement 填入不相干的商業欄位：

| Product | Document Comparison 欄位 | 必須為 `NotApplicable` 的商業欄位 |
| --- | --- | --- |
| Survey | `billing_period`、`price` | `usage_sets`、`bonus_sets`、`overage_method`、`overage_unit_price` |
| Voice | `billing_period`、`price` | `usage_sets`、`bonus_sets`、`overage_method`、`overage_unit_price` |
| Deposit-Commission | `deposit_type`（payment method）、`commission_rate`／`buy_in_price` | `billing_period`、`usage_sets`、`price`、一般 overage 欄位 |

「不限問卷發送組數」與「不限電話轉接及發送簡訊數」是 entitlement description。可另存
`entitlement={state:"Confirmed",value:"unlimited",...}`，但不得映射成 `usage_sets=unlimited`、
`bonus_sets`、`overage_method` 或 `overage_unit_price=0`。本矩陣是 canonical product-level authority，
不得以 Branch／餐廳例外取代。

Schema-required 但未記載的欄位仍要輸出 field object，依 field-state gate 使用
`NotMentioned` 或 `NotApplicable`，不可漏 key。正常 product 必須至少包含：
`product`、`billing_period`、`usage_sets`、`bonus_sets`、`price`、`share_plan_id`；非 Deposit 類另有
`overage_method`、`overage_unit_price`；Deposit 類使用 `deposit_type`，`Deposit` 使用
`setup_fee`，`Deposit-Commission` 至少包含 `commission_rate` 或 `buy_in_price`。

## Contract evidence sidecar

Structured Contract Data 可保留下列 provider-neutral sidecar facts；Apps Script 的 product parser
忽略 sidecar，Skill 在完整流程中將它們依 header name 映射至既有 Contract Evidence Review 欄位：

- `restaurant_name`：文件實際文字。換行、空白與已知 OCR 異體可另記 raw value；無法唯一確認時
  使用 `Ambiguous`。多店文件保存所有明示店名，不以 Queue 名稱覆蓋。
- `contract_start_date`、`contract_end_date`：只比較日曆日期，輸出 `yyyy-MM-dd`，忽略時間。
- `annual_payment_amount_ntd`：文件明載的 explicit annual payment。這是付款條文明確要求本次支付的
  金額，不等於 annualized product economics；`Confirmed` 必須同時保存 value、relevant `source_id`、
  含該金額的逐字 quote 與精確 page／section locator。
- `annualized_economic_amount_ntd`：僅在文件沒有 explicit annual payment、且可由同一 Branch 的
  Confirmed document product facts 合法推導時使用。必須保存 `derived=true`、calculation、逐項
  `source_product_facts` 與 provenance。不得用它覆寫 explicit annual payment，也不得由 Queue 回推。
- `inline_seal`、`customer_seal`、`signature`：必須實際視覺檢查簽署／用印區。OCR 或檔案存在不能
  證明有或沒有；尚未視覺確認時使用 `Unreadable` 或提出 fallback。
- `consent_evidence`：完整 email thread 的實際同意文字、sender 與 locator；信件檔案存在不等於
  已同意。

### Evidence completeness and field-local visual fallback

- **Dual seal / signature：**每個 relevant PDF、增補協議與 folder attachment 都要檢查實際簽署／
  用印頁，至少包含第 2 頁、末頁與被拆成獨立檔案的 signature attachment。OCR／文字層沒有印章文字
  不能判為 `NotMentioned`。只有目視確認實際圖像後，才可用 `verification="visual"` 將
  `inline_seal`／`customer_seal` 設為 `Confirmed(true)`；未能可靠檢視時使用 `Unreadable`／
  `Ambiguous` 並提出該欄位的 visual fallback，不重跑無關產品 extraction。
- **Seal attribution / agreement isolation：**先判斷相關 agreement 的用印區是否有印章，再分別判斷
  每個印章的 owner 是 inline、customer 或無法確認。必須綜合印章本身可辨識的文字／公司名稱、簽署
  欄位標籤、印章與當事人名稱的視覺關聯，以及目前 section／document type；不得只憑左／右位置、
  附近印有某公司名稱或同一 PDF 其他獨立協議的印章推定 owner。續約文件與移轉協議即使合併為
  一個 PDF，印章證據也不可跨 section 借用。可確認有印章但 owner 不明時，相關 party seal 為
  `Ambiguous` 並使該項 `NEEDS_REVIEW`，不得猜成任一方的 `Confirmed(true)`。
  `Confirmed(true)` 必須附 `source_id`、page、agreement/section locator、`verification="visual"` 與
  `visual_description`，說明印章文字及如何對應當事人。完整目視相關用印區後若確認某方未用印，
  才能給該方 `Confirmed(false)`，並同樣保存 source、page、section 與目視描述；無法可靠確認
  缺席時應為 `Unreadable`／`Ambiguous`，不能由 OCR 空白或另一方有章推論。

  Generic seal-attribution regression cases（只根據文件，不使用 Queue 或 Branch 名稱）：

  | 續約 agreement 的目視事實 | inline_seal | customer_seal |
  | --- | --- | --- |
  | 只有 customer 公司章，旁邊印有 inline 公司名稱但未用印 | `Confirmed(false)` | `Confirmed(true)` |
  | 只有可歸屬 inline 的章 | `Confirmed(true)` | `Confirmed(false)` |
  | 雙方各有可歸屬的章 | `Confirmed(true)` | `Confirmed(true)` |
  | 有章但文字／欄位不足以判 owner | `Ambiguous` | `Ambiguous` |
  | 續約文件只見 customer 章；同 PDF 的另一份移轉協議有 inline 章 | `Confirmed(false)` | `Confirmed(true)` |
  | 左右位置對調，但章文字與簽署欄位仍可歸屬雙方 | `Confirmed(true)` | `Confirmed(true)` |
- **Consent：**完整 Email 串中客戶明確回覆「同意」或其他語意同等、明確的同意文字，可建立
  `kind="explicit_email_consent"`；由 `inline-csm-team@inline.tw` 明確記錄雙方已就續約方案達成
  合意並進行書面確認，可建立 `kind="agreement_confirmation"`。兩者都必須保存原文 quote、sender
  （如適用）與 locator。模糊回覆、單純收件、請求對方同意或不完整對話不得推測為 consent。
- **Period：**掃描／圖片文件的文字層無法可靠提供日期時，只 fallback 合約日期區域並目視確認。
  只有年、月、日皆可可靠閱讀且為有效日曆日期時才 `Confirmed`；否則維持 `Unreadable`／
  `Ambiguous`，不得由 Queue 的預期期間補值。
- **Annual payment：**文件明確寫 annual payment 時，explicit fact 為 authority；任何 `Confirmed`
  explicit amount 必須具有 value、relevant source ID、包含該金額的逐字 quote 與精確 page／section
  locator，缺一即 `Unreadable`／`Ambiguous` 或交 `NEEDS_REVIEW`，不得 Confirmed。只有文件未載明 explicit
  payment 且同一 Branch 的產品費用均為 Confirmed document facts 時，才可建立 `derived=true` 的
  document-based annualized amount；必須保存完整計算式、每個 source product 的 product／billing／
  price、quote、locator 與 source ID。Explicit payment 與 annualized economic amount 必須用不同語意
  欄位保存，後者不得覆寫前者。禁止使用 Queue annual 合計或 Queue 產品值反推、生成文件不存在的
  quote，或讓 stale Review row Amount／Quote／Location 覆蓋 current structured JSON。JSON 與 Review row
  evidence／provenance 不一致時 fail closed。
- **Shared contract：**先依文件明示的 restaurant scope 建立每個 Branch 自己的 document-based
  annual amount，再用 shared document total 作 cross-check。Group total 不得取代逐 Branch facts，也
  不得把整組金額寫成單一 Branch 的 `annual_payment_amount_ntd`。例如每店文件 facts 為 RSV 21,600
  與 Deposit 300／月時，每店衍生為 `21,600 + 300 × 12 = 25,200`；兩店合計 50,400 只保存為
  `shared_total_cross_check`。

建議 sidecar 形狀：

```json
{
  "contract_evidence": {
    "restaurant_name": {"state":"Confirmed","value":"...","source_id":"..."},
    "contract_start_date": {"state":"Confirmed","value":"2026-09-01","source_id":"..."},
    "contract_end_date": {"state":"Confirmed","value":"2027-08-31","source_id":"..."},
    "annual_payment_amount_ntd": {
      "state":"Confirmed","value":21600,"source_id":"...","quote":"年繳總額 21,600 元",
      "locator":"page 2 / 給付方式"
    },
    "inline_seal": {"state":"Confirmed","value":true,"source_id":"...","locator":"signature page"},
    "customer_seal": {"state":"Confirmed","value":true,"source_id":"...","locator":"signature page"},
    "signature": {"state":"NotApplicable"},
    "consent_evidence": {"state":"NotApplicable"}
  }
}
```

文件產品費用推導範例：

```json
{
  "annualized_economic_amount_ntd": {
    "state": "Confirmed",
    "value": 25200,
    "derived": true,
    "derivation": {
      "calculation": "RSV 21600 + Deposit 300 × 12 = 25200",
      "source_product_facts": [
        {
          "source_id": "signed-contract",
          "quote": "RSV 年費 21,600 元",
          "locator": "page 1 / 店別方案列",
          "product": {"state":"Confirmed","value":"RSV"},
          "billing_period": {"state":"Confirmed","value":"annual"},
          "price": {"state":"Confirmed","value":21600}
        },
        {
          "source_id": "signed-contract",
          "quote": "Deposit 月費 300 元",
          "locator": "page 1 / 店別方案列",
          "product": {"state":"Confirmed","value":"Deposit"},
          "billing_period": {"state":"Confirmed","value":"monthly"},
          "price": {"state":"Confirmed","value":300}
        }
      ],
      "shared_total_cross_check": {
        "state":"Confirmed","value":50400,"source_id":"signed-contract",
        "quote":"兩店合計 50,400 元","locator":"page 1 / 總額"
      }
    }
  }
}
```

## Schema version 1 output contract

只輸出 JSON，不加 Markdown fence、摘要或 prose。Top-level 必須包含：

```json
{
  "schema_version": 1,
  "evidence_set": {
    "state": "Confirmed",
    "complete": true,
    "relevant_source_ids": ["drive-file-id"]
  },
  "products": [
    {
      "source_id": "drive-file-id",
      "product": {"state":"Confirmed","value":"RSV"},
      "billing_period": {"state":"Confirmed","value":"annual"},
      "usage_sets": {"state":"Confirmed","value":3600},
      "bonus_sets": {"state":"Confirmed","value":300},
      "price": {"state":"Confirmed","value":21600},
      "share_plan_id": {"state":"Confirmed","value":"group-id"},
      "overage_method": {"state":"Confirmed","value":"per unit"},
      "overage_unit_price": {"state":"Confirmed","value":7}
    }
  ],
  "share_coverage_manifests": [],
  "contract_evidence": {},
  "fallback_requests": []
}
```

`contract_evidence` 與 `fallback_requests` 是 extraction sidecar；reader 仍不得加入
Document Match authority。正常 passing fields 不需 raw text；Bonus、annual total、Deposit rate、
consent、seal、Unreadable、Ambiguous 與其他 exception 應保存 `source_id` 與 page／section locator。

## First-pass reader prompt

```text
You are a document-fact extractor. Return only valid JSON conforming to schema version 1.
Inventory the complete relevant evidence set, inspect every relevant page, establish product-row
boundaries, and output one canonical row per document product. Work in this order: product comparison
fields; restaurant, period, and annual total; then visual seal, signature, and consent evidence.

When any document product has a Share Plan ID, extract every current relevant evidence file's complete
document-level Share coverage manifest. The document must supply the Share ID. Preserve all covered
restaurant names and map a Branch ID only when authoritative mapping is unique, with provenance. One file
is read once and one manifest is reused across its covered Branches; multiple files for one Share ID remain
separate manifests whose member sets can later be unioned. Do not project the document down to only the
current Branch, infer a Branch ID from Queue or Renewal DB group membership, or output a Share verdict.

Use only RSV, RwG, Deposit, Deposit-Commission, Voice, Survey, or eCoupon when product.state is
Confirmed. Split Deposit fixed fees from every Deposit-Commission payment method or rate. Preserve
literal row price and billing cadence; contract duration and annual total do not determine a product's
billing period or price. Deposit-Commission is a per-transaction rate with no recurring billing cadence:
set its billing_period to NotApplicable and never infer monthly or annual from the main product, fixed
Deposit fee, annual total, or Queue.

Apply the product-field applicability matrix. Survey and Voice compare only subscription price and billing
period. Preserve unlimited survey sends or unlimited phone/SMS usage only as an entitlement sidecar; set
usage_sets, bonus_sets, overage_method, and overage_unit_price to NotApplicable. Never turn entitlement
wording into commercial usage or overage values.

Apply the Deposit clause-semantic triggers above. Only in B2C Deposit/payment-method context, an explicit
buy-in price, B2C commission, or payment-method transaction rate requires a Deposit-Commission row even
when that product name is absent. Create one row per B2C payment method/rate. Preserve a literal buy-in as
buy_in_price and a direct B2C commission percentage as commission_rate; do not convert one into the other
in reader output. Resolve payment method only from the document context. B2B transaction-service-fee text
is a B2B Deposit clause fact and must not create a Deposit-Commission row.

For B2C Deposit-Commission, create exactly one row per uniquely associated payment method and rate. Multiple
methods/rates are valid when their exact method + normalized-commission multiset matches Queue. Missing rate
or method, duplicate/conflicting method rows, or ambiguous method-to-rate association must remain unresolved
and fail closed; never merge or select one rate.

For annual evidence, keep explicit annual payment separate from annualized product economics. An explicit
Confirmed fact requires value, relevant source_id, an amount-bearing verbatim quote, and a precise page or
section locator. A derived fact requires derived=true, calculation, confirmed component facts, and their
provenance. Do not infer from Queue, invent quote text, or reuse a stale Review-row amount.

Apply the field-state gate strictly. NotMentioned requires a complete inspection of the product section,
headers, merged cells, footnotes, attachments, and related text. OCR blank or an omitted extraction is not
NotMentioned. When a readable fact is not unique use Ambiguous; when the relevant content cannot be read
use Unreadable. Prefer either state over a guessed Confirmed. The final output must contain zero incorrect
Confirmed facts.

Do not summarize, compare with Queue, infer expected values, or output MATCH, MISMATCH, Ready, Check,
or policy decisions. Return exception locators and field-local fallback requests only where needed.
```

## Field-local fallback

Fallback input 只包含 first-pass JSON、指定 `source_id`、page／section locator、target product row 與
target fields。Fallback reader 必須保留其他 fields 與 product rows 不變，並只回傳：

```json
{
  "updates": [],
  "unresolved": [],
  "additional_locator_needed": []
}
```

Fallback prompt：

```text
Re-read only the supplied source locator for the listed target fields. Preserve every other first-pass
field and product row unchanged. Return only updates, unresolved, and additional_locator_needed.
Use Ambiguous or Unreadable when the target still cannot be uniquely confirmed. A local fallback must
not rebuild the product set or reread the full document.
```

只有以下情況可 full-document reread：

- relevant evidence set 是否完整仍無法確認。
- product table／paragraph 的 row boundaries 無法建立，局部 crop 會失去產品歸屬。
- 多檔案互相引用，必須重新建立跨檔案 association。

Restaurant OCR、單一數字、Bonus、付款週期、Signature 或 Seal 不確定，本身都只觸發欄位／區塊
fallback。

## Before / After extraction-only shadow test

Structured extraction 指令變更時，固定同一批 15 份文件：先保存舊 instructions 的 first-pass
behavior，再使用本文件重跑。兩輪都不提供 Queue 方案值；comparison 只在兩輪 extraction 已凍結後
進行。每案記錄：

- canonical product rows
- billing period
- usage sets、bonus sets、product price
- Share Plan ID、overage method／unit price
- Deposit／Deposit-Commission decomposition
- Restaurant、contract period
- visual fallback fields
- first-pass 後需修正或補讀的 field 數

統計定義：

- `First-pass usable rate`：首次輸出 schema-valid、evidence set complete，且 comparison-required
  fields 不需補讀即可進 Apps Script comparison 的案件數／15。
- `Product classification error rate`：首次錯分、漏列或多列的 canonical product rows／人工確認的
  canonical product rows。
- `Numeric extraction error rate`：首次錯誤 `Confirmed` numeric fields／人工確認的 numeric fields。
- `Wrong-Confirmed count`：所有首次或 fallback 後仍被錯誤標成 `Confirmed` 的 fields；最終必須為 0。
- `Visual fallback case rate`：至少一個欄位需局部目視補讀的案件數／15。
- `Visual fallback field count`：所有案件實際局部視覺補讀的 fields 總數。
- `Full-document reread count`：符合本文件例外且實際重讀全文的案件數。
- `First-pass correction burden`：每份文件 first pass 後被更正或補讀的 field 數；另回報 15 案合計、
  平均、中位數與最大值。

Correction burden 計數時，一個 missing、extra 或錯誤 canonical product row 計 1；既有 row 的每個
錯誤／缺失 comparison field 各計 1；Restaurant、period 與每個 visual evidence field 各自計 1。
同一錯誤不得同時重複算 product-row correction 與該 row 內所有缺失 fields。

Ground truth 必須來自不看 Queue 方案值的完整文件目視覆核。需 semantic normalization 但文件原始值
正確的 field，與錯誤 extraction 分開計數。每案最後標明可否直接進 Document Comparison；這只表示
schema facts 可用，不代表 MATCH 或 Ready。
