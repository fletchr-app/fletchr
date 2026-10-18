import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ invite_code: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(await register(form));
    setBusy(false);
  }

  return (
    <Screen>
      <Field label="Invite code" value={form.invite_code} onChangeText={set('invite_code')} autoCapitalize="characters" />
      <Field label="Name" value={form.name} onChangeText={set('name')} autoCapitalize="words" autoComplete="name" />
      <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={submit} busy={busy} />
    </Screen>
  );
}
