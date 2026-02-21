import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  // Keep lint focused on source files.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
