require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const getLocalIP = require("./get-ip.cjs");
const chatbotService = require("./features/chatbot.service");
const aiService = require("./features/ai.service");

const Post = require("./models/Post");

const app = express();



/* -------- MIDDLEWARE -------- */

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// Disable caching for api/posts to ensure real-time cross-device sync
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});

/* -------- EMOTION FEATURE -------- */
const emotionRoutes = require('./features/emotion/emotion.routes');
app.use('/api/emotion', emotionRoutes);

/* -------- MONGODB CONNECTION -------- */

const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Fail early if database is unreachable
  socketTimeoutMS: 45000,         // Close sockets after 45 seconds of inactivity
};

mongoose.connect(process.env.MONGO_URI, mongooseOptions)
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => {
  console.error("❌ MongoDB Connection Fatal Error!");
  console.error("   ➡️  If this happens on Render, ensure your MongoDB Atlas 'Network Access' allows connections from anywhere (0.0.0.0/0).");
  console.error("   ➡️  Error details:", err.message);
});

/* -------- HAVERSINE DISTANCE (meters) -------- */

function haversineDistance(lat1, lon1, lat2, lon2) {
 const R = 6371000; // Earth radius in meters
 const toRad = (deg) => (deg * Math.PI) / 180;

 const dLat = toRad(lat2 - lat1);
 const dLon = toRad(lon2 - lon1);

 const a =
  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
  Math.sin(dLon / 2) * Math.sin(dLon / 2);

 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

 return R * c;
}

/* -------- CONTENT FILTER -------- */

const Filter = require('bad-words');
const contentFilter = new Filter();

// Add our custom words to ensure maximum safety (in addition to the 400+ default words)
contentFilter.addWords(
 // Threats & violence
 "kill", "murder", "rape", "terrorist", "bomb",
 "shoot", "stab", "suicide", "die", "hang", "cut",
 // Sexual content
 "porn", "sex", "nude", "naked", "boobs", "penis", "vagina",
 "orgasm", "masturbate", "blowjob", "handjob",
 // Harassment
 "ugly", "fat", "loser", "idiot", "stupid", "dumb", "moron",
 "worthless", "useless", "pathetic", "disgusting",
 // Drug-related
 "cocaine", "heroin", "meth", "weed", "marijuana", "drugs", "faggot", "dyke"
);

/* -------- ROOT ROUTE -------- */

app.get("/", (req, res) => {
 res.sendFile(__dirname + "/public/echozone.html");
});

/* -------- CREATE POST -------- */

app.post("/posts", async (req, res) => {

 try {

  // Check for inappropriate content using bad-words
  if (req.body.text && contentFilter.isProfane(req.body.text)) {
   return res.status(400).json({
    error: "Your post contains inappropriate language and cannot be published. Please keep Echozone respectful. 🚫"
   });
  }

  const post = new Post({
   text: req.body.text,
   location: req.body.location,
   type: req.body.type || "normal",
   user: req.body.user,
   recipient: req.body.recipient, // FIX: Inclusion of recipient field for privacy
   isPrivate: req.body.isPrivate || false, // FIX: Inclusion of isPrivate flag for privacy
   lat: req.body.lat,
   lng: req.body.lng
  });

  await post.save();

  res.status(201).json({
   message: "Post saved successfully"
  });

 } catch (err) {

  console.error("Database POST Error:", err.message);

  res.status(500).json({
   error: "Database error: " + err.message
  });

 }

});

/* -------- GET ALL POSTS (normal only) -------- */

app.get("/posts", async (req, res) => {

 try {

  const range = req.query.range || "local";
  const userLat = parseFloat(req.query.lat);
  const userLng = parseFloat(req.query.lng);
  const requesterId = req.query.user; // Get the ID of the user requesting the feed

  // Query filter logic for privacy
  const queryFilter = {
    type: { $ne: "emergency" },
    $or: [
      { isPrivate: { $ne: true } }, // Show public posts
      { user: requesterId },         // Show private posts I sent
      { recipient: requesterId }     // Show private posts sent to me
    ]
  };

  const posts = await Post
   .find(queryFilter)
   .sort({ createdAt: -1 });

  // If range is global, return all posts regardless of distance
  if (range === "global") {
    return res.json(posts);
  }

  // If no coords provided, fallback to default latest sorting (e.g. for initial load without location)
  if (isNaN(userLat) || isNaN(userLng)) {
   return res.json(posts);
  }

  // Local filtering logic: Map and calculate distance
  const postsWithDistance = posts.map(post => {
   const postObj = post.toObject();
   if (postObj.lat && postObj.lng) {
    postObj.distance = haversineDistance(userLat, userLng, postObj.lat, postObj.lng);
   } else {
    postObj.distance = Infinity;
   }
   return postObj;
  })
  .filter(post => post.distance <= 10000 || post.distance === Infinity) // Within 10km (increased from 5km) OR location unknown
  .sort((a, b) => a.distance - b.distance); // Nearest first

  res.json(postsWithDistance);

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Error fetching posts"
  });

 }

});

