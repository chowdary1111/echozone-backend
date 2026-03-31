const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
  text: String,
  location: String,
  type: { type: String, default: "normal" },
  user: String,
  lat: Number,
  lng: Number
},{
  timestamps: true
});

module.exports = mongoose.model("Post", PostSchema);