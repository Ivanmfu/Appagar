import test from 'node:test';
import assert from 'node:assert';

import { AppError } from '../src/lib/errors';
import {
  normalizeEmailInput,
  validateCreateExpenseInput,
  validatePasswordInput,
  validateSettlementInput,
} from '../src/lib/validation';

test('rejects expenses con importes inválidos', () => {
  assert.throws(
    () =>
      validateCreateExpenseInput({
        groupId: 'group',
        payerId: 'payer',
        totalCents: -10,
        shares: [{ userId: 'user-1', shareCents: 100 }],
        createdBy: 'creator',
      }),
    (error: unknown) => error instanceof AppError && error.code === 'validation_error',
  );
});

test('valida liquidaciones con usuarios distintos', () => {
  assert.throws(
    () => validateSettlementInput({ groupId: 'g', fromUserId: 'same', toUserId: 'same', amountMinor: 10 }),
    (error: unknown) => error instanceof AppError && error.code === 'validation_error',
  );
});

test('normaliza correos y rechaza formatos inválidos', () => {
  assert.strictEqual(normalizeEmailInput('USER@example.com'), 'user@example.com');
  assert.throws(
    () => normalizeEmailInput('sin-correo'),
    (error: unknown) => error instanceof AppError && error.code === 'validation_error',
  );
});

test('valida contraseñas mínimas', () => {
  assert.strictEqual(validatePasswordInput('12345678'), '12345678');
  assert.throws(
    () => validatePasswordInput('123'),
    (error: unknown) => error instanceof AppError && error.code === 'validation_error',
  );
});
