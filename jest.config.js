// jest.config.js
module.exports = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "babel-jest"
  },
  moduleNameMapper: {
    "\\.(css|less|scss)$": "identity-obj-proxy"
  },
  setupFiles: ["<rootDir>/jest.setup.ts"],
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  transformIgnorePatterns: [
    // If you’re mocking react-markdown, you can keep or remove this
    "node_modules/(?!(@?micromark|react-markdown|remark-.*|rehype-.*|unified|unist-util-.*|mdast-util-.*|hast-util-.*|devlop|character-entities|property-information|space-separated-tokens)/)"
  ]
};
