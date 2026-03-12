require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Post = require("./models/Post");

const app = express();

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());
app.use(cors());

/* ---------------- MONGODB CONNECTION ---------------- */

mongoose.connect(process.env.MONGO_URI,{
useNewUrlParser:true,
useUnifiedTopology:true
})

.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log("MongoDB Error:",err));

/* ---------------- ROOT ROUTE ---------------- */

app.get("/",(req,res)=>{

res.send("ECHOZONE server is running");

});

/* ---------------- CREATE POST ---------------- */

app.post("/posts",async(req,res)=>{

try{

const post=new Post({

text:req.body.text,
location:req.body.location,
type:req.body.type,
user:req.body.user

});

await post.save();

res.status(201).json({

message:"Post saved successfully"

});

}catch(err){

console.log(err);

res.status(500).json({

error:"Error saving post"

});

}

});

/* ---------------- GET ALL POSTS ---------------- */

app.get("/posts",async(req,res)=>{

try{

const posts=await Post.find().sort({_id:-1});

res.json(posts);

}catch(err){

console.log(err);

res.status(500).json({

error:"Error fetching posts"

});

}

});

/* ---------------- SERVER START ---------------- */

const PORT=process.env.PORT || 3000;

app.listen(PORT,()=>{

console.log("Echozone server running on port "+PORT);

});