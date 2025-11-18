'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchGroupDetail, GroupTypeValue, updateGroupDetails } from '@/lib/groups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const CARD_CLASS = 'glass-card p-6';

const GROUP_TYPE_OPTIONS: Array<{ value: GroupTypeValue; label: string; icon: string }> = [
  { value: 'trip', label: 'Viaje', icon: '✈️' },
  { value: 'home', label: 'Casa', icon: '🏠' },
  { value: 'couple', label: 'Pareja', icon: '❤️' },
  { value: 'other', label: 'Otro', icon: '📝' },
];

function formatDateToInput(value?: string | null): string {
  if (!value) return '';
  if (value.includes('T')) {
    return value.slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  } catch {
    return '';
  }
  return '';
}

export default function GroupEditPageClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [groupId, setGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<GroupTypeValue>('other');
  const [datesEnabled, setDatesEnabled] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams?.get('id');
    if (id) {
      setGroupId(id);
    } else {
      router.replace('/grupos');
    }
  }, [router, searchParams]);

  const detailQuery = useQuery({
    queryKey: ['group-detail', groupId],
    enabled: Boolean(groupId),
    queryFn: async () => {
      if (!groupId) throw new Error('Grupo no encontrado');
      return fetchGroupDetail(groupId);
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const group = detailQuery.data.group;
    setName(group.name);

    const normalizedType = (group.group_type as GroupTypeValue | null) ?? 'other';
    setSelectedType(GROUP_TYPE_OPTIONS.some((option) => option.value === normalizedType) ? normalizedType : 'other');

    const normalizedStart = formatDateToInput(group.start_date);
    const normalizedEnd = formatDateToInput(group.end_date);
    setStartDate(normalizedStart);
    setEndDate(normalizedEnd);
    setDatesEnabled(Boolean(normalizedStart || normalizedEnd));

    setDescription(group.description ?? '');
  }, [detailQuery.data]);

  const currentMemberRole = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail || !user?.id) return null;
    return detail.members.find((member) => member.userId === user.id)?.role ?? null;
  }, [detailQuery.data, user?.id]);

  const canEdit = useMemo(() => {
    if (!detailQuery.data) return false;
    return currentMemberRole === 'owner' || user?.id === detailQuery.data.group.created_by;
  }, [currentMemberRole, detailQuery.data, user?.id]);

  const originalValues = useMemo(() => {
    const group = detailQuery.data?.group;
    if (!group) {
      return {
        name: '',
        type: 'other' as GroupTypeValue,
        start: null as string | null,
        end: null as string | null,
        description: null as string | null,
      };
    }
    return {
      name: group.name,
      type: (group.group_type as GroupTypeValue | null) ?? 'other',
      start: group.start_date ? formatDateToInput(group.start_date) || null : null,
      end: group.end_date ? formatDateToInput(group.end_date) || null : null,
      description: group.description?.trim() ?? null,
    };
  }, [detailQuery.data?.group]);

  const finalName = name.trim();
  const finalType = selectedType;
  const finalStart = datesEnabled && startDate ? startDate : null;
  const finalEnd = datesEnabled && endDate ? endDate : null;
  const finalDescription = description.trim() ? description.trim() : null;

  const isDirty = useMemo(() => {
    if (!detailQuery.data) return false;
    return (
      finalName !== originalValues.name ||
      finalType !== originalValues.type ||
      finalStart !== originalValues.start ||
      finalEnd !== originalValues.end ||
      finalDescription !== originalValues.description
    );
  }, [detailQuery.data, finalDescription, finalEnd, finalName, finalStart, finalType, originalValues.description, originalValues.end, originalValues.name, originalValues.start, originalValues.type]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!groupId) {
        throw new Error('Grupo no disponible');
      }
      return updateGroupDetails(groupId, {
        name: finalName,
        groupType: finalType,
        startDate: finalStart,
        endDate: finalEnd,
        description: finalDescription,
      });
    },
    onSuccess: async () => {
      if (!groupId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
      ]);
      router.replace(`/grupos/configuracion?id=${groupId}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el grupo.';
      setFormError(message);
    },
  });

  function handleSave() {
    if (!canEdit || updateMutation.isPending) return;
    if (!finalName) {
      setFormError('Introduce un nombre para el grupo.');
      return;
    }
    setFormError(null);
    updateMutation.mutate();
  }

  if (!groupId) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Redirigiendo a tus grupos...</p>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Cargando datos del grupo...</p>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className={`${CARD_CLASS} space-y-4`}>
        <p className="text-sm text-danger">
          {(detailQuery.error as Error).message ?? 'No se pudieron obtener los detalles del grupo'}
        </p>
        <Link
          className="inline-flex items-center text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href="/grupos"
        >
          Volver a grupos
        </Link>
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-danger">El grupo no existe o no tienes acceso.</p>
        <Link
          className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href="/grupos"
        >
          Volver a grupos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href={`/grupos/configuracion?id=${detailQuery.data.group.id}`}
        >
          ← Configuración
        </Link>
        <button
          type="button"
          className="text-sm font-semibold text-primary underline-offset-4 hover:text-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSave}
          disabled={!canEdit || updateMutation.isPending || !isDirty || !finalName}
        >
          {updateMutation.isPending ? 'Guardando...' : 'Listo'}
        </button>
      </div>

      {!canEdit && (
        <div className="rounded-2xl border border-white/30 bg-white/60 p-4 text-sm text-danger shadow-[0_6px_18px_rgba(0,0,0,0.05)]">
          Solo el propietario puede editar los detalles del grupo.
        </div>
      )}

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Nombre del grupo</h2>
          <p className="text-sm text-text-secondary">Este nombre se mostrará en toda la aplicación.</p>
        </header>
        <input
          className="input-field"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre del grupo"
          value={name}
        />
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Tipo de grupo</h2>
          <p className="text-sm text-text-secondary">Selecciona la categoría que mejor describa este grupo.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUP_TYPE_OPTIONS.map((option) => {
            const isActive = selectedType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedType(option.value)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                  isActive
                    ? 'border-primary bg-primary-soft/40 text-primary'
                    : 'border-white/30 bg-white/60 text-text-secondary'
                }`}
              >
                <span className="text-xl">{option.icon}</span>
                <span className="font-semibold text-text-primary">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Fechas del grupo</h2>
          <p className="text-sm text-text-secondary">Define el periodo activo si quieres limitar el rango temporal.</p>
        </header>
        <button
          type="button"
          onClick={() => {
            setDatesEnabled((value) => !value);
            if (datesEnabled) {
              setStartDate('');
              setEndDate('');
            }
          }}
          className="flex w-full items-center justify-between rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-sm font-medium text-text-primary shadow-[0_6px_18px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span>Activar fechas del grupo</span>
          <span
            className={`relative inline-flex h-6 w-12 items-center rounded-full transition ${
              datesEnabled ? 'bg-primary' : 'bg-white/50'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                datesEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
        {datesEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              Inicio
              <input
                className="input-field"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              Fin
              <input
                className="input-field"
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Descripción</h2>
          <p className="text-sm text-text-secondary">Añade notas o detalles relevantes sobre este grupo.</p>
        </header>
        <textarea
          className="input-field min-h-[8rem] resize-none"
          maxLength={600}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe brevemente el propósito del grupo"
          value={description}
        />
      </section>

      {formError && (
        <div className="glass-danger rounded-2xl border border-danger/40 bg-white/70 p-4 text-sm text-danger">
          {formError}
        </div>
      )}
    </div>
  );
}
