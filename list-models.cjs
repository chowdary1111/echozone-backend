// list-models.cjs - Debugging script
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // SDK doesn't have a direct listModels, but we can test access
        console.log("Checking gemini-1.5-flash access...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello?");
        console.log("✅ Access Successful:", result.response.text().substring(0, 50));
    } catch (e) {
        console.error("❌ Access Failed:", e.message);
        if (e.message.includes("404")) {
            console.log("Attempting fallback to 'gemini-pro'...");
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent("Hello?");
                console.log("✅ Fallback Successful: gemini-pro is available.");
            } catch (err) {
                console.error("❌ Fallback Failed:", err.message);
            }
        }
    }
}

listModels();
