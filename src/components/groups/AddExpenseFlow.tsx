'use client';

import { useAuth } from '@/components/AuthGate';
import { CreateExpenseForm } from '@/components/groups/CreateExpenseForm';
import { fetchGroupDetail, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

const CARD_CLASS =
  'rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-2xl max-h-[80vh] overflow-y-auto';

type AddExpenseFlowProps = {
  isOpen: boolean;
  onClose: () => void;
  currentGroupId?: string;
};

export function AddExpenseFlow({ isOpen, onClose, currentGroupId }: AddExpenseFlowProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'select-group' | 'form'>('select-group');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setStep(currentGroupId ? 'form' : 'select-group');
      setSelectedGroupId(currentGroupId ?? '');
    } else {
      setStep('select-group');
      setSelectedGroupId('');
    }
  }, [isOpen, currentGroupId]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: isOpen && Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const selectedGroup = useMemo(() => {
    return groupsQuery.data?.find((group) => group.id === selectedGroupId) ?? null;
  }, [groupsQuery.data, selectedGroupId]);

  const detailQuery = useQuery({
    queryKey: ['group-detail', selectedGroupId],
    enabled: isOpen && Boolean(selectedGroupId),
    queryFn: async () => {
      if (!selectedGroupId) throw new Error('No se encontró el grupo');
      return fetchGroupDetail(selectedGroupId);
    },
    staleTime: 10_000,
  });

  const handleClose = useCallback(() => {
    onClose();
    setStep('select-group');
    setSelectedGroupId('');
  }, [onClose]);

  const handleSubmitSuccess = useCallback(() => {
    if (!selectedGroupId) {
      handleClose();
      return;
    }
    if (!currentGroupId) {
      handleClose();
      router.push(`/grupos/detalle?id=${selectedGroupId}`);
    } else {
      handleClose();
    }
  }, [currentGroupId, handleClose, router, selectedGroupId]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4 py-10">
      <div className="absolute inset-0" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-3xl">
        <div className={`${CARD_CLASS} space-y-6`}>
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-secondary">Appagar</p>
                <h2 className="mt-2 text-2xl font-semibold text-text-primary">
                  {step === 'select-group' ? '¿En qué grupo quieres añadir el gasto?' : 'Registrar nuevo gasto'}
                </h2>
                {step === 'form' && selectedGroup && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {selectedGroup.name} · Base {selectedGroup.baseCurrency}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/40 text-lg font-semibold text-text-primary transition hover:bg-white/60"
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>

            {step === 'select-group' && !currentGroupId && (
              <section className="space-y-4">
                {groupsQuery.isLoading && <p className="text-sm text-text-secondary">Cargando tus grupos...</p>}
                {groupsQuery.error && (
                  <p className="text-sm text-danger">
                    {(groupsQuery.error as Error).message ?? 'No se pudieron recuperar tus grupos'}
                  </p>
                )}

                {!groupsQuery.isLoading && (groupsQuery.data?.length ?? 0) === 0 && (
                    <div className="rounded-2xl border border-dashed border-border-subtle bg-white/60 p-6 text-sm text-text-secondary shadow-[0_6px_18px_rgba(0,0,0,0.06)] backdrop-blur-lg">
                    <p>No tienes grupos disponibles todavía.</p>
                    <p>Crea uno nuevo desde la pestaña Grupos para registrar gastos.</p>
                  </div>
                )}

                {groupsQuery.data && groupsQuery.data.length > 0 && (
                  <ul className="space-y-3">
                    {groupsQuery.data.map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          className="glass-list-item flex w-full flex-col gap-1 border border-white/40 bg-white/30 px-5 py-4 text-left text-sm text-text-primary transition hover:bg-white/40"
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setStep('form');
                          }}
                        >
                          <span className="text-base font-semibold text-text-primary">{group.name}</span>
                          <span className="text-xs text-text-secondary">
                            {group.memberCount} miembros · Base {group.baseCurrency}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {step === 'form' && (
              <section className="space-y-5">
                {!currentGroupId && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary underline-offset-2 hover:text-text-primary hover:underline"
                    onClick={() => {
                      setStep('select-group');
                      setSelectedGroupId('');
                    }}
                  >
                    ← Cambiar de grupo
                  </button>
                )}
                {detailQuery.isLoading && <p className="text-sm text-text-secondary">Preparando el formulario...</p>}
                {detailQuery.error && (
                  <p className="text-sm text-danger">
                    {(detailQuery.error as Error).message ?? 'No se pudo cargar la información del grupo'}
                  </p>
                )}
                {detailQuery.data && detailQuery.data.members.length === 0 && (
                  <p className="text-sm text-text-secondary">
                    Invita al menos a un miembro antes de registrar nuevos gastos en este grupo.
                  </p>
                )}
                {detailQuery.data && detailQuery.data.members.length > 0 && (
                  <CreateExpenseForm
                    baseCurrency={detailQuery.data.group.base_currency}
                    groupId={detailQuery.data.group.id}
                    members={detailQuery.data.members}
                    onSuccess={handleSubmitSuccess}
                  />
                )}
              </section>
            )}
        </div>
      </div>
    </div>
  );
}
