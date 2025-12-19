# 追加実装計画書 （未実装・不足分のBacklog）

作成日: 2025-12-18

対象リポジトリ状態: `exoclim-_-planetary-climate-simulator (2).zip` 相当

---

## 先に：現状の根拠（コード引用）

### A. 実シミュレーション（runSimulation）は **風帯由来の gap を海流に渡している**
```ts
// services/climateEngine.ts
const physForOcean = { ...phys, oceanEcLatGap: windRes.oceanEcLatGapDerived };
const oceanRes = computeOceanCurrents(grid, circulationRes.itczLines, physForOcean, config, planet);
```

### B. しかし海流デバッガーは **raw phys のまま再計算している**（= 実行結果とズレうる）
```ts
// components/OceanDebugView.tsx
const result = computeOceanCurrents(grid, itczLines, phys, config, planet, targetMonth);
```

### C. 海流デバッガーの EC 誘導ラインも **raw phys** を参照
```ts
// components/OceanDebugView.tsx
const gap = phys.oceanEcLatGap;
const ecN = debugData.itczLine.map(l => l + gap);
const ecS = debugData.itczLine.map(l => l - gap);
```

### D. メインの海流表示（oceanCurrent）の補助線も **raw phys** を参照
```ts
// components/visualizer/OverlayRenderer.ts
const separation = physicsParams.oceanEcLatGap;
```

### E. 海流デバッガーの「セル境界」は **等間隔推定（90/cellCount）** で、Step2の境界配列は使っていない
```ts
// components/OceanDebugView.tsx
const cellDeg = 90 / cellCount;
for(let i=1; i<cellCount; i++) {
  const lat = i * cellDeg;
  renderLatHLine(lat, ...);
}
```

### F. Controls の物理タブ表記が旧ステップ（Step 2: 海流）のまま
```tsx
// components/Controls.tsx
<h3 className="text-xs font-bold text-cyan-400 uppercase">Step 2: 海流シミュレーション</h3>
```

---

## 結論（いま不足している核心）

- **計算系としての「風帯→海流」の値渡しは既に成立**しています（A）。
- ただし **UI/デバッグが raw phys を再参照している**ため（B/C/D）、
  - 「渡っていないように見える」
  - 「誘導線と海流が噛み合わない」
  が起きやすい。
- また「誘導線三種（EC/ECC/セル境界）」は、
  - ECC: ITCZライン（誘導に使用）
  - EC: ITCZ±gap（誘導に使用）
  - セル境界: 現状は **参照用オーバーレイ**（海流物理に未使用）
  で、**物理的には同列ではない**。
  ただし **UI表現として“同じカテゴリのガイド”として並列表示**するのは可能で、その方がデバッグしやすい。

このBacklogは、上記のズレを潰しつつ、未実装パラメータの効きやUI整合を段階的に改善します。

---

## 絶対制約（重要）

1. **海流ステップのロジック（`services/physics/ocean.ts`）は変更禁止**
   - アルゴリズム・数式・挙動が変わる修正は不可
   - 許可されるのは **呼び出し側での入力（phys）の差し替え**、UI表示、ドキュメント整備のみ
2. すべての作業は **小さい単位（Unit）** で完了させる。
3. 各Unit完了時に、`docs/handover/UNIT_XX_*.md` を必ず追加し、別実装者でも続きができる申し送りを書く。

---

## 実装Unit一覧（優先順）

### Unit J: 「Effective Phys」配管（実行結果・表示・デバッグのズレ解消）

**目的**
- 実シミュで使った `oceanEcLatGap`（= wind由来の effective値）と、
  oceanCurrent表示・OceanDebugViewの再計算を一致させる。

**やること**
- App側で `effectiveOceanEcLatGap` を決定するヘルパを追加:
  - `effectiveGap = result.wind?.oceanEcLatGapDerived ?? phys.oceanEcLatGap`
- `MapVisualizer` に渡す `physicsParams` を **effectiveGapを反映したコピー**にする
  - `const physForView = {...phys, oceanEcLatGap: effectiveGap}`
- `OceanDebugView` に `effectiveGap` を渡す（Props追加）
  - OceanDebugView内部で `const physForDebug = {...phys, oceanEcLatGap: effectiveGap}` を作り、
    `computeOceanCurrents(..., physForDebug, ...)` で再計算
  - EC誘導ライン描画も `effectiveGap` を使用
- OceanDebugViewのサイドバーに **Configured/Effective** を並べて表示（混乱防止）

