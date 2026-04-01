import { Platform } from 'react-native';

export const getApiUrl = (): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    return `${window.location.protocol}//${window.location.host}`;
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || 'https://web-test-ts.up.railway.app';
};
