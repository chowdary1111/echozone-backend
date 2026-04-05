/* =========================
   USER IDENTIFICATION
========================= */

let userId = localStorage.getItem("echozone_userId");
if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("echozone_userId", userId);
}

/* =========================
   STATE
========================= */

// Persist seen emergency IDs in localStorage to survive page refreshes
// This prevents the emergency sound/notification from firing again for already-seen posts
function loadSeenSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
function saveSeenSet(key, set) {
  // Keep only the last 200 IDs to avoid unbounded storage growth
  const arr = [...set].slice(-200);
  localStorage.setItem(key, JSON.stringify(arr));
}

const processedGlobalEmergencyIds = loadSeenSet("echozone_seen_global");
const knownEmergencies = loadSeenSet("echozone_seen_emergency");
let globalAudioUnlocked = false;
let currentRange = localStorage.getItem("echozone_range") || "local";
let currentLat = null;
let currentLng = null;
let isLoadingFeed = false;

/* =========================
   GEOLOCATION HELPERS
========================= */

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* =========================
   SOCKET.IO REAL-TIME
========================= */

// Connect to the same server that served this page
const socket = io();

socket.on("connect", () => {
  console.log("⚡ Socket.IO connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("⚡ Socket.IO disconnected");
});

// When any client creates a new post, inject it directly into the DOM (instant sync)
socket.on("new_post", (post) => {
  // Skip private / chat / room messages
  if (post.isPrivate === true || post.type === "chat" || post.recipient) return;

  // Handle Emergency Posts Instantly
  if (post.type === "emergency") {
    if (currentLat !== null && currentLng !== null && post.lat && post.lng) {
      const dist = haversineDistance(currentLat, currentLng, post.lat, post.lng);
      if (dist <= 1000) {
        // Only show alerts if we haven't seen this ID yet
        if (!knownEmergencies.has(post._id)) {
          knownEmergencies.add(post._id);
          saveSeenSet("echozone_seen_emergency", knownEmergencies);

          // Only show for OTHER users
          if (post.user !== userId) {
            showMotivationalBanner(dist, post.location);
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("🚨 Echozone Emergency Alert!", {
                body: `Help needed ${Math.round(dist)}m away at ${post.location}!`,
              });
            }
          }
        }
        // Force a total reload to ensure emergency posts are at the top and correct
        loadPosts();
      }
    }
    return;
  }

  injectPostIntoDom(post);
});

// When any client deletes a post, remove it from DOM immediately
socket.on("delete_post", ({ id }) => {
  const el = document.getElementById(`post-${id}`);
  if (el) el.remove();
});

// Fallback reload (used only on initial load or manual range change)
let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => loadPosts(), 300);
}

/* =========================
   INSTANT POST INJECTION (Socket)
========================= */

function injectPostIntoDom(post) {
  const postsContainer = document.getElementById("posts");
  if (!postsContainer) return;

  // Don't add duplicates
  if (document.getElementById(`post-${post._id}`)) return;

  const isGlobalEmergency = post.text && post.text.includes("[GLOBAL EMERGENCY]");
  const filteredText = checkAndCensorMessage(post.text, false);

  // Play global alert sound for global emergencies (only once per ID)
  if (isGlobalEmergency && !processedGlobalEmergencyIds.has(post._id)) {
    processedGlobalEmergencyIds.add(post._id);
    saveSeenSet("echozone_seen_global", processedGlobalEmergencyIds);
    playGlobalNotif();
  }

  let locationDisplay = post.location && post.location !== "Nearby" ? post.location : "Nearby";
  const time = new Date(post.createdAt).toLocaleTimeString();

  const div = document.createElement("div");
  div.id = `post-${post._id}`;
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
          style="position:absolute;right:85px;top:10px;background:#3b82f6;color:white;border:none;padding:5px 12px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:13px;"
          onclick="window.open('https://www.google.com/maps?q=${post.lat},${post.lng}','_blank')">
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

  // Prepend (newest first) before existing posts but after emergency posts
  const firstNonEmergency = postsContainer.querySelector(".post:not(.emergency)");
  if (firstNonEmergency) {
    postsContainer.insertBefore(div, firstNonEmergency);
  } else {
    postsContainer.appendChild(div);
  }
}

/* =========================
   GLOBAL AUDIO
========================= */

window.addEventListener("click", () => {
  if (!globalAudioUnlocked) {
    const s = document.getElementById("globalNotifSound");
    if (s) {
      s.play().then(() => {
        s.pause();
        s.currentTime = 0;
        globalAudioUnlocked = true;
      }).catch(() => {});
    }
  }
}, { once: true });

