// emergency.js

const holdCircle = document.getElementById("holdCircle");
const stopBtn = document.getElementById("stopAlarm");
const sound = document.getElementById("emergencySound");

let holdTimer;
let isHolding = false;

/* MOBILE SOUND SETTINGS */

sound.loop = true;
sound.volume = 1.0;

/* START HOLD */

function startHold() {

  isHolding = true;

  holdCircle.classList.add("holding");

  // Start vibration immediately
  startVibration();

  // Start sound after hold time
  holdTimer = setTimeout(() => {

    playSound();

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

    navigator.vibrate([
      400,
      200,
      400,
      200,
      800,
      200,
      400
    ]);

  }

}

function stopVibration() {

  if ("vibrate" in navigator) {

    navigator.vibrate(0);

  }

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