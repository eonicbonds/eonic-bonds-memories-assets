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
  const emailInput = document.getElementById("player-email");
  const customMessageInput = document.getElementById("custom-message");

  // Custom message: char counter (optional field)
  if (customMessageInput) {
    const getOrCreateCustomCounter = () => {
      // Prefer a counter inside the same field block (most reliable)
      const wrap = customMessageInput.closest(".memories-custom-message-field");
      let counter =
        (wrap && wrap.querySelector(".memories-char-counter")) ||
        document.querySelector('.memories-char-counter[data-for="custom-message"]');

      // If not found, create one so the feature still works
      if (!counter && wrap) {
        let footer = wrap.querySelector(".memories-field-footer");
        if (!footer) {
          footer = document.createElement("div");
          footer.className = "memories-field-footer";
          wrap.appendChild(footer);
        }

        counter = document.createElement("span");
        counter.className = "memories-char-counter";
        counter.setAttribute("data-for", "custom-message");
        footer.appendChild(counter);
      }

      return counter;
    };

    const renderCustomCounter = () => {
      const counterEl = getOrCreateCustomCounter();
      if (counterEl) ns.updateCharCounter(customMessageInput, counterEl, 300);
    };

    // initialize on page load
    renderCustomCounter();

    // update as user types
    customMessageInput.addEventListener("input", () => {
      renderCustomCounter();
      updateFormState();
    });
  }




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
    if (!isFilled(emailInput)) allGiftFieldsValid = false;

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
      updateFormState();
      closeCropper();
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
    // Second submit (after uploads) → let Webflow handle it
    if (hasUploadedForThisSubmit) {
      hasUploadedForThisSubmit = false; // reset for next submission
      return;
    }

    // First submit: intercept and run the Cloudinary pipeline
    e.preventDefault();
    e.stopImmediatePropagation();

    if (isUploading) return;
    isUploading = true;
    setStatus("");

    if (!ns.CLOUD_NAME || !ns.UPLOAD_PRESET) {
      setStatus(
        "Cloudinary configuration missing. Please contact support.",
        "error"
      );
      isUploading = false;
      return;
    }
    
    // Use the session id we generated on page load
    sessionId = sessionInput ? (sessionInput.value || "").trim() : "";

    const blocks = grid.querySelectorAll(".memory-block");

    // Guard: ensure all tiles are complete
    let allComplete = true;
    blocks.forEach((block) => {
      const fileInput = block.querySelector(".memory-image-input");
      const titleInput = block.querySelector(".memory-title-input");
      const dateInput = block.querySelector(".memory-date-input");
      const descInput = block.querySelector(".memory-description-input");

      const file = fileInput && fileInput.files[0];
      const title = titleInput && titleInput.value.trim();
      const date = dateInput && dateInput.value.trim();
      const desc = descInput && descInput.value.trim();

      if (!file || !title || !date || !desc) {
        allComplete = false;
      }
    });

    if (!allComplete) {
      setStatus(
        "Please complete all 8 memories with image, title, month/year, and description.",
        "error"
      );
      isUploading = false;
      return;
    }

    // ✅ New: Guard for gift fields so we don't start uploads if they're empty
    if (
      fromNameInput &&
      toNameInput &&
      emailInput
    ) {
      if (
        !fromNameInput.value.trim() ||
        !toNameInput.value.trim() ||
        !emailInput.value.trim()
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


    if (submitButton) submitButton.disabled = true;

    const memories = [];

    try {
      setStatus("Uploading memories… (0/" + ns.TOTAL_SLOTS + ")", "success");

      let uploadedCount = 0;

      // Upload each image
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const memoryNumber = i + 1;
        const fileInput = block.querySelector(".memory-image-input");
        const titleInput = block.querySelector(".memory-title-input");
        const dateInput = block.querySelector(".memory-date-input");
        const descInput = block.querySelector(".memory-description-input");

        const file = fileInput.files[0];
        const title = titleInput.value.trim();
        const date = dateInput.value.trim();
        const description = descInput.value.trim();

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", ns.UPLOAD_PRESET);
        formData.append("folder", "our-matching-memories/images");
        formData.append(
          "context",
          `memory_number=${memoryNumber}|title=${title}|date=${date}|description=${description}`
        );
        const tags = ["our-matching-memories"];
        if (sessionId) tags.push(sessionId);
        formData.append("tags", tags.join(","));

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${ns.CLOUD_NAME}/image/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!res.ok) {
          const text = await res.text();
          console.error("Cloudinary upload failed:", text);
          throw new Error("Upload failed for Memory " + memoryNumber);
        }

        const data = await res.json();

        memories.push({
          memoryNumber,
          title,
          date,
          description,
          imageUrl: data.secure_url,
          publicId: data.public_id,
          width: data.width,
          height: data.height,
        });

        uploadedCount++;
        setStatus(
          "Uploading memories… (" + uploadedCount + "/" + ns.TOTAL_SLOTS + ")",
          "success"
        );
      }

      // Sort by date asc, then memoryNumber
      memories.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.memoryNumber - b.memoryNumber;
      });

      const payload = {
        sessionId: sessionId || null,
        totalMemories: memories.length,
        memories,
      };

      setStatus("Uploading JSON summary…", "success");

      // Upload JSON payload as raw file to Cloudinary
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const jsonFormData = new FormData();
      jsonFormData.append("file", jsonBlob, "memories.json");
      jsonFormData.append("upload_preset", ns.UPLOAD_PRESET);
      jsonFormData.append("folder", "our-matching-memories/json");
      const jsonTags = ["our-matching-memories-json"];
      if (sessionId) jsonTags.push(sessionId);
      jsonFormData.append("tags", jsonTags.join(","));

      const jsonRes = await fetch(
        `https://api.cloudinary.com/v1_1/${ns.CLOUD_NAME}/raw/upload`,
        {
          method: "POST",
          body: jsonFormData,
        }
      );

      if (!jsonRes.ok) {
        const text = await jsonRes.text();
        console.error("Cloudinary JSON upload failed:", text);
        throw new Error("Upload failed for memories JSON.");
      }

      const jsonData = await jsonRes.json();

      // Populate hidden fields for Zapier/Webflow
      if (jsonPublicIdField) jsonPublicIdField.value = jsonData.public_id;
      if (jsonUrlField) jsonUrlField.value = jsonData.secure_url;

      setStatus(
        "All memories uploaded! Finishing your submission…",
        "success"
      );

      // Mark that we've finished the Cloudinary side for this submit
      hasUploadedForThisSubmit = true;
      isUploading = false;

      // Trigger a *new* submit event that Webflow's handler will catch
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        const evt = new Event("submit", {
          bubbles: true,
          cancelable: true,
        });
        form.dispatchEvent(evt);
      }
    } catch (err) {
      console.error(err);
      setStatus(
        err && err.message
          ? err.message
          : "Something went wrong while uploading your memories.",
        "error"
      );
      if (submitButton) submitButton.disabled = false;
      isUploading = false;
      hasUploadedForThisSubmit = false;
    }
  }

  // NOTE: capture = true so we run before Webflow's own submit handler
  form.addEventListener("submit", handleMemoriesSubmit, true);
});
