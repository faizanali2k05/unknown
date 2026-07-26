module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated's plugin must stay last — react-native-worklets/plugin is the
    // Reanimated 4 entry point.
    plugins: ['react-native-worklets/plugin'],
  };
};
