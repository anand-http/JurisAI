import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type MainTabParamList = {
  NewDraft: undefined;
  History: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  // Signed out
  Login: undefined;
  Otp: { email: string };
  // Signed in without a profile yet. Distinct from EditProfile so the
  // navigator can't keep this route when the signed-in stack mounts.
  Onboarding: undefined;
  EditProfile: undefined;
  // Signed in
  Main: NavigatorScreenParams<MainTabParamList>;
  DraftIntake: { docTypeId: string };
  Generating: undefined;
  DraftReview: { draftId: string };
  CitationSource: {
    draftId: string;
    /** Index into draft.citations, or… */
    citationIndex?: number;
    /** …a reference the backend returned no citation for. */
    unlinkedText?: string;
  };
  Export: { draftId: string };
  SetPassword: undefined;
  Paywall: { reason?: 'quota' } | undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
