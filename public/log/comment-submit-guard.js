"use strict";

// LOGCOMMENTS realtime is event-driven. If the websocket drops, reconnect from
// that close/error event, but never start a periodic annotation-version poll in
// the background. Data is fetched only after a realtime change notification.
try {
  if(typeof stopFallbackPolling==="function")stopFallbackPolling();
  if(typeof startFallbackPolling==="function"){
    startFallbackPolling=function(){
      try{clearInterval(state?.fallbackPoller);state.fallbackPoller=null}catch{}
    };
    window.startFallbackPolling=startFallbackPolling;
  }
} catch {}

// The profile editor embedded inside the board settings is only an editor. It
// must not become a second live LOGCOMMENTS client for the same PL/room.
try {
  const profileOnlyFrame=parent!==window&&window.frameElement?.parentElement?.id==="boardSpeakerSlot";
  if(profileOnlyFrame&&typeof disconnectRealtime==="function"){
    const disableRealtime=()=>{
      try{state.realtimeWanted=false;disconnectRealtime()}catch{}
    };
    connectRealtime=disableRealtime;
    window.connectRealtime=disableRealtime;
    disableRealtime();
  }
} catch {}

// Guard against accidental duplicate posts from rapid clicks / outside-click autosave.
// This does not change the comment UI or payload; it only serializes form submission.
(() => {
  const form = document.querySelector("#commentForm");
  const dialog = document.querySelector("#commentDialog");
  if (!form || !dialog) return;

  let submitting = false;
  let fallbackTimer = 0;

  function setSubmitting(value) {
    submitting = value;
    form.dataset.submitting = value ? "1" : "0";
    form.querySelectorAll('button[type="submit"],input[type="submit"]').forEach(control => {
      control.disabled = value;
    });
    if (!value && fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
  }

  form.addEventListener("submit", event => {
    if (submitting) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    setSubmitting(true);
    // postComment normally closes the dialog on success. If the request fails and the
    // dialog stays open, allow a deliberate retry after a short safety window.
    fallbackTimer = setTimeout(() => {
      if (dialog.open) setSubmitting(false);
    }, 3500);
  }, true);

  dialog.addEventListener("close", () => setSubmitting(false));
})();
