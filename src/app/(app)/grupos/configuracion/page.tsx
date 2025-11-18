import { Suspense } from 'react';
import GroupSettingsPageClient from './GroupSettingsPageClient';

export default function GroupSettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/80">Cargando...</div>}>
      <GroupSettingsPageClient />
    </Suspense>
  );
}
