/** Tests unitaires et d'intégration (base PostgreSQL dédiée « <base>_test », jamais la base de développement). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  maxWorkers: 1,
  testTimeout: 120000,
  collectCoverageFrom: ['src/modules/**/*.ts', 'src/shared/**/*.ts', '!src/**/*.d.ts']
};
