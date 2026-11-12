import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      // Maintained in the Aurora development checkout.
      "projects/aurora/**",
      "projects/workout-tracker/app/media/**",
      // Maintained in the Travian development checkout; its scripts share globals across files.
      "projects/travian-extensions/**",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["eslint.config.js", "**/*.config.{js,mjs}", "projects/workout-tracker/tests/**"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["projects/workout-tracker/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["projects/workout-tracker/app/sw.js"],
    languageOptions: { sourceType: "script", globals: globals.serviceworker },
  },
  {
    files: ["projects/pc-remote/web/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  prettier,
];
