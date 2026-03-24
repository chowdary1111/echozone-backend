/* =========================
   OPEN APP
========================= */

function openApp(){

document.getElementById("landing").style.display="none";

document.getElementById("appPage").style.display="block";

}

/* =========================
   CREATE POST
========================= */

function createPost(){

let text=document.getElementById("text").value;

if(text.trim()=="") return;

/* Fake distance generator */

let distance=Math.floor(
Math.random()*50
)+1;

/* Timestamp */

let time=new Date().toLocaleTimeString();

/* Create Post */

let post=document.createElement("div");

post.className="post";

post.innerHTML=`

${text}

<div class="distance">

📍 ${distance} km away

</div>

<div class="time">

${time}

</div>

<button class="delete-btn"
onclick="this.parentElement.remove()">

Delete

</button>

`;

document
.getElementById("posts")
.prepend(post);

document.getElementById("text").value="";

}

/* =========================
   AUTO DEMO POSTS
========================= */

window.onload=function(){

let demoPosts=[

"Anyone nearby hospital?",
"Power outage in my street",
"Lost dog spotted",
"Need water supply info"

];

demoPosts.forEach(msg=>{

document.getElementById("text").value=msg;

createPost();

});

document.getElementById("text").value="";

}

/* ===========================
   OPEN EMERGENCY PAGE
=========================== */

function openEmergency(){

window.location.href = "emergency.html";

}  

