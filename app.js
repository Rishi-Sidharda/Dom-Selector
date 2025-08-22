// Runs in the popup. Injects a function into the active tab that toggles the selector.
document.getElementById("toggle").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    // Inject a self-contained function so we only need this single JS file.
    func: () => {
      // Toggle OFF if already active
      if (window.__domSelector?.active) {
        window.__domSelector.off();
        return;
      }

      // Create highlight overlay
      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "fixed",
        top: "0px",
        left: "0px",
        width: "0px",
        height: "0px",
        pointerEvents: "none",
        zIndex: "2147483647",
        boxShadow: "0 0 0 2px #4c9ffe, 0 0 12px 2px rgba(76,159,254,.35) inset",
        background: "rgba(76,159,254,.12)",
        borderRadius: "4px",
        transition: "all 60ms ease",
      });

      // Small crosshair that follows the cursor (optional but nice)
      const dot = document.createElement("div");
      Object.assign(dot.style, {
        position: "fixed",
        width: "8px",
        height: "8px",
        marginLeft: "-4px",
        marginTop: "-4px",
        pointerEvents: "none",
        borderRadius: "50%",
        background: "#4c9ffe",
        boxShadow: "0 0 0 2px white, 0 0 10px rgba(0,0,0,.2)",
        zIndex: "2147483647",
      });

      // Utility to update overlay to hovered element
      function updateBoxFor(el) {
        if (!el || el === box || el === dot) return;
        const r = el.getBoundingClientRect();
        // Skip if element not visible or size is 0
        if (r.width <= 0 || r.height <= 0) return;
        box.style.top = `${Math.max(
          0,
          r.top + window.scrollY - window.scrollY
        )}px`;
        box.style.left = `${Math.max(
          0,
          r.left + window.scrollX - window.scrollX
        )}px`;
        box.style.width = `${r.width}px`;
        box.style.height = `${r.height}px`;
      }

      function onMove(e) {
        // Move the dot to the cursor
        dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;

        // Which element is under the cursor?
        const el = document.elementFromPoint(e.clientX, e.clientY);
        updateBoxFor(el);
      }

      function off() {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("click", onClick, true);
        window.removeEventListener("keydown", onKey, true);
        box.remove();
        dot.remove();
        window.__domSelector = { active: false, off };
      }

      function onClick(e) {
        // Prevent the page click and turn off
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        off();
      }

      function onKey(e) {
        // ESC to cancel without clicking
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          off();
        }
      }

      // Initialize
      document.documentElement.appendChild(box);
      document.documentElement.appendChild(dot);
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("click", onClick, true);
      window.addEventListener("keydown", onKey, true);

      // Mark active with a global so we can toggle from the popup
      window.__domSelector = { active: true, off };
    },
  });
});
