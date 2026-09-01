"use strict";

// Presence packets are frequent (join/leave/typing heartbeats). The legacy LOG
// runtime calls renderComments() for every packet, even when neither comments nor
// typing indicators changed. Keep the existing renderer and UI, but skip exact
// no-op rerenders so presence traffic does not rebuild the whole comments column.
(() => {
  if (typeof renderComments !== "function" || renderComments.__jijinPresenceGuard) return;
  const rawRenderComments = renderComments;
  let lastAnnotationKey = "";
  let lastTypingKey = "";

  const annotationKey = () => {
    const list = Array.isArray(state?.annotations) ? state.annotations : [];
    return `${Number(state?.annotationVersion) || 0}:${list.length}`;
  };

  const typingKey = () => {
    const people = Array.isArray(state?.presence) ? state.presence : [];
    return people
      .filter(person => person?.is_typing && person?.typing_message_id)
      .map(person => `${person.author_id || person.client_id || person.pl_name || ""}|${person.typing_message_id || ""}|${person.typing_name || person.pl_name || ""}|${person.typing_icon || ""}`)
      .sort()
      .join("\n");
  };

  const guarded = function(...args) {
    const nextAnnotationKey = annotationKey();
    const nextTypingKey = typingKey();
    if (nextAnnotationKey === lastAnnotationKey && nextTypingKey === lastTypingKey) return;
    lastAnnotationKey = nextAnnotationKey;
    lastTypingKey = nextTypingKey;
    return rawRenderComments.apply(this, args);
  };

  guarded.__jijinPresenceGuard = true;
  guarded.__jijinRaw = rawRenderComments;
  renderComments = guarded;
})();
