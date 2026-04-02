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
 * Wraps content generation with a fallback to gemini-pro if the first choice fails.
 */
async function safeGenerateContent(prompt, expectJson = false) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    const config = expectJson ? { responseMimeType: "application/json" } : {};
    
    // Try primary
    try {
        const model = genAI.getGenerativeModel({ model: workingModel, generationConfig: config });
        const result = await model.generateContent(prompt);
        return result;
    } catch (err) {
        console.warn(`[AI Service] Primary model (${workingModel}) failed:`, err.message);
        
        // If we were using flash, try pro as a fallback strategy
        if (workingModel === "gemini-1.5-flash") {
            console.warn("Falling back to Gemini 1.5 Pro for this request.");
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", generationConfig: config });
            return await model.generateContent(prompt);
        }
        throw err; // Re-throw if already checked or failed on fallback
    }
}

module.exports = {
    getAIModel,
    safeGenerateContent
};
