/**
 * Route shim. The implementation lives in src/screens so Metro's platform
 * resolution can swap in the web stub — expo-router's require.context loads
 * every file under app/ on every platform, so a native-only module cannot sit
 * here directly.
 */
export { default } from '../../src/screens/CallScreen';
