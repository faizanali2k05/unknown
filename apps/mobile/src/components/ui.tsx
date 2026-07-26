import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius, typography } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { t } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text.primary} />;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { t } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        primary && { backgroundColor: pressed ? t.accent.pressed : t.accent.default },
        variant === 'ghost' && { borderWidth: 1, borderColor: t.border.default },
        variant === 'danger' && { borderWidth: 1, borderColor: t.status.danger },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? t.accent.on : t.accent.default} />
      ) : (
        <Text
          style={[
            typography.label,
            { fontSize: 16 },
            primary
              ? { color: t.accent.on, fontWeight: '800' }
              : { color: variant === 'danger' ? t.status.danger : t.text.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  icon?: IconName;
}

export function Field({ label, icon, style, secureTextEntry, ...rest }: FieldProps) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const isPassword = !!secureTextEntry;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? (
        <Text style={[typography.caption, { color: t.text.secondary, marginBottom: spacing.sm }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          s.field,
          {
            backgroundColor: t.bg.secondary,
            borderColor: focused ? t.accent.default : t.border.default,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={focused ? t.accent.default : t.text.muted} /> : null}
        <TextInput
          placeholderTextColor={t.text.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={isPassword ? hidden : false}
          style={[
            s.input,
            { color: t.text.primary },
            icon ? { marginLeft: spacing.sm } : null,
            style,
          ]}
          {...rest}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={t.text.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Initials avatar with a deterministic tint per name. */
export function Avatar({ name, size = 46 }: { name: string; size?: number }) {
  const { t } = useTheme();
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `hsl(${hash}, 42%, ${t.bg.primary === '#07120C' ? 28 : 82}%)`,
      }}
    >
      <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: t.text.primary }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
}) {
  const { t } = useTheme();
  return (
    <View style={s.empty}>
      <Icon name={icon} size={44} color={t.text.muted} />
      <Text style={[typography.heading, { color: t.text.primary, marginTop: spacing.md }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            typography.body,
            { color: t.text.secondary, marginTop: spacing.xs, textAlign: 'center' },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, fontSize: 16, height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
});