**変更ファイル候補**
- `App.tsx`
- `components/OceanDebugView.tsx`
- `components/visualizer/OverlayRenderer.ts`（※physicsParams参照が残るため）

**受け入れ条件（動作確認）**
- `windOceanEcGapMode = 'derivedFromTradePeak'` にした時、
  1) WindDebugViewの「海流への継承 Gap」
  2) oceanCurrentの補助線（EC誘導ライン）
  3) OceanDebugViewのEC誘導ライン
  4) 実際のEC流路
  が同じgapで揃う。

**申し送り**
- `docs/handover/UNIT_J_effective_phys_plumbing.md`

---

### Unit K: 海流デバッガー「誘導線三種」を同じ“ガイド”として並列表示（EC/ECC/セル境界）

**目的**
- ユーザーが「3種類のガイドが同じUIカテゴリで扱われている」ことを一目で理解できる表示にする。
- ただし物理的な使用有無（ECC/ECは使用、セル境界は参照）も誤解なく示す。

**やること**
- OceanDebugViewの表示設定を **“Guides”セクション**に改造
  - ガイド共通UI（同じレイアウト、同じ説明スタイル、同じ色チップ/破線サンプル）
  - 3エントリ:
    1. **ECC Guide**: ITCZライン（いまの `showOverlayITCZ`）
       - ラベル例: `ECC 誘導線（ITCZ）`
       - バッジ: `USED`（物理に使用）
    2. **EC Guide**: ITCZ±gap（いまの `showOverlayECTargets`）
       - ラベル例: `EC 誘導線（ITCZ±gap）`
       - バッジ: `USED`
    3. **Cell Boundaries Guide**: Step2境界（後述 Unit L で供給）
       - ラベル例: `セル境界（風帯Step2）`
       - バッジ: `REF`（参照）
- 3つとも **同じ描画ヘルパ**で扱う
  - `renderGuideLine(GuideSpec)` みたいな形に寄せる
  - スタイル差は `GuideSpec`（color/dash/width）で宣言的に管理
- サイドバーに小さな説明枠を追加:
  - `ECC/ECは海流エージェントが“引かれる線”`
  - `セル境界は風帯モデル由来の参照線（現時点で海流物理には未使用）`

**変更ファイル候補**
- `components/OceanDebugView.tsx`

**受け入れ条件**
- 3種類が同じUIカテゴリで並び、色・破線の凡例が揃っている
- USED/REF の表示で誤解が起きない

**申し送り**
- `docs/handover/UNIT_K_ocean_debug_guides_ui.md`

---

### Unit L: OceanDebugView のセル境界を Step2の境界配列に合わせる（推定から脱却）

**目的**
- OceanDebugViewの「セル境界」が `90/cellCount` の推定ではなく、
  Step2（windBelts）が実際に計算した `cellBoundariesDeg` を使うようにする。

**やること**
- OceanDebugView Propsに `wind?: WindBeltsResult` もしくは `cellBoundariesDeg?: number[]` を追加
- 描画側:
  - `wind.cellBoundariesDeg` があればそれを使う
  - 無ければ従来通り `90/cellCount` フォールバック

**変更ファイル候補**
- `App.tsx`（result.wind を渡す）
- `components/OceanDebugView.tsx`

**受け入れ条件**
- WindDebugViewで見えている境界と、OceanDebugViewの境界線が一致

**申し送り**
- `docs/handover/UNIT_L_cell_boundaries_from_step2.md`

---

### Unit M: oceanCurrent マップ表示のガイドも“同じ3種”に揃える（任意トグル or 常時表示）

**目的**
- OceanDebugViewだけでなく、通常の `Step 3.1 oceanCurrent` ビューでも
  ECC/EC/セル境界のガイドが整合した状態で見えるようにする。

**やること（最小）**
- `OverlayRenderer.ts` の `oceanCurrent` ガイド線を
  - ITCZライン = ECC guide
  - EC attractor lines = EC guide
  に名称・色・破線パターンを OceanDebugView と一致させる
- さらにセル境界（wind.cellBoundariesDeg）も薄い灰色破線で重ねる
  - `data.wind?.cellBoundariesDeg` がある時だけ

**注意**
- ここはUIオーバーレイので海流ロジック変更には該当しない。

**申し送り**
- `docs/handover/UNIT_M_ocean_map_guides_alignment.md`

---

## Unit一覧（優先度順）

> 目安：Unit 1つ = 実装者1人が半日〜1日で終えられる粒度

