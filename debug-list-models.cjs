// debug-list-models.cjs - Direct REST call to Gemini API to list models
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing in .env!");
        return;
    }
    console.log("🔍 Fetching available models for your API key...");
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
            console.error("❌ API Error:", data.error.message);
            if (data.error.status === "INVALID_ARGUMENT") {
                console.log("💡 Tip: Check if your API key is correct and for the Generative Language API.");
            }
        } else if (data.models) {
            console.log("✅ Models found:");
            data.models.forEach(m => {
                console.log(`   - ${m.name} (${m.displayName})`);
            });
            console.log("\n💡 Look for 'models/gemini-1.5-flash' or 'models/gemini-pro' in this list.");
        } else {
            console.log("❓ No models returned for this key.");
        }
    } catch (e) {
        console.error("❌ Fetch failed:", e.message);
    }
}

listModels();
