import { Alert, Platform } from 'react-native';
import RazorpayCheckout, { type RazorpayFailure } from 'react-native-razorpay';

import { billingApi } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { mockActivateSubscription } from '../api/mock/mockAdapter';
import type { Subscription, User } from '../api/types';
import { env } from '../config/env';
import { colors } from '../theme';

export type PurchaseResult =
  | { status: 'active'; subscription: Subscription }
  /** Paid, but the webhook has not activated the plan yet. */
  | { status: 'pending' }
  | { status: 'cancelled' };

/**
 * Razorpay reports a user-dismissed checkout as PAYMENT_CANCELED: code 0 on
 * Android, 2 on iOS. Check against the SDK docs when upgrading the SDK.
 */
function isUserCancel(error: RazorpayFailure): boolean {
  const cancelCode = Platform.OS === 'android' ? 0 : 2;
  return error.code === cancelCode || /cancel/i.test(error.description ?? '');
}

/**
 * 1. Backend creates (or resumes) a Razorpay subscription for Pro.
 * 2. Razorpay Checkout collects the mandate/payment (UPI, card, netbanking).
 * 3. Razorpay's webhook tells the backend, which is the only thing that
 *    upgrades the plan. The app polls /subscriptions/me until it sees it.
 */
export async function purchasePro(user: User | null): Promise<PurchaseResult> {
  let session;
  try {
    session = await billingApi.startCheckout();
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CONFLICT') {
      // Already subscribed — just refresh.
      return pollUntilActive();
    }
    throw error;
  }

  const paid = env.useMockApi
    ? await simulateCheckout(session.subscriptionId)
    : await RazorpayCheckout.open({
        key: session.keyId,
        subscription_id: session.subscriptionId,
        amount: 0, // taken from the Razorpay plan for subscriptions
        name: env.appName,
        description: env.proPlan.name,
        prefill: {
          name: user?.profile?.fullName,
          email: user?.email ?? undefined,
        },
        theme: { color: colors.primary },
      })
        .then(() => true)
        .catch((error: RazorpayFailure) => {
          if (isUserCancel(error)) {
            return false;
          }
          throw new Error(
            error.description || 'Payment failed. You have not been charged.',
          );
        });

  if (!paid) {
    return { status: 'cancelled' };
  }
  return pollUntilActive();
}

async function pollUntilActive(
  attempts = 10,
  intervalMs = 2000,
): Promise<PurchaseResult> {
  for (let i = 0; i < attempts; i++) {
    const subscription = await billingApi.subscription().catch(() => null);
    if (subscription?.tier === 'pro') {
      return { status: 'active', subscription };
    }
    await new Promise<void>(resolve => setTimeout(() => resolve(), intervalMs));
  }
  return { status: 'pending' };
}

/** Mock mode has no real Razorpay subscription; let the developer pick an outcome. */
function simulateCheckout(subscriptionId: string) {
  return new Promise<boolean>(resolve => {
    Alert.alert(
      'Mock payment',
      `Simulate Razorpay checkout for ${env.proPlan.name}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Pay',
          onPress: () => {
            mockActivateSubscription(subscriptionId).then(() => resolve(true));
          },
        },
      ],
    );
  });
}
