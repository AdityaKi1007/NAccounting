"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Landmark, CreditCard, Star, Pencil, Trash2 } from "lucide-react";
import BankAccountModal, { type BankAccountData } from "@/components/banking/BankAccountModal";
import { formatCurrency } from "@/lib/format";

interface Row {
  id: string;
  account_type: string;
  account_name: string;
  account_code: string | null;
  currency: string;
  account_number: string | null;
  bank_name: string | null;
  bank_identifier_code: string | null;
  description: string | null;
  is_primary: boolean;
  opening_balance: string | number;
}

export default function BankingClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountData | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    setEditing({
      id: row.id,
      account_type: row.account_type,
      account_name: row.account_name,
      account_code: row.account_code ?? "",
      currency: row.currency,
      account_number: row.account_number ?? "",
      bank_name: row.bank_name ?? "",
      bank_identifier_code: row.bank_identifier_code ?? "",
      description: row.description ?? "",
      is_primary: row.is_primary,
    });
    setModalOpen(true);
  }

  async function onDelete(id: string) {
    await fetch(`/api/entities/bank-accounts/${id}`, { method: "DELETE" });
    setConfirmId(null);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">Banking</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage the bank and credit card accounts for your organization</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} />
          Add Bank or Credit Card
        </button>
      </div>

      <div className="p-6">
        {rows.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Landmark size={40} className="text-gray-300" />
            <p className="text-sm text-gray-500">No bank or credit card accounts added yet.</p>
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} />
              Add Bank or Credit Card
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <div key={row.id} className="card relative p-5">
                {row.is_primary && (
                  <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Star size={12} fill="currentColor" /> Primary
                  </span>
                )}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    {row.account_type === "credit_card" ? <CreditCard size={20} /> : <Landmark size={20} />}
                  </div>
                  <div>
                    <p className="font-medium text-ink-800">{row.account_name}</p>
                    <p className="text-xs text-gray-500">{row.bank_name || (row.account_type === "credit_card" ? "Credit Card" : "Bank Account")}</p>
                  </div>
                </div>
                <p className="text-2xl font-semibold text-ink-800">
                  {formatCurrency(row.opening_balance, row.currency)}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {row.account_number ? `••••${row.account_number.slice(-4)}` : "No account number"}
                </p>
                <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => openEdit(row)} className="btn-secondary flex-1 py-1.5 text-xs">
                    <Pencil size={13} /> Edit
                  </button>
                  {confirmId === row.id ? (
                    <button
                      onClick={() => onDelete(row.id)}
                      className="flex-1 rounded-md bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(row.id)}
                      className="btn-secondary flex-1 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BankAccountModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
    </div>
  );
}
