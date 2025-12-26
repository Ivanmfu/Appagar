import { getSupabaseClient } from '@/lib/supabase';
import type { Database, Json } from '@/lib/database.types';

export type ActivityAction =
	| 'expense_created'
	| 'expense_updated'
	| 'expense_deleted'
	| 'group_created'
	| 'group_deleted';

export type ActivityPayload = {
	expenseId?: string;
	amountMinor?: number;
	currency?: string;
	note?: string | null;
	groupName?: string | null;
	groupId?: string;
};

export type ActivityFeedItem = {
	id: string;
	action: ActivityAction;
	createdAt: string | null;
	groupId: string | null;
	groupName: string;
	actorId: string | null;
	actorName: string;
	payload: ActivityPayload;
};

type LogActivityInput = {
	groupId?: string | null;
	actorId: string;
	action: ActivityAction;
	payload?: ActivityPayload;
};

function ensurePayload(input: Json | null): ActivityPayload {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return {};
	}

	const raw = input as Record<string, unknown>;
	const maybeString = (value: unknown): string | undefined =>
		typeof value === 'string' && value.length > 0 ? value : undefined;

	const maybeNumber = (value: unknown): number | undefined =>
		typeof value === 'number' && Number.isFinite(value) ? value : undefined;

	return {
		expenseId: maybeString(raw.expenseId),
		amountMinor: maybeNumber(raw.amountMinor),
		currency: maybeString(raw.currency),
		note: typeof raw.note === 'string' ? raw.note : null,
		groupName: typeof raw.groupName === 'string' ? raw.groupName : null,
		groupId: maybeString(raw.groupId),
	} satisfies ActivityPayload;
}

export async function logActivity({ groupId = null, actorId, action, payload }: LogActivityInput) {
	try {
		const supabase = getSupabaseClient();
		const { error } = await supabase.from('activity_events').insert({
			group_id: groupId ?? null,
			actor_id: actorId,
			action,
			payload: payload ?? null,
		});

		if (error) {
			console.error('[Activity] No se pudo registrar el evento:', error);
		}
	} catch (error) {
		console.error('[Activity] Error inesperado al registrar evento:', error);
	}
}

export async function fetchActivityFeed(userId: string | null): Promise<ActivityFeedItem[]> {
        if (!userId) return [];

        const supabase = getSupabaseClient();

        const { data: membershipRows, error: membershipError } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', userId)
                .eq('is_active', true);

	if (membershipError) {
		throw membershipError;
	}

        const groupIds = Array.from(
                new Set((membershipRows ?? []).map((row: { group_id: string }) => row.group_id))
        );

        const filters = [`actor_id.eq.${userId}`];
        if (groupIds.length > 0) {
                filters.push(`group_id.in.(${groupIds.join(',')})`);
        }

        const { data: eventsData, error: eventsError } = await supabase
                .from('activity_events')
                .select('id, group_id, actor_id, action, payload, created_at')
                .or(filters.join(','))
                .order('created_at', { ascending: false })
                .limit(80);

        if (eventsError) {
                throw eventsError;
        }

        const events = (eventsData ?? []).sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
        });

	if (events.length === 0) {
		return [];
	}

	const actorIds = Array.from(
		new Set(events.map((event) => event.actor_id).filter((id): id is string => Boolean(id)))
	);
	const relatedGroupIds = Array.from(
		new Set(events.map((event) => event.group_id).filter((id): id is string => Boolean(id)))
	);

	type ProfileLite = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'email'>;
	type GroupLite = Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name'>;

	const [profilesRes, groupsRes] = await Promise.all([
		actorIds.length
			? supabase
					.from('profiles')
					.select('id, display_name, email')
					.in('id', actorIds)
			: Promise.resolve({ data: [] as ProfileLite[] | null, error: null }),
		relatedGroupIds.length
			? supabase
					.from('groups')
					.select('id, name')
					.in('id', relatedGroupIds)
			: Promise.resolve({ data: [] as GroupLite[] | null, error: null }),
	]);

	if (profilesRes.error) {
		throw profilesRes.error;
	}
	if (groupsRes.error) {
		throw groupsRes.error;
	}

        const profileMap = new Map<string, ProfileLite>();
        (profilesRes.data ?? []).forEach((profile: ProfileLite) => {
                profileMap.set(profile.id, profile);
        });

        const groupMap = new Map<string, GroupLite>();
        (groupsRes.data ?? []).forEach((group: GroupLite) => {
                groupMap.set(group.id, group);
        });

	return events.map((event) => {
		const payload = ensurePayload(event.payload);
		const profile = event.actor_id ? profileMap.get(event.actor_id) : null;
		const group = event.group_id ? groupMap.get(event.group_id) : null;

		const actorName = profile?.display_name ?? profile?.email ?? 'Alguien';
		const groupName = payload.groupName ?? group?.name ?? 'Grupo';

		return {
			id: event.id,
			action: event.action as ActivityAction,
			createdAt: event.created_at,
			groupId: event.group_id ?? payload.groupId ?? null,
			groupName,
			actorId: event.actor_id,
			actorName,
			payload,
		} satisfies ActivityFeedItem;
	});
}
