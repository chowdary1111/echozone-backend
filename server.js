require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Post = require("./models/Post");

const app = express();



/* -------- MIDDLEWARE -------- */

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

/* -------- MONGODB CONNECTION -------- */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

/* -------- ROOT ROUTE -------- */

app.get("/", (req, res) => {
 res.sendFile(__dirname + "/public/echozone.html");
});

/* -------- CREATE POST -------- */

app.post("/posts", async (req, res) => {

 try {

  const post = new Post({
   text: req.body.text,
   location: req.body.location,
   type: req.body.type,
   user: req.body.user
  });

  await post.save();

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

/* -------- GET ALL POSTS -------- */

app.get("/posts", async (req, res) => {

 try {

  const posts = await Post
   .find()
   .sort({ createdAt: -1 });

  res.json(posts);

 } catch (err) {

  console.log(err);

  res.status(500).json({
   error: "Error fetching posts"
  });

 }

});

/* -------- DELETE POST -------- */

app.delete("/posts/:id", async (req, res) => {

 try {

  await Post.findByIdAndDelete(req.params.id);

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

app.listen(PORT, () => {
 console.log("Echozone server running on port " + PORT);
});