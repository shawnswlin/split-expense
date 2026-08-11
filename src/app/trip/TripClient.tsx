"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addExpense as addExpenseRequest,
  addExtraParticipant as addExtraParticipantRequest,
  deleteExpense as deleteExpenseRequest,
  deleteExtraParticipant as deleteExtraParticipantRequest,
  loadTrip,
  logActivity,
  setExpensePaid,
  subscribeToTrip,
} from "@/lib/data";
import { randomId } from "@/lib/id";
import { FIXED_PARTICIPANTS, type Participant } from "@/lib/participants";
import { expenseDebts } from "@/lib/settlement";
import type { Expense, ExpenseShare, Trip } from "@/lib/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export default function TripClient() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id") ?? "";

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    if (!tripId) return;
    return loadTrip(tripId)
      .then((t) => {
        if (!t) setLoadError("找不到這個行程，連結可能有誤");
        setTrip(t);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "載入失敗");
      });
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    refresh()!.finally(() => setLoading(false));
    const unsubscribe = subscribeToTrip(tripId, () => refresh());
    return unsubscribe;
  }, [tripId, refresh]);

  const participants: Participant[] = useMemo(
    () => [...FIXED_PARTICIPANTS, ...(trip?.extraParticipants ?? [])],
    [trip],
  );

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? id;

  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Set<string>>(new Set());

  function toggleSummaryExpanded(participantId: string) {
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  type SpendingItem = { expenseId: string; title: string; amount: number };

  const spendingSummary = useMemo(() => {
    const totals = new Map<string, { spent: number; items: SpendingItem[] }>();
    for (const p of participants) totals.set(p.id, { spent: 0, items: [] });
    for (const expense of trip?.expenses ?? []) {
      for (const share of expense.shares) {
        const shareTotals = totals.get(share.participantId);
        if (!shareTotals) continue;
        shareTotals.spent = round2(shareTotals.spent + share.amount);
        shareTotals.items.push({
          expenseId: expense.id,
          title: expense.title || nameOf(expense.payerId),
          amount: share.amount,
        });
      }
    }
    return participants.map((p) => ({ id: p.id, name: p.name, ...(totals.get(p.id) ?? { spent: 0, items: [] }) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, trip?.expenses]);

  async function runAction(action: () => Promise<void>, logMessage?: string) {
    setActionError(null);
    setSaving(true);
    try {
      await action();
      if (logMessage) await logActivity(tripId, logMessage);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "操作失敗，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  function addExtraParticipant(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    runAction(() => addExtraParticipantRequest(tripId, trimmed), `新增參與者：${trimmed}`);
  }

  function deleteExtraParticipant(participantId: string) {
    const name = nameOf(participantId);
    runAction(() => deleteExtraParticipantRequest(participantId), `刪除參與者：${name}`);
  }

  function addExpense(expense: Expense) {
    const label = expense.title ? `${expense.title}（${nameOf(expense.payerId)}付）` : nameOf(expense.payerId);
    runAction(() => addExpenseRequest(tripId, expense), `新增帳目：${label} $${fmt(expense.totalAmount)}`);
  }

  function deleteExpense(expenseId: string) {
    const expense = trip?.expenses.find((e) => e.id === expenseId);
    const label = expense ? (expense.title ? `${expense.title}（${nameOf(expense.payerId)}付）` : nameOf(expense.payerId)) : expenseId;
    runAction(() => deleteExpenseRequest(expenseId), `刪除帳目：${label}`);
  }

  function toggleExpensePaid(expenseId: string, participantId: string, currentlyPaid: boolean) {
    const expense = trip?.expenses.find((e) => e.id === expenseId);
    const label = expense ? (expense.title || nameOf(expense.payerId)) : expenseId;
    const message = currentlyPaid
      ? `標記 ${nameOf(participantId)} 尚未付「${label}」`
      : `標記 ${nameOf(participantId)} 已付「${label}」`;
    runAction(() => setExpensePaid(expenseId, participantId, !currentlyPaid), message);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!tripId) {
    return (
      <main>
        <p className="error">連結缺少行程 ID</p>
      </main>
    );
  }
  if (loading) return <main>載入中...</main>;
  if (loadError || !trip)
    return (
      <main>
        <p className="error">{loadError ?? "載入失敗"}</p>
      </main>
    );

  return (
    <main>
      <h1>{trip.name}</h1>

      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={copyLink}>{copied ? "已複製！" : "複製分享連結"}</button>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      <AddExpenseForm
        participants={participants}
        extraParticipants={trip.extraParticipants}
        disabled={saving}
        onSubmit={addExpense}
        onAddExtraParticipant={addExtraParticipant}
        onDeleteExtraParticipant={deleteExtraParticipant}
      />

      <h2>帳目紀錄</h2>
      <div className="card">
        {trip.expenses.length === 0 && <p className="muted">還沒有任何帳目</p>}
        {[...trip.expenses]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((expense) => {
            const debts = expenseDebts(expense, trip.expensePaid);
            return (
              <div className="expense-item" key={expense.id}>
                <div className="row">
                  <strong>{expense.title ? `${expense.title}（${nameOf(expense.payerId)}）` : nameOf(expense.payerId)}</strong>
                  <span>${fmt(expense.totalAmount)}</span>
                  <button
                    disabled={saving}
                    onClick={() => {
                      if (window.confirm("確定要刪除這筆帳目嗎？")) deleteExpense(expense.id);
                    }}
                  >
                    刪除
                  </button>
                </div>
                {debts.length === 0 && <p className="muted">只有付款人自己，不用分攤</p>}
                {debts.map((debt) => (
                  <div className="row" key={debt.participantId} style={{ marginTop: 6 }}>
                    <span style={{ textDecoration: debt.paid ? "line-through" : "none" }}>
                      {nameOf(debt.participantId)} 要付 ${fmt(debt.amount)} 給 {nameOf(expense.payerId)}
                    </span>
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={debt.paid}
                        disabled={saving}
                        onChange={() => toggleExpensePaid(expense.id, debt.participantId, debt.paid)}
                      />
                      已付
                    </label>
                  </div>
                ))}
              </div>
            );
          })}
      </div>

      <h2>花費總覽</h2>
      <div className="card">
        {spendingSummary.map((p) => {
          const expanded = expandedSummaryIds.has(p.id);
          return (
            <div key={p.id}>
              <div
                className="expense-item row"
                style={{ cursor: "pointer" }}
                onClick={() => toggleSummaryExpanded(p.id)}
              >
                <span>{expanded ? "▾" : "▸"} {p.name}</span>
                <span>花費 ${fmt(p.spent)}</span>
              </div>
              {expanded && (
                <div style={{ padding: "0 16px 8px" }}>
                  {p.items.length === 0 && <p className="muted">沒有分攤到任何帳目</p>}
                  {p.items.map((item, i) => (
                    <div className="row" key={`${item.expenseId}-${i}`} style={{ marginTop: 4 }}>
                      <span className="muted">{item.title}</span>
                      <span>${fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2>更動紀錄</h2>
      <div className="card">
        {trip.activityLog.length === 0 && <p className="muted">還沒有任何紀錄</p>}
        {trip.activityLog.map((entry) => (
          <div className="expense-item row" key={entry.id}>
            <span>{entry.message}</span>
            <span className="muted">{formatTime(entry.createdAt)}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AddExpenseForm({
  participants,
  extraParticipants,
  disabled,
  onSubmit,
  onAddExtraParticipant,
  onDeleteExtraParticipant,
}: {
  participants: Participant[];
  extraParticipants: Participant[];
  disabled: boolean;
  onSubmit: (expense: Expense) => void;
  onAddExtraParticipant: (name: string) => void;
  onDeleteExtraParticipant: (participantId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [payerId, setPayerId] = useState(participants[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(participants.map((p) => p.id)));
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [extraName, setExtraName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local selection state when the roster grows (e.g. a guest is added)
    if (!payerId && participants[0]) setPayerId(participants[0].id);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of participants) next.add(p.id);
      return next;
    });
    // Only run when the participant roster grows (e.g. a guest was just added).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.length]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setFormError(null);
    const total = parseFloat(totalAmount);
    if (!payerId) {
      setFormError("請選付款人");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setFormError("請輸入正確的總金額");
      return;
    }
    const selectedIds = [...selected];
    if (selectedIds.length === 0) {
      setFormError("至少要勾選一位參加者");
      return;
    }

    let shares: ExpenseShare[];
    if (splitType === "equal") {
      const base = round2(total / selectedIds.length);
      shares = selectedIds.map((id) => ({ participantId: id, amount: base }));
      const diff = round2(total - shares.reduce((sum, s) => sum + s.amount, 0));
      if (diff !== 0) shares[0].amount = round2(shares[0].amount + diff);
    } else {
      shares = selectedIds.map((id) => ({
        participantId: id,
        amount: round2(parseFloat(customAmounts[id] || "0")),
      }));
      const sum = round2(shares.reduce((s, share) => s + share.amount, 0));
      if (Math.abs(sum - total) > 0.01) {
        setFormError(`自訂金額加總（$${fmt(sum)}）跟總金額（$${fmt(total)}）不一致`);
        return;
      }
    }

    onSubmit({
      id: randomId("exp"),
      title: title.trim(),
      payerId,
      totalAmount: total,
      splitType,
      shares,
      createdAt: new Date().toISOString(),
    });

    setTitle("");
    setTotalAmount("");
    setCustomAmounts({});
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>新增帳目</h2>

      <label>項目名稱（選填）</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例如：報名費、吃飯"
        disabled={disabled}
      />

      <label>付款人</label>
      <select
        value={payerId}
        onChange={(e) => setPayerId(e.target.value)}
        disabled={disabled}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
      >
        {participants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <label>總金額</label>
      <input
        type="number"
        value={totalAmount}
        onChange={(e) => setTotalAmount(e.target.value)}
        placeholder="0"
        disabled={disabled}
      />

      <label>這筆誰有參加</label>
      <div className="chip-row">
        {participants.map((p) => (
          <span
            key={p.id}
            className={`chip ${selected.has(p.id) ? "selected" : ""}`}
            onClick={() => !disabled && toggleSelected(p.id)}
          >
            {p.name}
          </span>
        ))}
      </div>

      <label>臨時新增這次的參與者（不在固定名單上的人）</label>
      <div className="row">
        <input
          type="text"
          value={extraName}
          onChange={(e) => setExtraName(e.target.value)}
          placeholder="輸入名字"
          disabled={disabled}
        />
        <button
          disabled={disabled || !extraName.trim()}
          onClick={() => {
            onAddExtraParticipant(extraName);
            setExtraName("");
          }}
        >
          新增
        </button>
      </div>
      {extraParticipants.length > 0 && (
        <div className="chip-row">
          {extraParticipants.map((p) => (
            <span key={p.id} className="chip">
              {p.name}
              <span
                onClick={() => !disabled && onDeleteExtraParticipant(p.id)}
                style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
      )}

      <label>分攤方式</label>
      <div className="chip-row">
        <span
          className={`chip ${splitType === "equal" ? "selected" : ""}`}
          onClick={() => !disabled && setSplitType("equal")}
        >
          均分
        </span>
        <span
          className={`chip ${splitType === "custom" ? "selected" : ""}`}
          onClick={() => !disabled && setSplitType("custom")}
        >
          自訂每人金額
        </span>
      </div>

      {splitType === "custom" && (
        <div style={{ marginTop: 12 }}>
          {[...selected].map((id) => (
            <div key={id} style={{ marginTop: 8 }}>
              <label style={{ marginTop: 0 }}>{participants.find((p) => p.id === id)?.name}</label>
              <input
                type="number"
                value={customAmounts[id] ?? ""}
                onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [id]: e.target.value }))}
                placeholder="0"
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      {formError && <p className="error">{formError}</p>}

      <div style={{ marginTop: 16 }}>
        <button className="primary" onClick={handleSubmit} disabled={disabled}>
          新增這筆帳目
        </button>
      </div>
    </div>
  );
}
