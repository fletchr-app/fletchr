import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Chips, Field, Screen } from '@/components/form';
import { GearPicker } from '@/components/gear-picker';
import { useLog } from '@/lib/log';
import { defaultChoice, Environment, gearFor, SessionType } from '@/lib/log-model';

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
  const { startSession, sessions, equipment, refreshEquipment } = useLog();
  const [type, setType] = useState<SessionType>('scoring');
  const [environment, setEnvironment] = useState<Environment>('indoor');
  const [location, setLocation] = useState('');
  // Until you choose, the equipment you used last is selected.
  const preselected = defaultChoice(equipment, sessions);
  const [picked, setPicked] = useState<{ bowId: number | null; arrowSetId: number | null } | null>(null);
  const { bowId, arrowSetId } = picked ?? preselected;

  // Pick up equipment added since the last time: only works with a connection, otherwise the copy on the device is used.
  useEffect(() => {
    void refreshEquipment();
  }, [refreshEquipment]);

  function start() {
    const gear = bowId === null ? undefined : gearFor(equipment, bowId, arrowSetId);
    router.replace(`/training/${startSession(type, environment, location.trim(), gear)}`);
  }

  return (
    <Screen>
      <Chips label="Type" options={TYPES} value={type} onChange={setType} />
      <Chips label="Where" options={ENVIRONMENTS} value={environment} onChange={setEnvironment} />
      <Field label="Location (optional)" value={location} onChangeText={setLocation} autoCapitalize="sentences" />
      <GearPicker equipment={equipment} bowId={bowId} arrowSetId={arrowSetId} onChange={(b, a) => setPicked({ bowId: b, arrowSetId: a })} />
      <Button title="Start" onPress={start} />
    </Screen>
  );
}
