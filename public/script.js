/* =========================
   USER IDENTIFICATION
========================= */

let userId = localStorage.getItem("echozone_userId");
if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("echozone_userId", userId);
}

/* ============================================================
   PROFANITY FILTER (English + Telugu)
   Catches: d e n g u, b o s u d i, and common English slurs
   ============================================================ */

function showToast(text) {
  let toast = document.getElementById("abusiveToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "abusiveToast";
    toast.innerHTML = `<span>⚠️</span> ${text}`;
    document.body.appendChild(toast);
  } else {
    toast.querySelector("span").nextSibling.textContent = " " + text;
  }
  
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function checkAndCensorMessage(message, isOutgoing) {
  if (!message) return message;

  // Normalized version for detection (no spaces, lowercase, restricted charset)
  // \u0C00-\u0C7F is the Telugu Unicode range
  const normalized = message.toLowerCase()
    .replace(/\s+/g, '') 
    .match(/[a-z\u0C00-\u0C7F0-9]+/g)?.join('') || "";

  const badWords = [
    // English
    "fuck", "shit", "bitch", "asshole", "dick", "pussy", "faggot", "bastard", "slut", "whore",
    // Telugu (including phonetic variations)
    "dengu", "dheng", "bosudi", "bhos", "kojja", "khoj", "nayala", "naaya", "munda", "guddha", "gudda",
    "lanja", "puku", "modda", "arey", "badacow", "vedhava", "sulla", "neeamma", "ammanee", "lanja"
  ];

  const isAbusive = badWords.some(word => 
    normalized.includes(word) || message.toLowerCase().includes(word)
  );

  if (isAbusive) {
    if (isOutgoing) {
      showToast("Abusive language detected! 🚫");
      return null; // Block sending
    } else {
      return "🚫 Message blocked - please be respectful";
    }
  }

  return message;
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

  const landing = document.getElementById("landing");
  if (landing) {
    landing.style.display = "none";
  }

  const appPage = document.getElementById("appPage");
  if (appPage) {
    appPage.style.display = "block";
  }

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
    if (localBtn) {
      localBtn.style.background = "#ffd700";
      localBtn.style.color = "black";
    }
    if (globalBtn) {
      globalBtn.style.background = "transparent";
      globalBtn.style.color = "white";
    }
  } else {
    if (globalBtn) {
      globalBtn.style.background = "#ffd700";
      globalBtn.style.color = "black";
    }
    if (localBtn) {
      localBtn.style.background = "transparent";
      localBtn.style.color = "white";
    }
  }
}

/* =========================
   CREATE POST (SEND TO SERVER)
========================= */

