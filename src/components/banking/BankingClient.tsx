"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Landmark, CreditCard, Star, Pencil, Trash2, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import BankAccountModal, { type BankAccountData, type GLAccountOption, type ProjectOption } from "@/components/banking/BankAccountModal";
import { formatCurrency } from "@/lib/format";

export interface BankRow {
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

export interface BookBalance {
  amount: number;
  side: "debit" | "credit";
}

interface Row extends BankRow {
  gl_account_id: string | null;
  project_id: string | null;
}

export default function BankingClient({
  rows,
  bookBalances,
  glAccountOptions,
  projectOptions,
}: {
  rows: Row[];
  bookBalances: Record<string, BookBalance>;
  glAccountOptions: GLAccountOption[];
  projectOptions: ProjectOption[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountData | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const glAccountById = new Map(glAccountOptions.map((a) => [a.id, a]));
  const projectById = new Map(projectOptions.map((p) => [p.id, p]));

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
      gl_account_id: row.gl_account_id ?? "",
      project_id: row.project_id ?? "",
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
          <h1 className="text-lg font-semibold text-ink-800">Banks</h1>
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
          <div className="card overflow-hidden">
            <div className="flex items-center border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <div className="flex-1">Account Details</div>
              <div className="w-40 text-right">Amount in Books</div>
              <div className="w-16" />
            </div>
            <div className="divide-y divide-gray-100">
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                const book = bookBalances[row.id];
                const gl = row.gl_account_id ? glAccountById.get(row.gl_account_id) : undefined;
                const project = row.project_id ? projectById.get(row.project_id) : undefined;
                return (
                  <div key={row.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      className="flex w-full items-center px-4 py-3.5 text-left hover:bg-gray-50"
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          {row.account_type === "credit_card" ? <CreditCard size={17} /> : <Landmark size={17} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-800">{row.account_name}</span>
                            {row.is_primary && (
                              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                <Star size={11} fill="currentColor" /> Primary
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {row.bank_name || (row.account_type === "credit_card" ? "Credit Card" : "Bank Account")}
                            {row.account_number ? ` · ••••${row.account_number.slice(-4)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="w-40 text-right">
                        {book ? (
                          <span className="text-sm font-semibold text-ink-800">
                            {formatCurrency(book.amount, row.currency)}{" "}
                            <span className="text-xs font-medium text-gray-400">({book.side === "debit" ? "Dr" : "Cr"})</span>
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">{formatCurrency(0, row.currency)}</span>
                        )}
                      </div>
                      <div className="flex w-16 justify-end text-gray-400">
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Account Code</dt>
                            <dd className="mt-0.5 text-ink-800">{row.account_code || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Currency</dt>
                            <dd className="mt-0.5 text-ink-800">{row.currency}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Account Number</dt>
                            <dd className="mt-0.5 text-ink-800">{row.account_number || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Bank Identifier Code</dt>
                            <dd className="mt-0.5 text-ink-800">{row.bank_identifier_code || "—"}</dd>
                          </div>
                          <div className="sm:col-span-3">
                            <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                              <Link2 size={12} /> Linked Chart of Accounts entry
                            </dt>
                            <dd className="mt-0.5 text-ink-800">
                              {gl ? (
                                <a href={`/chart-of-accounts/${gl.id}`} className="text-brand-600 hover:underline">
                                  {gl.name}
                                </a>
                              ) : (
                                <span className="text-gray-400">Not linked yet — will be created on next save.</span>
                              )}
                            </dd>
                          </div>
                          <div className="sm:col-span-3">
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Project</dt>
                            <dd className="mt-0.5 text-ink-800">
                              {project ? (
                                <a href={`/projects/${project.id}`} className="text-brand-600 hover:underline">
                                  {project.name}
                                </a>
                              ) : (
                                <span className="text-gray-400">Not tagged to a project.</span>
                              )}
                            </dd>
                          </div>
                          {row.description && (
                            <div className="sm:col-span-3">
                              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Description</dt>
                              <dd className="mt-0.5 text-ink-800">{row.description}</dd>
                            </div>
                          )}
                        </dl>
                        <div className="mt-4 flex items-center gap-2">
                          <button onClick={() => openEdit(row)} className="btn-secondary py-1.5 text-xs">
                            <Pencil size={13} /> Edit
                          </button>
                          {confirmId === row.id ? (
                            <button
                              onClick={() => onDelete(row.id)}
                              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Confirm Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmId(row.id)}
                              className="btn-secondary py-1.5 text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <BankAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        glAccountOptions={glAccountOptions}
        projectOptions={projectOptions}
      />
    </div>
  );
}
