/**
 * Native integrations (modules/maindy-native). In Expo Go and on the web the native module is not
 * linked; every call then reports `{ supported: false }` instead of failing.
 */
export { AppIntents, FloatingAgent, LiveActivity, Notifications as NativeNotifications, Widgets } from '../../modules/maindy-native';
export type { FocusMode as NativeFocusMode } from '../../modules/maindy-native';
