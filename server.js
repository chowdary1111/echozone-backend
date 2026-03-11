const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Post = require("./models/post");
const app = express(); 

// Middleware to parse JSON
app.use(express.json()); 
app.use(cors());

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/ECHOZONE")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

app.get("/", (req, res) => {
    res.send("ECHOZONE server is running");
});

// --- POINT 1: UPDATED POST ROUTE ---
// I added the 'type' and 'user' fields to match your pitch requirements
app.post("/posts", async (req, res) => {
    try {
        const post = new Post({
            text: req.body.text,
            location: req.body.location,
            type: req.body.type,
            user: req.body.user
        });
        await post.save();
        res.status(201).send("Post saved");
    } catch (err) {
        res.status(500).send("Error saving post");
    }
});

// --- POINT 2: NEW GET ROUTE ADDED HERE ---
// This allows your frontend to fetch and display the local anonymous chats
app.get("/posts", async (req, res) => {
    try {
        const allPosts = await Post.find(); 
        res.json(allPosts);
    } catch (err) {
        res.status(500).send("Error fetching posts");
    }
});
app.post("/posts", async (req, res) => {
try {
const post = new Post({
text: req.body.text,
location: req.body.location,
type: req.body.type,
user: req.body.user
});

await post.save();

res.status(201).send("Post saved");

} catch (err) {
res.status(500).send("Error saving post");
}
});


app.get("/posts", async (req, res) => {
try {
const allPosts = await Post.find();
res.json(allPosts);
} catch (err) {
res.status(500).send("Error fetching posts");
}
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("server running on port " + PORT);
});