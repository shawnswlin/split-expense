# 出遊分帳小工具（split-expense）

朋友出遊時常常是一個人先統一代墊費用，之後大家再各自還錢，但代墊的人常常記不清楚誰還沒還。這是一個免費、不需要註冊登入的分帳網站：

- 記錄每一筆花費是誰付的、總金額多少、項目名稱（例如「報名費」「吃飯」）
- 每筆帳目可以勾選誰有參加，分攤方式可以均分或自訂每人金額
- 參與者除了固定名單，也可以每次出遊臨時新增額外的人（例如朋友的朋友）
- 每一筆帳目底下直接列出「誰要付多少給付款人」，可以個別勾選「已付」追蹤進度（不同筆帳目分開算，不會互相合併）
- 更動紀錄：新增/刪除帳目、新增/刪除參與者、勾選已付，都會留下一筆紀錄可以回顧

所有開著同一個行程連結的人都會即時看到彼此的更新，不用手動重新整理。

## 架構

- **前端**：Next.js（`output: export` 純靜態匯出），部署在 GitHub Pages
- **資料庫**：[Supabase](https://supabase.com)（免費方案的 Postgres），瀏覽器直接用 `@supabase/supabase-js` 呼叫，資料表結構見 [`supabase/schema.sql`](supabase/schema.sql)（`trips` / `expenses` / `extra_participants` / `expense_settlements` / `activity_log`）
- **即時同步**：透過 Supabase Realtime 訂閱同一行程的異動，任何人新增/刪除帳目、勾選已付狀態，其他人畫面會自動更新
- **Keep-alive**：[`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) 每週一自動打一次 Supabase API，避免免費專案因為太久沒活動被自動暫停

沒有帳號系統、沒有權限分級——任何拿到行程連結的人都能新增/刪除帳目、勾選已付狀態。這個設計前提是：**分帳資料本身不是機密（金額、誰欠誰沒有隱私疑慮），使用情境是彼此信任的朋友之間，就算資料被亂改，代價也很低**。如果你的使用情境不是這樣，不建議直接用這個做法。

沒有登入，所以「更動紀錄」只能記錄「發生了什麼事、什麼時候」，沒辦法記錄「是誰做的」。

程式碼裡的 Supabase URL 和 `anon` / `publishable` key（見 `src/lib/config.ts`）是刻意公開寫在原始碼裡的——這不是帳號密碼，是 Supabase 設計上就給前端公開使用的公開金鑰，實際的存取權限由資料庫的 Row Level Security 規則決定（目前設定成完全開放讀寫，對應上面說的使用情境）。

## 想要自己的一份？Fork 這個 repo

1. Fork 這個 repo 到你自己的帳號
2. 到 [supabase.com](https://supabase.com/dashboard) 建立一個免費專案，到 Project Settings → API Keys 拿到 **Project URL** 和 **anon / publishable key**
3. 到 Supabase 的 SQL Editor，貼上 [`supabase/schema.sql`](supabase/schema.sql) 的內容並執行，建立資料表
4. 修改 `src/lib/config.ts`，換成你自己的 Project URL 和 key
5. 修改 `src/lib/participants.ts`，改成你自己這群朋友的固定名單
6. 修改 [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) 裡的 URL 和 key，換成你自己的（不然它會一直打到原作者的 Supabase 專案，對你自己的沒用）
7. 到 repo 的 Settings → Pages，把 Source 設成 "GitHub Actions"
8. Push 到 `main` 分支，GitHub Actions 會自動 build 並部署到 `https://<你的帳號>.github.io/<repo名稱>/`

Supabase 免費專案如果連續 7 天沒有任何活動會自動暫停；上面第 6 步設定好 keep-alive workflow 之後就不用管這件事了，它會每週自動保持專案活躍。

## 本機開發

```bash
npm install
npm run dev      # 開發模式，預設 http://localhost:3000
npm run build    # 產生靜態網站到 out/ 目錄
npm run lint
```
