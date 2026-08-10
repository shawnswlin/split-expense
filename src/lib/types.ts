import type { Participant } from "./participants";

export type ExpenseShare = { participantId: string; amount: number };

export type Expense = {
  id: string;
  title: string;
  payerId: string;
  totalAmount: number;
  splitType: "equal" | "custom";
  shares: ExpenseShare[];
  createdAt: string;
};

export type ActivityLogEntry = { id: number; message: string; createdAt: string };

export type Trip = {
  tripId: string;
  name: string;
  createdAt: string;
  extraParticipants: Participant[];
  expenses: Expense[];
  // Keyed by `${expenseId}:${participantId}` — see src/lib/settlement.ts.
  expensePaid: Record<string, boolean>;
  activityLog: ActivityLogEntry[];
};
