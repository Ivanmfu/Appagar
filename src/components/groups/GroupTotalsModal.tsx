import { useMemo } from 'react';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function describeBalance(minor: number, currency: string) {
  if (minor > 0) return `Te deben ${formatCurrency(minor, currency)}`;
  if (minor < 0) return `Debes ${formatCurrency(Math.abs(minor), currency)}`;
  return 'Todo en orden ✨';
}

type MemberSnapshot = {
  userId: string;
  name: string;
  netMinor: number;
  paidMinor?: number;
  shareMinor?: number;
};

type Totals = {
  totalGroupSpendMinor: number;
  totalUserPaidMinor: number;
  totalUserShareMinor: number;
  userNetMinor: number;
};

type GroupTotalsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  totals: Totals;
  memberSnapshots?: MemberSnapshot[];
};

export function GroupTotalsModal({ isOpen, onClose, currency, totals, memberSnapshots }: GroupTotalsModalProps) {
  const orderedMembers = useMemo(() => {
    return [...(memberSnapshots ?? [])].sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));
  }, [memberSnapshots]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 text-text-primary shadow-2xl shadow-black/30">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-secondary">Balance del grupo</p>
            <h3 className="mt-2 text-xl font-semibold">Totales detallados</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg transition hover:border-white/30 hover:bg-white/20"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="glass-card p-4 shadow-inner shadow-black/40">
            <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Gasto total del grupo</p>
            <p className="mt-2 text-xl font-semibold text-text-primary">{formatCurrency(totals.totalGroupSpendMinor, currency)}</p>
          </article>
          <article className="glass-card p-4 shadow-inner shadow-black/40">
            <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Has pagado</p>
            <p className="mt-2 text-xl font-semibold text-text-primary">{formatCurrency(totals.totalUserPaidMinor, currency)}</p>
          </article>
          <article className="glass-card p-4 shadow-inner shadow-black/40">
            <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Tu parte</p>
            <p className="mt-2 text-xl font-semibold text-text-primary">{formatCurrency(totals.totalUserShareMinor, currency)}</p>
          </article>
          <article className="glass-card p-4 shadow-inner shadow-black/40">
            <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Saldo neto</p>
            <p className="mt-2 text-lg font-semibold text-text-primary">{describeBalance(totals.userNetMinor, currency)}</p>
          </article>
        </section>

        {orderedMembers.length > 0 && (
          <section className="mt-6 space-y-3">
            <h4 className="text-sm font-semibold text-text-primary/90">Saldos por miembro</h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              {orderedMembers.map((member) => {
                const tone =
                  member.netMinor > 0
                    ? 'text-success'
                    : member.netMinor < 0
                      ? 'text-danger'
                      : 'text-slate-200';
                return (
                  <li
                    key={member.userId}
                    className="flex items-center justify-between glass-card px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-text-primary">{member.name}</p>
                      {(member.paidMinor !== undefined || member.shareMinor !== undefined) && (
                        <p className="text-xs text-text-secondary">
                          Ha pagado {formatCurrency(member.paidMinor ?? 0, currency)} · Su parte {formatCurrency(member.shareMinor ?? 0, currency)}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${tone}`}>
                      {describeBalance(member.netMinor, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