/* -------- GET POSTS FOR SPECIFIC ROOM (Fast Sync) -------- */
app.get("/posts/room/:recipient", async (req, res) => {
  try {
    const { recipient } = req.params;
    const posts = await Post.find({ recipient })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

/* -------- GET NEARBY EMERGENCY POSTS -------- */

app.get("/posts/nearby", async (req, res) => {

 try {

  const userLat = parseFloat(req.query.lat);
  const userLng = parseFloat(req.query.lng);

  if (isNaN(userLat) || isNaN(userLng)) {
   return res.status(400).json({
    error: "lat and lng query parameters are required"
   });
  }

  const emergencyPosts = await Post
   .find({ type: "emergency" })
   .sort({ createdAt: -1 });

  // Filter posts strictly within 500m to 1km range
  const nearbyPosts = emergencyPosts
   .map(post => {
    const postObj = post.toObject();
    if (postObj.lat && postObj.lng) {
     postObj.distance = haversineDistance(
      userLat, userLng, postObj.lat, postObj.lng
     );
    } else {
     postObj.distance = Infinity;
    }
    return postObj;
   })
   .filter(post => post.distance <= 1000); // 0m to 1km

  res.json(nearbyPosts);

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Error fetching nearby posts"
  });

 }

});

/* -------- DELETE POST -------- */

app.delete("/posts/:id", async (req, res) => {
 try {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ message: "Post deleted" });
 } catch (err) {
  console.log(err);
  res.status(500).json({ error: "Delete failed" });
 }
});

/* -------- AI EMERGENCY CHATBOT -------- */

app.post("/api/chatbot", async (req, res) => {
 try {
  const { message, lat, lng } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  // Use the service to identify intent (has built-in keyword fallback)
  const intentResult = await chatbotService.identifyIntent(message);
  
  const locationIntents = ["police", "hospital", "cafe", "restaurant", "fuel", "pharmacy"];
  
  if (locationIntents.includes(intentResult.intent)) {
   const locations = await chatbotService.findNearby(lat, lng, intentResult.intent);
   return res.json({
    intent: intentResult.intent,
    message: `I've found ${locations.length} nearby ${intentResult.intent} locations for you.`,
    locations: locations
   });
  }

  // Default response (Chatting) - NOW AUTO-POSTS TO FEED
  try {
   const apiKey = process.env.GEMINI_API_KEY;

   // Auto-publish non-location thoughts to Echozone Feed
   const autoPost = new Post({
    text: message,
    user: req.body.user || "Anonymous",
    lat: lat,
    lng: lng,
    location: "Shared via AI",
    type: "normal"
   });
   await autoPost.save();

   if (!process.env.GEMINI_API_KEY) throw new Error("Missing API Key");

   const result = await aiService.safeGenerateContent(`You are an emergency AI assistant named EchoBot. The user just shared this thought to the community feed: "${message}". Give a very brief, supportive 1-sentence response acknowledging their share.`);
   
   return res.json({
    intent: "other",
    message: result.response.text(),
    locations: [],
    autoPosted: true
   });
  } catch (aiErr) {
   // Fallback if AI fails, but post is already saved!
   return res.json({
    intent: "other",
    message: "I've shared your thought to the Echozone feed! 🚀 Keep being awesome.",
    locations: [],
    autoPosted: true
   });
  }

 } catch (err) {
  console.error("Critical Chatbot Error:", err);
  res.status(500).json({ error: "Assistant is currently resting. Please try again soon." });
 }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
 const localIP = getLocalIP();
 console.log(`🚀 Echozone server running on:`);
 console.log(`   - Local:            http://localhost:${PORT}`);
 console.log(`   - Network (Wi-Fi):  http://${localIP}:${PORT}`);

 // CHECK FOR GEMINI API KEY
 if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "") {
  console.log(`\n⚠️  WARNING: GEMINI_API_KEY is missing!`);
  console.log(`   Emotional AI and Chatbot will use keyword-based fallbacks.`);
  console.log(`   To fix this, add GEMINI_API_KEY to your .env or Render Environment Variables.`);
 } else {
  console.log(`\n✅ GEMINI_API_KEY detected. AI features enabled.`);
 }
 console.log(`\nTo test on other devices, make sure they are on the same Wi-Fi!`);
});