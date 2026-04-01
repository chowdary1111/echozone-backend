const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
  text: String,
  location: String,
  type: { type: String, default: "normal" },
  user: String,
  recipient: String, // Added for private matching
  isPrivate: { type: Boolean, default: false }, // Added for private matching
  lat: Number,
  lng: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Post", PostSchema);