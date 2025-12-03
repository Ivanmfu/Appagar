import { fetchActivityFeed } from '@/lib/activity';

import type { TransactionActivity } from './types';

export async function fetchRecentTransactions(userId: string | null): Promise<TransactionActivity[]> {
  return fetchActivityFeed(userId);
}
