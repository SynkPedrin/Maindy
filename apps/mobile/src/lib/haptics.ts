import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

type Kind = 'press' | 'start' | 'commit' | 'cancel' | 'success' | 'error' | 'select';

export function haptic(kind: Kind): void {
  if (Platform.OS === 'web') return;
  switch (kind) {
    case 'press':
    case 'select':
      void Haptics.selectionAsync();
      break;
    case 'start':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'commit':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'cancel':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      break;
    case 'success':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'error':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
  }
}
