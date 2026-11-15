import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button, FlatList, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';

export default function MessagesScreen() {
  const theme = useTheme();
  const messages = useQuery(api.messages.list);
  const send = useMutation(api.messages.send);
  const [draft, setDraft] = useState('');

  async function submit() {
    if (!draft.trim()) return;
    await send({ body: draft });
    setDraft('');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Convex messages</ThemedText>
        <ThemedView style={styles.row}>
          <TextInput
            testID="message-input"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            placeholder="Write a message"
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          <Button testID="send-button" title="Send" onPress={submit} />
        </ThemedView>
        {messages === undefined ? (
          <ThemedText type="small">Loading…</ThemedText>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m._id}
            ListEmptyComponent={<ThemedText type="small">No messages yet.</ThemedText>}
            renderItem={({ item }) => <ThemedText style={styles.item}>{item.body}</ThemedText>}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  item: {
    paddingVertical: Spacing.two,
  },
});
