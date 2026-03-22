function openApp() {

 document.getElementById("landingPage").style.display = "none";

 document.getElementById("appPage").style.display = "block";

 loadPosts();

}

/* LOAD POSTS */

async function loadPosts() {

 try {

  const res = await fetch("/posts");

  const posts = await res.json();

  const container = document.getElementById("posts");

  container.innerHTML = "";

  posts.forEach(p => {

   const div = document.createElement("div");

   div.className = "post";

   const text = document.createElement("p");
   text.innerText = p.text;

   const loc = document.createElement("small");
   loc.innerText = "📍 " + p.location;

   const time = document.createElement("small");

   const postTime = new Date(p.createdAt);

   time.innerText =
    "🕒 " + postTime.toLocaleString("en-IN");

   time.style.display = "block";
   time.style.fontSize = "12px";
   time.style.color = "gray";

   div.appendChild(text);
   div.appendChild(loc);
   div.appendChild(time);
/* DELETE BUTTON */

const delBtn =
 document.createElement("button");

delBtn.innerText = "🗑 Delete";

delBtn.onclick = async () => {

 await fetch("/posts/" + p._id, {
  method: "DELETE"
 });

 loadPosts();

};

div.appendChild(delBtn);

   container.appendChild(div);

  });

 } catch (err) {

  console.log("Load error:", err);

 }

}

/* CREATE POST */

async function createPost() {

 const text =
 document.getElementById("text").value;

 if (!text) return;

 navigator.geolocation.getCurrentPosition(

 async position => {

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  const location = lat + "," + lon;

  await fetch("/posts", {

   method: "POST",

   headers: {
    "Content-Type": "application/json"
   },

   body: JSON.stringify({
    text: text,
    location: location,
    type: "general",
    user: "anonymous"
   })

  });

  document.getElementById("text").value = "";

  loadPosts();

 },

 error => {

  alert("Location permission required to post 📍");

 }

 );

}


/* LOAD POSTS ON START */

loadPosts();