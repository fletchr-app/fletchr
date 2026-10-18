import { useLocalSearchParams, useTheme } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EndEditor } from '@/components/end-editor';
import { Button, ErrorText, Field, Screen } from '@/components/form';
import { SyncBanner } from '@/components/sync-banner';
import { getFace } from '@/lib/faces';
import { useLog } from '@/lib/log';
import { endTotal, LogSession, sessionTotals, shotLabel, sortedShots, usesEnds } from '@/lib/log-model';
import { newId } from '@/lib/uuid';

export default function SessionScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded, sessions, finishSession, deleteSession } = useLog();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const session = sessions.find((s) => s.id === id);

  if (!session) {
    return <Screen><Text style={{ color: colors.text }}>{loaded ? 'This session is not on this device.' : 'Loading…'}</Text></Screen>;
  }
  const { arrows, score } = sessionTotals(session);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Screen>
        <SyncBanner />
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>
          {session.type} · {new Date(session.started_at).toLocaleDateString()}
        </Text>
        <Text style={{ color: colors.text, opacity: 0.7 }}>
          {session.location ? `${session.location} · ` : ''}
          {arrows} arrows{usesEnds(session.type) ? ` · ${score} points` : ''}
          {session.ended_at ? ' · finished' : ''}
        </Text>
        {usesEnds(session.type) ? <Ends session={session} /> : <Volume session={session} />}
        <Button
          title={session.ended_at ? 'Reopen session' : 'Finish session'}
          secondary
          onPress={() => finishSession(session.id, !session.ended_at)}
        />
        <Button
          title={confirmDelete ? 'Tap again to delete this session' : 'Delete session'}
          secondary
          onPress={() => (confirmDelete ? deleteSession(session.id) : setConfirmDelete(true))}
        />
      </Screen>
    </ScrollView>
  );
}

function Ends({ session }: { session: LogSession }) {
  const { colors } = useTheme();
  // null: a new end; otherwise the id of the end being edited. The key restarts the editor each time.
  const [editing, setEditing] = useState<string | null>(null);
  const editedEnd = session.ends.find((e) => e.id === editing) ?? null;

  return (
    <>
      <EndEditor
        key={editedEnd?.id ?? `new-${session.ends.length}`}
        session={session}
        editing={editedEnd}
        onDone={() => setEditing(null)}
      />
      {session.ends.length > 0 && <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 8 }}>Ends</Text>}
      {[...session.ends].reverse().map((end) => (
        <Pressable key={end.id} onPress={() => setEditing(end.id)}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            End {end.index + 1} · {sortedShots(end.shots).map(shotLabel).join(' ')} = {endTotal(end)}
          </Text>
          <Text style={{ color: colors.text, opacity: 0.6 }}>
            {end.distance_m} m · {getFace(end.face)?.name ?? end.face}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

function Volume({ session }: { session: LogSession }) {
  const { colors } = useTheme();
  const { saveVolume, deleteVolume } = useLog();
  const last = session.volume[session.volume.length - 1];
  const [distance, setDistance] = useState(last?.distance_m ?? '18');
  const [count, setCount] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const metres = Number(distance.replace(',', '.'));
    const arrows = Number(count);
    if (!(metres > 0)) return setError('Enter the distance in metres');
    if (!(Number.isInteger(arrows) && arrows >= 1 && arrows <= 32767)) return setError('Enter how many arrows you shot');
    setError(null);
    saveVolume(session.id, { id: newId(), distance_m: metres.toFixed(1), arrow_count: arrows });
    setCount('');
  }

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Distance (m)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Arrows" value={count} onChangeText={setCount} keyboardType="number-pad" onSubmitEditing={add} />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Add" onPress={add} />
      {session.volume.map((entry) => (
        <View key={entry.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text }}>{entry.arrow_count} arrows at {entry.distance_m} m</Text>
          <Pressable onPress={() => deleteVolume(session.id, entry.id)}>
            <Text style={{ color: colors.primary }}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}
