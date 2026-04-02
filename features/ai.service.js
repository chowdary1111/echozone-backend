const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

let workingModel = "gemini-1.5-flash"; // Default

/**
 * Centrally manages the Generative AI model and provides fallbacks.
 */
async function getAIModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    
    try {
        // Try the cached working model first
        const model = genAI.getGenerativeModel({ model: workingModel });
        
        // Quick test to see if it's reachable (only if we haven't confirmed it yet)
        // Note: In a production app, you might want to cache this result for a few minutes
        return model;
    } catch (e) {
        console.error(`AI Model ${workingModel} failed initialization:`, e.message);
        
        if (workingModel === "gemini-1.5-flash") {
            console.log("Switching to fallback model: gemini-1.5-pro");
            workingModel = "gemini-1.5-pro";
            return genAI.getGenerativeModel({ model: workingModel });
        }
        return null;
    }
}

/**
 * Wraps content generation with a fallback to gemini-pro if the first choice fails with a 404.
 */
async function safeGenerateContent(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try primary
    try {
        const model = genAI.getGenerativeModel({ model: workingModel });
        const result = await model.generateContent(prompt);
        return result;
    } catch (err) {
        // If 404 and we were using flash, try pro
        if (err.message.includes("404") && workingModel === "gemini-1.5-flash") {
            console.warn("Gemini 1.5 Flash returned 404. Falling back to Gemini 1.5 Pro permanently for this session.");
            workingModel = "gemini-1.5-pro";
            const model = genAI.getGenerativeModel({ model: workingModel });
            return await model.generateContent(prompt);
        }
        throw err; // Re-throw other errors
    }
}

module.exports = {
    getAIModel,
    safeGenerateContent
};
