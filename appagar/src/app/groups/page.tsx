'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { getSupabaseClient } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';

type Group = {
  id: string;
  name: string;
  created_at: string;
};

type MemberInsert = {
  group_id: string;
  user_id: string;
  is_active: boolean;
};

type GroupInsert = {
  name: string;
};

function GroupsContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const showNewGroup = searchParams?.get('new') === '1';
  const [creating, setCreating] = useState(showNewGroup);
  const [groupName, setGroupName] = useState('');
  const supabase = useMemo(() => getSupabaseClient(), []);

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as Group[];
      const { data, error } = await supabase
        .from('group_members')
        .select('groups(id, name, created_at)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      const rows = (data ?? []) as { groups: Group | null }[];
      // Extraer los grupos y ordenar localmente por nombre
      const groups = rows
        .map((row) => row.groups)
        .filter((group): group is Group => Boolean(group))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      return groups;
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      try {
        console.log('[Groups] Starting group creation, user:', user?.id);
        if (!user?.id) {
          console.error('[Groups] No user ID found');
          throw new Error('Debes iniciar sesión');
        }
        if (!name.trim()) {
          console.error('[Groups] Empty group name');
          throw new Error('Introduce un nombre de grupo');
        }

        const groupPayload = {
          name: name.trim(),
          base_currency: 'EUR',
        };

        console.log('[Groups] Inserting group:', JSON.stringify(groupPayload));
        
        // Usar API REST directamente con timeout agresivo
        const session = await supabase.auth.getSession();
        if (!session.data.session?.access_token) {
          throw new Error('No hay sesión activa');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/groups?select=id,name,created_at`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                'Authorization': `Bearer ${session.data.session.access_token}`,
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(groupPayload),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);
          console.log('[Groups] API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('[Groups] API error:', errorData);
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          const groups = await response.json();
          console.log('[Groups] API response data:', groups);

          if (!Array.isArray(groups) || groups.length === 0) {
            throw new Error('No se recibió el grupo creado');
          }

          const group = groups[0] as Group;
          console.log('[Groups] Group created:', group.id);

          // Crear miembro con el mismo método
          const memberPayload = {
            group_id: group.id,
            user_id: user.id,
            is_active: true,
          };

          console.log('[Groups] Inserting member:', JSON.stringify(memberPayload));

          const memberController = new AbortController();
          const memberTimeoutId = setTimeout(() => memberController.abort(), 5000);

          const memberResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/group_members`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                'Authorization': `Bearer ${session.data.session.access_token}`,
              },
              body: JSON.stringify(memberPayload),
              signal: memberController.signal,
            }
          );

          clearTimeout(memberTimeoutId);
          console.log('[Groups] Member API response status:', memberResponse.status);

          if (!memberResponse.ok) {
            const errorData = await memberResponse.json();
            console.error('[Groups] Member API error:', errorData);
            throw new Error(errorData.message || 'Error al añadir miembro');
          }

          console.log('[Groups] Member created successfully');
          return group;
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error('[Groups] Request timeout');
            throw new Error('La petición tardó demasiado (timeout 5s)');
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('[Groups] Exception in mutationFn:', error);
        console.error('[Groups] Exception type:', error instanceof Error ? 'Error' : typeof error);
        if (error instanceof Error) {
          console.error('[Groups] Exception message:', error.message);
          console.error('[Groups] Exception stack:', error.stack);
        }
        throw error;
      }
    },
    onSuccess: async (group) => {
      console.log('[Groups] Mutation onSuccess, group:', group);
      console.log('[Groups] Invalidating queries for user:', user?.id);
      await queryClient.invalidateQueries({ queryKey: ['groups', user?.id] });
      console.log('[Groups] Queries invalidated');
    },
    onError: (error) => {
      console.error('[Groups] Mutation onError:', error);
      console.error('[Groups] Error instanceof Error:', error instanceof Error);
      if (error instanceof Error) {
        console.error('[Groups] Error message:', error.message);
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    console.log('[Groups] Form submitted, group name:', groupName);
    createGroupMutation.mutate(groupName, {
      onSuccess: (group) => {
        console.log('[Groups] onSuccess callback, group:', group);
        setGroupName('');
        setCreating(false);
        if (group) {
          console.log('[Groups] Navigating to group:', group.id);
          // Usar router para respetar basePath
          router.push(`/groups/${group.id}`);
        }
      },
      onError: (error) => {
        console.error('[Groups] onError callback:', error);
      },
    });
  }

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Cargando grupos...</main>;
  }

  if (!user) {
    return null;
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tus grupos</h1>
            <p className="text-gray-600 text-sm">Crea un grupo nuevo o entra en uno existente.</p>
          </div>
          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={() => setCreating(true)}
          >
            Nuevo grupo
          </button>
        </header>

        {creating && (
          <form className="border p-4 rounded space-y-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-sm">
              Nombre del grupo
              <input
                className="border px-3 py-2 rounded"
                placeholder="Viaje a la sierra"
                required
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                disabled={createGroupMutation.isPending}
                type="submit"
              >
                {createGroupMutation.isPending ? 'Creando...' : 'Crear y entrar'}
              </button>
              <button
                className="text-sm text-gray-600"
                onClick={() => setCreating(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {createGroupMutation.error && (
              <p className="text-sm text-red-600">
                {(createGroupMutation.error as Error).message ?? 'No se pudo crear el grupo'}
              </p>
            )}
            {createGroupMutation.isSuccess && !createGroupMutation.error && (
              <p className="text-sm text-green-600">Grupo creado correctamente.</p>
            )}
          </form>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Grupos existentes</h2>
          <ul className="space-y-2">
            {groupsQuery.data?.map((group) => (
              <li key={group.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{group.name}</p>
                  <p className="text-xs text-gray-500">
                    Creado {new Date(group.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link className="text-sm text-blue-600" href={`/groups/${group.id}`}>
                  Abrir
                </Link>
              </li>
            ))}
          </ul>

          {groupsQuery.isLoading && <p className="text-sm text-gray-500">Cargando...</p>}
          {groupsQuery.error && (
            <p className="text-sm text-red-600">
              {(groupsQuery.error as Error).message ?? 'No se pudieron obtener los grupos'}
            </p>
          )}
          {groupsQuery.data?.length === 0 && !groupsQuery.isLoading && (
            <p className="text-sm text-gray-500">Todavía no perteneces a ningún grupo.</p>
          )}
        </section>
      </main>
    </AuthGate>
  );
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <GroupsContent />
    </Suspense>
  );
}
