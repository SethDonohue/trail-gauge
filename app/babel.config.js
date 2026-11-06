module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo adds the Reanimated / worklets plugin automatically.
  return { presets: ['babel-preset-expo'] };
};
