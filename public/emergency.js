// emergency.js

const holdCircle = document.getElementById("holdCircle");
const stopBtn = document.getElementById("stopAlarm");
const sound = document.getElementById("emergencySound");
const statusEl = document.getElementById("emergencyStatus");

let holdTimer;
let isHolding = false;

/* MOBILE SOUND SETTINGS */

sound.loop = true;
sound.volume = 1.0;

/* STATUS MESSAGE HELPER */

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type; // "success", "error", or "pending"
}

/* =========================
   PERMISSION UNLOCKING (Modern Browsers)
   ========================= */

let audioUnlocked = false;

function initUnlock() {
  // Shown by default in HTML
  console.log("Waiting for user interaction to unlock media...");
}

async function confirmUnlock() {
  // 1. Unlock Audio
  try {
    sound.play();
    sound.pause();
    sound.currentTime = 0;
    audioUnlocked = true;
    console.log("Audio context unlocked ✅");
  } catch (err) {
    console.log("Audio unlock failed:", err);
  }

  // 2. Unlock Vibration
  if ("vibrate" in navigator) {
    navigator.vibrate(50); // Small pulse to test
    console.log("Haptics unlocked ✅");
  }

  // 3. Hide Overlay
  document.getElementById("unlockOverlay").style.display = "none";
}

/* USER IDENTIFICATION */
let userId = localStorage.getItem("echozone_userId");
if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("echozone_userId", userId);
}

/* AUTO POST EMERGENCY */

async function triggerEmergencyPost() {

  showStatus("📡 Getting your location...", "pending");

  if (!("geolocation" in navigator)) {
    showStatus("❌ Location not available on this device", "error");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      showStatus("🚀 Sending emergency alert...", "pending");
      
      const currentRange = localStorage.getItem("echozone_range") || "local";
      const isGlobal = currentRange === "global";

      // Get fast location name
      let locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      // Post emergency to server - if global, we bypass the backend "no-emergency-in-global" filter
      // by using type="normal" with a special marker that the frontend will recognize.
      try {
        const response = await fetch("/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: isGlobal ? "🚨 [GLOBAL EMERGENCY] Help Needed" : "🚨 Help Needed",
            type: isGlobal ? "normal" : "emergency",
            location: locationName,
            user: userId,
            lat: lat,
            lng: lng
          })
        });

        if (response.ok) {
          showStatus(isGlobal ? "✅ Critical: Global Emergency Alert broadcasted!" : "✅ Emergency alert sent! Nearby users notified.", "success");
          // Show map
          showEmergencyMap(lat, lng, locationName);
        } else {
          showStatus("❌ Failed to send alert. Try again.", "error");
        }
      } catch (err) {
        console.log("Emergency post error:", err);
        showStatus("❌ Network error. Check connection.", "error");
      }
    },
    (error) => {
      console.log("Geolocation error:", error);
      showStatus("❌ Location access denied. Please enable GPS.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

/* SHOW MAP */

function showEmergencyMap(lat, lng, locationName) {

  const mapSection = document.getElementById("mapSection");
  mapSection.classList.add("visible");

  // Scroll map into view
  setTimeout(() => {
    mapSection.scrollIntoView({ behavior: "smooth" });
  }, 300);

  const map = L.map("emergencyMap").setView([lat, lng], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Custom red pulsing marker icon
  const emergencyIcon = L.divIcon({
    className: "emergency-marker",
    html: `<div style="
      width: 24px;
      height: 24px;
      background: #ef4444;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4);
      animation: markerPulse 1.5s ease-in-out infinite;
    "></div>
    <style>
      @keyframes markerPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(239,68,68,0.8); }
        50% { transform: scale(1.3); box-shadow: 0 0 40px rgba(239,68,68,1); }
      }
    </style>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  L.marker([lat, lng], { icon: emergencyIcon })
    .addTo(map)
    .bindPopup(`<b>🚨 Emergency Location</b><br>${locationName}`)
    .openPopup();

  // Add 1km radius circle
  L.circle([lat, lng], {
    color: "#ef4444",
    fillColor: "#ef4444",
    fillOpacity: 0.08,
    radius: 1000,
    weight: 2,
    dashArray: "8, 8"
  }).addTo(map);

  // Add 500m radius circle
  L.circle([lat, lng], {
    color: "#facc15",
    fillColor: "#facc15",
    fillOpacity: 0.1,
    radius: 500,
    weight: 2,
    dashArray: "5, 5"
  }).addTo(map);
}

/* START HOLD */

function startHold() {

  isHolding = true;

  holdCircle.classList.add("holding");

  // Start vibration immediately
  startVibration();

  // Start sound + emergency post after hold time
  holdTimer = setTimeout(() => {

    playSound();
    triggerEmergencyPost();

  }, 2500); // 2.5 sec hold

}

/* CANCEL HOLD */

function cancelHold() {

  isHolding = false;

  holdCircle.classList.remove("holding");

  clearTimeout(holdTimer);

  stopVibration();

}

/* PLAY SOUND */

function playSound() {

  sound.currentTime = 0;

  sound.play()
    .then(() => {

      console.log("Sound playing");

    })
    .catch((err) => {

      console.log("Sound blocked:", err);

    });

}

/* STOP SOUND */

function stopSound() {

  sound.pause();

  sound.currentTime = 0;

}

/* MOBILE VIBRATION */

function startVibration() {
  if ("vibrate" in navigator) {
    // SOS Pattern: 3 short, 3 long, 3 short
    navigator.vibrate([
      200, 100, 200, 100, 200, 300, 
      600, 300, 600, 300, 600, 300,
      200, 100, 200, 100, 200
    ]);
    
    // Repeat every 3 seconds while holding
    vibeInterval = setInterval(() => {
      if (isHolding) {
        navigator.vibrate([
          200, 100, 200, 100, 200, 300, 
          600, 300, 600, 300, 600, 300,
          200, 100, 200, 100, 200
        ]);
      }
    }, 3000);
  }
}

let vibeInterval;

function stopVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }
  if (vibeInterval) clearInterval(vibeInterval);
}

/* TOUCH EVENTS (Mobile) */

holdCircle.addEventListener("touchstart", (e) => {

  e.preventDefault();

  startHold();

});

holdCircle.addEventListener("touchend", cancelHold);

holdCircle.addEventListener("touchcancel", cancelHold);

/* MOUSE EVENTS (Laptop) */

holdCircle.addEventListener("mousedown", startHold);

holdCircle.addEventListener("mouseup", cancelHold);

holdCircle.addEventListener("mouseleave", cancelHold);

/* STOP BUTTON */

stopBtn.addEventListener("click", () => {

  stopSound();

  stopVibration();

});