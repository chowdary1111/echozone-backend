const mongoose = require("mongoose");
const uri = "mongodb+srv://chetansairaparla433_db_user:echo123@echozone.omkcyew.mongodb.net/echozone?retryWrites=true&w=majority";

console.log("Connecting to MongoDB...");
mongoose.connect(uri, { family: 4 })
  .then(() => {
    console.log("SUCCESS!");
    process.exit(0);
  })
  .catch(err => {
    console.error("FULL ERROR:");
    console.error(err);
    process.exit(1);
  });
