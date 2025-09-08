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
        // Prevent the page click
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) {
          off();
          return;
        }

        //Pruning and main logic starts here

        const defaultStylesCache = {};

        function getDefaultStyleObject(tagName) {
          // If it's a custom element (contains a dash), fallback to div
          const normalizedTag = tagName.includes("-") ? "div" : tagName;

          if (defaultStylesCache[normalizedTag])
            return defaultStylesCache[normalizedTag];

          const el = document.createElement(normalizedTag);
          document.body.appendChild(el); // must be in DOM
          const defaultStyles = window.getComputedStyle(el);
          const obj = {};
          for (let i = 0; i < defaultStyles.length; i++) {
            const prop = defaultStyles[i];
            obj[prop] = defaultStyles.getPropertyValue(prop);
          }
          document.body.removeChild(el);

          defaultStylesCache[normalizedTag] = obj;
          return obj;
        }

        // MVP whitelist of computed styles
        const WHITELIST = [
          // Box Model & Layout
          "width",
          "height",
          "margin-top",
          "margin-right",
          "margin-bottom",
          "margin-left",
          "padding-top",
          "padding-right",
          "padding-bottom",
          "padding-left",
          "border-top-width",
          "border-right-width",
          "border-bottom-width",
          "border-left-width",
          "border-top-style",
          "border-right-style",
          "border-bottom-style",
          "border-left-style",
          "border-top-color",
          "border-right-color",
          "border-bottom-color",
          "border-left-color",
          "border-radius",
          "box-sizing",
          "display",
          "position",
          "top",
          "right",
          "bottom",
          "left",
          "z-index",
          "overflow",
          // Backgrounds & Effects
          "background-color",
          "background-image",
          "background-repeat",
          "background-position",
          "background-size",
          "box-shadow",
          "opacity",
          // Typography
          "color",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "word-spacing",
          "text-align",
          "text-decoration",
          "text-transform",
          "white-space",
          "vertical-align",
          "text-shadow",
          // Transforms & Filters
          "transform",
          "transform-origin",
          "filter",
          // Layout Systems
          "flex-direction",
          "justify-content",
          "align-items",
          "align-content",
          "gap",
          "grid-template-columns",
          "grid-template-rows",
          "grid-column-gap",
          "grid-row-gap",
          "place-items",
        ];

        function getFilteredStyleObject(element) {
          const tagName = element.tagName.toLowerCase();
          console.log(tagName);
          const normalizedTag = tagName.includes("-") ? "div" : tagName;

          const style = window.getComputedStyle(element);
          const defaults = getDefaultStyleObject(normalizedTag);
          const obj = {};

          WHITELIST.forEach((prop) => {
            // Skip font-family and "d"
            if (prop === "font-family" || prop === "d") return;

            const val = style.getPropertyValue(prop).replace(/"/g, "'");
            const defVal = defaults[prop];

            // Only keep properties that differ from defaults
            if (val !== defVal) {
              obj[prop] = val;
            }
          });

          return obj;
        }

        function serializeElement(element) {
          const tagName = element.tagName.toLowerCase();
          const normalizedTag = tagName.includes("-") ? "div" : tagName;

          // Full info object
          const info = {
            tag: normalizedTag,
            attributes: {},
            styles: getFilteredStyleObject(element), // filtered!
            children: [],
          };

          // Minimal dom object
          const dom = {
            tag: normalizedTag,
            children: [],
          };

          // Handle text content (only for info)
          if (
            element.childNodes.length === 1 &&
            element.childNodes[0].nodeType === Node.TEXT_NODE
          ) {
            info.textContent = element.textContent.trim();
          }

          // Whitelist attributes
          const visualAttributes = new Set([
            "placeholder",
            "title",
            "alt",
            "value",
            "checked",
            "selected",
            "disabled",
            "readonly",
            "multiple",
            "required",
            "poster",
            "controls",
            "autoplay",
            "loop",
            "muted",
            "src",
            "href",
          ]);

          for (const attr of element.attributes || []) {
            if (!visualAttributes.has(attr.name)) continue;

            if (attr.name === "d") {
              info.attributes[attr.name] = "M0 0h24v24H0z";
              continue;
            }

            info.attributes[attr.name] = attr.value;
          }

          // Recurse for children
          for (const child of element.children) {
            const childResult = serializeElement(child);
            info.children.push(childResult.info);
            dom.children.push(childResult.dom);
          }

          return { info, dom };
        }

        //Pruning logic ends here

        // Copy JSON safely to clipboard
        function toClipBoard(obj) {
          const json = JSON.stringify(obj, null, 2); // pretty print, escapes quotes
          navigator.clipboard.writeText(json).then(
            () => console.log("✅ JSON copied to clipboard"),
            (err) => console.error("❌ Failed to copy:", err)
          );
        }

        const data = serializeElement(el);
        toClipBoard(data);

        // Turn off overlay
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
