import { useTheme } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/form';
import { useLog } from '@/lib/log';

/** Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. */
export function SyncBanner() {
  const { colors } = useTheme();
  const { waiting, failed, retryFailed, discardFailed } = useLog();
  if (waiting === 0 && failed.length === 0) return null;
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
      {waiting > 0 && (
        <Text style={{ color: colors.text }}>
          {waiting} {waiting === 1 ? 'item is' : 'items are'} waiting to upload. Saved on this device, they go up when there is a connection.
        </Text>
      )}
      {failed.length > 0 && (
        <>
          <Text style={{ color: colors.notification }}>
            {failed.length} {failed.length === 1 ? 'item was' : 'items were'} refused by the server: {failed[0].error}
          </Text>
          <Button title="Try again" onPress={retryFailed} secondary />
          <Button title="Give up on these uploads" onPress={discardFailed} secondary />
        </>
      )}
    </View>
  );
}
