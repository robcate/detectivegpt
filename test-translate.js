// test-translate.js
require("dotenv").config(); // Loads .env (ensure GOOGLE_APPLICATION_CREDENTIALS is set there)
const { v2: Translate } = require("@google-cloud/translate");

// Create a new translator client.
// The library will automatically pick up GOOGLE_APPLICATION_CREDENTIALS from the environment.
const translator = new Translate.Translate();

/**
 * Helper to translate a given text into a target language.
 */
async function translateText(text, targetLang) {
  const [translation] = await translator.translate(text, targetLang);
  console.log(`"${text}" → (${targetLang}): ${translation}`);
}

/**
 * Main test function
 */
async function main() {
  try {
    console.log("Running translation tests...\n");

    await translateText("Hello world", "es");  // English → Spanish
    await translateText("Hello world", "fr");  // English → French
    await translateText("Hello world", "de");  // English → German

    console.log("\nTranslation tests completed.");
  } catch (error) {
    console.error("❌ Error in translation test:", error);
  }
}

// Invoke main
main();
