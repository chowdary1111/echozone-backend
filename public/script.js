/* =========================
   USER IDENTIFICATION
========================= */

let userId = localStorage.getItem("echozone_userId");
if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("echozone_userId", userId);
}

// Request Notification Permission for emergencies
if ("Notification" in window) {
  Notification.requestPermission();
}
let knownEmergencies = new Set();

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

  const postData = {
    text: text,
    location: "Nearby",
    type: "normal",
    user: userId
  };

  const sendPost = async () => {
    try {
      const response = await fetch("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData)
      });

      if (response.ok) {
        textInput.value = "";
        loadPosts(); // Reload posts
      } else {
        const data = await response.json();
        if (data.error) {
          alert(data.error);
        } else {
          alert("Failed to post. Please try again.");
        }
      }
    } catch (error) {
      console.log("Error creating post:", error);
      alert("Network error. Please try again.");
    }
  };

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        postData.lat = lat;
        postData.lng = lon;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const data = await res.json();
          if (data && data.address) {
            postData.location = data.address.city || data.address.town || data.address.village || data.address.county || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
          } else {
            postData.location = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
          }
        } catch (e) {
          postData.location = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        }
        sendPost();
      },
      (error) => {
        console.log("Geolocation error:", error);
        sendPost();
      }
    );
  } else {
    sendPost();
  }

}

/* =========================
   LOAD POSTS FROM SERVER
========================= */

async function loadPosts() {
  try {
    let fetchUrl = "/posts";

    // Attempt to get user location to sort posts by distance
    if ("geolocation" in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 5000, maximumAge: 30000
          });
        });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        fetchUrl = `/posts?lat=${lat}&lng=${lng}`;
      } catch (e) {
        console.log("Could not get location for exact normal sorting.");
      }
    }

    const response = await fetch(fetchUrl);
    const posts = await response.json();

    const postsContainer = document.getElementById("posts");
    postsContainer.innerHTML = "";

    // Load emergency posts FIRST so they are ALWAYS anchored at the top!
    await loadEmergencyPosts(postsContainer);

    posts.forEach(post => {

      let locationDisplay = post.location && post.location !== "Nearby" ? post.location : "Nearby";
      if (post.distance !== undefined && post.distance !== null) {
        if (post.distance < 1000) {
          locationDisplay += ` • ${Math.round(post.distance)}m away`;
        } else {
          locationDisplay += ` • ${(post.distance / 1000).toFixed(1)}km away`;
        }
      }

      let time =
        new Date(post.createdAt)
          .toLocaleTimeString();

      let div =
        document.createElement("div");

      div.className = "post";

      let deleteBtnHtml = "";
      if (post.user === userId) {
        deleteBtnHtml = `
          <button class="delete-btn"
            onclick="deletePost('${post._id}')">
            Delete
          </button>
        `;
      }

      div.innerHTML = `

        ${post.text}

        <div class="distance">
          📍 ${locationDisplay}
        </div>

        <div class="time">
          ${time}
        </div>

        ${deleteBtnHtml}

      `;

      postsContainer.appendChild(div);

    });

  } catch (error) {

    console.log("Error loading posts:", error);

  }

}

/* =========================
   LOAD NEARBY EMERGENCY POSTS
========================= */

async function loadEmergencyPosts(container) {

  if (!("geolocation" in navigator)) return;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000
      });
    });

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    const response = await fetch(`/posts/nearby?lat=${lat}&lng=${lng}`);
    const emergencyPosts = await response.json();

    emergencyPosts.forEach(post => {

      // Notification System
      if (!knownEmergencies.has(post._id)) {
        knownEmergencies.add(post._id);
        
        // Trigger OS notification for someone else's emergency
        if ("Notification" in window && Notification.permission === "granted" && post.user !== userId) {
          new Notification("🚨 Echozone Emergency Alert!", {
            body: `Help needed ${Math.round(post.distance)}m away at ${post.location}!`,
          });
        }
      }

      let distanceText = "";
      if (post.distance !== undefined) {
        if (post.distance < 1000) {
          distanceText = `${Math.round(post.distance)}m away`;
        } else {
          distanceText = `${(post.distance / 1000).toFixed(1)}km away`;
        }
      }

      let time = new Date(post.createdAt).toLocaleTimeString();

      let locationDisplay = post.location || "Unknown";

      let div = document.createElement("div");
      div.className = "post emergency";

      let deleteBtnHtml = "";
      if (post.user === userId) {
        const createdAt = new Date(post.createdAt).getTime();
        const now = Date.now();
        const diffSecs = Math.floor((now - createdAt) / 1000);
        const cooldown = 5 * 60; // 5 minutes

        if (diffSecs < cooldown) {
          const remaining = cooldown - diffSecs;
          deleteBtnHtml = `
            <button id="del-${post._id}" class="delete-btn" disabled
              style="background: #9ca3af; cursor: not-allowed;"
              onclick="deletePost('${post._id}')">
              Delete (${formatTime(remaining)})
            </button>
          `;
          startDeleteTimer(post._id, createdAt, cooldown);
        } else {
          deleteBtnHtml = `
            <button class="delete-btn"
              onclick="deletePost('${post._id}')">
              Delete
            </button>
          `;
        }
      }

      div.innerHTML = `

        <div class="emergency-badge">🚨 EMERGENCY</div>

        <div class="emergency-text">${post.text}</div>

        <div class="distance">
          📍 ${locationDisplay} ${distanceText ? "• " + distanceText : ""}
        </div>

        <div class="time">
          ${time}
        </div>

        <button class="view-map-btn"
          style="position: absolute; right: 85px; top: 10px; background: #3b82f6; color: white; border: none; padding: 5px 12px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 13px;"
          onclick="window.open('https://www.google.com/maps?q=${post.lat},${post.lng}', '_blank')">
          📍 Map
        </button>

        ${deleteBtnHtml}

      `;

      container.appendChild(div);

    });

  } catch (error) {
    console.log("Emergency posts load skipped:", error.message);
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
   REAL-TIME WEBSOCKETS
========================= */

const socket = io();

socket.on('postsUpdated', () => {
  if (document.getElementById("appPage").style.display !== "none") {
    loadPosts();
  }
});

function openemergency() {
  window.location.href = "emergency.html";
}

/* =========================
   DELETE TIMERS (Helpers)
========================= */

function formatTime(s) {
  const m = Math.floor(s/60);
  const rs = s % 60;
  return `${m}:${rs < 10 ? '0' : ''}${rs}`;
}

function startDeleteTimer(id, startMs, cooldown) {
  const timer = setInterval(() => {
    const el = document.getElementById("del-" + id);
    if (!el) {
      clearInterval(timer);
      return;
    }
    const diff = Math.floor((Date.now() - startMs) / 1000);
    const remaining = cooldown - diff;
    if (remaining <= 0) {
      el.disabled = false;
      el.style.background = "red";
      el.style.cursor = "pointer";
      el.innerHTML = "Delete";
      clearInterval(timer);
    } else {
      el.innerHTML = `Delete (${formatTime(remaining)})`;
    }
  }, 1000);
}

