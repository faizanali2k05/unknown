/**
 * Extends app.json so the Firebase config file never has to live in the repo.
 *
 * On EAS, GOOGLE_SERVICES_JSON is a file-type secret and this resolves to the
 * path EAS wrote it to. Locally it falls back to ./google-services.json, which
 * is gitignored — download it from the Firebase console if you need it:
 *   Firebase → Project settings → Your apps → Android → google-services.json
 *
 * newArchEnabled must stay true: react-native-worklets fails the Gradle build
 * outright without it ("Worklets require new architecture to be enabled") and
 * Reanimated 4 is New-Architecture-only. LiveKit is still a Paper module, so
 * its RTCView runs through Fabric's interop layer — that is fine, but it means
 * the call screen has to be tested on a device after any LiveKit upgrade.
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
