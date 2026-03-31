require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const Post = require("./models/Post");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Broadcast changes
io.on("connection", (socket) => {
  console.log("A user connected via WebSocket");
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});



/* -------- MIDDLEWARE -------- */

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

/* -------- MONGODB CONNECTION -------- */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

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
   lat: req.body.lat,
   lng: req.body.lng
  });

  await post.save();

  io.emit("postsUpdated");

  res.status(201).json({
   message: "Post saved successfully"
  });

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Error saving post"
  });

 }

});

/* -------- GET ALL POSTS (normal only) -------- */

app.get("/posts", async (req, res) => {

 try {

  const userLat = parseFloat(req.query.lat);
  const userLng = parseFloat(req.query.lng);

  // If no coords provided, fallback to default latest sorting (e.g. for initial load without location)
  if (isNaN(userLat) || isNaN(userLng)) {
   const posts = await Post
    .find({ type: { $ne: "emergency" } })
    .sort({ createdAt: -1 });
   
   return res.json(posts);
  }

  const posts = await Post
   .find({ type: { $ne: "emergency" } })
   .sort({ createdAt: -1 });

  // Map and calculate distance
  const postsWithDistance = posts.map(post => {
   const postObj = post.toObject();
   if (postObj.lat && postObj.lng) {
    postObj.distance = haversineDistance(userLat, userLng, postObj.lat, postObj.lng);
   } else {
    postObj.distance = Infinity;
   }
   return postObj;
  })
  .filter(post => post.distance <= 5000 || post.distance === Infinity) // Within 5km (0m to 5000m) OR location unknown
  .sort((a, b) => a.distance - b.distance); // Nearest first

  res.json(postsWithDistance);

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Error fetching posts"
  });

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

  io.emit("postsUpdated");

  res.json({
   message: "Post deleted"
  });

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Delete failed"
  });

 }

});

/* -------- SERVER START -------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
 console.log("Echozone server running on port " + PORT + " with WebSockets");
});