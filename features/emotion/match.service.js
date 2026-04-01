const { getStore } = require('./emotion.store');
const { emotions } = require('./emotion.service');

/**
 * Matching logic for users based on their emotional state.
 * @param {string} userId - The user looking for a match.
 * @param {string} detectedEmotion - The current emotion of the user.
 * @returns {string|null} - The matched userId or null.
 */
function findMatch(userId, detectedEmotion) {
  const store = getStore();
  const allUserIds = Object.keys(store).filter(uid => uid !== userId);

  // Critical users are NOT allowed to match
  if (detectedEmotion === emotions.CRITICAL) {
    return null;
  }

  // Define target emotions for matching
  let targetEmotions = [];

  switch (detectedEmotion) {
    case emotions.SAD:
      targetEmotions = [emotions.HAPPY];
      break;
    case emotions.ANGRY:
      targetEmotions = [emotions.NEUTRAL];
      break;
    default:
      // happy, stress, neutral can match with anyone available (non-critical)
      targetEmotions = [emotions.HAPPY, emotions.SAD, emotions.ANGRY, emotions.STRESS, emotions.NEUTRAL];
      break;
  }

  // Filter available users by target emotions and exclude "critical" ones
  const potentialMatches = allUserIds.filter(uid => {
    const userState = store[uid];
    return targetEmotions.includes(userState.emotion) && userState.emotion !== emotions.CRITICAL;
  });

  if (potentialMatches.length === 0) {
    // If specific target not found and original user was sad/angry, fallback to any (except critical)
    if (detectedEmotion === emotions.SAD || detectedEmotion === emotions.ANGRY) {
       const fallbackMatches = allUserIds.filter(uid => store[uid].emotion !== emotions.CRITICAL);
       if (fallbackMatches.length > 0) {
         return fallbackMatches[Math.floor(Math.random() * fallbackMatches.length)];
       }
    }
    return null;
  }

  // Randomly select from potential matches
  const randomIndex = Math.floor(Math.random() * potentialMatches.length);
  return potentialMatches[randomIndex];
}

module.exports = {
  findMatch
};