function playGlobalNotif() {
  if (!globalAudioUnlocked) return;
  const s = document.getElementById("globalNotifSound");
  if (s) {
    s.volume = 0.4;
    s.currentTime = 0;
    s.play().catch(() => {});
  }
}

/* =========================
   PROFANITY FILTER
========================= */

function showToast(text) {
  let toast = document.getElementById("abusiveToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "abusiveToast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>⚠️</span> ${text}`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function checkAndCensorMessage(message, isOutgoing) {
  if (!message) return message;

  const normalized = message.toLowerCase()
    .replace(/\s+/g, '')
    .match(/[a-z\u0C00-\u0C7F0-9]+/g)?.join('') || "";

  const badWords = [
    "fuck", "shit", "bitch", "asshole", "dick", "pussy", "faggot", "bastard", "slut", "whore",
    "dengu", "dheng", "bosudi", "bhos", "kojja", "khoj", "nayala", "naaya", "munda", "guddha", "gudda",
    "lanja", "puku", "modda", "badacow", "vedhava", "sulla", "neeamma", "ammanee"
  ];

  const isAbusive = badWords.some(word =>
    normalized.includes(word) || message.toLowerCase().includes(word)
  );

  if (isAbusive) {
    if (isOutgoing) {
      showToast("Abusive language detected! 🚫");
      return null;
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

/* =========================
   BACKGROUND GPS TRACKING
========================= */

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (position) => {
      currentLat = position.coords.latitude;
      currentLng = position.coords.longitude;
    },
    (err) => console.log("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 10000 }
  );
}

/* =========================
   OPEN APP
========================= */

function openApp() {
  const landing = document.getElementById("landing");
  if (landing) landing.style.display = "none";

  const appPage = document.getElementById("appPage");
  if (appPage) appPage.style.display = "block";

  // Remember the user entered the app so back-navigation skips the landing
  sessionStorage.setItem("echozone_entered", "true");

  updateRangeUI();
  loadPosts();
}

// Auto-skip landing if already entered (e.g. coming back from emergency.html)
if (sessionStorage.getItem("echozone_entered") === "true") {
  openApp();
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
    if (localBtn) { localBtn.style.background = "#ffd700"; localBtn.style.color = "black"; }
    if (globalBtn) { globalBtn.style.background = "transparent"; globalBtn.style.color = "white"; }
  } else {
    if (globalBtn) { globalBtn.style.background = "#ffd700"; globalBtn.style.color = "black"; }
    if (localBtn) { localBtn.style.background = "transparent"; localBtn.style.color = "white"; }
  }
}

/* =========================
   CREATE POST
========================= */

async function createPost() {
  const textInput = document.getElementById("text");
  let text = textInput.value.trim();
  if (!text) return;

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
        // Socket.IO will trigger the reload automatically
      } else {
        const data = await response.json();
        alert(data.error || "Failed to post. Please try again.");
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
  }

  sendPost();
}

/* =========================
   LOAD POSTS FROM SERVER
========================= */

async function loadPosts() {
  if (isLoadingFeed) return;
  isLoadingFeed = true;

  try {
    let fetchUrl = `/posts?range=${currentRange}&user=${userId}&_t=${Date.now()}`;

    if (currentRange === "local" && currentLat !== null && currentLng !== null) {
      fetchUrl += `&lat=${currentLat}&lng=${currentLng}`;
    }

    const response = await fetch(fetchUrl);
    const posts = await response.json();

    const postsContainer = document.getElementById("posts");
    const tempContainer = document.createElement("div");

    // Load emergency posts FIRST
    await loadEmergencyPosts(tempContainer);

    posts.forEach(post => {
      // Skip private posts, chat type, or room messages from main feed
      if (post.isPrivate === true || post.type === "chat" || post.recipient) return;

      const isGlobalEmergency = post.text && post.text.includes("[GLOBAL EMERGENCY]");
      const filteredText = checkAndCensorMessage(post.text, false);

      // Global Notification Sound — only play once per ID (persisted in localStorage)
      if (isGlobalEmergency && !processedGlobalEmergencyIds.has(post._id)) {
        processedGlobalEmergencyIds.add(post._id);
        saveSeenSet("echozone_seen_global", processedGlobalEmergencyIds);
        playGlobalNotif();
      }

      let locationDisplay = post.location && post.location !== "Nearby" ? post.location : "Nearby";
      if (post.distance !== undefined && post.distance !== null && post.distance !== Infinity) {
        if (post.distance < 1000) {
          locationDisplay += ` • ${Math.round(post.distance)}m away`;
        } else {
          locationDisplay += ` • ${(post.distance / 1000).toFixed(1)}km away`;
        }
      }

      const time = new Date(post.createdAt).toLocaleTimeString();
      const div = document.createElement("div");
      div.id = `post-${post._id}`;
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
              style="position:absolute;right:85px;top:10px;background:#3b82f6;color:white;border:none;padding:5px 12px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:13px;"
              onclick="window.open('https://www.google.com/maps?q=${post.lat},${post.lng}','_blank')">
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
  if (currentLat === null || currentLng === null) return;

  try {
    const response = await fetch(`/posts/nearby?lat=${currentLat}&lng=${currentLng}&_t=${Date.now()}`);
    const emergencyPosts = await response.json();

    emergencyPosts.forEach(post => {
      const filteredText = checkAndCensorMessage(post.text, false);

      if (!knownEmergencies.has(post._id)) {
        knownEmergencies.add(post._id);
        // Persist so we don't re-alert on page refresh
        saveSeenSet("echozone_seen_emergency", knownEmergencies);
        // Only show motivational banner and notification for OTHER users' emergencies
        if (post.user !== userId) {
          showMotivationalBanner(post.distance, post.location);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("\uD83D\uDEA8 Echozone Emergency Alert!", {
              body: `Help needed ${Math.round(post.distance)}m away at ${post.location}!`,
            });
          }
        }
      }

      let distanceText = "";
      if (post.distance !== undefined) {
        distanceText = post.distance < 1000
          ? `${Math.round(post.distance)}m away`
          : `${(post.distance / 1000).toFixed(1)}km away`;
      }

      const time = new Date(post.createdAt).toLocaleTimeString();
      const locationDisplay = post.location || "Unknown";
      const div = document.createElement("div");
      div.id = `post-${post._id}`;
      div.className = "post emergency";

      let deleteBtnHtml = "";
      if (post.user === userId) {
        const createdAt = new Date(post.createdAt).getTime();
        const diffSecs = Math.floor((Date.now() - createdAt) / 1000);
        const cooldown = 5 * 60;

        if (diffSecs < cooldown) {
          const remaining = cooldown - diffSecs;
          deleteBtnHtml = `
            <button id="del-${post._id}" class="delete-btn" disabled
              style="background:#9ca3af;cursor:not-allowed;"
              onclick="deletePost('${post._id}')">
              Delete (${formatTime(remaining)})
            </button>
          `;
          startDeleteTimer(post._id, createdAt, cooldown);
        } else {
          deleteBtnHtml = `<button class="delete-btn" onclick="deletePost('${post._id}')">Delete</button>`;
        }
      }

      div.innerHTML = `
        <div class="emergency-badge">🚨 EMERGENCY</div>
        <div class="emergency-text">${filteredText}</div>
        <div class="distance">📍 ${locationDisplay} ${distanceText ? "• " + distanceText : ""}</div>
        <div class="time">${time}</div>
        <button class="view-map-btn"
          style="position:absolute;right:85px;top:10px;background:#3b82f6;color:white;border:none;padding:5px 12px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:13px;"
          onclick="window.open('https://www.google.com/maps?q=${post.lat},${post.lng}','_blank')">
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
    await fetch("/posts/" + id, { method: "DELETE" });
    // Socket.IO will handle DOM removal via "delete_post" event
  } catch (error) {
    console.log("Delete failed:", error);
  }
}

