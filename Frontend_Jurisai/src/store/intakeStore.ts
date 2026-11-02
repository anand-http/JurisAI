import { create } from 'zustand';

import type { Answers } from '../documents/types';

/**
 * Wizard answers for the draft being prepared. Held in memory only — case
 * facts are never written to disk unencrypted — and cleared once the draft
 * is generated.
 */
interface IntakeState {
  docTypeId: string | null;
  answers: Answers;
  start: (docTypeId: string, initial: Answers) => void;
  setAnswer: (key: string, value: string) => void;
  reset: () => void;
}

export const useIntakeStore = create<IntakeState>(set => ({
  docTypeId: null,
  answers: {},
  start: (docTypeId, initial) => set({ docTypeId, answers: initial }),
  setAnswer: (key, value) =>
    set(state => ({ answers: { ...state.answers, [key]: value } })),
  reset: () => set({ docTypeId: null, answers: {} }),
}));
