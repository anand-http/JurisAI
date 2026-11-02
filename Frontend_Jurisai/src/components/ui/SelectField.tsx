import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronRight, X } from 'lucide-react-native';

import type { FieldOption } from '../../documents/types';
import { colors, radius, spacing, type } from '../../theme';

interface Props {
  label: string;
  value: string;
  options: FieldOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  help?: string;
  required?: boolean;
}

/** A tappable field that opens a searchable full-screen list. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  error,
  help,
  required,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not selected'}`}
        onPress={() => setOpen(true)}
        style={[styles.field, !!error && styles.fieldError]}
      >
        <Text
          style={[styles.value, !selected && styles.placeholder]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronRight size={18} color={colors.textSubtle} />
      </Pressable>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : help ? (
        <Text style={styles.help}>{help}</Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.sheetHeader}>
            <Text style={type.heading}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={12}
            >
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          {options.length > 8 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.textSubtle}
              style={styles.search}
              autoCorrect={false}
            />
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={o => o.value}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={Separator}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={styles.optionLabel}>{item.label}</Text>
                {item.value === value ? (
                  <Check size={20} color={colors.primary} />
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...type.label, marginBottom: spacing.xs + 2 },
  required: { color: colors.danger },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  fieldError: { borderColor: colors.danger },
  value: { fontSize: 16, color: colors.text, flex: 1, marginRight: spacing.sm },
  placeholder: { color: colors.textSubtle },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  help: { ...type.caption, marginTop: spacing.xs },
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  option: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  optionLabel: { fontSize: 16, color: colors.text, flex: 1 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
