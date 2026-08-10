import { supabase } from "./supabaseClient";
import { expensePaidKey } from "./settlement";
import { randomId } from "./id";
import type { Participant } from "./participants";
import type { ActivityLogEntry, Expense, Trip } from "./types";

export async function createTrip(name: string): Promise<string> {
  const tripId = randomId("trip");
  const { error } = await supabase.from("trips").insert({ id: tripId, name });
  if (error) throw new Error(error.message);
  return tripId;
}

export async function loadTrip(tripId: string): Promise<Trip | null> {
  const [tripRes, expensesRes, extrasRes, settlementsRes, logRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
    supabase.from("expenses").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("extra_participants").select("*").eq("trip_id", tripId),
    supabase.from("expense_settlements").select("*, expenses!inner(trip_id)").eq("expenses.trip_id", tripId),
    supabase
      .from("activity_log")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (tripRes.error) throw new Error(tripRes.error.message);
  if (!tripRes.data) return null;
  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (extrasRes.error) throw new Error(extrasRes.error.message);
  if (settlementsRes.error) throw new Error(settlementsRes.error.message);
  if (logRes.error) throw new Error(logRes.error.message);

  const expensePaid: Record<string, boolean> = {};
  for (const s of settlementsRes.data) {
    if (s.paid) expensePaid[expensePaidKey(s.expense_id, s.participant_id)] = true;
  }

  return {
    tripId: tripRes.data.id,
    name: tripRes.data.name,
    createdAt: tripRes.data.created_at,
    extraParticipants: extrasRes.data.map((p): Participant => ({ id: p.id, name: p.name })),
    expenses: expensesRes.data.map(
      (e): Expense => ({
        id: e.id,
        title: e.title ?? "",
        payerId: e.payer_id,
        totalAmount: Number(e.total_amount),
        splitType: e.split_type,
        shares: e.shares,
        createdAt: e.created_at,
      }),
    ),
    expensePaid,
    activityLog: logRes.data.map((l): ActivityLogEntry => ({ id: l.id, message: l.message, createdAt: l.created_at })),
  };
}

export async function logActivity(tripId: string, message: string): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({ trip_id: tripId, message });
  if (error) throw new Error(error.message);
}

export async function addExpense(tripId: string, expense: Expense): Promise<void> {
  const { error } = await supabase.from("expenses").insert({
    id: expense.id,
    trip_id: tripId,
    title: expense.title || null,
    payer_id: expense.payerId,
    total_amount: expense.totalAmount,
    split_type: expense.splitType,
    shares: expense.shares,
  });
  if (error) throw new Error(error.message);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);
}

export async function addExtraParticipant(tripId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("extra_participants")
    .insert({ id: randomId("guest"), trip_id: tripId, name });
  if (error) throw new Error(error.message);
}

export async function deleteExtraParticipant(participantId: string): Promise<void> {
  const { error } = await supabase.from("extra_participants").delete().eq("id", participantId);
  if (error) throw new Error(error.message);
}

export async function setExpensePaid(
  expenseId: string,
  participantId: string,
  paid: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("expense_settlements")
    .upsert({ expense_id: expenseId, participant_id: participantId, paid }, { onConflict: "expense_id,participant_id" });
  if (error) throw new Error(error.message);
}

// Notifies `onChange` whenever anyone (including another browser tab) adds/edits
// data for this trip, so every open page stays in sync without a manual refresh.
export function subscribeToTrip(tripId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`trip-${tripId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "extra_participants", filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    // expense_settlements isn't filterable by trip_id directly (it only has expense_id),
    // so listen unfiltered and just refetch — this trip's own subscription rarely fires anyway.
    .on("postgres_changes", { event: "*", schema: "public", table: "expense_settlements" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_log", filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
