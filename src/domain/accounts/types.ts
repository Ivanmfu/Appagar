import { Database } from '@/lib/database.types';

export type AccountProfile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'email'>;

export type UpdateDisplayNameInput = {
  userId: string;
  displayName: string;
};

export type UpdateEmailInput = {
  userId: string;
  email: string;
  currentEmail?: string;
};

export type UpdatePasswordInput = {
  password: string;
  confirmPassword: string;
};

export type UpdateEmailResult = {
  normalizedEmail: string;
  requiresConfirmation: boolean;
};
