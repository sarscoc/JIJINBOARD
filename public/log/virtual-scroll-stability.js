"use strict";

// Virtual rows are replaced while scrolling. Disable browser scroll anchoring on
// that region and normalize wheel input so a small wheel/touchpad gesture never
// turns into a multi-screen jump.
(() => {
  const style = document.createElement("style");
  style.textContent = `.virtual-page .page-scroll{overflow-anchor:none}.virtual-page .virtual-spacer-top,.virtual-page .virtual-spacer-bottom,.virtual-page .virtual-rows{overflow-anchor:none}`;
  document.head.appendChild(style);

  document.addEventListener("wheel", event => {
    const scroll = event.target?.closest?.(".virtual-page .page-scroll");
    if (!scroll || event.ctrlKey) return;
    let delta = event.deltaY;
    if (!delta) return;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 22;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= scroll.clientHeight;
    const limit = Math.max(72, scroll.clientHeight * .22);
    const step = Math.sign(delta) * Math.min(Math.abs(delta) * .55, limit);
    event.preventDefault();
    scroll.scrollTop += step;
  }, {capture:true, passive:false});
})();
