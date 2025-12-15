// Namespace for Eonic Bonds memories logic
window.EonicMemories = window.EonicMemories || {};

(function (ns) {
  // Config
  ns.TOTAL_SLOTS = 8;

  // Cloudinary config
  ns.CLOUD_NAME = "dfrolhhx9";
  ns.UPLOAD_PRESET = "memory_game_upload";

  // Optional aliases used by memories-page.js
  ns.CLOUDINARY_UPLOAD_PRESET = ns.UPLOAD_PRESET;

  // Folders (adjust as you prefer)
  ns.CLOUDINARY_FOLDER = "our-matching-memories/images";
  ns.CLOUDINARY_JSON_FOLDER = "our-matching-memories/json";
  ns.CLOUDINARY_SNAPSHOT_FOLDER = "our-matching-memories/snapshots";



  /**
 * Upload a file/blob to Cloudinary.
 * resourceType: "image" | "raw"
 */
  ns.uploadToCloudinary = async function ({
    file,
    resourceType = "image",
    folder,
    uploadPreset,
    tags,
    context,
    filename,
  }) {
    if (!ns.CLOUD_NAME || !(uploadPreset || ns.UPLOAD_PRESET)) {
      throw new Error("Cloudinary config missing (CLOUD_NAME / UPLOAD_PRESET).");
    }
    if (!file) throw new Error("No file provided to uploadToCloudinary.");

    const endpoint =
      resourceType === "raw"
        ? `https://api.cloudinary.com/v1_1/${ns.CLOUD_NAME}/raw/upload`
        : `https://api.cloudinary.com/v1_1/${ns.CLOUD_NAME}/image/upload`;

    const formData = new FormData();

    // If a filename is provided (useful for raw uploads), include it
    if (filename) {
      formData.append("file", file, filename);
    } else {
      formData.append("file", file);
    }

    formData.append("upload_preset", uploadPreset || ns.UPLOAD_PRESET);
    if (folder) formData.append("folder", folder);
    if (tags && tags.length) formData.append("tags", tags.join(","));
    if (context) formData.append("context", context);

    const res = await fetch(endpoint, { method: "POST", body: formData });

    if (!res.ok) {
      const text = await res.text();
      console.error("Cloudinary upload failed:", text);
      throw new Error("Cloudinary upload failed.");
    }

    return await res.json();
  };

  /**
   * Upload a JSON payload to Cloudinary as a raw file.
   */
  ns.uploadJsonToCloudinary = async function ({
    payload,
    folder,
    tags,
    filename = "memories.json",
  }) {
    const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    return await ns.uploadToCloudinary({
      file: jsonBlob,
      resourceType: "raw",
      folder,
      tags,
      filename,
    });
  };

  /**
   * Convert a Cloudinary public_id into just the last segment,
   * and optionally strip the file extension.
   * Example: "our-matching-memories/json/abc123.json" -> "abc123"
   */
  ns.publicIdToFilename = function (publicId, stripExtension = true) {
    if (!publicId) return "";
    const last = String(publicId).split("/").pop() || "";
    return stripExtension ? last.replace(/\.[^/.]+$/, "") : last;
  };


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
