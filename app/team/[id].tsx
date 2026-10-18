import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { InvitesSection } from '@/components/invites-section';
import { MembersSection } from '@/components/members-section';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { useRemote } from '@/lib/use-remote';

const REFRESH_MS = 15000;
const always = () => true;

/** One team: its members, and for admins the invites and the team name. */
export default function ManageTeam() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const { api, userId } = useAuth();
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  // A new `version` means: fetch again (after a change).
  const loadTeam = useCallback(async () => {
    void version;
    return (await api.GET('/api/teams/{team_id}/', { params: { path: { team_id: teamId } } })).data ?? null;
  }, [api, teamId, version]);
  const loadMembers = useCallback(async () => {
    void version;
    return (await api.GET('/api/teams/{team_id}/members/', { params: { path: { team_id: teamId } } })).data ?? null;
  }, [api, teamId, version]);
  const team = useRemote(loadTeam, REFRESH_MS, always);
  const members = useRemote(loadMembers, REFRESH_MS, always);
  const isAdmin = team.data?.my_role === 'admin';

  const loadInvites = useCallback(async () => {
    void version;
    if (!isAdmin) return [];
    return (await api.GET('/api/teams/{team_id}/invites/', { params: { path: { team_id: teamId } } })).data ?? null;
  }, [api, teamId, isAdmin, version]);
  const invites = useRemote(loadInvites, REFRESH_MS, always);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: team.data?.name ?? 'Team' }} />
      <Screen>
        <ErrorText>{team.error ?? members.error}</ErrorText>
        {team.loading && <Text style={{ color: colors.text }}>Loading…</Text>}
        {team.data && (
          <>
            {isAdmin && <Rename key={team.data.name} teamId={teamId} name={team.data.name} onChanged={reload} />}
            {members.data && (
              <MembersSection teamId={teamId} members={members.data} isAdmin={isAdmin} myId={userId === null ? null : Number(userId)} onChanged={reload} />
            )}
            {isAdmin && invites.data && <InvitesSection teamId={teamId} teamName={team.data.name} invites={invites.data} onChanged={reload} />}
          </>
        )}
      </Screen>
    </ScrollView>
  );
}

function Rename({ teamId, name, onChanged }: { teamId: number; name: string; onChanged: () => void }) {
  const { api } = useAuth();
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      const { data, error } = await api.PATCH('/api/teams/{team_id}/', { params: { path: { team_id: teamId } }, body: { name: draft } });
      if (data) onChanged();
      else setError(errorMessage(error));
    } catch {
      setError('Server not reachable');
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Field label="Team name" value={draft} onChangeText={setDraft} autoCapitalize="words" onSubmitEditing={save} />
      <ErrorText>{error}</ErrorText>
      {draft.trim() !== name && <Button title="Save name" onPress={save} />}
    </View>
  );
}
