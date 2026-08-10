import type { Expense } from "./types";

export type ExpenseDebt = { participantId: string; amount: number; paid: boolean };

export function expensePaidKey(expenseId: string, participantId: string): string {
  return `${expenseId}:${participantId}`;
}

// Who owes the payer what, for this expense alone (no cross-expense netting).
export function expenseDebts(expense: Expense, paidMap: Record<string, boolean>): ExpenseDebt[] {
  return expense.shares
    .filter((s) => s.participantId !== expense.payerId)
    .map((s) => ({
      participantId: s.participantId,
      amount: s.amount,
      paid: paidMap[expensePaidKey(expense.id, s.participantId)] ?? false,
    }));
}
