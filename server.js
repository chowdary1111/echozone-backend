require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const getLocalIP = require("./get-ip.cjs");
const chatbotService = require("./features/chatbot.service");
const aiService = require("./features/ai.service");

const Post = require("./models/Post");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const dbStatus = { 
  connected: false, 
  error: null, 
  startTime: new Date().toISOString(),
  lastAttempt: null
};

// Middleware to block DB routes if not connected
const dbCheck = (req, res, next) => {
  if (!dbStatus.connected) {
    return res.status(503).json({ 
      error: "Database is connecting... Please try again in a few seconds. ⏳",
      details: dbStatus.error
    });
  }
  next();
};



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
// DB connection logic has been moved to the startServer() function at the bottom of this file.

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

/* -------- DIAGNOSTICS -------- */

app.get("/api/diag", (req, res) => {
  const mongoUri = process.env.MONGO_URI || "MISSING";
  // Mask password for safety
  const maskedUri = mongoUri.replace(/:([^:@]{1,})@/, ":****@");
  
  res.json({
    status: dbStatus.connected ? "READY" : "CONNECTING",
    database: dbStatus.connected ? "CONNECTED" : "DISCONNECTED",
    error: dbStatus.error,
    startTime: dbStatus.startTime,
    lastAttempt: dbStatus.lastAttempt,
    env: {
      has_uri: mongoUri !== "MISSING",
      uri_preview: maskedUri.substring(0, 30) + "...",
      has_gemini: !!process.env.GEMINI_API_KEY,
      node_version: process.version,
      platform: process.platform
    }
  });
});

/* -------- CREATE POST -------- */

app.post("/posts", dbCheck, async (req, res) => {

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
   recipient: req.body.recipient,
   isPrivate: req.body.isPrivate || false,
   lat: req.body.lat,
   lng: req.body.lng
  });

  await post.save();

  // ✅ Broadcast new post to all connected Socket.IO clients
  io.emit("new_post", post.toObject());

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

app.get("/posts", dbCheck, async (req, res) => {

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
  .filter(post => post.distance <= 10000 || post.distance === Infinity) // Within 10km OR location unknown
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

app.delete("/posts/:id", dbCheck, async (req, res) => {
 try {
  await Post.findByIdAndDelete(req.params.id);
  // Notify clients of deletion
  io.emit("delete_post", { id: req.params.id });
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

  // Default response (Chatting) - AUTO-POSTS TO FEED
  try {
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

   // Broadcast new auto post
   io.emit("new_post", autoPost.toObject());

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

/* -------- SOCKET.IO CONNECTION -------- */

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

/* -------- SERVER STARTUP & DATABASE CONNECTION -------- */

const PORT = process.env.PORT || 3000;
const MAX_RETRIES = 5; // Increased retries for background connection

async function connectToDB(retryCount = 0) {
  const mongoUri = process.env.MONGO_URI;
  dbStatus.lastAttempt = new Date().toISOString();

  if (!mongoUri) {
    dbStatus.error = "MONGO_URI is missing from environment variables!";
    console.error("❌ " + dbStatus.error);
    return;
  }

  try {
    console.log(`📡 Connecting to MongoDB... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
    
    // Set options
    mongoose.set('bufferCommands', false);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000
    });

    dbStatus.connected = true;
    dbStatus.error = null;
    console.log("✅ MongoDB Connected Successfully");

  } catch (error) {
    dbStatus.connected = false;
    dbStatus.error = error.message;
    console.error("❌ MongoDB Connection Failed:", error.message);

    if (retryCount < MAX_RETRIES - 1) {
      const wait = 5000;
      console.log(`🔄 Retrying connection in ${wait/1000} seconds...`);
      setTimeout(() => connectToDB(retryCount + 1), wait);
    } else {
      console.error("🚨 Max DB retries reached. Server will remain UP, but DB features will stay disabled.");
    }
  }
}

// Handle connection events
mongoose.connection.on('disconnected', () => {
  dbStatus.connected = false;
  console.error('❌ MongoDB Disconnected!');
});
mongoose.connection.on('reconnected', () => {
  dbStatus.connected = true;
  console.log('✅ MongoDB Reconnected!');
});

// START THE SERVER (using http server to support Socket.IO)
server.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  console.log(`\n🚀 Echozone server is LIVE on port ${PORT}`);
  console.log(`   - Local:            http://localhost:${PORT}`);
  console.log(`   - Network (Wi-Fi):  http://${localIP}:${PORT}`);
  console.log(`   - Diagnostics:      http://localhost:${PORT}/api/diag`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.log(`⚠️  GEMINI_API_KEY missing - AI fallbacks enabled.`);
  }

  // Connect to DB in background
  connectToDB();
});

// Global Exception Handlers for graceful failure
process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception thrown:", error);
  // Do not exit on production to keep app alive
});