### Unit J："effective（実際に使われた）パラメータ" をUIへ伝搬させる

**目的**
- 風帯由来の `oceanEcLatGapDerived` が、
  - oceanCurrent表示の補助線
  - 海流デバッガーの誘導線
  - 海流デバッガーの再計算
  のすべてで一致する状態を作る。

**スコープ**（海流ロジックは触らない）
- `App.tsx`
- `components/OceanDebugView.tsx`
- `components/MapVisualizer.tsx`（渡す `physicsParams` を差し替える）
- `components/visualizer/OverlayRenderer.ts`（参照値の取り方を変更）

**設計方針**
- **effectiveOceanEcLatGap** を次で決める（単一関数にする）
  - `result.wind?.oceanEcLatGapDerived ?? phys.oceanEcLatGap`
- `MapVisualizer` へ渡す `physicsParams` は raw ではなく、
  - `physEffectiveForOceanView = { ...phys, oceanEcLatGap: effectiveOceanEcLatGap }`
- `OceanDebugView` へも同様に `physEffectiveForOceanDebug` を渡す。

**UI表示（混乱防止）**
- OceanDebugView 右ペインに
  - `Configured gap (phys.oceanEcLatGap)`
  - `Effective gap (wind/ocean coupling)`
  の2行を並べて表示（差がある場合は色を変える）。

**受け入れ条件（Acceptance）**
- `windOceanEcGapMode='derivedFromTradePeak'` のとき、
  - 風帯の `tradePeakOffset` を変えると
  - oceanCurrentの補助線（EC attractor）が動き
  - 海流デバッガーの誘導線も同じだけ動き
  - さらにデバッガーのエージェント軌跡も同じズレ方向で変わる

**申し送り**
- `docs/handover/UNIT_J_effective_params_plumbing.md`
  - 「effectiveの定義」「rawとの差」「どこで使っているか」を図解（1枚でOK）

---

### Unit K：海流デバッガーの「誘導線三種（EC/ECC/セル境界）」を“同一カテゴリのガイド”として見せる

**目的**
- OceanDebugView上で、EC/ECC/セル境界が**同じUI部品として並列に扱われている**と分かる表示にする。
- 同時に、**セル境界は現状“参照用”で物理には未使用**であることを誤解なく伝える。

**スコープ**
- `components/OceanDebugView.tsx`
- `types.ts`（必要ならOceanDebugView props追加）

**実装要件**
1. 右ペイン「表示設定」を次の構造に変更
   - 見出し：`ガイドレイヤー (Guides)`
   - 3行チェックボックス（同じUIパターン、同じ余白、同じ階層）
     - **ECCガイド**: `ITCZ ライン`（黄）
       - バッジ：`USED`（海流物理で使用）
     - **ECガイド**: `ITCZ ± gap`（水色）
       - バッジ：`USED`
     - **セル境界**: `Wind cell boundaries`（灰）
       - バッジ：`REF`（参照用。未使用）

2. Canvas上の描画も「ガイド描画パイプライン」を統一
   - `renderGuide(name, style, drawFn)` のような形でまとめる
   - スタイル（dash/alpha/lineWidth）の規約を揃える

3. セル境界のデータソースを改善
   - `cellCount`の等分割はフォールバックとして残す
   - 可能なら Step2出力（`result.wind.cellBoundariesDeg`）をpropsで渡して、それを優先

4. “同じように扱ってますよね？”への誤解回避
   - 右ペインに小さな注釈を入れる
     - `USED: シミュレーション内の誘導に使用`
     - `REF : 比較用の参照線（現状は海流の力学に未接続）`

**受け入れ条件**
- 3種のガイドが
  - 同じUI部品（同じフォーマット）で並び
  - 同じ描画系関数から出力され
  - USED/REF の違いが一目で分かる

**申し送り**
- `docs/handover/UNIT_K_ocean_debug_guides_unified.md`

---

### Unit L：oceanCurrent マップ表示の補助線も“ガイドレイヤー”として統一

**目的**
- メインマップ（`mode='oceanCurrent'`）でも、
  - ECCガイド（ITCZ）
  - ECガイド（±gap）
  - セル境界（wind boundaries）
  を同じ思想で表示し、OceanDebugViewと解釈が一致するようにする。

**スコープ**
- `components/visualizer/OverlayRenderer.ts`
- `components/visualizer/Legend.tsx`（凡例更新）
- `services/exporter.ts`（エクスポート凡例更新：任意）

