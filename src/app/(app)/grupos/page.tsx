import { Suspense } from 'react';
import GroupsPageClient from './GroupsPageClient';

export default function GroupsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/80">Cargando...</div>}>
      <GroupsPageClient />
    </Suspense>
  );
}