import { useTheme } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.border}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        {...props}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  busy,
  secondary,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, { backgroundColor: secondary ? colors.border : colors.primary }]}>
      {busy ? (
        <ActivityIndicator color={secondary ? colors.text : 'white'} />
      ) : (
        <Text style={{ color: secondary ? colors.text : 'white', fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, { backgroundColor: value === option.value ? colors.primary : colors.border }]}>
            <Text style={{ color: value === option.value ? 'white' : colors.text }}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const { colors } = useTheme();
  return children ? <Text style={{ color: colors.notification }}>{children}</Text> : null;
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  button: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
});
