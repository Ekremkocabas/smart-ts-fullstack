module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Enable reanimated plugin for react-native-reanimated
      'react-native-reanimated/plugin',
    ],
  };
};
