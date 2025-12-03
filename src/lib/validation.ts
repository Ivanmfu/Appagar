import { z } from 'zod';
import { AppError } from './errors';

const uuidish = z.string().min(1, 'Se requiere un identificador');

const currencySchema = z
  .string({ required_error: 'La divisa es obligatoria' })
  .length(3, 'La divisa debe ser un código ISO de 3 letras')
  .toUpperCase();

const optionalNoteSchema = z.string().trim().max(500, 'La nota no puede superar los 500 caracteres').optional();

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'La fecha debe tener el formato AAAA-MM-DD')
  .optional();

const expenseShareSchema = z.object({
  userId: uuidish,
  shareCents: z
    .number({ required_error: 'El reparto debe incluir una cantidad' })
    .int('El reparto debe ser un número entero')
    .nonnegative('El reparto no puede ser negativo'),
});

const baseExpenseSchema = z.object({
  groupId: uuidish,
  payerId: uuidish,
  totalCents: z
    .number({ required_error: 'El importe total es obligatorio' })
    .int('El importe debe ser entero')
    .positive('El importe debe ser mayor que cero'),
  currency: currencySchema.default('EUR'),
  fxRate: z
    .number({ required_error: 'La tasa de cambio es obligatoria' })
    .positive('La tasa de cambio debe ser mayor que cero')
    .default(1),
  shares: z
    .array(expenseShareSchema)
    .nonempty('Debes especificar al menos un participante')
    .max(100, 'No se pueden añadir más de 100 participantes'),
  note: optionalNoteSchema,
  category: z.string().trim().max(100).optional(),
  date: optionalDateSchema,
});

export const createExpenseSchema = baseExpenseSchema.extend({
  createdBy: uuidish,
});

export const updateExpenseSchema = baseExpenseSchema.extend({
  expenseId: uuidish,
  updatedBy: uuidish,
});

export const deleteExpenseSchema = z.object({
  expenseId: uuidish,
  groupId: uuidish,
  deletedBy: uuidish,
});

export const settlementSchema = z.object({
  groupId: uuidish,
  fromUserId: uuidish,
  toUserId: uuidish,
  amountMinor: z
    .number({ required_error: 'La cantidad a liquidar es obligatoria' })
    .int('La cantidad debe ser un entero')
    .positive('La cantidad a liquidar debe ser mayor que cero'),
});

const nameSchema = z
  .string({ required_error: 'El nombre es obligatorio' })
  .trim()
  .max(80, 'El nombre no puede superar los 80 caracteres')
  .optional();

const emailSchema = z
  .string({ required_error: 'El correo es obligatorio' })
  .trim()
  .email('El correo no es válido');

const passwordSchema = z
  .string({ required_error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres');

export function validateCreateExpenseInput(input: unknown) {
  const result = createExpenseSchema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Datos del gasto inválidos', result.error);
  }
  return result.data;
}

export function validateUpdateExpenseInput(input: unknown) {
  const result = updateExpenseSchema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Datos del gasto inválidos', result.error);
  }
  return result.data;
}

export function validateDeleteExpenseInput(input: unknown) {
  const result = deleteExpenseSchema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Datos del gasto inválidos', result.error);
  }
  return result.data;
}

export function validateSettlementInput(input: unknown) {
  const result = settlementSchema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Datos de liquidación inválidos', result.error);
  }
  if (result.data.fromUserId === result.data.toUserId) {
    throw AppError.validation('La liquidación requiere dos personas distintas');
  }
  return result.data;
}

export function normalizeNameInput(value: string | undefined | null) {
  const result = nameSchema.safeParse(value ?? '');
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Nombre inválido', result.error);
  }
  const trimmed = result.data?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEmailInput(value: string) {
  const result = emailSchema.safeParse(value);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Correo inválido', result.error);
  }
  return result.data.trim().toLowerCase();
}

export function validatePasswordInput(value: string) {
  const result = passwordSchema.safeParse(value);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Contraseña inválida', result.error);
  }
  return result.data;
}
