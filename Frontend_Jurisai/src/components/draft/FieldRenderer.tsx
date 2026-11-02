import React from 'react';

import type { FieldDef } from '../../documents/types';
import { DateField } from '../ui/DateField';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';

interface Props {
  field: FieldDef;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

/** Maps a registry field definition to the right input. */
export function FieldRenderer({ field, value, error, onChange }: Props) {
  const common = {
    label: field.label,
    required: field.required,
    help: field.help,
    error,
  };

  switch (field.type) {
    case 'select':
      return (
        <SelectField
          {...common}
          value={value}
          options={field.options ?? []}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );
    case 'date':
      return <DateField {...common} value={value} onChange={onChange} />;
    case 'number':
    case 'amount':
      return (
        <TextField
          {...common}
          value={value}
          onChangeText={onChange}
          keyboardType={field.type === 'amount' ? 'decimal-pad' : 'number-pad'}
          prefix={field.type === 'amount' ? '₹' : undefined}
          placeholder={field.placeholder}
        />
      );
    case 'multiline':
      return (
        <TextField
          {...common}
          value={value}
          onChangeText={onChange}
          multiline
          placeholder={field.placeholder}
        />
      );
    default:
      return (
        <TextField
          {...common}
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder}
          autoCapitalize="words"
        />
      );
  }
}
