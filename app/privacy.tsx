import { useTheme } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { useLog, type DeletedCounts } from '@/lib/log';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summary(d: DeletedCounts) {
  return [
    plural(d.sessions, 'session', 'sessions') + (d.shots > 0 ? ` (${plural(d.shots, 'scored arrow', 'scored arrows')})` : ''),
    plural(d.bows, 'bow', 'bows'),
    plural(d.arrow_sets, 'arrow set', 'arrow sets'),
    plural(d.notes_about_me, 'coach note about you', 'coach notes about you'),
  ].join(', ');
}

export default function YourData() {
  const { colors } = useTheme();
  const { deleteMyData } = useLog();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DeletedCounts | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    const result = await deleteMyData(password, confirm);
    if ('error' in result) setError(result.error);
    else {
      setDone(result.deleted);
      setPassword('');
      setConfirm('');
    }
    setBusy(false);
  }

  const text = { color: colors.text };
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Screen>
        <Text style={[text, { fontSize: 20, fontWeight: '600' }]}>Delete my data</Text>
        <Text style={text}>
          This erases, for good: all your sessions with their arrows, all your bows and arrow sets, and the coach notes written about you
          (also the ones that were not shared with you). It also clears the copy on this device, including anything still waiting to upload.
        </Text>
        <Text style={text}>
          It keeps your account, your profile and your teams, and the notes you wrote yourself about other archers. A copy may remain in
          server backups until they are rotated out.
        </Text>
        <Text style={text}>It cannot be undone.</Text>
        {done ? (
          <Text style={[text, { fontWeight: '600' }]}>Deleted: {summary(done)}.</Text>
        ) : (
          <>
            <Field label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
            <Field label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" onSubmitEditing={erase} />
            <ErrorText>{error}</ErrorText>
            <Button title="Delete my data" onPress={erase} busy={busy} />
          </>
        )}
      </Screen>
    </ScrollView>
  );
}
