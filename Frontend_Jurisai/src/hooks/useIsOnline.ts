import { useNetInfo } from '@react-native-community/netinfo';

/** Optimistic until NetInfo says otherwise (null means "unknown"). */
export function useIsOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}
