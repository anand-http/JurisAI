import type { LawyerProfile } from '../src/api/types';
import {
  collectVisibleAnswers,
  documentTypeFor,
  getDocumentType,
  initialAnswers,
  validateField,
  validateStep,
  visibleSteps,
} from '../src/documents/registry';

const notice = getDocumentType('legal_notice')!;
const bail = getDocumentType('bail_application')!;

const profile: LawyerProfile = {
  fullName: 'Priya Sharma',
  barRegistrationNumber: 'D/1234/2015',
  enrolmentState: 'Delhi',
  practiceAreas: ['Criminal'],
  primaryCourt: 'Saket District Courts, New Delhi',
  city: 'New Delhi',
};

describe('document registry', () => {
  it('shows the cheque step only for cheque dishonour notices', () => {
    const ids = (answers: Record<string, string>) =>
      visibleSteps(notice, answers).map(s => s.id);
    expect(ids({ noticeType: 'money_recovery' })).not.toContain('cheque');
    expect(ids({ noticeType: 'cheque_dishonour' })).toContain('cheque');
  });

  it('pre-fills defaults, today’s date and the court from the profile', () => {
    const answers = initialAnswers(bail, profile, new Date(2026, 8, 27));
    expect(answers.courtName).toBe(profile.primaryCourt);
    expect(
      initialAnswers(notice, profile, new Date(2026, 8, 27)),
    ).toMatchObject({
      noticeDate: '2026-09-27',
      compliancePeriodDays: '15',
    });
  });

  it('validates only visible fields', () => {
    const court = bail.steps[0];
    const errors = validateStep(court, { bailType: 'regular' });
    expect(Object.keys(errors).sort()).toEqual([
      'courtName',
      'firNumber',
      'offenceSections',
      'policeStation',
    ]);
    const accused = bail.steps[1];
    expect(
      validateStep(accused, { bailType: 'anticipatory' }),
    ).not.toHaveProperty('arrestDate');
    expect(validateStep(accused, { bailType: 'regular' })).toHaveProperty(
      'arrestDate',
    );
  });

  it('checks field formats', () => {
    const field = (type: any) => ({
      key: 'k',
      label: 'Field',
      type,
      required: true,
    });
    expect(validateField(field('number'), '34')).toBeNull();
    expect(validateField(field('number'), '34a')).toMatch(/whole number/);
    expect(validateField(field('amount'), '4,50,000')).toBeNull();
    expect(validateField(field('date'), '2026-02-30')).toMatch(/valid date/);
    expect(validateField(field('text'), '  ')).toMatch(/required/);
  });

  it('drops answers for hidden fields before they reach the backend', () => {
    const answers = {
      noticeType: 'money_recovery',
      chequeNumber: '123',
      facts: 'x',
    };
    expect(collectVisibleAnswers(notice, answers)).toEqual({
      noticeType: 'money_recovery',
      facts: 'x',
    });
  });

  it('maps backend document types back to the client definition', () => {
    expect(documentTypeFor('regular_bail')?.id).toBe('bail_application');
    expect(documentTypeFor('anticipatory_bail')?.id).toBe('bail_application');
    expect(bail.backendType?.({ bailType: 'anticipatory' })).toBe(
      'anticipatory_bail',
    );
    expect(bail.backendType?.({ bailType: 'interim' })).toBe('regular_bail');
  });
});
