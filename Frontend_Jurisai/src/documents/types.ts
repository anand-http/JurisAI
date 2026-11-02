import type { LawyerProfile } from '../api/types';

export type FieldType =
  | 'text'
  | 'multiline'
  | 'date'
  | 'select'
  | 'number'
  | 'amount';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  defaultValue?: string;
  /** Date fields only: start with today's date. */
  defaultToday?: boolean;
  maxLength?: number;
  /** Only shown (and validated) when another answer matches. */
  visibleIf?: { key: string; oneOf: string[] };
  /** Pre-fills the field from the lawyer's profile when empty. */
  prefillFromProfile?: (profile: LawyerProfile) => string;
}

export interface WizardStep {
  id: string;
  title: string;
  subtitle?: string;
  fields: FieldDef[];
}

export type DocumentIcon = 'notice' | 'bail' | 'affidavit';

export interface DocumentTypeDef {
  id: string;
  title: string;
  description: string;
  icon: DocumentIcon;
  /** Other documentType keys the backend may return for this type. */
  aliases?: string[];
  /** The documentType sent to POST /drafts/generate, if not `id`. */
  backendType?: (answers: Answers) => string;
  steps: WizardStep[];
  /** Used as the draft title in history, e.g. "Bail application — Ravi Kumar". */
  draftTitle: (answers: Record<string, string>) => string;
}

export type Answers = Record<string, string>;
