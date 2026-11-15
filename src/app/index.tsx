import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';

type Character = Doc<'characters'>;

const CLASSES: Character['characterClass'][] = ['warrior', 'mage', 'rogue', 'cleric', 'ranger'];
const RACES: Character['race'][] = ['human', 'elf', 'dwarf', 'halfling', 'orc'];
const ALIGNMENTS: Character['alignment'][] = ['good', 'neutral', 'evil'];
const WEAPONS: Character['weapon'][] = ['sword', 'staff', 'dagger', 'mace', 'bow'];

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <ThemedView style={styles.question}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedView style={styles.chips}>
        {options.map((option) => (
          <Pressable key={option} testID={`${label}-${option}`} onPress={() => onChange(option)}>
            <ThemedView
              type={value === option ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.chip}>
              <ThemedText type="small" themeColor={value === option ? 'text' : 'textSecondary'}>
                {option}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

export default function CharactersScreen() {
  const theme = useTheme();
  const characters = useQuery(api.characters.list);
  const create = useMutation(api.characters.create);
  const [name, setName] = useState('');
  const [characterClass, setCharacterClass] = useState<Character['characterClass']>();
  const [race, setRace] = useState<Character['race']>();
  const [alignment, setAlignment] = useState<Character['alignment']>();
  const [weapon, setWeapon] = useState<Character['weapon']>();
  const [backstory, setBackstory] = useState('');

  const ready = name.trim() && characterClass && race && alignment && weapon;
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  async function submit() {
    if (!ready) return;
    await create({ name, characterClass, race, alignment, weapon, backstory });
    setName('');
    setBackstory('');
    setCharacterClass(undefined);
    setRace(undefined);
    setAlignment(undefined);
    setWeapon(undefined);
  }

  const form = (
    <ThemedView style={styles.form}>
      <ThemedText type="subtitle">New character</ThemedText>
      <TextInput
        testID="name-input"
        style={inputStyle}
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
        value={name}
        onChangeText={setName}
      />
      <Choice label="Class" options={CLASSES} value={characterClass} onChange={setCharacterClass} />
      <Choice label="Race" options={RACES} value={race} onChange={setRace} />
      <Choice label="Alignment" options={ALIGNMENTS} value={alignment} onChange={setAlignment} />
      <Choice label="Starting weapon" options={WEAPONS} value={weapon} onChange={setWeapon} />
      <TextInput
        testID="backstory-input"
        style={inputStyle}
        placeholder="Backstory"
        placeholderTextColor={theme.textSecondary}
        value={backstory}
        onChangeText={setBackstory}
      />
      <Button testID="create-button" title="Create character" onPress={submit} disabled={!ready} />
      <ThemedText type="subtitle">Party</ThemedText>
      {characters === undefined && <ThemedText type="small">Loading…</ThemedText>}
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={characters ?? []}
          keyExtractor={(c) => c._id}
          ListHeaderComponent={form}
          ListEmptyComponent={
            characters && <ThemedText type="small">No characters yet.</ThemedText>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{item.name}</ThemedText>
              <ThemedText type="small">
                {item.alignment} {item.race} {item.characterClass} with a {item.weapon}
              </ThemedText>
              {item.backstory ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.backstory}
                </ThemedText>
              ) : null}
            </ThemedView>
          )}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
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
    maxWidth: MaxContentWidth,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
  form: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  question: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
