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

  /**
   * Recompute how many tiles are complete and update progress UI
   */
  function updateFormState() {
    const blocks = grid.querySelectorAll(".memory-block");
    let completeCount = 0;

    blocks.forEach((block) => {
      const fileInput = block.querySelector(".memory-image-input");
      const titleInput = block.querySelector(".memory-title-input");
      const dateInput = block.querySelector(".memory-date-input");
      const descInput = block.querySelector(".memory-description-input");

      const file = fileInput && fileInput.files[0];
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

    // ✅ New: Validate gift fields
    let allGiftFieldsValid = true;
    const isFilled = (input) =>
      input && input.value && input.value.trim().length > 0;

    if (!isFilled(fromNameInput)) allGiftFieldsValid = false;
    if (!isFilled(toNameInput)) allGiftFieldsValid = false;
    if (!isFilled(fromEmailInput)) allGiftFieldsValid = false;

    const toggle = document.getElementById("send-direct-toggle");
    const fromEmail = document.getElementById("from-email");
    const recipient = document.getElementById("to-email");

    if (toggle && toggle.checked) {
      if (!isFilled(recipient)) allGiftFieldsValid = false;

      const fromVal = (fromEmail?.value || "").trim().toLowerCase();
      const toVal = (toEmail?.value || "").trim().toLowerCase();

      if (fromVal && toVal && fromVal === toVal) {
        allGiftFieldsValid = false;
      }
    }


    if (progressCountEl) {
      progressCountEl.textContent = String(completeCount);
    }

    if (progressBarEl) {
      const pct = (completeCount / ns.TOTAL_SLOTS) * 100;
      progressBarEl.style.width = pct + "%";
    }

    if (submitButton) {
      const ready = completeCount === ns.TOTAL_SLOTS && allGiftFieldsValid;
      submitButton.disabled = !ready;
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
  if (submitButton) submitButton.disabled = true;
  updateFormState();
  setStatus(
    "Add 8 memories with images, titles, months, and descriptions.",
    "success"
  );

  /**
   * Submit handler (capture phase so we run before Webflow's own handler):
   * - First submit: intercept, upload to Cloudinary, then trigger a second submit
   * - Second submit: let Webflow handle it normally
   */
  async function handleMemoriesSubmit(e) {
    if (hasUploadedForThisSubmit) {
      // second pass: allow Webflow to submit normally, but don't "stick" true forever
      hasUploadedForThisSubmit = false;
      return; // don't preventDefault on this pass
    }


    e.preventDefault();

    if (isUploading) return;
    isUploading = true;

    if (submitButton) submitButton.disabled = true;

    // ✅ New: Guard for gift fields so we don't start uploads if they're empty
    if (fromNameInput && toNameInput && fromEmailInput) {
      if (
        !fromNameInput.value.trim() ||
        !toNameInput.value.trim() ||
        !fromEmailInput.value.trim()
      ) {
        setStatus(
          "Please fill in who the game is from, who it’s for, and the email before continuing.",
          "error"
        );
        if (submitButton) submitButton.disabled = false;
        isUploading = false;
        return;
      }
    }

    // ✅ New: Send-direct guard (recipient email required if toggle is on)
    const liveToggle = document.getElementById("send-direct-toggle");
    const liveRecipient = document.getElementById("to-email");
    const sendDirectOn = liveToggle && liveToggle.checked;

    if (sendDirectOn) {
      if (!liveRecipient || !liveRecipient.value.trim()) {
        setStatus(
          "Please enter your recipient’s email (or turn off the send-direct option) before continuing.",
          "error"
        );
        if (submitButton) submitButton.disabled = false;
        isUploading = false;
        return;
      }
    }

    // ✅ New: Send-direct guard (from_email and to_email must be different)
    if (sendDirectOn) {
      const liveFrom = document.getElementById("from-email");
      const fromVal = (liveFrom?.value || "").trim().toLowerCase();
      const toVal = (liveRecipient?.value || "").trim().toLowerCase();

      if (fromVal && toVal && fromVal === toVal) {
        setStatus(
          "Sender email and recipient email must be different. Please use two different email addresses (or turn off the send-direct option).",
          "error"
        );
        if (submitButton) submitButton.disabled = false;
        isUploading = false;
        return;
      }
    }

    if (submitButton) submitButton.disabled = true;

    const memories = [];

    // Verify all slots complete
    for (let i = 1; i <= ns.TOTAL_SLOTS; i++) {
      const slot = memoryData[i];
      if (!slot || !slot.title || !slot.date || !slot.description || !slot.blob) {
        setStatus(
          "Please complete all memories before uploading.",
          "error"
        );
        if (submitButton) submitButton.disabled = false;
        isUploading = false;
        return;
      }
    }

    setStatus("Uploading memories… (0/" + ns.TOTAL_SLOTS + ")", "success");

    try {
      const sessionInput = document.getElementById("game-session-id");
      const sessionId = sessionInput ? (sessionInput.value || "").trim() : "";

      // Upload each memory image to Cloudinary
      for (let i = 1; i <= ns.TOTAL_SLOTS; i++) {
        const slot = memoryData[i];

        const uploaded = await ns.uploadToCloudinary(slot.blob, {
          folder: ns.CLOUDINARY_FOLDER,
          uploadPreset: ns.CLOUDINARY_UPLOAD_PRESET,
        });

        memories.push({
          slot: i,
          title: slot.title,
          date: slot.date,
          description: slot.description,
          secure_url: uploaded.secure_url,
          public_id: uploaded.public_id,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format,
        });

        setStatus(
          "Uploading memories… (" + i + "/" + ns.TOTAL_SLOTS + ")",
          "success"
        );
      }

      // Build JSON payload
      const customMessageValue = customMessageInput
        ? (customMessageInput.value || "").trim()
        : "";

      const jsonPayload = {
        sessionId: sessionId || null,
        totalMemories: ns.TOTAL_SLOTS,
        fromName: fromNameInput ? (fromNameInput.value || "").trim() : "",
        toName: toNameInput ? (toNameInput.value || "").trim() : "",
        fromEmail: fromEmailInput ? (fromEmailInput.value || "").trim() : "",
        sendDirect: !!(liveToggle && liveToggle.checked),
        toEmail: liveRecipient ? (liveRecipient.value || "").trim() : "",
        customMessage: customMessageValue,
        memories,
      };

      // Upload JSON to Cloudinary
      const jsonUploaded = await ns.uploadJsonToCloudinary(jsonPayload, {
        folder: ns.CLOUDINARY_JSON_FOLDER,
        uploadPreset: ns.CLOUDINARY_UPLOAD_PRESET,
      });

      // Populate hidden fields for Zapier/Webflow
      const jsonPublicIdInput = document.getElementById("cloudinary-json-public-id");
      const jsonUrlInput = document.getElementById("cloudinary-json-url");

      if (jsonPublicIdInput && jsonUploaded.public_id) {
        const fullId = jsonUploaded.public_id;

        // Strip folders and extension:
        // "our-matching-memories/json/abc123.json" → "abc123"
        const filenameOnly = fullId
          .split("/")                // take last path segment
          .pop()
          .replace(/\.[^.]+$/, "");  // remove extension

        jsonPublicIdInput.value = filenameOnly;
      }

      if (jsonUrlInput) jsonUrlInput.value = jsonUploaded.secure_url || "";

      // Mark that uploads are done for THIS submit click
      hasUploadedForThisSubmit = true;

      // Now allow native Webflow submit to proceed by programmatically submitting
      form.requestSubmit();

    } catch (err) {
      console.error(err);
      setStatus(
        "Something went wrong while uploading your memories.",
        "error"
      );
      if (submitButton) submitButton.disabled = false;
    } finally {
      isUploading = false;
      // Important: if we failed, allow retry; if we succeeded, keep hasUploadedForThisSubmit true
      if (!hasUploadedForThisSubmit) {
        hasUploadedForThisSubmit = false;
      }
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