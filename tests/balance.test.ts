import assert from 'node:assert';
import test from 'node:test';

import { computeUserTotals } from '../src/lib/finance';

test('filtra miembros activos y participaciones incluidas al calcular balances', async () => {
  const totals = await computeUserTotals('g1', {
    members: [
      { user_id: 'alice', is_active: true },
      { user_id: 'bob', is_active: true },
      { user_id: 'charlie', is_active: false },
    ],
    expenses: [
      {
        id: 'exp-1',
        group_id: 'g1',
        payer_id: 'alice',
        amount_minor: 3000,
        amount_base_minor: 3000,
      },
      {
        id: 'exp-2',
        group_id: 'g1',
        payer_id: 'charlie',
        amount_minor: 2000,
        amount_base_minor: 2000,
      },
    ],
    shares: [
      { expense_id: 'exp-1', user_id: 'alice', share_minor: 1500, is_included: true },
      { expense_id: 'exp-1', user_id: 'bob', share_minor: 1500, is_included: true },
      // Este share pertenece a un miembro inactivo y debe ignorarse junto con su gasto.
      { expense_id: 'exp-2', user_id: 'charlie', share_minor: 1000, is_included: true },
      { expense_id: 'exp-2', user_id: 'alice', share_minor: 1000, is_included: true },
    ],
    settlements: [
      { group_id: 'g1', from_user_id: 'bob', to_user_id: 'alice', amount_minor: 500 },
      // Liquidación con un usuario inactivo que debe quedar fuera del cálculo.
      { group_id: 'g1', from_user_id: 'charlie', to_user_id: 'alice', amount_minor: 500 },
    ],
  });

  assert.deepStrictEqual(totals, [
    {
      userId: 'alice',
      totalPaidCents: 3000,
      totalOwedCents: 1500,
      settlementsPaidCents: 0,
      settlementsReceivedCents: 500,
      netBalanceCents: 1000,
    },
    {
      userId: 'bob',
      totalPaidCents: 0,
      totalOwedCents: 1500,
      settlementsPaidCents: 500,
      settlementsReceivedCents: 0,
      netBalanceCents: -1000,
    },
  ]);
});

test('ignora participaciones marcadas como no incluidas y mantiene miembros con saldo cero', async () => {
  const totals = await computeUserTotals('g2', {
    members: [
      { user_id: 'dora', is_active: true },
      { user_id: 'eric', is_active: true },
    ],
    expenses: [
      {
        id: 'exp-3',
        group_id: 'g2',
        payer_id: 'dora',
        amount_minor: 2000,
        amount_base_minor: 2000,
      },
    ],
    shares: [
      { expense_id: 'exp-3', user_id: 'dora', share_minor: 1000, is_included: true },
      { expense_id: 'exp-3', user_id: 'eric', share_minor: 1000, is_included: false },
    ],
    settlements: [],
  });

  assert.deepStrictEqual(totals, [
    {
      userId: 'dora',
      totalPaidCents: 2000,
      totalOwedCents: 1000,
      settlementsPaidCents: 0,
      settlementsReceivedCents: 0,
      netBalanceCents: 1000,
    },
    {
      userId: 'eric',
      totalPaidCents: 0,
      totalOwedCents: 0,
      settlementsPaidCents: 0,
      settlementsReceivedCents: 0,
      netBalanceCents: 0,
    },
  ]);
});