async function createPost() {

  let textInput = document.getElementById("text");
  let text = textInput.value.trim();

  if (text === "") return;

  const filteredText = checkAndCensorMessage(text, true);
  if (!filteredText) return; 

  const postData = {
    text: filteredText,
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
    let fetchUrl = `/posts?range=${currentRange}&user=${userId}&_t=${Date.now()}`;

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
      // Stricter Filter: Skip private posts, chat type, OR anything with a recipient (room messages)
      if (post.isPrivate === true || post.type === "chat" || post.recipient) return;

      const isGlobalEmergency = post.text && post.text.includes("[GLOBAL EMERGENCY]");
      const filteredText = checkAndCensorMessage(post.text, false);
      
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
      div.className = isGlobalEmergency ? "post emergency" : "post";

      let deleteBtnHtml = "";
      if (post.user === userId) {
        deleteBtnHtml = `<button class="delete-btn" onclick="deletePost('${post._id}')">Delete</button>`;
      }

      if (isGlobalEmergency) {
        div.innerHTML = `
          <div class="emergency-badge">🚨 GLOBAL EMERGENCY</div>
          <div class="emergency-text">${filteredText}</div>
          <div class="distance">📍 ${locationDisplay}</div>
          <div class="time">${time}</div>
          ${post.lat && post.lng ? `
            <button class="view-map-btn" 
              style="position: absolute; right: 85px; top: 10px; background: #3b82f6; color: white; border: none; padding: 5px 12px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 13px;"
              onclick="window.open('https://www.google.com/maps?q=${post.lat},${post.lng}', '_blank')">
              📍 Map
            </button>
          ` : ""}
          ${deleteBtnHtml}
        `;
      } else {
        div.innerHTML = `
          ${filteredText}
          <div class="distance">📍 ${locationDisplay}</div>
          <div class="time">${time}</div>
          ${deleteBtnHtml}
        `;
      }
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

    const response = await fetch(`/posts/nearby?lat=${lat}&lng=${lng}&_t=${Date.now()}`);
    const emergencyPosts = await response.json();

    emergencyPosts.forEach(post => {
      const filteredText = checkAndCensorMessage(post.text, false);

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

        <div class="emergency-text">${filteredText}</div>

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
setInterval(loadPosts, 2000); 

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
   REFACTORED MOOD & CHAT LOGIC
========================= */

let currentMatchId = null;
let currentEmotion = null;
let displayedChatIds = new Set(); 

const motivationMessages = [
  "You're not alone. We're here for you. / Meeru ontari kaadu. Memu unnamu.",
  "Every storm passes, and so will this one. / Prathi tufanu aagipothundi, idi kuda.",
  "You are stronger than you think. / Mee namma-kam mee gunde-dhairyam.",
  "Take a deep breath. You've got this. / Okasari gattiga gaali peelchukondi.",
  "Better days are coming. Just hold on. / Manchi rojulu mundu unnay.",
  "Your life matters. You matter. / Mee jeevitham chala viluvainadi.",
  "Give yourself some credit for how far you've come. / Meeru entha dooram vacharo gurtuches-kondi.",
  "It's okay not to be okay. Reach out for help. / Meeru bada-padi-nappudu help adaga-dam tappu kaadu.",
  "One small step at a time is enough. / Prathi chinna adugu mimmulni munduki teesukelthundi.",
  "You are deserving of love and peace. / Meeru prema mariyu shanthiki arhulu."
];

function openEmotionMode() {
  document.getElementById("emotionModal").style.display = "block";
  document.getElementById("emotionInitial").style.display = "block";
  document.getElementById("emotionMatch").style.display = "none";
  document.getElementById("emotionMotivation").style.display = "none";
  document.getElementById("emotionSearching").style.display = "none";
  currentMatchId = null;
}

function closeEmotionMode() {
  document.getElementById("emotionModal").style.display = "none";
  currentMatchId = null;
}

async function analyzeMood() {
  const input = document.getElementById("moodInput");
  const text = input.value.trim();
  if (!text) return alert("Please tell me how you're feeling first! ✨");

  // Show searching state
  document.getElementById("emotionInitial").style.display = "none";
  document.getElementById("emotionSearching").style.display = "block";
  const status = document.getElementById("searchingStatus");

  try {
    status.innerText = "Analyzing your emotional frequency...";
    
    const res = await fetch("/api/emotion/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message: text })
    });
    
    const data = await res.json();
    
    if (data.emotion === 'critical') {
      showMotivationWall();
      return;
    }

    status.innerText = `Connecting you with a ${data.emotion} vibe match...`;
    
    // Artificial small delay for addictive "matching" feel
    setTimeout(() => {
      currentEmotion = data.emotion;
      // If backend found a matchUserId, we use that, otherwise use the emotion as the room
      currentMatchId = data.matchUserId || data.emotion; 
      
      showChatRoom(currentMatchId, data.emotion, data.matchUserId ? "Human Match" : "EchoBot AI");
    }, 1500);

  } catch (err) {
    console.error("AI Analysis failed:", err);
    status.innerText = "AI is resting. Using local vibe detection...";
    setTimeout(() => {
      selectMood('chill'); // Fallback
    }, 1000);
  }
}

function selectMood(mood) {
  currentEmotion = mood;
  
  if (mood === 'feeling_low' || mood === 'critical') {
    showMotivationWall();
  } else {
    currentMatchId = mood;
    showChatRoom(currentMatchId, mood);
  }
}

function switchGlobalRoom(room) {
  // Unified Room ID: No prefixes
  currentMatchId = room;
  const roomName = document.getElementById("roomSelector").options[document.getElementById("roomSelector").selectedIndex].text;
  
  document.getElementById("matchTitle").innerText = `Room: ${roomName}`;
  document.getElementById("matchSub").innerText = `You've joined the ${roomName} chat. Keep it respectful!`;
  
  // Clear and refresh
  document.getElementById("chatBox").innerHTML = "";
  displayedChatIds.clear();
  updateChatBox();
}

function reportMessage(msgId) {
  if (confirm("Are you sure you want to report this message for abusive language?")) {
    // Simulate a reporting event
    console.log(`Reported message: ${msgId}`);
    
    fetch("/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[REPORT] Message ID ${msgId} reported for abuse by ${userId}`,
        user: userId,
        type: "report",
        isPrivate: true,
        recipient: "admin"
      })
    });

    alert("Message reported to admin. Thank you for keeping Echozone safe!");
  }
}

