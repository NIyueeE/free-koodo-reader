module.exports = {
  extends: "react-app",
  rules: {
    "no-unused-expressions": "off",
    "@typescript-eslint/ban-types": "off",
  },
  ignorePatterns: [
    "src/assets/lib/**",
    "src/utils/plugins/main/**",
    "src/utils/storage/webdavCloud.js",
    "build/**",
    "dist/**",
    "android/**",
    "node_modules/**",
  ],
};
