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
      if (!user?.id) throw new Error('Debes iniciar sesión');
      if (!name.trim()) throw new Error('Introduce un nombre de grupo');

      const groupPayload: GroupInsert = {
        name: name.trim(),
        // Asegurar moneda base por defecto (algunas configuraciones la requieren)
        // @ts-ignore base_currency existe en la tabla aunque sea opcional
        base_currency: 'EUR',
      };

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert(groupPayload)
        .select('id, name, created_at')
        .single();

      if (groupError) throw groupError;

      const memberPayload: MemberInsert = {
        group_id: group.id,
        user_id: user.id,
        is_active: true,
      };

      const { error: memberError } = await supabase
        .from('group_members')
        .insert(memberPayload);
      if (memberError) throw memberError;

      return group as Group;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groups', user?.id] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createGroupMutation.mutate(groupName, {
      onSuccess: (group) => {
        setGroupName('');
        setCreating(false);
        if (group) {
          // Usar router para respetar basePath
          router.push(`/groups/${group.id}`);
        }
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
