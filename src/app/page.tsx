"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTrip } from "@/lib/data";

export default function HomePage() {
  const router = useRouter();
  const [tripName, setTripName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    if (!tripName.trim()) {
      setError("請輸入行程名稱");
      return;
    }

    setCreating(true);
    try {
      const tripId = await createTrip(tripName.trim());
      router.push(`/trip/?id=${tripId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立行程失敗，請稍後再試");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <h1>出遊分帳小工具</h1>
      <p className="subtitle">記錄每筆花費，自動算出誰該轉多少給誰</p>

      <div className="card">
        <label htmlFor="tripName">行程名稱</label>
        <input
          id="tripName"
          type="text"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          placeholder="例如：陽明山健行"
        />

        {error && <p className="error">{error}</p>}

        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={handleCreate} disabled={creating}>
            {creating ? "建立中..." : "建立行程"}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        已經有分享連結了嗎？直接打開朋友傳給你的連結即可，不需要在這裡建立新行程。
      </p>
    </main>
  );
}
