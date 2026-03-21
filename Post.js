const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({

 text: String,
 location: String,
 type: String,
 user: String

},{
 timestamps: true
});

module.exports = mongoose.model("Post", PostSchema);