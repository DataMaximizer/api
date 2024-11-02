module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{js,ts}']
};
