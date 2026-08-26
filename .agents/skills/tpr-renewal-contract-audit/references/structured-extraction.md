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
- `Deposit-Commission`：訂金交易抽成、commission rate、信用卡／LINE Pay 等買入價格或交易費率。
- `Voice`、`Survey`、`eCoupon`：文件能唯一對應該 add-on 時使用。

Ocard、generic add-on 或其他未支援名稱不可硬套 taxonomy；無法唯一對應時輸出 `Ambiguous`。

### Deposit decomposition

- 「訂金月費／年費 + 信用卡買入價格／抽成」拆成一列 `Deposit` 與至少一列
  `Deposit-Commission`。
- 不同 payment method 或不同 rate 各自建立 `Deposit-Commission` row；不得合併成一個範圍、
  平均值或任選其中一個。
- Setup Fee 是 `Deposit.setup_fee`，不是獨立產品。
- B2B 且文件沒有交易抽成／買入價格時，只建立 `Deposit`；不虛構 `Deposit-Commission`。
- `commission_rate` 與 `buy_in_price` 按文件字面擷取。文件只寫買入價格時，不由 reader 改寫成
  抽成；Apps Script 負責 `100 - buy_in_price` 的一致性計算。

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
- `commission_rate`、`buy_in_price`：Deposit-Commission 的交易抽成或買入價格；多種 payment
  method 分列。

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
- `annual_payment_amount_ntd`：文件明載的年繳總額；不得加總 product rows 或由 Queue 回推，並保存
  quote／locator。
- `inline_seal`、`customer_seal`、`signature`：必須實際視覺檢查簽署／用印區。OCR 或檔案存在不能
  證明有或沒有；尚未視覺確認時使用 `Unreadable` 或提出 fallback。
- `consent_evidence`：完整 email thread 的實際同意文字、sender 與 locator；信件檔案存在不等於
  已同意。

建議 sidecar 形狀：

```json
{
  "contract_evidence": {
    "restaurant_name": {"state":"Confirmed","value":"...","source_id":"..."},
    "contract_start_date": {"state":"Confirmed","value":"2026-09-01","source_id":"..."},
    "contract_end_date": {"state":"Confirmed","value":"2027-08-31","source_id":"..."},
    "annual_payment_amount_ntd": {
      "state":"Confirmed","value":21600,"source_id":"...","locator":"page 2 / 給付方式"
    },
    "inline_seal": {"state":"Confirmed","value":true,"source_id":"...","locator":"signature page"},
    "customer_seal": {"state":"Confirmed","value":true,"source_id":"...","locator":"signature page"},
    "signature": {"state":"NotApplicable"},
    "consent_evidence": {"state":"NotApplicable"}
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

Use only RSV, RwG, Deposit, Deposit-Commission, Voice, Survey, or eCoupon when product.state is
Confirmed. Split Deposit fixed fees from every Deposit-Commission payment method or rate. Preserve
literal row price and billing cadence; contract duration and annual total do not determine a product's
billing period or price. Deposit-Commission is a per-transaction rate with no recurring billing cadence:
set its billing_period to NotApplicable and never infer monthly or annual from the main product, fixed
Deposit fee, annual total, or Queue.

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
