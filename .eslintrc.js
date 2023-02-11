module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  overrides: [],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint"],
  rules: {
    "linebreak-style": ["error", "unix"],
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "react-hooks/exhaustive-deps": [0],
    "@typescript-eslint/no-explicit-any": [0],
    // eslint-disable-next-line
    "react/no-unescaped-entities": ["error", { forbid: [">", '"', "}"] }],
    "react/react-in-jsx-scope": "off",
  },
  ignorePatterns: ["tailwind.config.js", "config-overrides.js", ".eslintrc.js"],
  settings: {
    react: {
      version: "detect",
    },
  },
};