**実装方針**
- `OverlayRenderer` 内で `data.wind?.cellBoundariesDeg` がある場合、
  - oceanCurrent表示にも薄いセル境界線を描く（デフォルトONでも良い）
- ITCZ/ECガイドの色・dash を OceanDebugView と合わせる
- gap は **Unit Jのeffective** を使う（raw physを直接使わない）

**受け入れ条件**
- OceanDebugViewのガイドと、oceanCurrent表示のガイドの位置が一致する

**申し送り**
- `docs/handover/UNIT_L_map_ocean_guides_consistency.md`

---

### Unit M：Controls（物理タブ）のステップ整合 + 風帯パラメータUI追加

**目的**
- Controlsの表記を現在のステップに合わせる
- 風帯（Step2）の主要パラメータをUIで調整できるようにする
- "manual / derived" の挙動をUIから切り替え可能にする

**スコープ**
- `components/Controls.tsx`
- `constants.ts`（デフォルト値の見直しは“必要最小限”）

**作業内容**
1. 見出しの修正
   - `Step 2: 海流シミュレーション` → `Step 3: 海流シミュレーション`
   - 新しく `Step 2: 風帯（Wind Belts）` セクションを追加

2. 風帯パラメータUI（最小）
   - `windHadleyWidthScale`
   - `windJetSpacingExp`
   - `windBaseSpeedEasterly / Westerly`
   - `windSpeedRotationExp`
   - `windItczConvergenceSpeed / Width`
   - `windPressureAnomalyMax / BeltWidth`
   - `windTradePeakOffsetMode`（abs/hadleyFracのラジオ）
   - `windTradePeakOffsetDeg / windTradePeakOffsetFrac`
   - `windOceanEcGapMode`（manual/derivedのラジオ）
   - `windOceanEcGapClampMin / Max`

3. Ocean側の gap スライダーの扱い
   - `windOceanEcGapMode=derived` のときは
     - `oceanEcLatGap` スライダーを「設定値」扱いにするか、読み取り専用にしても良い
     - 少なくとも UIに "manual時のみ海流に直結" を注記

**受け入れ条件**
- 風帯の主要定数をUIから触れる
- manual/derived 切替ができ、Unit Jのeffective表示で差が見える

**申し送り**
- `docs/handover/UNIT_M_controls_wind_params.md`

---

### Unit N：Step2（WindBelts）の未使用パラメータを“効くように”する

**目的**
- 現状表示だけ存在するが計算に未反映の値を、モデルに組み込む
  - `windDoldrumsWidthDeg`
  - `windTradePeakWidthDeg`

**根拠（未使用の兆候）**
- `computeWindBelts` は `doldrumsHalfWidthDeg` を返すが、u計算で使っていない
```ts
// services/physics/windBelts.ts
return { doldrumsHalfWidthDeg: phys.windDoldrumsWidthDeg, ... }
```

**実装アイデア（最小で破綻しにくい形）**
- Tropical Zone の `profile` に2つの係数を掛ける
  1) **doldrums係数**：ITCZ近傍でuを抑える
     - `d = absDistToItcz`
     - `dold = smoothstep(d / doldrumsWidth)` のような0→1
  2) **peak幅係数**：tradeOffset付近を太らせる/細らせる
     - `gauss = exp(-(d - tradeOffset)^2 / (2*sigma^2))`
     - `sigma = windTradePeakWidthDeg / 2.355`（FWHM→σ）

- 最終的に `u = -min(Ucap, base * profile * dold * gaussNormalized)`

**受け入れ条件**
- `windDoldrumsWidthDeg` を大きくすると ITCZ近傍の風が弱くなる領域が広がる
- `windTradePeakWidthDeg` を変えると貿易風の帯の太さが変わる

**申し送り**
- `docs/handover/UNIT_N_wind_unused_params_activated.md`

---

### Unit O：Step4（気流詳細）タブのプレイスホルダ整備（黒画面回避）

**目的**
- Step4をクリックしたときに真っ黒表示にならないようにする
- 今は未実装であることが明確で、デバッグ導線として使える状態にする

**根拠（黒画面になりうる）**
- `drawPixels` は未知modeだと何も塗らず黒になる
```ts
// components/visualizer/PixelRenderer.ts
if (mode === 'temp' || ...) { ... } // else は r,g,b=0のまま
```

**実装方針（どちらか1つでOK）**
1) `PIPELINE_STEPS` の Step4 にサブステップを追加し、
   - `airflow_placeholder` を `wind` 表示にマップする
