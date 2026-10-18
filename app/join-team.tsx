import { router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { errorMessage, useAuth } from '@/lib/auth';

export default function JoinTeamScreen() {
  const { api } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await api.POST('/api/invites/redeem/', { body: { invite_code: code.trim() } });
      if (data) router.replace('/');
      else setError(errorMessage(error));
    } catch {
      setError('Server not reachable');
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Field label="Invite code" value={code} onChangeText={setCode} autoCapitalize="characters" onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button title="Join team" onPress={submit} busy={busy} />
    </Screen>
  );
}
