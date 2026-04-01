/**
 * In-memory storage for user emotions.
 * format: { userId: { emotion: string, updatedAt: timestamp } }
 */
const emotionStore = {};

module.exports = {
  getStore: () => emotionStore,
  setUserEmotion: (userId, emotion) => {
    emotionStore[userId] = {
      emotion,
      updatedAt: Date.now()
    };
  },
  getUserEmotion: (userId) => emotionStore[userId],
  getAllEmotions: () => emotionStore
};
