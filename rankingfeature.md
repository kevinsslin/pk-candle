# Ranking Feature Plan (Season 1)

這份計畫基於目前 repo 的 WebSocket 房間架構與全域排行榜流程，新增「單人排位」與動態匹配機制，同時保留現有自建房/房間邀請模式。Season 1 不做賽季重置；只預留 `seasonId` 以便 Season 2 做 mapping/重置。

## Scope
- In: 單人排位模式、動態匹配範圍、結算與段位/積分、匹配隊列與房間生成、結果展示、錢包綁定策略
- Out: 組隊排位、公會/賽事系統、反作弊深度方案、跨區基礎設施、賽季重置/衰減

## Repo Scan (關鍵現況)
- `apps/server/src/index.ts`: WS server 管理房間/房主/倒數開局/交易；無匹配隊列；禁止中途加入；結算後提交 leaderboard。
- `apps/server/src/schema.ts` + `apps/server/src/db.ts`: 只有 `sessions`/`leaderboard_entries`；無 rating/season/match tables。
- `packages/shared/src/protocol.ts`: WS message types 沒有 queue/match/score delta。
- `apps/web/src/App.tsx` + `apps/web/src/pages/LeaderboardPage.tsx`: Web UI 有大廳與排行榜；結算 UI 只顯示本地與全域 ROI。
- `apps/server/src/auth.ts`: 現在用 Privy（可選）取得 wallet；可 `REQUIRE_PRIVY_FOR_LEADERBOARD`。

## Plan (Season 1)
1. **定義排位資料模型**
   - 新增 tables（最小可行）：`ranked_seasons`, `player_ratings`, `ranked_matches`, `ranked_match_players`。
   - 每局記錄：`seasonId`, `roomId`, `finishedAt`, `placements`, `delta`, `ratingAfter`, `wallet/user`。
   - 以 `walletAddress` 或 `userId` 作為主鍵；無驗證者標記為 `unverified`。

2. **匹配隊列與房間生成**
   - 新增 queue manager（初期可 in‑memory，保留 Redis 介面）。
   - Queue ticket：`clientId`, `wallet/user`, `rating`, `enqueuedAt`, `region`, `isVerified`。
   - 當匹配成功（6 人或 2–6 人）→ 生成私有 roomId + roomKey，自動 `join`；不足名額由 bot 補位。

3. **動態匹配範圍 (避免排不到)**
   - 初始範圍：同段位或 `±50 rating`。
   - 超過 30s：允許跨 1 段位。
   - 超過 60s：允許 2–6 人開局（Bot 補位預設開啟）。

4. **排位積分模型 (6 人 FFA)**
   - 轉換名次為分數：`score = (N - rank) / (N - 1)`。
   - 期望分：`expected = avg(1 / (1 + 10^((oppRating - myRating)/400)))`。
   - Delta：`K * (score - expected) + placementBonus[rank]`。
   - K 值：新手 10 場內 40；其後 20；高分段可降至 16。
   - `placementBonus` (N=6) 例：`+8, +4, +1, -1, -4, -8`。

5. **段位與分數展示 (銅/銀/金/白金/鑽石 + I/II/III)**
   - 起始分數：`1000`（銅 II）。
   - 段位區間（每段 300 分，每小段 100 分）：  
     - **銅**：III `900–999` / II `1000–1099` / I `1100–1199`  
     - **銀**：III `1200–1299` / II `1300–1399` / I `1400–1499`  
     - **金**：III `1500–1599` / II `1600–1699` / I `1700–1799`  
     - **白金**：III `1800–1899` / II `1900–1999` / I `2000–2099`  
     - **鑽石**：III `2100–2199` / II `2200–2299` / I `>= 2300`  
   - 每位玩家同時顯示：`rating 數字` + `段位名稱（如：金 II）`。
   - 全域排位榜：依 `rating` 排序，顯示全球名次與段位。

6. **結算 UI 與房內結果展示**
   - 結束畫面顯示：名次、加減分、更新後段位、歷史變動。
   - 房內榜單顯示 score delta；leaderboard 頁新增「排位榜」tab。

7. **協議與前端整合**
   - 新增 WS message：`ranked_queue_status`, `ranked_match_found`, `ranked_match_cancelled`, `ranked_match_result`。
   - 前端新增「Solo Ranked」入口，顯示排隊時間與範圍擴張狀態。

8. **錢包/身份策略**
   - 採用方案 B：導入 SIWE，驗證後才可排位。
   - UI 明確提示「不會發送交易，只是簽名驗證身份」。

9. **測試與驗證**
   - 單元測試：分數/名次/期望分計算。
   - 模擬低人數排隊與擴張邏輯。
   - e2e：排隊 → 匹配 → 自動入房 → 結算 → 排位榜更新。

## Plan Review (可行性/風險檢查)
- **可行性**：現有 WS room 模型適合擴充 queue + auto‑join，DB 也已有 leaderboard pipeline，可沿用結構擴表。
- **低人數風險**：若不允許 4–6 或 bot，排隊會卡死；動態範圍 + fallback 必須先落地。
- **身份風險**：已決定 SIWE，降低小號/冒用風險。
- **結算可解釋性**：Elo 期望分 + 名次分數 + 小幅名次 bonus 可解釋，避免純名次加扣造成極端落差。
- **可擴展**：預留 `seasonId` 欄位，Season 2 僅新增 mapping 公式即可，不影響 Season 1 資料。

## 可解釋性說明 (給產品/玩家)
- **名次分數 score**：6 人局，第 1 名的 `score=1`，第 6 名 `score=0`，中間線性遞減。
- **期望分 expected**：把你和每位對手的分差換算成「你該贏的機率」，再取平均；強者遇到弱者，expected 就高，贏了加分少、輸了扣分多。
- **最終加減分**：`K * (score - expected)` 再加上一點名次 bonus，讓名次更直觀。

## Open Questions (需對齊)
- 低人數排位的 bot 強度是否需要做更細的分級（與段位/Rating 連動）？
