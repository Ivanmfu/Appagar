"use client";

import { useAuth } from '@/components/AuthGate';
import { createExpense } from '@/lib/expenses';
import type { GroupMember } from '@/lib/groups';
import { splitEvenlyInCents } from '@/lib/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Props = {
  groupId: string;
  members: GroupMember[];
  baseCurrency: string;
  onSuccess?: () => void;
};

type SplitMode = 'equal' | 'custom';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

export function CreateExpenseForm({ groupId, members, baseCurrency, onSuccess }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payerId, setPayerId] = useState(() => members[0]?.userId ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(() => members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

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
        throw new Error('Introduce un importe');
      }

      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para registrar un gasto');
      }

      const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Introduce un importe válido');
      }

      if (participantIds.length === 0) {
        throw new Error('Selecciona al menos un participante');
      }

      const totalCents = Math.round(parsedAmount * 100);
      let shares: { userId: string; shareCents: number }[] = [];

      if (splitMode === 'custom') {
        let assignedTotal = 0;
        shares = participantIds.map((id) => {
          const rawValue = customShares[id];
          if (!rawValue || !rawValue.trim()) {
            throw new Error('Completa el importe para cada participante en el reparto personalizado');
          }
          const parsedShare = Number.parseFloat(rawValue.replace(',', '.'));
          if (!Number.isFinite(parsedShare) || parsedShare < 0) {
            throw new Error('Introduce importes válidos en el reparto personalizado');
          }
          const shareCents = Math.round(parsedShare * 100);
          assignedTotal += shareCents;
          return { userId: id, shareCents };
        });

        const difference = totalCents - assignedTotal;
        if (Math.abs(difference) > 1) {
          throw new Error('El reparto personalizado debe sumar exactamente el total del gasto');
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

      return createExpense({
        groupId,
        payerId,
        totalCents,
        currency: baseCurrency,
        shares,
        note: note.trim() ? note.trim() : undefined,
        date,
        createdBy: user.id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-balance', groupId] }),
      ]);
      setAmount('');
      setNote('');
      setParticipantIds(members.map((m) => m.userId));
      setSplitMode('equal');
      setCustomShares({});
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el gasto';
      setError(message);
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

  return (
    <form className="space-y-5 text-sm text-slate-100" onSubmit={onSubmit}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">Registrar gasto</h3>
        <p className="text-xs text-slate-300">Selecciona quién participa y cómo quieres repartir el importe.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">
            Importe ({baseCurrency})
          </span>
          <input
            className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-white/40 focus:outline-none"
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">Fecha</span>
          <input
            className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white focus:border-white/40 focus:outline-none"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">Descripción</span>
        <input
          className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-white/40 focus:outline-none"
          placeholder="Cena del viernes"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">Pagado por</span>
        <select
          className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white focus:border-white/40 focus:outline-none"
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
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">Tipo de reparto</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              splitMode === 'equal'
                ? 'bg-white/80 text-slate-900 shadow shadow-white/40'
                : 'border border-white/30 bg-black/30 text-slate-200/80 hover:border-white/50 hover:text-white'
            }`}
            onClick={() => setSplitMode('equal')}
          >
            Reparto igualitario
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              splitMode === 'custom'
                ? 'bg-white/80 text-slate-900 shadow shadow-white/40'
                : 'border border-white/30 bg-black/30 text-slate-200/80 hover:border-white/50 hover:text-white'
            }`}
            onClick={() => setSplitMode('custom')}
          >
            Reparto personalizado
$          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200/80">Participantes</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {members.map((member) => {
            const checked = participantIds.includes(member.userId);
            return (
              <label
                key={member.userId}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                  checked ? 'border-white/40 bg-white/10' : 'border-white/10 bg-black/20 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/30 bg-black/40 text-indigo-400 focus:ring-indigo-300"
                  checked={checked}
                  onChange={() => toggleParticipant(member.userId)}
                />
                <span className="text-sm text-slate-100">
                  {member.displayName ?? member.email ?? 'Miembro'}
                  {checked && previewShares.length > 0 && (
                    <span className="block text-xs text-slate-300">
                      {formatCurrency(
                        previewShares.find((share) => share.userId === member.userId)?.share ?? 0,
                        baseCurrency
                      )}
                    </span>
                  )}
                </span>
                {splitMode === 'custom' && checked && (
                  <input
                    className="mt-2 w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-white/40 focus:outline-none"
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

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? 'Guardando...' : 'Guardar gasto'}
      </button>
      {previewShares.length > 0 && (
        <p className="text-xs text-slate-300">
          Cada participante aporta aproximadamente {formatCurrency(previewShares[0].share, baseCurrency)}
        </p>
      )}
    </form>
  );
}
