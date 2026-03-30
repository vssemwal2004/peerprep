// Project-level ESLint overrides to reduce noisy unused-var errors during development
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  rules: {
    // disable noisy rules for this workspace to focus on runtime errors during edits
    'no-unused-vars': 'off',
    'no-undef': 'off',
  },
  overrides: [
    {
      files: ['scripts/**', 'backend/**'],
      env: { node: true, browser: false },
    },
  ],
};
