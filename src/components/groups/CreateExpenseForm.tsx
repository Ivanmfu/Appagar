"use client";

import { createExpense } from '@/lib/expenses';
import type { GroupMember } from '@/lib/groups';
import { splitEvenlyInCents } from '@/lib/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Props = {
  groupId: string;
  members: GroupMember[];
  baseCurrency: string;
};

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

export function CreateExpenseForm({ groupId, members, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payerId, setPayerId] = useState(() => members[0]?.userId ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(() => members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);

  const memberMap = useMemo(() => {
    const map = new Map<string, GroupMember>();
    members.forEach((member) => map.set(member.userId, member));
    return map;
  }, [members]);

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

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!amount.trim()) {
        throw new Error('Introduce un importe');
      }

      const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Introduce un importe válido');
      }

      if (participantIds.length === 0) {
        throw new Error('Selecciona al menos un participante');
      }

      const totalCents = Math.round(parsedAmount * 100);
      const shares = splitEvenlyInCents(totalCents, participantIds.length).map((shareCents, index) => ({
        userId: participantIds[index],
        shareCents,
      }));

      return createExpense({
        groupId,
        payerId,
        totalCents,
        currency: baseCurrency,
        shares,
        note: note.trim() ? note.trim() : undefined,
        date,
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
    if (!amount.trim() || participantIds.length === 0) return [] as { userId: string; share: number }[];
    const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return [];
    const totalCents = Math.round(parsedAmount * 100);
    return splitEvenlyInCents(totalCents, participantIds.length).map((share, index) => ({
      userId: participantIds[index],
      share,
    }));
  }, [amount, participantIds]);

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <h3 className="text-base font-semibold">Registrar gasto</h3>
        <p className="text-xs text-gray-500">Divide a partes iguales entre los participantes seleccionados.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col text-sm gap-1">
          Importe ({baseCurrency})
          <input
            className="border rounded px-3 py-2"
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="flex flex-col text-sm gap-1">
          Fecha
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
      </div>

      <label className="flex flex-col text-sm gap-1">
        Descripción
        <input
          className="border rounded px-3 py-2"
          placeholder="Cena del viernes"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <label className="flex flex-col text-sm gap-1">
        Pagado por
        <select
          className="border rounded px-3 py-2"
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Participantes</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {members.map((member) => {
            const checked = participantIds.includes(member.userId);
            return (
              <label key={member.userId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => toggleParticipant(member.userId)}
                />
                <span>
                  {member.displayName ?? member.email ?? 'Miembro'}
                  {checked && previewShares.length > 0 && (
                    <span className="block text-xs text-gray-500">
                      {formatCurrency(
                        previewShares.find((share) => share.userId === member.userId)?.share ?? 0,
                        baseCurrency
                      )}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? 'Guardando...' : 'Guardar gasto'}
      </button>
      {previewShares.length > 0 && (
        <p className="text-xs text-gray-500">
          Cada participante aporta aproximadamente {formatCurrency(previewShares[0].share, baseCurrency)}
        </p>
      )}
    </form>
  );
}
