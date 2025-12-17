document.addEventListener("DOMContentLoaded", function () {
  const ns = window.EonicMemories;
  if (!ns) {
    console.error("EonicMemories namespace not found.");
    return;
  }

  const form = document.getElementById("memories-form");
  const grid = document.getElementById("memories-grid");
  const submitButton = document.getElementById("submit-memories");
  const statusEl = document.getElementById("status-message");
  const progressCountEl = document.getElementById("memories-progress-count");
  const progressBarEl = document.getElementById("memories-progress-bar");

  // Gift details fields
  const fromNameInput = document.getElementById("from-name");
  const toNameInput = document.getElementById("to-name");
  const fromEmailInput = document.getElementById("from-email");

  // Send-direct toggle: show/hide recipient email + toggle required
  (function setupSendDirectToggle() {
    const applyState = () => {
      const toggle = document.getElementById("send-direct-toggle");
      const field = document.getElementById("to-email-field");
      const input = document.getElementById("to-email");
      if (!toggle || !field || !input) return;

      const on = toggle.checked;

      // Native visibility (no CSS fighting)
      field.hidden = !on;
      input.disabled = !on;
      input.required = on;

      if (!on) input.value = "";

      updateFormState();
    };

    // Initialize once on load
    applyState();

    // ✅ THIS is the key line — fires AFTER checked state updates
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "send-direct-toggle") {
        applyState();
      }
    });

    // Keep submit button state live while typing recipient email
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "to-email") {
        updateFormState();
      }
    });
  })();



  // From/To name: char counters (delegated, Webflow-proof)
  (function setupNameCounters() {
    const MAX = 20;

    const render = (id) => {
      const input = document.getElementById(id);
      const counter = document.querySelector(`.memories-char-counter[data-for="${id}"]`);
      if (!input || !counter) return;
      counter.textContent = `${(input.value || "").length}/${MAX}`;
    };

    // Initialize on load (handles autofill / back-button cache)
    render("from-name");
    render("to-name");

    // Update as the user types (delegated)
    document.addEventListener("input", (e) => {
      if (!e.target || !e.target.id) return;

      if (e.target.id === "from-name" || e.target.id === "to-name") {
        render(e.target.id);
        updateFormState();
      }
    });

    // Safety for autofill/change events
    document.addEventListener("change", (e) => {
      if (!e.target || !e.target.id) return;

      if (e.target.id === "from-name" || e.target.id === "to-name") {
        render(e.target.id);
        updateFormState();
      }
    });
  })();

  // Auto-trim From/To names on blur (optional UX polish)
  document.addEventListener(
    "blur",
    (e) => {
      if (!e.target || !e.target.id) return;

      if (e.target.id === "from-name" || e.target.id === "to-name") {
        e.target.value = (e.target.value || "").trim();
      }
    },
    true // capture phase so it always fires
  );


  // Custom message: char counter (optional field) — resilient to Webflow DOM replacement
  (function setupCustomMessageCounter() {
    const MAX = 300;

    const render = () => {
      const input = document.getElementById("custom-message");
      const counter = document.querySelector(
        '.memories-char-counter[data-for="custom-message"]'
      );
      if (!input || !counter) return;

      // Update text directly (span counter)
      counter.textContent = `${(input.value || "").length}/${MAX}`;
    };

    // Initialize once on load
    render();

    // Event delegation: survives Webflow replacing the textarea node
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "custom-message") {
        render();
        updateFormState();
      }
    });

    // Extra safety for autofill/paste edge cases
    document.addEventListener("change", (e) => {
      if (e.target && e.target.id === "custom-message") {
        render();
        updateFormState();
      }
    });
  })();


  const jsonPublicIdField = document.getElementById(
    "cloudinary-json-public-id"
  );
  const jsonUrlField = document.getElementById("cloudinary-json-url");

  // Ensure we have a game session id as soon as the page is ready
  const sessionInput = document.getElementById("game-session-id");
  let sessionId = "";
  if (sessionInput) {

    sessionId = (sessionInput.value || "").trim();
    if (!sessionId) {
      const timestampPart = Date.now().toString(36);
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      sessionId = `eb-mm-${timestampPart}-${randomSuffix}`;


      sessionInput.value = sessionId;

    }
  }

  // Cropper globals
  const cropperModal = document.getElementById("memories-cropper-modal");
  const cropperImage = document.getElementById("cropper-image");
  const cropCancelBtn = document.getElementById("cropper-cancel");
  const cropApplyBtn = document.getElementById("cropper-apply");

  if (!form || !grid) {
    console.error("Memories form or grid not found.");
    return;
  }

  let activeBlock = null;
  let activeFileInput = null;
  let cropper = null;

  // Flags used to coordinate with Webflow's built-in form handler
  let isUploading = false;
  let hasUploadedForThisSubmit = false;

  window.addEventListener("pageshow", () => {
    hasUploadedForThisSubmit = false;
    isUploading = false;
  });


  /**
   * Set status text and optional type (success|error)
   */
  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.remove("error", "success");
    if (type) statusEl.classList.add(type);
  }


  // -----------------------------
  // Validation UI (blur + submit)
  // -----------------------------
  function getFieldWrap(el) {
    return el ? el.closest(".memories-field") : null;
  }

  function ensureErrorEl(fieldWrap) {
    if (!fieldWrap) return null;
    let err = fieldWrap.querySelector(".memories-error");
    if (!err) {
      err = document.createElement("div");
      err.className = "memories-error";
      err.setAttribute("role", "alert");
      // Minimal inline styling so it's visible even if CSS hasn't been updated yet.
      err.style.marginTop = "6px";
      err.style.fontSize = "12px";
      err.style.lineHeight = "1.3";
      err.style.color = "#d33";
      fieldWrap.appendChild(err);
    }
    return err;
  }

  function setFieldError(el, message) {
    const wrap = getFieldWrap(el);
    if (!wrap) return;

    wrap.classList.add("is-invalid");

    // Minimal inline styling so it's visible immediately
    if (el && el.style) {
      el.style.borderColor = "#d33";
      el.style.boxShadow = "0 0 0 2px rgba(211, 51, 51, 0.15)";
    }

    const err = ensureErrorEl(wrap);
    if (err) err.textContent = message || "Please check this field.";
  }

  function clearFieldError(el) {
    const wrap = getFieldWrap(el);
    if (!wrap) return;

    wrap.classList.remove("is-invalid");

    if (el && el.style) {
      el.style.borderColor = "";
      el.style.boxShadow = "";
    }

    const err = wrap.querySelector(".memories-error");
    if (err) err.textContent = "";
  }

  function isVisibleAndEnabled(el) {
    if (!el) return false;
    if (el.disabled) return false;

    const wrap = getFieldWrap(el) || el;

    if (wrap.hidden) return false;
    // If hidden via CSS (display:none), offsetParent will be null (except fixed).
    if (wrap.offsetParent === null && getComputedStyle(wrap).position !== "fixed") return false;

    return true;
  }

  function validateRequired(el, label) {
    if (!isVisibleAndEnabled(el)) {
      // If not visible, clear errors to avoid stale red states.
      clearFieldError(el);
      return true;
    }

    const requiredNow = el.hasAttribute("required");
    const val = (el.value || "").trim();

    if (requiredNow && !val) {
      setFieldError(el, `${label || "This field"} is required.`);
      return false;
    }

    // valid required state
    clearFieldError(el);
    return true;
  }

  function validateEmailDistinctIfNeeded() {
    const toggle = document.getElementById("send-direct-toggle");
    const from = document.getElementById("from-email");
    const to = document.getElementById("to-email");

    // Toggle off: recipient email not required, clear recipient error
    if (!(toggle && toggle.checked)) {
      if (to) clearFieldError(to);
      // Don't clear from-email required errors here.
      return true;
    }

    // Toggle on: recipient email required
    if (to) to.setAttribute("required", "required");

    const fromVal = (from?.value || "").trim().toLowerCase();
    const toVal = (to?.value || "").trim().toLowerCase();

    let ok = true;

    if (to && !toVal) {
      setFieldError(to, "Recipient email is required when send-direct is checked.");
      ok = false;
    }

    if (fromVal && toVal && fromVal === toVal) {
      if (from) setFieldError(from, "Sender and recipient emails must be different.");
      if (to) setFieldError(to, "Sender and recipient emails must be different.");
      ok = false;
    }

    if (ok) {
      // Only clear the “distinct” errors; required errors are handled by validateRequired()
      if (fromVal) clearFieldError(from);
      if (toVal) clearFieldError(to);
    }

    return ok;
  }

  function validateMemoriesBlocks(showPerFieldErrors = true) {
    const blocks = grid.querySelectorAll(".memory-block");
    let ok = true;

    blocks.forEach((block, idx) => {
      const slot = idx + 1;

      const fileInput = block.querySelector(".memory-image-input");
      const titleInput = block.querySelector(".memory-title-input");
      const dateInput = block.querySelector(".memory-date-input");
      const descInput = block.querySelector(".memory-description-input");

      const file = fileInput && fileInput.files && fileInput.files[0];

      if (!file) {
        if (showPerFieldErrors) setFieldError(fileInput, `Please add an image for Memory ${slot}.`);
        ok = false;
      } else {
        if (showPerFieldErrors) clearFieldError(fileInput);
      }

      // These don't have native required attributes, so treat them as required by rule
      const titleVal = (titleInput?.value || "").trim();
      const dateVal = (dateInput?.value || "").trim();
      const descVal = (descInput?.value || "").trim();

      if (!titleVal) {
        if (showPerFieldErrors) setFieldError(titleInput, `Title (Memory ${slot}) is required.`);
        ok = false;
      } else if (showPerFieldErrors) {
        clearFieldError(titleInput);
      }

      if (!dateVal) {
        if (showPerFieldErrors) setFieldError(dateInput, `Month/Year (Memory ${slot}) is required.`);
        ok = false;
      } else if (showPerFieldErrors) {
        clearFieldError(dateInput);
      }

      if (!descVal) {
        if (showPerFieldErrors) setFieldError(descInput, `Description (Memory ${slot}) is required.`);
        ok = false;
      } else if (showPerFieldErrors) {
        clearFieldError(descInput);
      }
    });

    return ok;
  }

  function focusFirstInvalid() {
    // Prefer focusing the first invalid input/textarea/select in DOM order
    const firstInvalidControl = form.querySelector(
      ".memories-field.is-invalid input, .memories-field.is-invalid textarea, .memories-field.is-invalid select"
    );
    const firstInvalidWrap = form.querySelector(".memories-field.is-invalid");

    const target = firstInvalidControl || firstInvalidWrap;
    if (!target) return;

    // Scroll into view first (smooth), then focus without jumping
    try {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (_) { }

    if (typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    } else {
      const focusable = target.querySelector("input,textarea,select,button");
      focusable && focusable.focus && focusable.focus();
    }
  }

  function validateAllAndMark() {
    let ok = true;

    ok = validateRequired(fromNameInput, "From") && ok;
    ok = validateRequired(toNameInput, "To") && ok;
    ok = validateRequired(fromEmailInput, "Email for checkout & game link") && ok;

    // Toggle-specific rules
    ok = validateEmailDistinctIfNeeded() && ok;

    // Memories required by product rules
    ok = validateMemoriesBlocks(true) && ok;

    return ok;
  }

  function setupBlurValidation() {
    // Gift fields
    fromNameInput && fromNameInput.addEventListener("blur", () => validateRequired(fromNameInput, "From"));
    toNameInput && toNameInput.addEventListener("blur", () => validateRequired(toNameInput, "To"));
    fromEmailInput && fromEmailInput.addEventListener("blur", () => {
      validateRequired(fromEmailInput, "Email for checkout & game link");
      validateEmailDistinctIfNeeded();
    });

    // Recipient email field may be hidden/disabled; validate only when relevant
    document.addEventListener(
      "blur",
      (e) => {
        if (!e.target || e.target.id !== "to-email") return;
        validateEmailDistinctIfNeeded();
      },
      true
    );

    // Toggle: re-check distinct rule when switched
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "send-direct-toggle") {
        // Clear/show errors based on new state
        validateEmailDistinctIfNeeded();
      }
    });

    // Memory fields: validate on blur/change (delegated)
    grid.addEventListener(
      "blur",
      (e) => {
        const t = e.target;
        if (!t) return;

        if (t.classList.contains("memory-title-input")) {
          if ((t.value || "").trim()) clearFieldError(t);
          else setFieldError(t, "Title is required.");
        } else if (t.classList.contains("memory-date-input")) {
          if ((t.value || "").trim()) clearFieldError(t);
          else setFieldError(t, "Month/Year is required.");
        } else if (t.classList.contains("memory-description-input")) {
          if ((t.value || "").trim()) clearFieldError(t);
          else setFieldError(t, "Description is required.");
        }
      },
      true
    );

    grid.addEventListener(
      "change",
      (e) => {
        const t = e.target;
        if (!t) return;

        if (t.classList.contains("memory-image-input")) {
          const hasFile = t.files && t.files[0];
          if (hasFile) clearFieldError(t);
          else setFieldError(t, "Please add an image.");
        }
      },
      true
    );
  }

  /**
   * Recompute how many tiles are complete and update progress UI
   */

  /**
   * Recompute how many tiles are complete and update progress UI
   * (No button disabling — validation UI is handled on blur + submit.)
   */
  function updateFormState() {
    const blocks = grid.querySelectorAll(".memory-block");
    let completeCount = 0;

    blocks.forEach((block) => {
      const fileInput = block.querySelector(".memory-image-input");
      const titleInput = block.querySelector(".memory-title-input");
      const dateInput = block.querySelector(".memory-date-input");
      const descInput = block.querySelector(".memory-description-input");

      const file = fileInput && fileInput.files && fileInput.files[0];
      const title = titleInput && titleInput.value.trim();
      const date = dateInput && dateInput.value.trim();
      const desc = descInput && descInput.value.trim();

      const cardComplete = !!file && !!title && !!date && !!desc;

      if (cardComplete) {
        completeCount++;
        block.classList.add("is-complete");
      } else {
        block.classList.remove("is-complete");
      }
    });

    if (progressCountEl) {
      progressCountEl.textContent = String(completeCount);
    }

    if (progressBarEl) {
      const pct = (completeCount / ns.TOTAL_SLOTS) * 100;
      progressBarEl.style.width = pct + "%";
    }

    // Never disable the button for “incomplete”.
    // We only prevent submission inside handleMemoriesSubmit when invalid.
    if (submitButton) {
      submitButton.disabled = false;
    }
  }


  /**
   * Open Cropper modal for a given selected image File
   */
  function openCropper(block, fileInput, file) {
    if (!window.Cropper || !cropperModal || !cropperImage) {
      console.warn(
        "Cropper.js not available, skipping crop step and using original image."
      );
      ns.updatePreview(block, file);
      updateFormState();
      return;
    }

    activeBlock = block;
    activeFileInput = fileInput;

    cropperModal.classList.add("is-open");
    cropperImage.src = "";

    const reader = new FileReader();
    reader.onload = function (e) {
      cropperImage.src = e.target.result;
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      cropper = new Cropper(cropperImage, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 1,
        movable: true,
        zoomable: true,
        rotatable: false,
        scalable: false,
        responsive: true,
      });
    };
    reader.readAsDataURL(file);
  }

  /**
   * Close Cropper modal and clean up
   */
  function closeCropper() {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    if (cropperModal) {
      cropperModal.classList.remove("is-open");
    }
    activeBlock = null;
    activeFileInput = null;
  }

  // Cropper modal buttons
  if (cropCancelBtn) {
    cropCancelBtn.addEventListener("click", function () {
      closeCropper();
    });
  }

  if (cropApplyBtn) {
    cropApplyBtn.addEventListener("click", function () {
      if (!cropper || !activeBlock || !activeFileInput) {
        closeCropper();
        return;
      }

      const canvas = cropper.getCroppedCanvas({
        width: 800,
        height: 800,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      const originalFile = activeFileInput.files[0];
      const croppedFile = ns.dataURLtoFile(
        dataUrl,
        (originalFile && originalFile.name) || "memory.jpg"
      );

      const dt = new DataTransfer();
      dt.items.add(croppedFile);
      activeFileInput.files = dt.files;

      ns.updatePreview(activeBlock, dataUrl);

      // Close first so UI never gets stuck if validation throws
      closeCropper();

      // Then update state (next tick so it runs after the modal DOM changes)
      setTimeout(() => {
        try {
          updateFormState();
        } catch (err) {
          console.error("updateFormState failed after crop apply:", err);
        }
      }, 0);

    });
  }

  /**
   * Attach all listeners to a single memory block
   */
  function attachBlockListeners(block) {
    const fileInput = block.querySelector(".memory-image-input");
    const fileArea = block.querySelector(".memories-file-area");
    const removeBtn = block.querySelector(".memories-file-remove");
    const titleInput = block.querySelector(".memory-title-input");
    const dateInput = block.querySelector(".memory-date-input");
    const descInput = block.querySelector(".memory-description-input");
    const titleCounter = block.querySelector(
      '.memories-char-counter[data-for="title"]'
    );
    const descCounter = block.querySelector(
      '.memories-char-counter[data-for="description"]'
    );

    // Title: char counter
    if (titleInput && titleCounter) {
      ns.updateCharCounter(titleInput, titleCounter, 30);
      titleInput.addEventListener("input", () => {
        ns.updateCharCounter(titleInput, titleCounter, 30);
        updateFormState();
      });
    }

    // Description: char counter
    if (descInput && descCounter) {
      ns.updateCharCounter(descInput, descCounter, 250);
      descInput.addEventListener("input", () => {
        ns.updateCharCounter(descInput, descCounter, 250);
        updateFormState();
      });
    }

    // Date field
    if (dateInput) {
      dateInput.addEventListener("change", updateFormState);
    }

    // File input change
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) {
          ns.updatePreview(block, null);
          updateFormState();
          return;
        }
        openCropper(block, fileInput, file);
      });
    }

    // Click + drag-and-drop on file area
    if (fileArea && fileInput) {
      fileArea.addEventListener("click", (e) => {
        const target = e.target;
        if (
          target &&
          target.classList &&
          target.classList.contains("memories-file-remove")
        ) {
          return;
        }
        fileInput.click();
      });

      fileArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        fileArea.classList.add("is-dragover");
      });

      fileArea.addEventListener("dragleave", (e) => {
        e.preventDefault();
        fileArea.classList.remove("is-dragover");
      });

      fileArea.addEventListener("drop", (e) => {
        e.preventDefault();
        fileArea.classList.remove("is-dragover");
        const files = Array.from(e.dataTransfer?.files || []);
        const imageFile = files.find(
          (f) => f.type && f.type.startsWith("image/")
        );
        if (!imageFile) return;

        const dt = new DataTransfer();
        dt.items.add(imageFile);
        fileInput.files = dt.files;

        openCropper(block, fileInput, imageFile);
      });
    }

    // Remove image
    if (removeBtn && fileInput) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dt = new DataTransfer();
        fileInput.files = dt.files;
        ns.updatePreview(block, null);
        updateFormState();
      });
    }
  }

  /**
   * Build the 8 memory tiles
   */
  for (let i = 1; i <= ns.TOTAL_SLOTS; i++) {
    const block = document.createElement("article");
    block.className = "memory-block";

    block.innerHTML = `
      <div class="memory-inner">
        <div class="memory-title-row">
          <div class="memory-title-label">Memory ${i}</div>
        </div>

        <div class="memories-field">
          <div class="memories-file-area">
            <input
              type="file"
              class="memories-file-input memory-image-input"
              accept="image/*"
            />
            <div class="memories-file-empty">
              <div class="memories-file-empty-icon">📷</div>
              <div class="memories-file-empty-text">Click to upload</div>
            </div>
            <div class="memories-image-preview"></div>
            <button
              type="button"
              class="memories-file-remove"
              aria-label="Remove image"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="memories-field">
          <input
            type="text"
            class="memories-input memory-title-input"
            maxlength="30"
            placeholder="Give this memory a short title"
          />
          <div class="memories-field-footer">
            <span class="memories-char-counter" data-for="title">0/30</span>
          </div>
        </div>

        <div class="memories-field">
          <input
            type="month"
            class="memories-input memory-date-input"
          />
        </div>

        <div class="memories-field">
          <textarea
            class="memories-textarea memory-description-input"
            maxlength="250"
            placeholder="Describe this memory"
          ></textarea>
          <div class="memories-field-footer">
            <span class="memories-char-counter" data-for="description">
              0/250
            </span>
          </div>
        </div>
      </div>
    `;

    grid.appendChild(block);
    attachBlockListeners(block);
  }


  // Initial state
  if (submitButton) submitButton.disabled = false; // ✅ never disabled for incomplete fields
  setupBlurValidation();
  updateFormState();
  setStatus(
    "Add 8 memories with images, titles, months, and descriptions.",
    "success"
  );


  async function captureAndUploadSnapshot() {
    if (!window.html2canvas) {
      throw new Error("html2canvas not loaded");
    }

    // Capture just the memory blocks area.
    // If you want *gift section + memories*, change this selector to a wrapper that contains both.
    const captureEl = document.querySelector(".memories-snapshot-area");
    if (!captureEl) {
      throw new Error("Snapshot capture element not found");
    }

    document.activeElement?.blur?.();

    // Render DOM -> canvas
    const canvas = await window.html2canvas(captureEl, {
      backgroundColor: "#ffffff",
      scale: 2,          // sharper image
      useCORS: true,     // allows external images (Cloudinary) when possible
      allowTaint: false,
      logging: false
    });

    // Convert to Blob for upload
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    if (!blob) throw new Error("Failed to create snapshot blob");

    // Upload to Cloudinary
    const uploaded = await window.EonicMemories.uploadToCloudinary({
      file: blob,
      resourceType: "image",
      folder: window.EonicMemories.CLOUDINARY_SNAPSHOT_FOLDER || "our-matching-memories/snapshots",
      uploadPreset: window.EonicMemories.CLOUDINARY_UPLOAD_PRESET || window.EonicMemories.UPLOAD_PRESET,
      filename: "memory_snapshot.png",
    });

    return uploaded; // has secure_url, public_id, width, height, bytes, format
  }

  function formatMonthYear(input) {
    const [month, year] = input.split('-');
  
    const date = new Date(year, month - 1); // month is 0-based
    return date.toLocaleString('en-US', { month: 'short' }).toUpperCase() + year;
  }

  /**
   * Submit handler (capture phase so we run before Webflow's own handler):
   * - First submit: intercept, upload to Cloudinary, then trigger a second submit
   * - Second submit: let Webflow handle it normally
   */

  async function handleMemoriesSubmit(e) {
    // Second pass (after uploads) → let Webflow handle it normally
    if (hasUploadedForThisSubmit) {
      hasUploadedForThisSubmit = false; // reset for next time
      return; // do NOT preventDefault here
    }

    // Always intercept the first pass
    e.preventDefault();
    e.stopImmediatePropagation(); // ✅ prevents Webflow from submitting right now

    // If an upload is already running, don't start another.
    if (isUploading) {
      setStatus("Uploading in progress… please wait.", "success");
      return;
    }

    // Validate and mark UI errors
    const ok = validateAllAndMark();
    if (!ok) {
      setStatus("Please fix the highlighted fields and try again.", "error");
      focusFirstInvalid();
      return;
    }

    isUploading = true;

    try {
      setStatus("");

      const liveToggle = document.getElementById("send-direct-toggle");
      const sendDirectOn = !!(liveToggle && liveToggle.checked);

      const liveFromEmail = document.getElementById("from-email");
      const liveToEmail = document.getElementById("to-email");

      // --- Collect memories from DOM ---
      const blocks = grid.querySelectorAll(".memory-block");
      if (!blocks || blocks.length !== ns.TOTAL_SLOTS) {
        setStatus("Memories grid is not ready. Please refresh and try again.", "error");
        return;
      }

      // --- Upload images ---
      const sessionIdLocal = (sessionInput?.value || "").trim();
      const memories = [];

      setStatus(`Uploading memories… (0/${ns.TOTAL_SLOTS})`, "success");

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const fileInput = block.querySelector(".memory-image-input");
        const titleInput = block.querySelector(".memory-title-input");
        const dateInput = block.querySelector(".memory-date-input");
        const descInput = block.querySelector(".memory-description-input");

        const file = fileInput.files[0];

        let uploaded;
        try {
          uploaded = await ns.uploadToCloudinary({
            file,
            resourceType: "image",
            folder: ns.CLOUDINARY_FOLDER,
            uploadPreset: ns.CLOUDINARY_UPLOAD_PRESET,
          });
        } catch (err) {
          throw new Error(`Failed to upload image for Memory ${i + 1}`);
        }

        memories.push({
          slot: i + 1,
          title: (titleInput.value || "").trim(),
          date: formatMonthYear((dateInput.value || "").trim()),
          description: (descInput.value || "").trim(),
          secure_url: uploaded.secure_url,
          public_id: uploaded.public_id,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format,
        });

        setStatus(`Uploading memories… (${i + 1}/${ns.TOTAL_SLOTS})`, "success");
      }

      setStatus("Creating your review snapshot…", "success");

      let snapshotUploaded = null;
      try {
        snapshotUploaded = await captureAndUploadSnapshot();
      } catch (err) {
        console.warn("Snapshot generation failed (continuing without it):", err);
      }

      const snapUrlField = document.getElementById("cloudinary-snapshot-url");
      const snapPublicIdField = document.getElementById("cloudinary-snapshot-public-id");

      if (snapshotUploaded) {
        if (snapUrlField) snapUrlField.value = snapshotUploaded.secure_url || "";

        if (snapPublicIdField && snapshotUploaded.public_id) {
          // optional: store filename-only like you do for JSON
          const filenameOnly = String(snapshotUploaded.public_id).split("/").pop();
          snapPublicIdField.value = filenameOnly || "";
        }
      } else {
        if (snapUrlField) snapUrlField.value = "";
        if (snapPublicIdField) snapPublicIdField.value = "";
      }



      // --- Build + upload JSON ---
      const customMessageValue = (document.getElementById("custom-message")?.value || "").trim();

      const jsonPayload = {
        sessionId: sessionIdLocal || null,
        totalMemories: ns.TOTAL_SLOTS,
        fromName: (fromNameInput?.value || "").trim(),
        toName: (toNameInput?.value || "").trim(),
        fromEmail: (liveFromEmail?.value || "").trim(),
        sendDirect: sendDirectOn,
        toEmail: (liveToEmail?.value || "").trim(),
        customMessage: customMessageValue,
        memories,
        snapshot: snapshotUploaded
          ? {
            secure_url: snapshotUploaded.secure_url,
            public_id: snapshotUploaded.public_id,
            width: snapshotUploaded.width,
            height: snapshotUploaded.height,
            bytes: snapshotUploaded.bytes,
            format: snapshotUploaded.format,
          }
          : null,
      };

      const jsonUploaded = await ns.uploadJsonToCloudinary({
        payload: jsonPayload,
        folder: ns.CLOUDINARY_JSON_FOLDER,
        filename: `${sessionIdLocal || "eb-mm"}.json`,
      });

      const jsonPublicIdInput = document.getElementById("cloudinary-json-public-id");
      const jsonUrlInput = document.getElementById("cloudinary-json-url");

      if (jsonPublicIdInput && jsonUploaded.public_id) {
        const filenameOnly = String(jsonUploaded.public_id)
          .split("/")
          .pop()
          .replace(/\.[^.]+$/, "");
        jsonPublicIdInput.value = filenameOnly;
      }

      if (jsonUrlInput) jsonUrlInput.value = jsonUploaded.secure_url || "";

      // --- Trigger Webflow submit as a second pass ---
      hasUploadedForThisSubmit = true;
      form.requestSubmit();
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong while uploading your memories.", "error");
    } finally {
      isUploading = false;
    }
  }




  // NOTE: capture = true so we run before Webflow's own submit handler
  form.addEventListener("submit", handleMemoriesSubmit, true);

  // Terms / Privacy modals — Webflow IX2-safe (force visible styles)
  (function setupPolicyModals() {
    function forceVisible(el) {
      if (!el) return;
      el.style.setProperty("display", "flex", "important");
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("visibility", "visible", "important");
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("pointer-events", "auto", "important");
    }

    function forceHidden(el) {
      if (!el) return;
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.setAttribute("aria-hidden", "true");
    }

    function openModalById(id) {
      const modal = document.getElementById(id);
      if (!modal) return;

      // Show the wrapper
      modal.removeAttribute("hidden");
      modal.setAttribute("aria-hidden", "false");
      forceVisible(modal);

      // Also force the inner content visible (Webflow IX2 often hides it too)
      const content = modal.querySelector(".div-block-47");
      if (content) {
        content.style.setProperty("opacity", "1", "important");
        content.style.setProperty("visibility", "visible", "important");
        content.style.setProperty("transform", "none", "important");
        content.style.setProperty("pointer-events", "auto", "important");
      }

      // And the backdrop
      const backdrop = modal.querySelector(".div-block-38");
      if (backdrop) {
        backdrop.style.setProperty("opacity", "0.7", "important");
        backdrop.style.setProperty("visibility", "visible", "important");
        backdrop.style.setProperty("pointer-events", "auto", "important");
      }
    }

    function closeModal(modal) {
      if (!modal) return;
      forceHidden(modal);
    }

    // Open from consent links: <a data-open-modal="terms-modal">...</a>
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-open-modal]");
      if (!link) return;

      e.preventDefault();
      openModalById(link.getAttribute("data-open-modal"));
    });

    // Close on backdrop or close button inside the modal
    document.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal-wrapper-2");
      if (!modal) return;

      const clickedBackdrop = e.target.closest(".div-block-38");
      const clickedClose = e.target.closest("a.link-block");

      if (clickedBackdrop || clickedClose) {
        e.preventDefault();
        closeModal(modal);
      }
    });

    // ESC closes open modals
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".modal-wrapper-2").forEach((m) => closeModal(m));
    });
  })();

});