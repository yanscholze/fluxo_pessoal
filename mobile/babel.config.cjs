/**
 * `babel-preset-expo` transpila TypeScript, JSX e as extensões do Hermes.
 *
 * Existe explicitamente (e não por padrão implícito) porque o bundle inclui
 * arquivos de fora da pasta do aplicativo — ver `metro.config.cjs`.
 */

module.exports = function babel(api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
