import reactNativeA11y from "eslint-plugin-react-native-a11y";
import baseConfig from "./base.mjs";

/** @type {import("eslint").Linter.Config[]} */

const config = [
  ...baseConfig,

  {
    plugins: {
      "react-native-a11y": reactNativeA11y,
    },

    rules: {
      ...reactNativeA11y.configs.all.rules,

      // React Native specific overrides
      "no-console": process.env.NODE_ENV === "production" ? "error" : "warn",
    },
  },
];

export default config;
