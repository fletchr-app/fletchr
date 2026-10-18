import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { LogProvider } from '@/lib/log';
import { ServerProvider } from '@/lib/server';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ServerProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <LogProvider>
            <RootNavigator />
          </LogProvider>
        </ThemeProvider>
      </AuthProvider>
    </ServerProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return null;

  return (
    <Stack>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="index" options={{ title: 'Archery Coach' }} />
        <Stack.Screen name="join-team" options={{ title: 'Join a team' }} />
        <Stack.Screen name="training/index" options={{ title: 'Training' }} />
        <Stack.Screen name="training/new" options={{ title: 'New session' }} />
        <Stack.Screen name="training/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="privacy" options={{ title: 'Your data' }} />
        <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
        <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="team/index" options={{ title: 'Team' }} />
        <Stack.Screen name="archers/[id]" options={{ title: 'Archer' }} />
        <Stack.Screen name="equipment/index" options={{ title: 'Equipment' }} />
        <Stack.Screen name="equipment/bows/[id]" options={{ title: 'Bow' }} />
        <Stack.Screen name="equipment/arrow-sets/[id]" options={{ title: 'Arrow set' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="register" options={{ title: 'Join with invite code' }} />
      </Stack.Protected>
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
