import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert that works on both web and native.
 * On web, Alert.alert is silent - we use window.confirm/window.alert instead.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Cross-platform confirm dialog.
 * Returns true if confirmed, false if cancelled.
 * On native, use callbacks (onConfirm/onCancel) since Alert is async.
 */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText = 'OK',
  destructive = false
) {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      onConfirm();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Annuleren', style: 'cancel', onPress: onCancel },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}
