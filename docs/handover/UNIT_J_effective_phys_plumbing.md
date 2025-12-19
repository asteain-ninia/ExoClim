# Handover Note: Unit J - Effective Physics Plumbing

## 目的
シミュレーション実行時、地図表示（Overlay）、および海流デバッガー（OceanDebugView）の3箇所で、実際に使用されている物理パラメータ（特に `oceanEcLatGap`）を完全に同期させる。
これにより、「風帯モデルから導出された海流分岐緯度」が正しく画面に反映されない問題を解消した。

## 変更点
- **App.tsx**: 
  - `effectivePhys` を `useMemo` で定義。`result.wind.oceanEcLatGapDerived` が存在すればそれを使い、なければ raw の `phys.oceanEcLatGap` を使用する。
  - `MapVisualizer` および `OceanDebugView` にこの `effectivePhys` を渡すように変更。
- **OceanDebugView.tsx**:
  - `phys` (Configured/Raw) と `effectivePhys` (Effective) の両方を受け取るように props を拡張。
  - 内部の `computeOceanCurrents` 再計算と、ガイド線（EC Targets）の描画に `effectivePhys` を使用するように修正。
  - サイドバーに `Configured Gap` と `Effective Gap` を並べて表示し、結合状態を可視化した。

## 動作確認
1. `windOceanEcGapMode` を `derivedFromTradePeak` に設定してシミュレーションを実行。
2. `OceanDebugView` を開き、サイドバーの `Effective Gap` が `Configured Gap` と異なり、かつ貿易風のピーク（WindDebugViewで確認可能）と一致していることを確認。
3. デバッガー内の水色の誘導線（EC Targets）が、実際のエージェントの流れと一致していることを確認。
4. メインマップの海流表示（Step 3.1）の補助線も同様に一致していることを確認。

## 次のユニットへの申し送り
- 次は **Unit K: 海流デバッガー「誘導線三種」のUI統合** に進んでください。
- `OceanDebugView` の「表示設定」を `Guides` セクションとしてまとめ、ECC/EC/セル境界を同一のスタイル・凡例で管理するように改善します。
- **重要**: `services/physics/ocean.ts` の内部ロジックは引き続き変更禁止です。