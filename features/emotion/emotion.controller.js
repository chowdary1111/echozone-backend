const { detectEmotion, emotions } = require('./emotion.service');
const { setUserEmotion } = require('./emotion.store');
const { findMatch } = require('./match.service');

/**
 * Controller for analyzing text messages and matching users.
 */
const analyzeEmotion = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }

    // 1. Detect emotion from text (AI detection is now asynchronous)
    const emotion = await detectEmotion(message);

    // 2. Temporarily store the detected emotion for the user
    setUserEmotion(userId, emotion);

    // 3. Find a potential match (if not critical)
    let matchUserId = null;
    if (emotion !== emotions.CRITICAL) {
      matchUserId = findMatch(userId, emotion);
    }

    // 4. Return the result
    // Per requirements: Return { "emotion": "detected_emotion" }
    // I also include the potential matchedUserId since we are doing matching logic here.
    res.status(200).json({
      emotion,
      matchUserId: matchUserId || null
    });

  } catch (error) {
    console.error("Error analyzing emotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  analyzeEmotion
};
