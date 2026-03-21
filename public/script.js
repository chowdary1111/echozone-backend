 /* OPEN APP */

function openApp(){

 document.getElementById("landing").style.display = "none";

 document.getElementById("appPage").style.display = "block";

 loadPosts();

}


/* LOAD POSTS */

async function loadPosts(){
try{

  const res = await fetch("https://echozone-3zt1.onrender.com/posts");
  const posts = await res.json();

  const container = document.getElementById("posts");

  container.innerHTML = "";

  posts.forEach(p => {

   console.log(p); // DEBUG

   const div = document.createElement("div");
   div.className = "post";

   /* TEXT */

   const txt = document.createElement("span");
   txt.innerText = p.text + " — " + p.location;
      /* 🕒 TIMESTAMP */

const time = document.createElement("small");

const postTime = new Date(p.createdAt);

time.innerText =
 "🕒 " + postTime.toLocaleString("en-IN");

time.style.display = "block";
time.style.fontSize = "12px";
time.style.color = "gray";
time.style.marginTop = "5px";
   /* DELETE BUTTON */

   const btn = document.createElement("button");
   btn.innerText = "Delete";

   btn.onclick = async () => {

    await fetch(
     "https://echozone-3zt1.onrender.com/posts/" + p._id,
     {
      method:"DELETE"
     }
    );

    loadPosts();

   };

   /* ADD ELEMENTS */

   div.appendChild(txt);
   div.appendChild(time);
   div.appendChild(btn);

   container.appendChild(div);

  });

 }catch(err){

  console.error("Error:",err);

 }

}


/* ADD POST WITH GEOLOCATION */

async function addPost(){

 const text = document.getElementById("text").value;

 if(!text){
  alert("Enter text");
  return;
 }

 navigator.geolocation.getCurrentPosition(
  async position => {

   const latitude = position.coords.latitude;
   const longitude = position.coords.longitude;

   const location =
     latitude + "," + longitude;

   await fetch(
    "https://echozone-3zt1.onrender.com/posts",
    {
     method:"POST",
     headers:{
      "Content-Type":"application/json"
     },
     body:JSON.stringify({
      text,
      location
     })
    }
   );

   document.getElementById("text").value="";

   loadPosts();

  },
  error => {
   alert("Location permission denied");
  }
 );

}


/* LOAD POSTS */

loadPosts();