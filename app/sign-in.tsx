import { Link, useTheme } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { useAuth } from '@/lib/auth';
import { useServer } from '@/lib/server';

export default function SignInScreen() {
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const { url } = useServer();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  }

  return (
    <Screen>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={submit} busy={busy} />
      <Link href="/register" style={{ color: colors.primary }}>
        I have an invite code
      </Link>
      <Text style={{ color: colors.text, opacity: 0.6 }}>
        Server: {url}{' '}
        <Link href="/settings" style={{ color: colors.primary }}>
          change
        </Link>
      </Text>
    </Screen>
  );
}
