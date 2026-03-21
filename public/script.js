/* OPEN APP */
function openApp(){
document.getElementById("landing").style.display="none";
document.getElementById("appPage").style.display="block";
loadPosts();
}

/* AUTO GEOLOCATION */
window.onload=function(){
if(navigator.geolocation){
navigator.geolocation.getCurrentPosition(
pos=>{
document.getElementById("location").value=
pos.coords.latitude.toFixed(2)+","+
pos.coords.longitude.toFixed(2);
});
}
}

/* SEND POST */
async function sendPost(){

const text=document.getElementById("text").value;
const location=document.getElementById("location").value;

if(!text) return alert("Write something!");

await fetch("https://echozone-3ztl.onrender.com/posts",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
text,
location
})
});

document.getElementById("text").value="";

loadPosts();

}

/* LOAD POSTS */
async function loadPosts(){

try{

const res=await fetch("https://echozone-3ztl.onrender.com/posts");

const posts=await res.json();

const container=document.getElementById("posts");

container.innerHTML="";

posts.forEach(p=>{

const div=document.createElement("div");

div.className="post";

/* POST TEXT */

const txt=document.createElement("span");

txt.innerText=p.text+" — "+p.location;

/* 🕒 TIMESTAMP */

const time=document.createElement("small");

if(p.time){

const postTime=new Date(p.time);

time.innerText=postTime.toLocaleString();

}

/* DELETE BUTTON */

const btn=document.createElement("button");

btn.innerText="Delete";

btn.onclick=()=>deletePost(p._id);

/* ADD ELEMENTS */

div.appendChild(txt);

div.appendChild(document.createElement("br"));

div.appendChild(time);

div.appendChild(document.createElement("br"));

div.appendChild(btn);

container.appendChild(div);

});

}catch(err){

console.log("Backend sleeping...");

}

}

/* DELETE POST */

async function deletePost(id){

await fetch("https://echozone-3ztl.onrender.com/posts/"+id,{
method:"DELETE"
});

loadPosts();

}