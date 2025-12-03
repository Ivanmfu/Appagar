'use client';

import { useAuth } from '@/components/AuthGate';
import { AppError, getUserMessage } from '@/lib/errors';
import type { GroupExpense, GroupMember } from '@/lib/groups';
import { createExpense, updateExpense, deleteExpense } from '@/lib/expenses';
import { splitEvenlyInCents } from '@/lib/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Props = {
  groupId: string;
  members: GroupMember[];
  baseCurrency: string;
  expense?: GroupExpense | null;
  mode?: 'create' | 'edit';
  onSuccess?: () => void;
  onCancel?: () => void;
};

type SplitMode = 'equal' | 'custom';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function toInputMinor(minor: number) {
  return (minor / 100).toFixed(2).replace('.', ',');
}

function normalizeDate(input?: string | null) {
  if (!input) {
    return new Date().toISOString().slice(0, 10);
  }
  try {
    return new Date(input).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function CreateExpenseForm({
  groupId,
  members,
  baseCurrency,
  expense = null,
  mode,
  onSuccess,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const resolvedMode: 'create' | 'edit' = mode ?? (expense ? 'edit' : 'create');
  const isEditing = resolvedMode === 'edit';
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payerId, setPayerId] = useState(() => members[0]?.userId ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(() => members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!expense) return;

    setAmount(toInputMinor(expense.amountMinor));
    setNote(expense.note ?? '');
    setDate(normalizeDate(expense.date ?? expense.createdAt));
    if (expense.payerId) {
      setPayerId(expense.payerId);
    }

    const participantIdsFromExpense = expense.participants.map((participant) => participant.userId);
    if (participantIdsFromExpense.length > 0) {
      setParticipantIds(participantIdsFromExpense);
    }

    setCustomShares(() => {
      const next: Record<string, string> = {};
      expense.participants.forEach((participant) => {
        next[participant.userId] = toInputMinor(participant.shareMinor);
      });
      return next;
    });

    const totalCents = expense.amountMinor;
    const equalShares = participantIdsFromExpense.length
      ? splitEvenlyInCents(totalCents, participantIdsFromExpense.length)
      : [];

    const isEqualSplit =
      participantIdsFromExpense.length > 0 &&
      expense.participants.length === equalShares.length &&
      expense.participants.every((participant, index) => {
        const expected = equalShares[index] ?? 0;
        return Math.abs(participant.shareMinor - expected) <= 1;
      });

    setSplitMode(isEqualSplit ? 'equal' : 'custom');
  }, [expense]);

  useEffect(() => {
    if (members.length === 0) return;

    setParticipantIds((current) => {
      if (current.length === 0) {
        return members.map((member) => member.userId);
      }
      const known = new Set(members.map((member) => member.userId));
      const filtered = current.filter((id) => known.has(id));
      return filtered.length > 0 ? filtered : members.map((member) => member.userId);
    });

    setPayerId((current) => {
      if (members.some((member) => member.userId === current)) {
        return current;
      }
      return members[0]?.userId ?? current;
    });
  }, [members]);

  useEffect(() => {
    setCustomShares((current) => {
      const next: Record<string, string> = {};
      participantIds.forEach((id) => {
        next[id] = current[id] ?? '';
      });
      return next;
    });
  }, [participantIds]);

  useEffect(() => {
    if (splitMode !== 'custom') return;
    if (!amount.trim()) return;

    const preview = (() => {
      const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || participantIds.length === 0) {
        return [] as number[];
      }
      const totalCents = Math.round(parsedAmount * 100);
      return splitEvenlyInCents(totalCents, participantIds.length).map((share) => share / 100);
    })();

    setCustomShares((current) => {
      const next = { ...current };
      participantIds.forEach((id, index) => {
        if (!next[id] || next[id] === '0' || next[id] === '0,00' || next[id] === '0.00') {
          const value = preview[index] ?? 0;
          next[id] = value > 0 ? value.toFixed(2) : '';
        }
      });
      return next;
    });
  }, [splitMode, amount, participantIds]);

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!amount.trim()) {
        throw AppError.validation('Introduce un importe');
      }

      if (!user?.id) {
        throw AppError.authRequired('Necesitas iniciar sesión para registrar un gasto');
      }

      const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw AppError.validation('Introduce un importe válido');
      }

      if (participantIds.length === 0) {
        throw AppError.validation('Selecciona al menos un participante');
      }

      const totalCents = Math.round(parsedAmount * 100);
      let shares: { userId: string; shareCents: number }[] = [];

      if (splitMode === 'custom') {
        let assignedTotal = 0;
        shares = participantIds.map((id) => {
          const rawValue = customShares[id];
          if (!rawValue || !rawValue.trim()) {
            throw AppError.validation('Completa el importe para cada participante en el reparto personalizado');
          }
          const parsedShare = Number.parseFloat(rawValue.replace(',', '.'));
          if (!Number.isFinite(parsedShare) || parsedShare < 0) {
            throw AppError.validation('Introduce importes válidos en el reparto personalizado');
          }
          const shareCents = Math.round(parsedShare * 100);
          assignedTotal += shareCents;
          return { userId: id, shareCents };
        });

        const difference = totalCents - assignedTotal;
        if (Math.abs(difference) > 1) {
          throw AppError.validation('El reparto personalizado debe sumar exactamente el total del gasto');
        }
        if (shares.length > 0 && difference !== 0) {
          shares[shares.length - 1].shareCents += difference;
        }
      } else {
        shares = splitEvenlyInCents(totalCents, participantIds.length).map((shareCents, index) => ({
          userId: participantIds[index],
          shareCents,
        }));
      }

      const payload = {
        groupId,
        payerId,
        totalCents,
        currency: expense?.currency ?? baseCurrency,
        shares,
        note: note.trim() ? note.trim() : undefined,
        date,
      };

      if (isEditing && expense) {
        return updateExpense({
          ...payload,
          expenseId: expense.id,
          updatedBy: user.id,
        });
      }

      return createExpense({
        ...payload,
        createdBy: user.id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-balance', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['activity', user?.id] }),
      ]);

      if (!isEditing) {
        setAmount('');
        setNote('');
        setParticipantIds(members.map((m) => m.userId));
        setSplitMode('equal');
        setCustomShares({});
      }

      onSuccess?.();
    },
    onError: (err: unknown) => {
      setError(getUserMessage(err, 'No se pudo registrar el gasto'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!user?.id) {
        throw AppError.authRequired('Necesitas iniciar sesión para eliminar un gasto');
      }
      if (!expense) {
        throw AppError.notFound('No se encontró el gasto a eliminar');
      }
      await deleteExpense({
        expenseId: expense.id,
        groupId,
        deletedBy: user.id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-balance', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['activity', user?.id] }),
      ]);
      onSuccess?.();
    },
    onError: (err: unknown) => {
      setError(getUserMessage(err, 'No se pudo eliminar el gasto'));
    },
  });

  function toggleParticipant(id: string) {
    setParticipantIds((current) => {
      if (current.includes(id)) {
        const updated = current.filter((value) => value !== id);
        return updated.length === 0 ? current : updated;
      }
      return [...current, id];
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  const previewShares = useMemo(() => {
    if (!amount.trim() || participantIds.length === 0) {
      return [] as { userId: string; share: number }[];
    }
    const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return [];
    const totalCents = Math.round(parsedAmount * 100);
    if (splitMode === 'custom') {
      return participantIds.map((id) => {
        const raw = customShares[id];
        const parsedShare = raw ? Number.parseFloat(raw.replace(',', '.')) : 0;
        return {
          userId: id,
          share: Number.isFinite(parsedShare) ? Math.round(parsedShare * 100) : 0,
        };
      });
    }
    return splitEvenlyInCents(totalCents, participantIds.length).map((share, index) => ({
      userId: participantIds[index],
      share,
    }));
  }, [amount, participantIds, splitMode, customShares]);

  const showAverageShareHint = splitMode === 'equal' && previewShares.length > 0;

  return (
    <form className="space-y-6 text-sm text-text-secondary" onSubmit={onSubmit}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          {isEditing ? 'Editar gasto' : 'Registrar gasto'}
        </h3>
        <p className="text-xs text-text-secondary">
          {isEditing
            ? 'Actualiza los participantes, el importe o quién pagó este gasto.'
            : 'Selecciona quién participa y cómo quieres repartir el importe.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
            Importe ({baseCurrency})
          </span>
          <input
            className="input-field"
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Fecha</span>
          <input
            className="input-field"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Descripción</span>
        <input
          className="input-field"
          placeholder="Cena del viernes"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Pagado por</span>
        <select
          className="input-field"
          value={payerId}
          onChange={(event) => setPayerId(event.target.value)}
        >
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName ?? member.email ?? 'Miembro'}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Tipo de reparto</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${
              splitMode === 'equal'
                ? 'btn-primary px-4 py-2 text-xs'
                : 'btn-secondary px-4 py-2 text-xs'
            }`}
            onClick={() => setSplitMode('equal')}
          >
            Reparto igualitario
          </button>
          <button
            type="button"
            className={`${
              splitMode === 'custom'
                ? 'btn-primary px-4 py-2 text-xs'
                : 'btn-secondary px-4 py-2 text-xs'
            }`}
            onClick={() => setSplitMode('custom')}
          >
            Reparto personalizado
          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Participantes</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {members.map((member) => {
            const checked = participantIds.includes(member.userId);
            return (
              <label
                key={member.userId}
                className={`glass-list-item flex flex-col gap-3 border px-4 py-3 transition ${
                  checked ? 'border-primary/40 bg-primary-soft/60' : 'border-white/40 bg-white/30'
                }`}
              >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input-border text-primary focus:ring-primary"
                        checked={checked}
                        onChange={() => toggleParticipant(member.userId)}
                      />
                      <span className="text-sm text-text-primary">
                        {member.displayName ?? member.email ?? 'Miembro'}
                      </span>
                    </div>
                  {checked && previewShares.length > 0 && (
                    <span className="text-xs text-text-secondary">
                      {formatCurrency(
                        previewShares.find((share) => share.userId === member.userId)?.share ?? 0,
                        baseCurrency
                      )}
                    </span>
                  )}
                </div>
                {splitMode === 'custom' && checked && (
                  <input
                    className="input-field"
                    placeholder="0,00"
                    value={customShares[member.userId] ?? ''}
                    onChange={(event) =>
                      setCustomShares((current) => ({
                        ...current,
                        [member.userId]: event.target.value,
                      }))
                    }
                    inputMode="decimal"
                  />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {onCancel && (
          <button
            type="button"
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onCancel}
            disabled={mutation.isPending || deleteMutation.isPending}
          >
            Cancelar
          </button>
        )}
        <button
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={mutation.isPending || deleteMutation.isPending}
          type="submit"
        >
          {mutation.isPending
            ? isEditing
              ? 'Guardando cambios...'
              : 'Guardando...'
            : isEditing
            ? 'Guardar cambios'
            : 'Guardar gasto'}
        </button>
        {isEditing && expense && (
          <button
            type="button"
            className="btn-danger ml-auto disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => deleteMutation.mutate()}
            disabled={mutation.isPending || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar gasto'}
          </button>
        )}
      </div>
      {showAverageShareHint && (
        <p className="text-xs text-text-secondary">
          Cada participante aporta aproximadamente {formatCurrency(previewShares[0].share, baseCurrency)}
        </p>
      )}
    </form>
  );
}
