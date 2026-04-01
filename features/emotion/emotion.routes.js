const express = require('express');
const router = express.Router();
const { analyzeEmotion } = require('./emotion.controller');

/**
 * Endpoint for analyzing user emotions and finding matched users.
 * POST /api/emotion/analyze
 */
router.post('/analyze', (req, res, next) => {
  analyzeEmotion(req, res).catch(next);
});

module.exports = router;
