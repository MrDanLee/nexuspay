// End-to-end tests run against a running full stack (docker compose).
// They are gated behind RUN_E2E=1 inside the specs, so this config is safe to
// invoke at any time (it simply skips when the flag is unset).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  roots: ['<rootDir>/tests/e2e'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 60000,
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.e2e.json' }],
  },
};