function showMotivationWall() {
  document.getElementById("emotionInitial").style.display = "none";
  document.getElementById("emotionSearching").style.display = "none";
  document.getElementById("emotionMotivation").style.display = "block";
  
  const wall = document.getElementById("motivationWall");
  wall.innerHTML = "";
  motivationMessages.forEach(msg => {
    const div = document.createElement("div");
    div.style.background = "rgba(255,255,255,0.05)";
    div.style.padding = "15px";
    div.style.borderRadius = "12px";
    div.style.fontSize = "14px";
    div.style.borderLeft = "4px solid #facc15";
    div.innerText = msg;
    wall.appendChild(div);
  });
}

function showChatRoom(matchId, mood, matchType = "Community") {
  document.getElementById("emotionInitial").style.display = "none";
  document.getElementById("emotionSearching").style.display = "none";
  document.getElementById("emotionMatch").style.display = "block";
  
  const colors = {
    happy: "#facc15",
    sad: "#60a5fa",
    angry: "#f87171",
    chill: "#10b981",
    stress: "#c084fc",
    neutral: "#9ca3af"
  };

  const titleColor = colors[mood] || "#38bdf8";
  
  document.getElementById("matchTitle").innerText = `${matchType}: ${mood.charAt(0).toUpperCase() + mood.slice(1)}`;
  document.getElementById("matchTitle").style.color = titleColor;
  document.getElementById("matchSub").innerText = `You've matched with someone feeling ${mood}. Share your energy!`;
  
  // Clear old chat and start tracking
  document.getElementById("chatBox").innerHTML = "";
  displayedChatIds.clear();
  updateChatBox();
}

// Updated message element helper to include Report button
function createMessageElement(msg, isMe, isOptimistic = false) {
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = isMe ? "row-reverse" : "row";
  container.style.alignItems = "flex-end";
  container.style.gap = "8px";
  container.style.marginBottom = "5px";
  container.style.width = "100%";

  const div = document.createElement("div");
  div.style.background = isMe ? "#10b981" : "rgba(255,255,255,0.1)";
  div.style.color = "white";
  div.style.padding = "10px 15px";
  div.style.borderRadius = isMe ? "15px 15px 2px 15px" : "15px 15px 15px 2px";
  div.style.maxWidth = "80%";
  div.style.fontSize = "14px";
  div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  if (isOptimistic) div.style.opacity = "0.7";
  div.innerText = typeof msg === "string" ? msg : msg.text;

  container.appendChild(div);

  // Add Report Button for incoming messages
  if (!isMe && !isOptimistic && typeof msg === "object") {
    const reportBtn = document.createElement("button");
    reportBtn.innerText = "🚩";
    reportBtn.style.background = "transparent";
    reportBtn.style.border = "none";
    reportBtn.style.cursor = "pointer";
    reportBtn.style.fontSize = "12px";
    reportBtn.style.opacity = "0.4";
    reportBtn.title = "Report Message";
    reportBtn.onclick = () => reportMessage(msg._id);
    container.appendChild(reportBtn);
  }

  return container;
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !currentMatchId) return;

  const filteredText = checkAndCensorMessage(text, true);
  if (!filteredText) return;

  const chatBox = document.getElementById("chatBox");
  const optimisticMsg = createMessageElement(filteredText, true, true);
  chatBox.appendChild(optimisticMsg);
  chatBox.scrollTop = chatBox.scrollHeight;
  input.value = "";

  try {
    await fetch("/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: filteredText,
        user: userId,
        recipient: currentMatchId, // Sending to the mood/global "room"
        isPrivate: false,           // Now public for cross-device sync
        type: "chat"               // Hidden from main feed via type check
      })
    });
  } catch (err) {
    const div = optimisticMsg.querySelector("div");
    if (div) {
      div.style.background = "#ef4444";
      div.innerText += " (Error)";
    }
  }
}

