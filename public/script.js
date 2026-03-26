/* =========================
   OPEN APP
========================= */

function openApp() {

  document.getElementById("landing").style.display = "none";

  document.getElementById("appPage").style.display = "block";

  loadPosts(); // Load posts when app opens

}

/* =========================
   CREATE POST (SEND TO SERVER)
========================= */

async function createPost() {

  let textInput = document.getElementById("text");

  let text = textInput.value.trim();

  if (text === "") return;

  try {

    const response = await fetch("/posts", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        text: text,
        location: "Nearby",
        type: "normal",
        user: "anonymous"

      })

    });

    if (response.ok) {

      textInput.value = "";

      loadPosts(); // Reload posts

    }

  } catch (error) {

    console.log("Error creating post:", error);

  }

}

/* =========================
   LOAD POSTS FROM SERVER
========================= */

async function loadPosts() {

  try {

    const response = await fetch("/posts");

    const posts = await response.json();

    const postsContainer =
      document.getElementById("posts");

    postsContainer.innerHTML = "";

    posts.forEach(post => {

      let distance =
        Math.floor(Math.random() * 50) + 1;

      let time =
        new Date(post.createdAt)
        .toLocaleTimeString();

      let div =
        document.createElement("div");

      div.className = "post";

      div.innerHTML = `

        ${post.text}

        <div class="distance">
          📍 ${distance} km away
        </div>

        <div class="time">
          ${time}
        </div>

        <button class="delete-btn"
          onclick="deletePost('${post._id}')">

          Delete

        </button>

      `;

      postsContainer.prepend(div);

    });

  } catch (error) {

    console.log("Error loading posts:", error);

  }

}

/* =========================
   DELETE POST
========================= */

async function deletePost(id) {

  try {

    await fetch("/posts/" + id, {

      method: "DELETE"

    });

    loadPosts();

  } catch (error) {

    console.log("Delete failed:", error);

  }

}

/* =========================
   AUTO REFRESH POSTS
========================= */

setInterval(loadPosts, 5000);

function openemergency() {
   window.location.href = " emergency.html";
}

