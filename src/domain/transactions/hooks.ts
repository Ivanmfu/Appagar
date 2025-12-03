import { useQuery } from '@tanstack/react-query';

import { fetchRecentTransactions } from './api';
import type { TransactionActivity } from './types';

export function useRecentTransactions(userId: string | null) {
  return useQuery<TransactionActivity[]>({
    queryKey: ['transactions', 'recent', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchRecentTransactions(userId),
    staleTime: 10_000,
  });
}
