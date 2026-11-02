import type { DocumentTypeDef } from './types';

export const affidavit: DocumentTypeDef = {
  id: 'affidavit',
  title: 'Affidavit',
  description:
    'Supporting or evidence affidavit for court, or a general declaration before a Notary / Oath Commissioner.',
  icon: 'affidavit',
  draftTitle: a => `Affidavit — ${a.deponentName || 'Deponent'}`,
  steps: [
    {
      id: 'purpose',
      title: 'Purpose',
      fields: [
        {
          key: 'affidavitType',
          label: 'Type of affidavit',
          type: 'select',
          required: true,
          options: [
            {
              value: 'supporting',
              label: 'In support of an application / petition',
            },
            { value: 'evidence', label: 'Evidence (examination-in-chief)' },
            { value: 'general', label: 'General declaration (not for a case)' },
          ],
        },
        {
          key: 'courtName',
          label: 'Court',
          type: 'text',
          required: true,
          prefillFromProfile: p => p.primaryCourt,
          visibleIf: {
            key: 'affidavitType',
            oneOf: ['supporting', 'evidence'],
          },
        },
        {
          key: 'caseTitle',
          label: 'Case title & number',
          type: 'text',
          required: true,
          placeholder: 'e.g. Anita Sharma v. Rajesh Sharma, HMA No. 112/2026',
          visibleIf: {
            key: 'affidavitType',
            oneOf: ['supporting', 'evidence'],
          },
        },
        {
          key: 'purpose',
          label: 'What is the affidavit for?',
          type: 'text',
          required: true,
          placeholder: 'e.g. Change of name, proof of residence',
          visibleIf: { key: 'affidavitType', oneOf: ['general'] },
        },
      ],
    },
    {
      id: 'deponent',
      title: 'Deponent',
      subtitle: 'The person swearing the affidavit.',
      fields: [
        {
          key: 'deponentName',
          label: 'Full name',
          type: 'text',
          required: true,
        },
        {
          key: 'relation',
          label: 'Relation',
          type: 'select',
          required: true,
          options: [
            { value: 'S/o', label: 'Son of (S/o)' },
            { value: 'D/o', label: 'Daughter of (D/o)' },
            { value: 'W/o', label: 'Wife of (W/o)' },
            { value: 'H/o', label: 'Husband of (H/o)' },
          ],
        },
        {
          key: 'relativeName',
          label: "Parent's / spouse's name",
          type: 'text',
          required: true,
        },
        { key: 'age', label: 'Age (years)', type: 'number', required: true },
        { key: 'occupation', label: 'Occupation', type: 'text' },
        {
          key: 'deponentAddress',
          label: 'Address',
          type: 'multiline',
          required: true,
        },
      ],
    },
    {
      id: 'statements',
      title: 'Statements',
      fields: [
        {
          key: 'statements',
          label: 'Facts to be affirmed',
          type: 'multiline',
          required: true,
          placeholder:
            'One statement per line. Only facts within the deponent’s own knowledge.',
        },
        {
          key: 'verificationPlace',
          label: 'Place of verification',
          type: 'text',
          required: true,
          prefillFromProfile: p => p.city,
        },
        {
          key: 'verificationDate',
          label: 'Date of verification',
          type: 'date',
          required: true,
          defaultToday: true,
        },
      ],
    },
  ],
};