/* =========================
   DELETE TIMERS (Helpers)
========================= */

function formatTime(s) {
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs < 10 ? '0' : ''}${rs}`;
}

function startDeleteTimer(id, startMs, cooldown) {
  const timer = setInterval(() => {
    const el = document.getElementById("del-" + id);
    if (!el) { clearInterval(timer); return; }
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
   EMERGENCY & NAVIGATION
========================= */

function openemergency() {
  window.location.href = "emergency.html";
}

/* =========================
   MOTIVATIONAL EMERGENCY BANNER
========================= */

const MOTIV_MESSAGES = [
  {
    quote: "<em>One act of courage</em> can save a life. Now is your moment.",
    action: "Check on them. Your presence alone can make a difference."
  },
  {
    quote: "The world needs <em>heroes without capes</em> — starting with you, right now.",
    action: "Stay calm. A calm helper is the most powerful helper."
  },
  {
    quote: "<em>Don't look away.</em> Someone nearby is counting on a stranger like you.",
    action: "Call 112 immediately and stay with them until help arrives."
  },
  {
    quote: "Every second counts. <em>You could be their reason</em> to hold on.",
    action: "Move toward them, not away. Courage is a choice."
  },
  {
    quote: "In someone's darkest moment, <em>your light is everything.</em>",
    action: "Speak to them calmly. Let them know they are not alone."
  },
  {
    quote: "<em>Ordinary people</em> change lives in extraordinary moments — this is yours.",
    action: "Alert others nearby and call emergency services immediately."
  },
  {
    quote: "Fear is natural. <em>Acting despite fear</em> is what makes you a hero.",
    action: "Even calling 112 and staying on the line can save a life."
  },
  {
    quote: "<em>Humanity at its best</em> is a neighbor who shows up when it matters most.",
    action: "Don't wait for someone else — be the someone else they're waiting for."
  }
];

let motivDismissTimer = null;

function showMotivationalBanner(distance, location) {
  const banner = document.getElementById("motivationBanner");
  if (!banner) return;

  // Pick a random message
  const msg = MOTIV_MESSAGES[Math.floor(Math.random() * MOTIV_MESSAGES.length)];

  // Set distance text
  const distEl = document.getElementById("motivDistanceText");
  if (distEl) {
    if (distance !== undefined && distance < 1000) {
      distEl.textContent = `Someone ${Math.round(distance)}m away needs help — ${location || "nearby"}`;
    } else if (distance !== undefined) {
      distEl.textContent = `Someone ${(distance / 1000).toFixed(1)}km away needs help — ${location || "nearby"}`;
    } else {
      distEl.textContent = `Someone near you needs help — ${location || "nearby"}`;
    }
  }

  // Set quote and action text
  const quoteEl = document.getElementById("motivQuote");
  const actionEl = document.getElementById("motivAction");
  if (quoteEl) quoteEl.innerHTML = `"${msg.quote}"`;
  if (actionEl) actionEl.textContent = msg.action;

  // Show banner
  banner.classList.add("show");

  // Animate progress bar countdown (9 seconds)
  const bar = document.getElementById("motivProgressBar");
  if (bar) {
    bar.style.transition = "none";
    bar.style.transform = "scaleX(1)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = "transform 9s linear";
        bar.style.transform = "scaleX(0)";
      });
    });
  }

  // Auto-dismiss after 9 seconds
  clearTimeout(motivDismissTimer);
  motivDismissTimer = setTimeout(() => dismissMotivBanner(), 9000);
}

function dismissMotivBanner() {
  const banner = document.getElementById("motivationBanner");
  if (banner) banner.classList.remove("show");
  clearTimeout(motivDismissTimer);
}

/* =========================
   CHATBOT TOGGLE
========================= */

function toggleChatbot() {
  const modal = document.getElementById("chatbotModal");
  if (!modal) return;
  modal.style.display = modal.style.display === "none" ? "flex" : "none";
}

/* =========================
   AI CHATBOT LOGIC
========================= */

async function sendChatbotMessage() {
  const input = document.getElementById("chatbotInput");
  const msg = input.value.trim();
  if (!msg) return;

  const msgContainer = document.getElementById("chatbotMessages");

  // User message bubble
  const userDiv = document.createElement("div");
  userDiv.className = "chat-msg-user pulse-in";
  userDiv.innerHTML = `<div class="msg-bubble">${msg}</div>`;
  msgContainer.appendChild(userDiv);
  input.value = "";
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Bot typing waveform indicator
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat-msg-bot typing";
  typingDiv.innerHTML = `
    <div class="bot-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-waveform">
        <div class="typing-bar"></div>
        <div class="typing-bar"></div>
        <div class="typing-bar"></div>
        <div class="typing-bar"></div>
        <div class="typing-bar"></div>
      </div>
    </div>
  `;
  msgContainer.appendChild(typingDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  try {
    const res = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, lat: currentLat, lng: currentLng, user: userId })
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
          <div class="loc-card" onclick="window.open('https://www.google.com/maps?q=${loc.lat},${loc.lng}','_blank')">
            <strong>📍 ${loc.name}</strong><br>
            <span style="font-size:11px;opacity:0.8">${loc.address}</span>
          </div>
        `;
      });
      botHtml += `</div>`;
    }

    botDiv.innerHTML = botHtml;
    msgContainer.appendChild(botDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    // Socket.IO handles feed refresh if autoPosted

  } catch (err) {
    if (typingDiv) typingDiv.remove();
    const errorDiv = document.createElement("div");
    errorDiv.className = "chat-msg-bot";
    errorDiv.innerHTML = `<div class="bot-avatar">🤖</div><div class="msg-bubble" style="background:rgba(239,68,68,0.2)">Service interrupted. Try again soon.</div>`;
    msgContainer.appendChild(errorDiv);
  }
}

// Allow Enter key in chatbot
document.addEventListener("DOMContentLoaded", () => {
  const chatInput = document.getElementById("chatbotInput");
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatbotMessage();
    });
  }

  // Enter key for main post textarea
  const postTextarea = document.getElementById("text");
  if (postTextarea) {
    postTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        createPost();
      }
    });
  }
});
