import { useTheme } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Chips, ErrorText } from '@/components/form';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { roleChangeWarning, roleLabel, sortMembers, TEAM_ROLES, type TeamRole } from '@/lib/team-admin';

type Member = components['schemas']['Member'];

/** Who is in the team. Admins can change roles and remove people; for everybody else it is a list. */
export function MembersSection({
  teamId,
  members,
  isAdmin,
  myId,
  onChanged,
}: {
  teamId: number;
  members: Member[];
  isAdmin: boolean;
  myId: number | null;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Members</Text>
      {sortMembers(members).map((m) => (
        <View key={m.user_id} style={{ gap: 6 }}>
          <Pressable disabled={!isAdmin} onPress={() => setOpen(open === m.user_id ? null : m.user_id)}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {m.name || m.email}
              {m.user_id === myId ? ' (you)' : ''}
            </Text>
            <Text style={{ color: colors.text, opacity: 0.7 }}>
              {roleLabel(m.role)} · {m.email}
              {m.also_shoots ? ' · shares own training' : ''}
              {isAdmin ? (open === m.user_id ? '  ▴' : '  ▾') : ''}
            </Text>
          </Pressable>
          {isAdmin && open === m.user_id && (
            <MemberActions teamId={teamId} member={m} isMe={m.user_id === myId} onChanged={() => { setOpen(null); onChanged(); }} />
          )}
        </View>
      ))}
    </View>
  );
}

function MemberActions({ teamId, member, isMe, onChanged }: { teamId: number; member: Member; isMe: boolean; onChanged: () => void }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [role, setRole] = useState<TeamRole>(member.role as TeamRole);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warning = roleChangeWarning(member.role as TeamRole, role);

  async function run(action: () => Promise<{ ok: boolean; error?: unknown }>) {
    setError(null);
    try {
      const result = await action();
      if (result.ok) onChanged();
      else setError(errorMessage(result.error));
    } catch {
      setError('Server not reachable');
    }
  }
  const changeRole = () =>
    run(async () => {
      const { data, error } = await api.PATCH('/api/teams/{team_id}/members/{user_id}/', {
        params: { path: { team_id: teamId, user_id: member.user_id } },
        body: { role },
      });
      return { ok: !!data, error };
    });
  const remove = () =>
    run(async () => {
      const { response, error } = await api.DELETE('/api/teams/{team_id}/members/{user_id}/', {
        params: { path: { team_id: teamId, user_id: member.user_id } },
      });
      return { ok: response.ok, error };
    });

  return (
    <View style={{ gap: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.border }}>
      <Chips label="Role" options={TEAM_ROLES} value={role} onChange={setRole} />
      {warning && <Text style={{ color: colors.text, opacity: 0.8 }}>{warning}</Text>}
      {warning && <Button title={`Make ${member.name || member.email} ${roleLabel(role).toLowerCase()}`} onPress={changeRole} />}
      {!isMe && (
        <Button
          title={confirmRemove ? 'Tap again to remove from the team' : 'Remove from the team'}
          secondary
          onPress={() => (confirmRemove ? remove() : setConfirmRemove(true))}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
