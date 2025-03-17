module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        // Ensure it targets your current Node version for testing
        targets: { node: "current" },
      },
    ],
    // Transpile JSX
    "@babel/preset-react",
    // Transpile TypeScript
    "@babel/preset-typescript",
  ],
};