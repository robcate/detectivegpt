// test-languages.js
import { translateText } from "./app/utils/translate.js"; // Adjust path as needed

async function testMultipleLanguages() {
  try {
    const original = "Hello, how are you today?";
    console.log("Original =>", original);

    // Spanish
    const spanish = await translateText(original, "es");
    console.log("Spanish =>", spanish);

    // French
    const french = await translateText(original, "fr");
    console.log("French =>", french);

    // German
    const german = await translateText(original, "de");
    console.log("German =>", german);

  } catch (err) {
    console.error("❌ Error translating:", err);
  }
}

testMultipleLanguages();
