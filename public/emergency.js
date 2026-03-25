// emergency.js

const holdCircle = document.getElementById('holdCircle');
const stopAlarmBtn = document.getElementById('stopAlarm');
const emergencySound = document.getElementById('emergencySound');

let holdTimer = null;
let vibrationInterval = null;
const HOLD_DURATION = 2500;

function canVibrate() {
  return 'vibrate' in navigator;
}

function shortHaptic() {
  if (canVibrate()) navigator.vibrate(60);
}

function startPulsingHaptic() {
  if (!canVibrate()) return;
  stopHaptic();
  vibrationInterval = setInterval(() => navigator.vibrate([90, 130]), 420);
}

function stopHaptic() {
  if (canVibrate()) navigator.vibrate(0);
  if (vibrationInterval) clearInterval(vibrationInterval);
}

function activationHaptic() {
  if (canVibrate()) navigator.vibrate([180, 90, 280, 120, 180]);
}

function playEmergencySound() {
  emergencySound.volume = 1;
  emergencySound.loop = true;
  emergencySound.play().catch(err => console.error("Sound blocked:", err));
}

function stopEmergencySound() {
  emergencySound.pause();
  emergencySound.currentTime = 0;
}

function startHold(e) {
  e.preventDefault();
  shortHaptic();
  startPulsingHaptic();

  holdTimer = setTimeout(() => {
    stopHaptic();
    activationHaptic();
    console.log("🚨 EMERGENCY ACTIVATED!");
    playEmergencySound();
    alert("🚨 EMERGENCY ACTIVATED!\nSound is playing.");
  }, HOLD_DURATION);
}

function cancelHold() {
  stopHaptic();
  if (holdTimer) clearTimeout(holdTimer);
}

holdCircle.addEventListener('mousedown', startHold);
holdCircle.addEventListener('touchstart', startHold);
holdCircle.addEventListener('mouseup', cancelHold);
holdCircle.addEventListener('mouseleave', cancelHold);
holdCircle.addEventListener('touchend', cancelHold);
holdCircle.addEventListener('touchcancel', cancelHold);

stopAlarmBtn.addEventListener('click', () => {
  cancelHold();
  stopEmergencySound();
  if (canVibrate()) navigator.vibrate([70, 50, 70]);
  alert("Emergency stopped.");
});