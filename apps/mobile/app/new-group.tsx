import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, spacing, typography } from '../src/theme';
import { Avatar, Button, Field, Icon } from '../src/components/ui';
import { api, User } from '../src/api';

export default function NewGroup() {
  const { t } = useTheme();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.directory().then(setPeople).catch(() => undefined);
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    if (!title.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      const g = await api.createGroup(title.trim(), Array.from(selected));
      router.replace({ pathname: '/chat/[id]', params: { id: g.id, title: g.title } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <View style={{ padding: spacing.lg }}>
        <Field label="Group name" placeholder="Design Team" value={title} onChangeText={setTitle} />
        <Text style={[typography.caption, { color: t.text.muted }]}>
          {selected.size} member{selected.size === 1 ? '' : 's'} selected
        </Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <Avatar name={item.display_name} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.heading, { color: t.text.primary }]}>
                  {item.display_name}
                </Text>
                <Text style={[typography.caption, { color: t.text.muted }]}>@{item.username}</Text>
              </View>
              <Icon
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={on ? t.accent.default : t.text.muted}
              />
            </Pressable>
          );
        }}
      />

      <View style={{ padding: spacing.lg }}>
        <Button
          label="Create group"
          onPress={create}
          loading={busy}
          disabled={!title.trim() || selected.size === 0}
        />
      </View>
    </View>
  );
}
