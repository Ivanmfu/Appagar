export type AppErrorCode =
  | 'validation_error'
  | 'auth_required'
  | 'not_found'
  | 'supabase_error'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }

  static validation(message: string, cause?: unknown) {
    return new AppError('validation_error', message, cause);
  }

  static authRequired(message = 'Necesitas iniciar sesión para continuar.') {
    return new AppError('auth_required', message);
  }

  static notFound(message: string) {
    return new AppError('not_found', message);
  }

  static fromSupabase(error: unknown, fallback: string) {
    if (error instanceof AppError) return error;
    const message =
      (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : undefined) || fallback;
    return new AppError('supabase_error', message, error);
  }

  static fromUnknown(error: unknown, fallback: string) {
    if (error instanceof AppError) return error;
    const message =
      (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : undefined) || fallback;
    return new AppError('unknown', message, error);
  }
}

export function getUserMessage(error: unknown, fallback: string) {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    if ('error_description' in error && typeof (error as { error_description?: unknown }).error_description === 'string') {
      return (error as { error_description?: string }).error_description ?? fallback;
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message?: string }).message ?? fallback;
    }
  }
  return fallback;
}
