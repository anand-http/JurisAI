import type { DocumentTypeDef } from './types';

export const legalNotice: DocumentTypeDef = {
  id: 'legal_notice',
  title: 'Legal notice',
  description:
    'Demand or pre-litigation notice — money recovery, cheque dishonour, breach of contract, tenancy.',
  icon: 'notice',
  draftTitle: a =>
    `Legal notice — ${a.senderName || 'Client'} to ${
      a.recipientName || 'Recipient'
    }`,
  steps: [
    {
      id: 'basics',
      title: 'Type of notice',
      subtitle: 'This decides which provisions the draft relies on.',
      fields: [
        {
          key: 'noticeType',
          label: 'Nature of notice',
          type: 'select',
          required: true,
          options: [
            { value: 'money_recovery', label: 'Recovery of money / dues' },
            { value: 'cheque_dishonour', label: 'Cheque dishonour' },
            { value: 'breach_of_contract', label: 'Breach of contract' },
            { value: 'tenancy', label: 'Tenancy / eviction' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          key: 'noticeDate',
          label: 'Date of notice',
          type: 'date',
          required: true,
          defaultToday: true,
        },
      ],
    },
    {
      id: 'parties',
      title: 'Parties',
      subtitle: 'Your client sends the notice to the recipient.',
      fields: [
        {
          key: 'senderName',
          label: "Client's name (sender)",
          type: 'text',
          required: true,
          placeholder: 'e.g. M/s Sunrise Traders',
        },
        {
          key: 'senderAddress',
          label: "Client's address",
          type: 'multiline',
          required: true,
        },
        {
          key: 'recipientName',
          label: "Recipient's name",
          type: 'text',
          required: true,
        },
        {
          key: 'recipientAddress',
          label: "Recipient's address",
          type: 'multiline',
          required: true,
        },
      ],
    },
    {
      id: 'cheque',
      title: 'Cheque details',
      subtitle: 'Exactly as on the cheque and the bank return memo.',
      fields: [
        {
          key: 'chequeNumber',
          label: 'Cheque number',
          type: 'text',
          required: true,
          visibleIf: { key: 'noticeType', oneOf: ['cheque_dishonour'] },
        },
        {
          key: 'chequeDate',
          label: 'Date on the cheque',
          type: 'date',
          required: true,
          visibleIf: { key: 'noticeType', oneOf: ['cheque_dishonour'] },
        },
        {
          key: 'bankName',
          label: 'Drawn on (bank & branch)',
          type: 'text',
          required: true,
          visibleIf: { key: 'noticeType', oneOf: ['cheque_dishonour'] },
        },
        {
          key: 'dishonourDate',
          label: 'Date of return memo',
          type: 'date',
          required: true,
          help: 'The demand notice must go out within 30 days of your client learning of the dishonour.',
          visibleIf: { key: 'noticeType', oneOf: ['cheque_dishonour'] },
        },
        {
          key: 'dishonourReason',
          label: 'Reason on return memo',
          type: 'text',
          required: true,
          placeholder: 'e.g. Funds insufficient',
          visibleIf: { key: 'noticeType', oneOf: ['cheque_dishonour'] },
        },
      ],
    },
    {
      id: 'facts',
      title: 'Facts & demand',
      fields: [
        {
          key: 'amount',
          label: 'Amount involved (₹)',
          type: 'amount',
          required: false,
          help: 'Leave blank if the notice is not for money.',
        },
        {
          key: 'facts',
          label: 'Facts of the matter',
          type: 'multiline',
          required: true,
          placeholder:
            'Describe the transaction, what was agreed, and what went wrong — in plain language, in order of dates.',
        },
        {
          key: 'relief',
          label: 'What does your client demand?',
          type: 'multiline',
          required: true,
          placeholder: 'e.g. Pay ₹4,50,000 with 18% interest from 1 March 2026',
        },
        {
          key: 'compliancePeriodDays',
          label: 'Days given to comply',
          type: 'number',
          required: true,
          defaultValue: '15',
        },
      ],
    },
  ],
};
