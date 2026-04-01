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
let currentRange = localStorage.getItem("echozone_range") || "local";

/* =========================
   BACKGROUND GPS TRACKING
========================= */

let currentLat = null;
let currentLng = null;
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (position) => {
      currentLat = position.coords.latitude;
      currentLng = position.coords.longitude;
    },
    (err) => console.log("Background GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 10000 }
  );
}

/* =========================
   OPEN APP
========================= */

function openApp() {

  document.getElementById("landing").style.display = "none";

  document.getElementById("appPage").style.display = "block";

  updateRangeUI(); // Set correct button colors
  loadPosts(); // Load posts when app opens

}

function setRange(range) {
  currentRange = range;
  localStorage.setItem("echozone_range", range);
  updateRangeUI();
  loadPosts();
}

function updateRangeUI() {
  const localBtn = document.getElementById("rangeLocal");
  const globalBtn = document.getElementById("rangeGlobal");
  if (currentRange === "local") {
    localBtn.style.background = "#ffd700";
    localBtn.style.color = "black";
    globalBtn.style.background = "transparent";
    globalBtn.style.color = "white";
  } else {
    globalBtn.style.background = "#ffd700";
    globalBtn.style.color = "black";
    localBtn.style.background = "transparent";
    localBtn.style.color = "white";
  }
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
        loadPosts(); // Guaranteed UI reload
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

  if (currentLat !== null && currentLng !== null) {
    postData.lat = currentLat;
    postData.lng = currentLng;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLat}&lon=${currentLng}`);
      const data = await res.json();
      if (data && data.address) {
        postData.location = data.address.city || data.address.town || data.address.village || data.address.county || `${currentLat.toFixed(2)}, ${currentLng.toFixed(2)}`;
      } else {
        postData.location = `${currentLat.toFixed(2)}, ${currentLng.toFixed(2)}`;
      }
    } catch (e) {
      postData.location = `${currentLat.toFixed(2)}, ${currentLng.toFixed(2)}`;
    }
    sendPost();
  } else {
    sendPost();
  }
}

/* =========================
   LOAD POSTS FROM SERVER
========================= */

let isLoadingFeed = false;

async function loadPosts() {
  if (isLoadingFeed) return;
  isLoadingFeed = true;

  try {
    let fetchUrl = `/posts?range=${currentRange}&user=${userId}`;

    // Add coordinates for local range
    if (currentRange === "local" && currentLat !== null && currentLng !== null) {
      fetchUrl += `&lat=${currentLat}&lng=${currentLng}`;
    }

    const response = await fetch(fetchUrl);
    const posts = await response.json();

    const postsContainer = document.getElementById("posts");
    
    // Create a temporary container to prevent flickering while loading
    const tempContainer = document.createElement("div");

    // Load emergency posts FIRST
    await loadEmergencyPosts(tempContainer);

    posts.forEach(post => {
      if (post.isPrivate === true) return;

      let locationDisplay = post.location && post.location !== "Nearby" ? post.location : "Nearby";
      if (post.distance !== undefined && post.distance !== null && post.distance !== Infinity) {
        if (post.distance < 1000) {
          locationDisplay += ` • ${Math.round(post.distance)}m away`;
        } else {
          locationDisplay += ` • ${(post.distance / 1000).toFixed(1)}km away`;
        }
      }

      let time = new Date(post.createdAt).toLocaleTimeString();
      let div = document.createElement("div");
      div.className = "post";

      let deleteBtnHtml = "";
      if (post.user === userId) {
        deleteBtnHtml = `<button class="delete-btn" onclick="deletePost('${post._id}')">Delete</button>`;
      }

      div.innerHTML = `
        ${post.text}
        <div class="distance">📍 ${locationDisplay}</div>
        <div class="time">${time}</div>
        ${deleteBtnHtml}
      `;
      tempContainer.appendChild(div);
    });

    // Swap content only after everything is ready
    postsContainer.innerHTML = tempContainer.innerHTML;

  } catch (error) {
    console.log("Error loading posts:", error);
  } finally {
    isLoadingFeed = false;
  }
}

/* =========================
   LOAD NEARBY EMERGENCY POSTS
========================= */

async function loadEmergencyPosts(container) {

  // Immediately return if we lack cached GPS coordinates
  if (currentLat === null || currentLng === null) return;

  try {
    const lat = currentLat;
    const lng = currentLng;

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
    
    loadPosts(); // Guaranteed UI reload

  } catch (error) {

    console.log("Delete failed:", error);

  }

}

/* =========================
   AUTO REFRESH POSTS
========================= */

// Fallback to strict HTTP auto-polling every 5 seconds since 
// WebSocket connections are notoriously dropped by free-tier 
// cloud providers like Render.
setInterval(loadPosts, 5000);

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


/* =========================
   AI EMOTION & MATCHING LOGIC
========================= */

let currentMatchId = null;
let currentEmotion = null;

const motivationalQuotes = [
  "You're braver than you believe, stronger than you seem, and smarter than you think. - A.A. Milne",
  "It does not matter how slowly you go as long as you do not stop. - Confucius",
  "Hardships often prepare ordinary people for an extraordinary destiny. - C.S. Lewis",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "The only way to do great work is to love what you do. - Steve Jobs",
  "You are enough just as you are. - Meghan Markle",
  "Keep your face always toward the sunshine—and shadows will fall behind you. - Walt Whitman",
];

function openEmotionMode() {
  document.getElementById("emotionModal").style.display = "block";
  document.getElementById("emotionInitial").style.display = "block";
  document.getElementById("emotionCritical").style.display = "none";
  document.getElementById("emotionMatch").style.display = "none";
  document.getElementById("emotionSearching").style.display = "none";
  currentMatchId = null;
}

function closeEmotionMode() {
  document.getElementById("emotionModal").style.display = "none";
  currentMatchId = null;
}

async function startAnalysis() {
  const msg = document.getElementById("emotionMsg").value.trim();
  if (!msg) return alert("Please share how you feel first!");

  document.getElementById("emotionInitial").style.display = "none";
  document.getElementById("emotionSearching").style.display = "block";

  try {
    const res = await fetch("/api/emotion/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message: msg })
    });
    const data = await res.json();

    document.getElementById("emotionSearching").style.display = "none";

    if (data.emotion === "critical") {
      showCriticalSupport();
    } else if (data.matchUserId) {
      currentMatchId = data.matchUserId;
      currentEmotion = data.emotion;
      showChatRoom(data.matchUserId, data.emotion);
    } else {
      // FALLBACK: Match with EchoBot if no human available
      currentMatchId = "EchoBot";
      currentEmotion = data.emotion;
      showChatRoom("EchoBot", data.emotion);
    }
  } catch (err) {
    console.error("Analysis failed:", err);
    alert("AI Analysis failed. Please try again.");
    document.getElementById("emotionInitial").style.display = "block";
  }
}

function showCriticalSupport() {
  document.getElementById("emotionCritical").style.display = "block";
  const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  document.getElementById("quoteDisplay").innerText = `"${quote}"`;
}

function showChatRoom(matchId, emotion) {
  document.getElementById("emotionMatch").style.display = "block";
  if (matchId === "EchoBot") {
    document.getElementById("matchSub").innerText = `AI matching: You're currently talking to EchoBot because no other users are online.`;
  } else {
    document.getElementById("matchSub").innerText = `You've been matched with ${matchId} because you both feel ${emotion}.`;
  }
  updateChatBox();
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !currentMatchId) return;

  try {
    if (currentMatchId === "EchoBot") {
      // Bot response logic
      const userMsgDiv = document.createElement("div");
      userMsgDiv.style.alignSelf = "flex-end";
      userMsgDiv.style.background = "#38bdf8";
      userMsgDiv.style.color = "black";
      userMsgDiv.style.padding = "10px 15px";
      userMsgDiv.style.borderRadius = "15px";
      userMsgDiv.style.maxWidth = "80%";
      userMsgDiv.style.fontSize = "14px";
      userMsgDiv.innerText = text;
      document.getElementById("chatBox").appendChild(userMsgDiv);
      
      input.value = "";
      
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `I'm feeling ${currentEmotion} and I just said: ${text}`, user: userId })
      });
      const data = await res.json();
      
      const botMsgDiv = document.createElement("div");
      botMsgDiv.style.alignSelf = "flex-start";
      botMsgDiv.style.background = "rgba(255,255,255,0.1)";
      botMsgDiv.style.color = "white";
      botMsgDiv.style.padding = "10px 15px";
      botMsgDiv.style.borderRadius = "15px";
      botMsgDiv.style.maxWidth = "80%";
      botMsgDiv.style.fontSize = "14px";
      botMsgDiv.innerText = data.message;
      document.getElementById("chatBox").appendChild(botMsgDiv);
      document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight;
      return;
    }

    const response = await fetch("/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        user: userId,
        recipient: currentMatchId,
        isPrivate: true,
        type: "normal"
      })
    });

    if (response.ok) {
      input.value = "";
      updateChatBox();
    }
  } catch (err) {
    console.error("Chat send failed:", err);
  }
}

