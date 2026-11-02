import type { DocumentTypeDef } from './types';

export const bailApplication: DocumentTypeDef = {
  id: 'bail_application',
  title: 'Bail application',
  description:
    'Regular, anticipatory, interim or default bail — before the Magistrate, Sessions Court or High Court.',
  icon: 'bail',
  // The backend has tuned drafting profiles for these two.
  aliases: ['regular_bail', 'anticipatory_bail'],
  backendType: a =>
    a.bailType === 'anticipatory' ? 'anticipatory_bail' : 'regular_bail',
  draftTitle: a => `Bail application — ${a.accusedName || 'Applicant'}`,
  steps: [
    {
      id: 'court',
      title: 'Court & case',
      fields: [
        {
          key: 'bailType',
          label: 'Type of bail',
          type: 'select',
          required: true,
          options: [
            { value: 'regular', label: 'Regular bail' },
            { value: 'anticipatory', label: 'Anticipatory bail' },
            { value: 'interim', label: 'Interim bail' },
            { value: 'default', label: 'Default (statutory) bail' },
          ],
        },
        {
          key: 'courtName',
          label: 'Court',
          type: 'text',
          required: true,
          placeholder: 'e.g. Court of the Sessions Judge, Saket, New Delhi',
          prefillFromProfile: p => p.primaryCourt,
        },
        {
          key: 'firNumber',
          label: 'FIR number & year',
          type: 'text',
          required: true,
          placeholder: 'e.g. 245/2026',
        },
        {
          key: 'policeStation',
          label: 'Police station',
          type: 'text',
          required: true,
        },
        {
          key: 'offenceSections',
          label: 'Sections invoked in the FIR',
          type: 'text',
          required: true,
          placeholder: 'e.g. Sections 318(4), 316(2) BNS',
          help: 'Copy exactly from the FIR.',
        },
      ],
    },
    {
      id: 'accused',
      title: 'Applicant (accused)',
      fields: [
        {
          key: 'accusedName',
          label: 'Full name',
          type: 'text',
          required: true,
        },
        {
          key: 'parentName',
          label: "Father's / mother's / spouse's name",
          type: 'text',
          required: true,
        },
        { key: 'age', label: 'Age (years)', type: 'number', required: true },
        {
          key: 'accusedAddress',
          label: 'Residential address',
          type: 'multiline',
          required: true,
        },
        {
          key: 'arrestDate',
          label: 'Date of arrest',
          type: 'date',
          required: true,
          visibleIf: {
            key: 'bailType',
            oneOf: ['regular', 'interim', 'default'],
          },
        },
      ],
    },
    {
      id: 'grounds',
      title: 'Facts & grounds',
      fields: [
        {
          key: 'facts',
          label: 'Prosecution case in brief',
          type: 'multiline',
          required: true,
          placeholder: 'What the FIR alleges, in 3–5 sentences.',
        },
        {
          key: 'grounds',
          label: 'Grounds for bail',
          type: 'multiline',
          required: true,
          placeholder:
            'e.g. False implication, recovery already effected, charge-sheet filed, roots in society, health, custody period.',
        },
        {
          key: 'antecedents',
          label: 'Criminal antecedents',
          type: 'multiline',
          placeholder: 'Leave blank if none.',
        },
        {
          key: 'previousApplications',
          label: 'Previous bail applications in this case',
          type: 'multiline',
          placeholder: 'Leave blank if this is the first application.',
        },
      ],
    },
  ],
};
