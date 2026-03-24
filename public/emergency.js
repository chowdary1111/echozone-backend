// 🚨 Emergency Hold System

let holdButton = document.querySelector(".hold-button");
let timerText = document.getElementById("time");
let cancelButton = document.getElementById("cancel-btn");

let holdTime = 10;
let interval;



// HOLD START
holdButton.addEventListener("mousedown", startHold);
holdButton.addEventListener("touchstart", startHold);

// HOLD RELEASE
holdButton.addEventListener("mouseup", cancelHold);
holdButton.addEventListener("mouseleave", cancelHold);
holdButton.addEventListener("touchend", cancelHold);

function startHold() {

    holdTime = 10;

    timerText.innerText =
    "Activating in " + holdTime + " seconds...";

    interval = setInterval(() => {

        holdTime--;

        timerText.innerText =
        "Activating in " + holdTime + " seconds...";

        if (holdTime <= 0) {

            clearInterval(interval);

            activateEmergency();

        }

    }, 1000);

}

function cancelHold() {

    clearInterval(interval);

    timerText.innerText =
    "Hold the circle to activate emergency";

}

function activateEmergency() {

    timerText.innerText =
    "🚨 EMERGENCY ACTIVATED";

   document.getElementById("alarmSound").play();

}

cancelButton.addEventListener("click", () => {

    clearInterval(interval);

    timerText.innerText =
    "Emergency Cancelled";

  document.getElementById("alarmSound").pause();
});
function stopAlarm() {

const alarm = document.getElementById("alarmSound");

if (alarm) {

alarm.pause();
alarm.currentTime = 0;

}

}