/**
 * Extends app.json so the Firebase config file never has to live in the repo.
 *
 * On EAS, GOOGLE_SERVICES_JSON is a file-type secret and this resolves to the
 * path EAS wrote it to. Locally it falls back to ./google-services.json, which
 * is gitignored — download it from the Firebase console if you need it:
 *   Firebase → Project settings → Your apps → Android → google-services.json
 *
 * newArchEnabled is false in app.json on purpose: @livekit/react-native and
 * @livekit/react-native-webrtc ship no codegenConfig, i.e. they are still
 * Paper-only native modules. Under Fabric their RTCView goes through the
 * interop layer and crashes the call screen. Re-enable only once LiveKit
 * declares New Architecture support.
 *
 * Create/replace the EAS secret with:
 *   eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
 *     --type file --value ./google-services.json --force
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