async function updateChatBox() {
  if (!currentMatchId || document.getElementById("emotionMatch").style.display === "none") return;

  try {
    const res = await fetch(`/posts/room/${currentMatchId}?user=${userId}&_t=${Date.now()}`);
    const posts = await res.json();
    
    const roomChat = posts.filter(p => 
      p.type === "chat" && p.recipient === currentMatchId
    ).reverse();

    const chatBox = document.getElementById("chatBox");
    let hasNew = false;

    roomChat.forEach(msg => {
      if (!displayedChatIds.has(msg._id)) {
        const opt = Array.from(chatBox.children).find(c => {
          const nestedDiv = c.querySelector("div");
          return nestedDiv && nestedDiv.style.opacity === "0.7" && nestedDiv.innerText === msg.text;
        });
        if (opt) opt.remove();

        const filteredText = checkAndCensorMessage(msg.text, false);
        chatBox.appendChild(createMessageElement(msg, msg.user === userId));
        displayedChatIds.add(msg._id);
        hasNew = true;
      }
    });

    if (hasNew) chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    console.error("Room update failed:", err);
  }
}

// Global polling for rooms (2s)
setInterval(() => {
  if (currentMatchId) {
    updateChatBox();
  }
}, 2000);




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
  userDiv.className = "chat-msg-user pulse-in";
  userDiv.innerHTML = `<div class="msg-bubble">${msg}</div>`;
  msgContainer.appendChild(userDiv);
  
  input.value = "";
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Bot Typing Indicator
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat-msg-bot typing";
  typingDiv.innerHTML = `
    <div class="bot-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  msgContainer.appendChild(typingDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  try {
    const res = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        lat: currentLat,
        lng: currentLng,
        user: userId
      })
    });
    
    const data = await res.json();
    typingDiv.remove();

    const botDiv = document.createElement("div");
    botDiv.className = "chat-msg-bot pulse-in";
    
    let botHtml = `<div class="bot-avatar">🤖</div><div class="msg-bubble">${data.message || "I'm sorry, I'm resting. 💤"}</div>`;
    
    if (data.locations && data.locations.length > 0) {
      botHtml += `<div class="bot-locations">`;
      data.locations.slice(0, 3).forEach(loc => {
        botHtml += `
          <div class="loc-card" onclick="window.open('https://www.google.com/maps?q=${loc.lat},${loc.lng}', '_blank')">
            <strong>📍 ${loc.name}</strong><br>
            <span style="font-size: 11px; opacity: 0.8">${loc.address}</span>
          </div>
        `;
      });
      botHtml += `</div>`;
    }

    botDiv.innerHTML = botHtml;
    msgContainer.appendChild(botDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    if (data.autoPosted) {
      // Refresh feed since bot automatically posted for us!
      setTimeout(loadPosts, 1500);
    }

  } catch (err) {
    if (typingDiv) typingDiv.remove();
    const errorDiv = document.createElement("div");
    errorDiv.className = "chat-msg-bot";
    errorDiv.innerHTML = `<div class="bot-avatar">🤖</div><div class="msg-bubble" style="background: rgba(239, 68, 68, 0.2)">Service interrupted. Try again soon.</div>`;
    msgContainer.appendChild(errorDiv);
  }
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
