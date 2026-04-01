const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Predefined emotion categories
const emotions = {
  CRITICAL: 'critical',
  HAPPY: 'happy',
  SAD: 'sad',
  ANGRY: 'angry',
  STRESS: 'stress',
  NEUTRAL: 'neutral'
};

// Keyword fallback logic (from previous version)
const keywords = {
  [emotions.CRITICAL]: [/suicide/i, /kill myself/i, /die/i, /end it all/i, /end my life/i],
  [emotions.HAPPY]: [/joy/i, /great/i, /awesome/i, /happy/i, /excited/i, /glad/i, /wonderful/i, /amazing/i, /fantastic/i, /smile/i, /laughing/i, /cheerful/i],
  [emotions.SAD]: [/sad/i, /cry/i, /unhappy/i, /miserable/i, /down/i, /lonely/i, /heart/i, /blue/i, /sorry/i, /gloom/i, /depressed/i],
  [emotions.ANGRY]: [/angry/i, /mad/i, /hate/i, /furious/i, /annoy/i, /pissed/i, /rage/i, /frustrated/i, /irritat/i, /venting/i],
  [emotions.STRESS]: [/stress/i, /worried/i, /anxious/i, /pressure/i, /panic/i, /nervous/i, /overwhelmed/i, /tense/i, /burnt out/i, /struggling/i]
};

/**
 * Fallback keyword detection logic.
 */
function detectEmotionKeywords(text) {
  const message = text.toLowerCase();
  if (keywords[emotions.CRITICAL].some(regex => regex.test(message))) return emotions.CRITICAL;
  for (const emotion of [emotions.STRESS, emotions.ANGRY, emotions.SAD, emotions.HAPPY]) {
    if (keywords[emotion].some(regex => regex.test(message))) return emotion;
  }
  return emotions.NEUTRAL;
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Detects the emotion from a given text message using AI (Gemini).
 * Falls back to keywords if AI fails.
 * @param {string} text - The user message.
 * @returns {Promise<string>} - The detected emotion name.
 */
async function detectEmotion(text) {
  if (!text || typeof text !== 'string') return emotions.NEUTRAL;

  // If no API key is provided, use fallback immediately
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY missing, using keyword fallback.");
    return detectEmotionKeywords(text);
  }

  try {
    const prompt = `Analyze the following user message and classify the user's emotional condition into exactly one of these categories: happy, sad, angry, stress, neutral, or critical.
    
Rules:
- 'critical' is for messages indicating self-harm, suicide, or severe danger.
- 'stress' is for anxiety, overwhelm, or high pressure.
- 'angry' is for frustration, rage, or annoyance.
- 'sad' is for grief, loneliness, or depression.
- 'happy' is for joy, excitement, or positive news.
- 'neutral' is for general statements or lack of strong emotion.

Message: "${text}"

Respond with ONLY a JSON object like this: {"emotion": "category_name"}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse the JSON response
    try {
      const cleanedResponse = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanedResponse);
      const detected = (parsed.emotion || emotions.NEUTRAL).toLowerCase();
      
      // Validate that the AI returned a valid emotion
      if (Object.values(emotions).includes(detected)) {
        return detected;
      }
    } catch (parseError) {
      console.error("AI response parsing error:", responseText);
    }
  } catch (error) {
    console.error("Gemini AI Error:", error.message);
  }

  // Fallback to keywords if anything goes wrong
  console.log("AI detection failed or returned invalid response, falling back to keywords.");
  return detectEmotionKeywords(text);
}

module.exports = {
  detectEmotion,
  emotions
};
