export const dynamic = 'force-dynamic';

import GroupDetailPageClient, { DetailPageProps } from './GroupDetailPageClient';

export default function GroupDetailPage(props: DetailPageProps) {
  return <GroupDetailPageClient {...props} />;
}
