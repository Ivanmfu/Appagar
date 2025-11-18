import { Suspense } from 'react';
import GroupEditPageClient from './GroupEditPageClient';

export default function GroupEditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/80">Cargando...</div>}>
      <GroupEditPageClient />
    </Suspense>
  );
}
