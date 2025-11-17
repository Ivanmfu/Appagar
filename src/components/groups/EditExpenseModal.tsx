'use client';

import { useEffect } from 'react';
import { CreateExpenseForm } from '@/components/groups/CreateExpenseForm';
import type { GroupExpense, GroupMember } from '@/lib/groups';

type EditExpenseModalProps = {
  isOpen: boolean;
  expense: GroupExpense | null;
  groupId: string;
  members: GroupMember[];
  baseCurrency: string;
  onClose: () => void;
};

function formatDateLabel(input?: string | null) {
  if (!input) return 'Sin fecha registrada';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return 'Sin fecha registrada';
  }
}

export function EditExpenseModal({
  isOpen,
  expense,
  groupId,
  members,
  baseCurrency,
  onClose,
}: EditExpenseModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !expense) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4 py-10 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl">
        <div className="space-y-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 backdrop-blur-xl shadow-2xl shadow-purple-900/30">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-secondary">Editar gasto</p>
              <h2 className="mt-2 text-2xl font-semibold text-text-primary">
                {expense.note && expense.note.trim().length > 0 ? expense.note : 'Gasto sin descripción'}
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                Registrado el {formatDateLabel(expense.date ?? expense.createdAt)} · Pagado por{' '}
                {expense.payerName ?? 'alguien del grupo'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg text-text-primary transition hover:border-white/30 hover:bg-white/20"
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>

          <CreateExpenseForm
            key={expense.id}
            baseCurrency={baseCurrency}
            expense={expense}
            groupId={groupId}
            members={members}
            mode="edit"
            onCancel={onClose}
            onSuccess={onClose}
          />
        </div>
      </div>
    </div>
  );
}
