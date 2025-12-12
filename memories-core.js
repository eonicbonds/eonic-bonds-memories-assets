// Namespace for Eonic Bonds memories logic
window.EonicMemories = window.EonicMemories || {};

(function (ns) {
  // Config
  ns.TOTAL_SLOTS = 8;

  // Cloudinary config
  ns.CLOUD_NAME = "dfrolhhx9";
  ns.UPLOAD_PRESET = "memory_game_upload";

  /**
   * Update character counter for a text input/textarea
   */
  ns.updateCharCounter = function (inputEl, counterEl, max) {
    if (!inputEl || !counterEl) return;
    const length = inputEl.value.length;
    counterEl.textContent = length + "/" + max;
  };

  /**
   * Render image preview inside a memory block
   * source: File | dataURL string | null
   */
  ns.updatePreview = function (block, source) {
    if (!block) return;

    const preview = block.querySelector(".memories-image-preview");
    const emptyState = block.querySelector(".memories-file-empty");
    const fileArea = block.querySelector(".memories-file-area");
    const removeBtn = block.querySelector(".memories-file-remove");

    if (!preview || !fileArea || !emptyState || !removeBtn) return;

    preview.innerHTML = "";

    if (!source) {
      fileArea.classList.remove("has-image");
      emptyState.style.display = "flex";
      removeBtn.classList.remove("visible");
      return;
    }

    const img = document.createElement("img");
    img.className = "memories-image-preview-img";

    if (typeof source === "string") {
      img.src = source;
      preview.appendChild(img);
    } else {
      const reader = new FileReader();
      reader.onload = function (e) {
        img.src = e.target.result;
        preview.appendChild(img);
      };
      reader.readAsDataURL(source);
    }

    fileArea.classList.add("has-image");
    emptyState.style.display = "none";
    removeBtn.classList.add("visible");
  };

  /**
   * Convert dataURL to File object
   */
  ns.dataURLtoFile = function (dataUrl, filename) {
    const arr = dataUrl.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };
})(window.EonicMemories);