2) もしくは `MapVisualizer` 側で
   - 未知modeは `wind` にフォールバック

**UI注記**
- Step4のラベルに `（未実装）` を付ける
- クリック時にトースト/ツールチップで「今はStep2の風を表示します」と出す

**申し送り**
- `docs/handover/UNIT_O_step4_placeholder.md`

---

### Unit P：ドキュメント整理（実装文書のアーカイブを含む）

**目的**
- 設計・実装の履歴が散らばらない状態を作る
- 今回までの計画書（v1/v2）を"アーカイブ"し、現行の正本を1つにする
- 仕様書と実装の不整合を最小限修正する（コード変更ではなくドキュメント側）

**作業内容**
1) ディレクトリ整備
- `docs/plans/`：正本（最新版のみ）
- `docs/archive/plans/`：旧計画書
- `docs/archive/code/`：不要になったファイル退避（例：未使用の `components/App.tsx`）

2) 計画書のアーカイブ
- 旧版（例）
  - `IMPLEMENTATION_PLAN_STEP2_WIND_STEP3_OCEAN_STEP4_AIRFLOW.md`
  - `IMPLEMENTATION_PLAN_v2_STEP2_WIND_STEP3_OCEAN_STEP4_AIRFLOW_UI.md`
  を `docs/archive/plans/2025-12-18_*.md` として格納
- `docs/plans/IMPLEMENTATION_PLAN_CURRENT.md` に v3 を配置

3) 目次（index）作成
- `docs/README.md` を追加し、
  - ITCZ仕様 (`docs/itcz_spec.md`)
  - 海流仕様 (`docs/ocean_current_spec.md`)
  - handover一覧
  - plan（current）
  - archive
  をリンクで繋ぐ

4) 仕様書の整合修正（ドキュメントのみ）
- `docs/ocean_current_spec.md` は記述が `oceanDeflectLat/2` 前提になっているので、
  - 現実装の `oceanEcLatGap` を主語に直す
  - さらに「風帯から派生させる（derived）」ルートがある旨を追記

**注意**
- これは “文書の再配置と記述修正” であり、海流ロジック変更ではない。

**申し送り**
- `docs/handover/UNIT_P_docs_archive_and_index.md`

---

### Unit Q：診断（System diagnostics）に「風帯→海流の整合」チェックを追加

**目的**
- "渡ってない気がする" を、診断画面で即判定できるようにする

**スコープ**
- `utils/testSuite.ts`
- `components/TestOverlay.tsx`（表示増強）

**追加する診断例**
- `wind.oceanEcLatGapDerived` が存在するか
- `Configured gap` と `Effective gap` の差分を表示
- oceanCurrent表示の補助線に effective を使っているか（フラグ）

**受け入れ条件**
- derived運用時に「effective gapが有効」と表示される
- manual運用時は「effective = configured」と出る

**申し送り**
- `docs/handover/UNIT_Q_diagnostics_coupling.md`

---

## 任意（スコープ拡大だが、先に手当てすると混乱が減る改善）

### Optional R：温度・降水が未計算のとき Charts を "未実装" 表示にする

**背景**
- 現状 `thermodynamics.ts/insolation.ts/hydrology.ts` がスタブなので、
  - `globalTemp` や `cell.temp` が 0K のままになり、チャートが誤解を招く。

**最小対応案**
- Chartsヘッダに `Thermo/Hydro not implemented` を表示し、値を灰色にする
- もしくはチャート自体を隠して「未実装」パネルを出す

（ここはあなたのアプリの優先度次第。海流/風帯の作業中は“誤解防止”だけでも価値がある）

---

## 推奨実行順（依存関係）

1. **Unit J**（まずズレを消す）
2. **Unit K**（OceanDebugガイド統一）
3. **Unit L**（oceanCurrent表示のガイド統一）
4. **Unit M**（Controls整合と風帯UI）
5. **Unit N**（未使用パラメータ効かせる）
6. **Unit O**（Step4プレイスホルダ）
7. **Unit P**（文書アーカイブとindex）
8. **Unit Q**（診断強化）

---

## Handoverテンプレ（Unitごとに必須）

`docs/handover/UNIT_XX_*.md` は最低限この形で残す：

- 目的
- 変更ファイル一覧
- 変更点（UI/ロジック/型）
- 追加・変更した入出力（Props/Result/Phys）
- 動作確認手順（再現できるチェックリスト）
- 既知の制限
- 次のUnitへの宿題
- **変更禁止領域の再掲**（特に `services/physics/ocean.ts`）
