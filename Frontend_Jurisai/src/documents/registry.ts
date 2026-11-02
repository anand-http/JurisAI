import type { LawyerProfile } from '../api/types';
import { toIsoDate } from '../lib/format';
import { affidavit } from './affidavit';
import { bailApplication } from './bailApplication';
import { legalNotice } from './legalNotice';
import type { Answers, DocumentTypeDef, FieldDef, WizardStep } from './types';

/**
 * Litigation document types offered in the wizard. To add one, create a
 * definition file next to these and append it here — the wizard, review
 * summary and history labels all read from this list.
 */
export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  legalNotice,
  bailApplication,
  affidavit,
];

export function getDocumentType(id: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES.find(d => d.id === id);
}

/** Resolves a backend documentType (which may be an alias) to our definition. */
export function documentTypeFor(key: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES.find(d => d.id === key || d.aliases?.includes(key));
}

export function documentTypeLabel(key: string): string {
  return (
    documentTypeFor(key)?.title ??
    key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase())
  );
}

export function isFieldVisible(field: FieldDef, answers: Answers): boolean {
  if (!field.visibleIf) {
    return true;
  }
  return field.visibleIf.oneOf.includes(answers[field.visibleIf.key] ?? '');
}

export function visibleFields(step: WizardStep, answers: Answers): FieldDef[] {
  return step.fields.filter(f => isFieldVisible(f, answers));
}

/** Steps whose fields are all conditional and currently hidden are skipped. */
export function visibleSteps(
  def: DocumentTypeDef,
  answers: Answers,
): WizardStep[] {
  return def.steps.filter(s => visibleFields(s, answers).length > 0);
}

export function initialAnswers(
  def: DocumentTypeDef,
  profile: LawyerProfile | null,
  today = new Date(),
): Answers {
  const answers: Answers = {};
  for (const field of def.steps.flatMap(s => s.fields)) {
    if (field.defaultValue !== undefined) {
      answers[field.key] = field.defaultValue;
    } else if (field.prefillFromProfile && profile) {
      answers[field.key] = field.prefillFromProfile(profile) ?? '';
    } else if (field.defaultToday) {
      answers[field.key] = toIsoDate(today);
    }
  }
  return answers;
}

const DEFAULT_MAX_LENGTH: Record<FieldDef['type'], number> = {
  text: 200,
  multiline: 6000,
  date: 10,
  select: 100,
  number: 6,
  amount: 16,
};

export function validateField(
  field: FieldDef,
  raw: string | undefined,
): string | null {
  const value = (raw ?? '').trim();
  if (!value) {
    return field.required ? `${field.label} is required` : null;
  }
  const max = field.maxLength ?? DEFAULT_MAX_LENGTH[field.type];
  if (value.length > max) {
    return `Keep this under ${max} characters`;
  }
  switch (field.type) {
    case 'number':
      return /^\d+$/.test(value) ? null : 'Enter a whole number';
    case 'amount':
      return /^\d[\d,]*(\.\d{1,2})?$/.test(value)
        ? null
        : 'Enter an amount in rupees, e.g. 450000';
    case 'date':
      return isValidIsoDate(value) ? null : 'Pick a valid date';
    case 'select':
      return field.options?.some(o => o.value === value)
        ? null
        : 'Choose an option';
    default:
      return null;
  }
}

export function validateStep(
  step: WizardStep,
  answers: Answers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(step, answers)) {
    const error = validateField(field, answers[field.key]);
    if (error) {
      errors[field.key] = error;
    }
  }
  return errors;
}

/** Drops answers for fields that are hidden, so stale data never reaches the backend. */
export function collectVisibleAnswers(
  def: DocumentTypeDef,
  answers: Answers,
): Answers {
  const out: Answers = {};
  for (const step of def.steps) {
    for (const field of visibleFields(step, answers)) {
      const value = (answers[field.key] ?? '').trim();
      if (value) {
        out[field.key] = value;
      }
    }
  }
  return out;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
