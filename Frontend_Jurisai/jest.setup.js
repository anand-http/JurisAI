/* eslint-env jest */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest').default,
);

// In-memory keychain.
jest.mock('react-native-keychain', () => {
  const items = new Map();
  return {
    ACCESSIBLE: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY:
        'AccessibleAfterFirstUnlockThisDeviceOnly',
    },
    setGenericPassword: jest.fn(async (username, password, opts = {}) => {
      items.set(opts.service, { username, password, service: opts.service });
      return { service: opts.service, storage: 'mock' };
    }),
    getGenericPassword: jest.fn(
      async (opts = {}) => items.get(opts.service) ?? false,
    ),
    resetGenericPassword: jest.fn(async (opts = {}) =>
      items.delete(opts.service),
    ),
  };
});

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/docs', CacheDir: '/cache' },
    exists: jest.fn(async () => false),
    isDir: jest.fn(async () => false),
    mkdir: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    writeFile: jest.fn(async () => undefined),
  },
  config: jest.fn(() => ({ fetch: jest.fn() })),
  ios: { previewDocument: jest.fn() },
  android: { actionViewIntent: jest.fn() },
  MediaCollection: { copyToMediaStore: jest.fn() },
}));

jest.mock('react-native-share', () => ({ open: jest.fn() }));
jest.mock('react-native-razorpay', () => ({ open: jest.fn() }));
