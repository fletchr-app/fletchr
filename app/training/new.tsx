import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Chips, Field, Screen } from '@/components/form';
import { useLog } from '@/lib/log';
import { Environment, SessionType } from '@/lib/log-model';

const TYPES: { value: SessionType; label: string }[] = [
  { value: 'scoring', label: 'Scoring' },
  { value: 'competition', label: 'Competition' },
  { value: 'volume', label: 'Volume' },
  { value: 'technique', label: 'Technique' },
];
const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: '', label: 'Not set' },
];

export default function NewSession() {
  const { startSession } = useLog();
  const [type, setType] = useState<SessionType>('scoring');
  const [environment, setEnvironment] = useState<Environment>('indoor');
  const [location, setLocation] = useState('');

  return (
    <Screen>
      <Chips label="Type" options={TYPES} value={type} onChange={setType} />
      <Chips label="Where" options={ENVIRONMENTS} value={environment} onChange={setEnvironment} />
      <Field label="Location (optional)" value={location} onChangeText={setLocation} autoCapitalize="sentences" />
      <Button title="Start" onPress={() => router.replace(`/training/${startSession(type, environment, location.trim())}`)} />
    </Screen>
  );
}