async function updateChatBox() {
  if (!currentMatchId || document.getElementById("emotionMatch").style.display === "none") return;

  try {
    const res = await fetch(`/posts?user=${userId}`);
    const posts = await res.json();
    
    // Filter private messages between me and my match
    const myChat = posts.filter(p => 
      p.isPrivate === true && 
      ((p.user === userId && p.recipient === currentMatchId) || 
       (p.user === currentMatchId && p.recipient === userId))
    );

    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";

    myChat.reverse().forEach(msg => {
      const msgDiv = document.createElement("div");
      const isMe = msg.user === userId;
      
      msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
      msgDiv.style.background = isMe ? "#38bdf8" : "rgba(255,255,255,0.1)";
      msgDiv.style.color = isMe ? "black" : "white";
      msgDiv.style.padding = "10px 15px";
      msgDiv.style.borderRadius = "15px";
      msgDiv.style.maxWidth = "80%";
      msgDiv.style.fontSize = "14px";
      
      msgDiv.innerText = msg.text;
      chatBox.appendChild(msgDiv);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    console.error("Chat update failed:", err);
  }
}

// Add chat update to the global poll
setInterval(() => {
  if (currentMatchId) updateChatBox();
}, 5000);


/* =========================
   UI TOGGLES
========================= */

function toggleTools() {
  const dropdown = document.getElementById("toolsDropdown");
  dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
}

function toggleChatbot() {
  const modal = document.getElementById("chatbotModal");
  modal.style.display = modal.style.display === "none" ? "flex" : "none";
}

// Close tools if clicking outside
window.addEventListener("click", (e) => {
  if (!e.target.closest("#toolsMenu")) {
    document.getElementById("toolsDropdown").style.display = "none";
  }
});


/* =========================
   AI CHATBOT LOGIC
======================== */

async function sendChatbotMessage() {
  const input = document.getElementById("chatbotInput");
  const msg = input.value.trim();
  if (!msg) return;

  const msgContainer = document.getElementById("chatbotMessages");
  
  // User message
  const userDiv = document.createElement("div");
  userDiv.className = "chat-msg-user";
  userDiv.innerText = msg;
  msgContainer.appendChild(userDiv);
  
  input.value = "";
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Bot thinking...
  const botDiv = document.createElement("div");
  botDiv.className = "chat-msg-bot";
  botDiv.innerText = "...";
  msgContainer.appendChild(botDiv);

  try {
    // GPS Check: Ensure location is available before searching - with FORCE DETECT
    if ((msg.toLowerCase().includes("hospital") || msg.toLowerCase().includes("police")) && (!currentLat || !currentLng)) {
      botDiv.innerHTML = "<div>Locating you... Please wait just a second. 📍</div>";
      
      // Force an immediate high-accuracy position check
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            currentLat = pos.coords.latitude;
            currentLng = pos.coords.longitude;
            resolve();
          },
          (err) => {
            console.log("Force location failed:", err.message);
            resolve();
          },
          { timeout: 5000, enableHighAccuracy: true }
        );
      });

      if (!currentLat || !currentLng) {
        botDiv.innerHTML = "<div>I'm still having trouble finding your location. Please check your GPS settings so I can find local results for you! 📍</div>";
        return;
      }
    }

    const res = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        user: userId, // Ensure auto-post uses correct user ID
        lat: currentLat,
        lng: currentLng
      })
    });
    const data = await res.json();

    botDiv.innerHTML = `<div>${data.message || "I'm sorry, I couldn't process that."}</div>`;

    if (data.autoPosted) {
      // Refresh feed since bot automatically posted for us!
      setTimeout(loadPosts, 1000);
    }

    if (data.locations && data.locations.length > 0) {
      data.locations.forEach(loc => {
        const locCard = document.createElement("div");
        locCard.className = "loc-card";
        
        let directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
        if (currentLat && currentLng) {
          directionsUrl += `&origin=${currentLat},${currentLng}`;
        }

        locCard.innerHTML = `
          <b>${loc.name}</b>
          <span style="font-size:12px; opacity:0.8;">📍 ${loc.address}</span>
          <button onclick="window.open('${directionsUrl}', '_blank')">🚀 Get Directions</button>
        `;
        botDiv.appendChild(locCard);
      });
    }

  } catch (err) {
    botDiv.innerText = "Error connecting to AI. Please try again.";
  }
  
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

async function postFromChatbot(text) {
  if (!userId) {
    alert("User ID missing. Try refreshing the page.");
    return;
  }

  // Ensure we have some location info
  const postData = {
    text: text,
    location: currentLat ? "Nearby" : "Unknown",
    type: "normal",
    user: userId,
    lat: currentLat,
    lng: currentLng
  };

  try {
    const response = await fetch("/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData)
    });

    const result = await response.json();

    if (response.ok) {
      alert("Post shared to Echozone! 🚀");
      loadPosts(); 
      toggleChatbot(); // Close chat
    } else {
      alert("Search Bot Error: " + (result.error || "Server rejected the post."));
    }
  } catch (err) {
    console.error("Post Chatbot Error:", err);
    alert("Post system is currently busy. Please try again in a moment.");
  }
}
