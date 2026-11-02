import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'backend/**',
      'artifacts/**',
      // Static showcase site: its own package and checks (website/README.md).
      'website/**',
      // Presentation video sources (own tooling, see video-brag/SETUP.md).
      'video-brag/**',
      // V6.1 throwaway spike extension (plain browser JS, never shipped).
      'docs/v6.1/spike/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
);
