import { Suspense } from 'react';
import GroupDetailPageClient from './GroupDetailPageClient';

export default function GroupDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/80">Cargando...</div>}>
      <GroupDetailPageClient />
    </Suspense>
  );
}
