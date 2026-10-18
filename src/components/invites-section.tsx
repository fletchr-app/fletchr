import { useTheme } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';

import { Button, Chips, ErrorText } from '@/components/form';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { inviteMessage, roleLabel, TEAM_ROLES, type TeamRole } from '@/lib/team-admin';

type Invite = components['schemas']['Invite'];

/** In the browser the text is copied; on a phone the share sheet opens. */
async function send(message: string): Promise<string> {
  if (Platform.OS === 'web') {
    await navigator.clipboard.writeText(message);
    return 'Copied. Paste it into a message.';
  }
  await Share.share({ message });
  return '';
}

/** Open invites of a team, and a form for a new one. Admins only. */
export function InvitesSection({ teamId, teamName, invites, onChanged }: { teamId: number; teamName: string; invites: Invite[]; onChanged: () => void }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [role, setRole] = useState<TeamRole>('archer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await api.POST('/api/teams/{team_id}/invites/', { params: { path: { team_id: teamId } }, body: { role } });
      if (data) onChanged();
      else setError(errorMessage(error));
    } catch {
      setError('Server not reachable');
    }
    setBusy(false);
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Invites</Text>
      <Text style={{ color: colors.text, opacity: 0.7 }}>
        Someone joins with a code, once, within 14 days. They become what you choose here.
      </Text>
      <Chips label="New invite for a" options={TEAM_ROLES} value={role} onChange={setRole} />
      <ErrorText>{error}</ErrorText>
      <Button title={`Create ${roleLabel(role).toLowerCase()} invite`} onPress={create} busy={busy} />
      {invites.length === 0 && <Text style={{ color: colors.text, opacity: 0.7 }}>No open invites.</Text>}
      {invites.map((invite) => (
        <InviteRow key={invite.id} teamId={teamId} teamName={teamName} invite={invite} onChanged={onChanged} />
      ))}
    </View>
  );
}

function InviteRow({ teamId, teamName, invite, onChanged }: { teamId: number; teamName: string; invite: Invite; onChanged: () => void }) {
  const { colors } = useTheme();
  const { api } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function share() {
    try {
      setNote(await send(inviteMessage(teamName, invite.code, invite.expires_at)));
    } catch {
      setNote('Could not copy: select the code above and copy it.');
    }
  }
  async function cancel() {
    try {
      const { response } = await api.DELETE('/api/teams/{team_id}/invites/{id}/', { params: { path: { team_id: teamId, id: invite.id } } });
      if (response.ok) onChanged();
      else setNote('Could not cancel this invite');
    } catch {
      setNote('Server not reachable');
    }
  }

  return (
    <View style={{ gap: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
      <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: 2 }}>
        {invite.code}
      </Text>
      <Text style={{ color: colors.text, opacity: 0.7 }}>
        {roleLabel(invite.role ?? 'archer')} · until {new Date(invite.expires_at).toLocaleDateString()}
      </Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Text style={{ color: colors.primary }} onPress={share}>
          {Platform.OS === 'web' ? 'Copy invite text' : 'Share'}
        </Text>
        <Text style={{ color: colors.primary }} onPress={() => (confirmCancel ? cancel() : setConfirmCancel(true))}>
          {confirmCancel ? 'Tap again to cancel the invite' : 'Cancel invite'}
        </Text>
      </View>
      {note ? <Text style={{ color: colors.text, opacity: 0.7 }}>{note}</Text> : null}
    </View>
  );
}
