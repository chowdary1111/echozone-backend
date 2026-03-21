const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
 {
  text: String,
  location: String
 },
 {
  timestamps: true   // ⭐ THIS ENABLES createdAt
 }
);

module.exports = mongoose.model("Post", PostSchema);