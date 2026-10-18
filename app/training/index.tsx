import { Link, useTheme } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/form';
import { SyncBanner } from '@/components/sync-banner';
import { useLog } from '@/lib/log';
import { sessionTotals } from '@/lib/log-model';

export default function TrainingList() {
  const { colors } = useTheme();
  const { sessions } = useLog();
  return (
    <ScrollView>
      <Screen>
        <SyncBanner />
        <Link href="/training/new" style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
          Start a session
        </Link>
        <Text style={{ color: colors.text, opacity: 0.6 }}>
          Sessions logged on this device. Older sessions from other devices will show up here later.
        </Text>
        {sessions.map((session) => {
          const { arrows, score } = sessionTotals(session);
          return (
            <Link key={session.id} href={`/training/${session.id}`}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {new Date(session.started_at).toLocaleString()} · {session.type}
                  {session.ended_at ? '' : ' (in progress)'}
                </Text>
                <Text style={{ color: colors.text, opacity: 0.7 }}>
                  {session.location ? `${session.location} · ` : ''}
                  {session.ends.length} ends · {arrows} arrows{session.ends.length > 0 ? ` · ${score} points` : ''}
                </Text>
              </View>
            </Link>
          );
        })}
      </Screen>
    </ScrollView>
  );
}
