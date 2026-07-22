const today = new Date().toISOString().slice(0, 10);

const defaultCase = () => ({
  id: crypto.randomUUID(),
  title: "위치도 및 현장사진",
  date: today,
  address: "",
  request: "도로 파손 보수 요청",
  author: localStorage.getItem("minwonAuthor") || "",
  layout: "single",
  memo: "",
  images: {
    map: null,
    photo1: null,
    photo2: null,
  },
  transforms: {
    map: imageDefaults(),
    photo1: imageDefaults(),
    photo2: imageDefaults(),
  },
  shapes: {
    map: [],
    photo1: [],
    photo2: [],
  },
});

function imageDefaults() {
  return { scale: 1, x: 0, y: 0, rotation: 0, naturalWidth: 0, naturalHeight: 0 };
}

const state = {
  cases: [defaultCase()],
  activeIndex: 0,
  selectedSlot: "map",
  selectedShape: null,
  drag: null,
  shapeDrag: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const inputs = {
  title: $("#titleInput"),
  date: $("#dateInput"),
  address: $("#addressInput"),
  request: $("#requestInput"),
  author: $("#authorInput"),
  layout: $("#layoutInput"),
  memo: $("#memoInput"),
};

function activeCase() {
  return state.cases[state.activeIndex];
}

function bindInputs() {
  Object.entries(inputs).forEach(([key, input]) => {
    const eventName = input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const item = activeCase();
      if (key === "memo") {
        input.value = limitLines(input.value, 3);
      }
      item[key] = input.type === "checkbox" ? input.checked : input.value;
      if (key === "author") {
        localStorage.setItem("minwonAuthor", input.value.trim());
      }
      render();
    });
  });

  $$(".dropzone").forEach((zone) => {
    const slot = zone.dataset.slot;
    const input = $("input", zone);
    input.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) loadImageFile(file, slot);
      input.value = "";
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
      const file = event.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) loadImageFile(file, slot);
    });
  });

  $$(".image-frame").forEach((frame) => {
    frame.addEventListener("pointerdown", startDrag);
    frame.addEventListener("pointermove", moveDrag);
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
    frame.addEventListener("wheel", zoomWithWheel, { passive: false });
    frame.addEventListener("click", () => selectSlot(frame.dataset.slot));
    frame.addEventListener("focus", () => selectSlot(frame.dataset.slot));
    frame.addEventListener("dblclick", openUploadForFrame);
  });

  $$(".tool-button").forEach((button) => {
    button.addEventListener("click", () => handleTool(button.dataset.action));
  });

  $("#addCase").addEventListener("click", () => {
    state.cases.push(defaultCase());
    state.activeIndex = state.cases.length - 1;
    render();
  });

  $("#duplicateCase").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(activeCase()));
    copy.id = crypto.randomUUID();
    state.cases.splice(state.activeIndex + 1, 0, copy);
    state.activeIndex += 1;
    render();
  });

  $("#quickSaveButton").addEventListener("click", quickSave);
  $("#copyAddress").addEventListener("click", () => navigator.clipboard?.writeText(activeCase().address || ""));
  document.addEventListener("paste", pasteImageIntoSelectedSlot);
  document.addEventListener("keydown", deleteSelectedImageWithKey);
  document.addEventListener("pointermove", moveShapeDrag);
  document.addEventListener("pointerup", endShapeDrag);
}

function limitLines(value, maxLines) {
  return value.split(/\r?\n/).slice(0, maxLines).join("\n");
}

function loadImageFile(file, slot) {
  clearGeneratedMap(slot);
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const item = activeCase();
      item.images[slot] = reader.result;
      item.transforms[slot] = {
        ...imageDefaults(),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      };
      autoFit(slot);
      selectSlot(slot);
      render();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function clearImage(slot) {
  const item = activeCase();
  item.images[slot] = null;
  item.transforms[slot] = imageDefaults();
  item.shapes[slot] = [];
  clearGeneratedMap(slot);
}

function clearGeneratedMap(slot) {
  if (slot !== "map") return;
  $$('.image-frame[data-slot="map"]').forEach((frame) => frame.classList.remove("has-map"));
}

function selectSlot(slot) {
  state.selectedSlot = slot;
  state.selectedShape = null;
  renderSelection();
}

function selectShape(slot, index) {
  state.selectedSlot = slot;
  state.selectedShape = { slot, index };
  render();
}

function render() {
  const item = activeCase();
  inputs.title.value = item.title;
  inputs.date.value = item.date;
  inputs.address.value = item.address;
  inputs.request.value = item.request;
  inputs.author.value = item.author;
  inputs.layout.value = item.layout;
  inputs.memo.value = item.memo;

  renderPaper($("#paper"), item);
  renderUploadVisibility(item);
  renderCaseList();
  renderSelection();
  $("#caseCounter").textContent = `${state.activeIndex + 1} / ${state.cases.length}`;
}

function renderPaper(root, item) {
  root.className = `paper layout-${item.layout} show-meta`;
  $('[data-field="title"]', root).textContent = item.title || "위치도 및 현장사진";
  $('[data-field="date"]', root).textContent = item.date || "";
  $('[data-field="request"]', root).textContent = item.request || "";
  $('[data-field="author"]', root).textContent = item.author || "";
  $('[data-field="location"]', root).textContent = formatLocation(item);
  $('[data-field="memo"]', root).textContent = item.memo;
  $("#memoBox", root).textContent = item.memo || item.request || "";

  ["map", "photo1", "photo2"].forEach((slot) => renderImageSlot(root, item, slot));
}

function renderImageSlot(root, item, slot) {
  const frame = $(`.image-frame[data-slot="${slot}"]`, root);
  if (!frame) return;
  const img = $("img", frame);
  const layer = $(".shape-layer", frame);
  const transform = item.transforms[slot];

  if (item.images[slot]) {
    frame.classList.add("has-image");
    img.src = item.images[slot];
    img.style.width = `${transform.naturalWidth || 10}px`;
    img.style.height = `${transform.naturalHeight || 10}px`;
    img.style.transform = `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) rotate(${transform.rotation}deg) scale(${transform.scale})`;
  } else {
    frame.classList.remove("has-image");
    img.removeAttribute("src");
    img.removeAttribute("style");
  }

  layer.innerHTML = "";
  const showEditing = root.id === "paper";
  item.shapes[slot].forEach((shape, index) => {
    const el = document.createElement("div");
    const selected = showEditing && state.selectedShape?.slot === slot && state.selectedShape.index === index;
    el.className = `shape ${shape.type}${selected ? " selected" : ""}`;
    el.dataset.slot = slot;
    el.dataset.index = index;
    el.style.left = `${shape.x}%`;
    el.style.top = `${shape.y}%`;
    if (shape.w) el.style.width = `${shape.w}px`;
    if (shape.h) el.style.height = `${shape.h}px`;
    if (shape.fontSize) el.style.fontSize = `${shape.fontSize}px`;
    if (shape.type === "label") el.textContent = shape.text;
    if (showEditing) {
      el.addEventListener("pointerdown", (event) => startShapeMove(event, slot, index));
      if (selected) {
        const handle = document.createElement("span");
        handle.className = "resize-handle";
        handle.addEventListener("pointerdown", (event) => startShapeResize(event, slot, index));
        el.appendChild(handle);
      }
    }
    layer.appendChild(el);
  });
}

function renderUploadVisibility(item) {
  const photo2Dropzone = $("#photo2Dropzone");
  if (photo2Dropzone) {
    photo2Dropzone.hidden = item.layout !== "double";
  }
}

function formatLocation(item) {
  return item.address || "";
}

function renderSelection() {
  $$(".image-frame").forEach((frame) => frame.classList.toggle("selected", frame.dataset.slot === state.selectedSlot));
  const labels = { map: "지도", photo1: "현장사진 1", photo2: "현장사진 2" };
  $("#selectedSlotLabel").textContent = `선택: ${labels[state.selectedSlot]}`;
}

function renderCaseList() {
  const list = $("#caseList");
  list.innerHTML = "";
  state.cases.forEach((item, index) => {
    const card = document.createElement("button");
    card.className = `case-card${index === state.activeIndex ? " active" : ""}`;
    card.type = "button";
    card.innerHTML = `
      <div class="case-thumb">${item.address || "주소 없음"}<br>${item.request || ""}</div>
      <div class="case-name">
        <span>${index + 1}</span>
        <button class="case-delete" type="button" title="삭제">×</button>
      </div>
    `;
    card.addEventListener("click", () => {
      state.activeIndex = index;
      render();
    });
    $(".case-delete", card).addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.cases.length === 1) return;
      state.cases.splice(index, 1);
      state.activeIndex = Math.max(0, Math.min(state.activeIndex, state.cases.length - 1));
      render();
    });
    list.appendChild(card);
  });
}

function handleTool(action) {
  const slot = state.selectedSlot;
  if (action === "fit") autoFit(slot);
  if (action === "zoom-in") adjustScale(slot, 1.08);
  if (action === "zoom-out") adjustScale(slot, 0.92);
  if (action === "rotate") rotateImage(slot);
  if (action === "circle" || action === "dashed") addShape(slot, action);
  if (action === "label") addTextShape(slot);
  if (action === "delete-shape") deleteSelectedOrLastShape(slot);
  if (action === "delete-image") clearImage(slot);
  render();
}

function autoFit(slot) {
  const item = activeCase();
  const frame = $(`.image-frame[data-slot="${slot}"]`);
  const transform = item.transforms[slot];
  if (!item.images[slot] || !frame || !transform.naturalWidth) return;
  const rect = frame.getBoundingClientRect();
  const rotated = Math.abs(transform.rotation % 180) === 90;
  const w = rotated ? transform.naturalHeight : transform.naturalWidth;
  const h = rotated ? transform.naturalWidth : transform.naturalHeight;
  transform.scale = Math.max(rect.width / w, rect.height / h);
  transform.x = 0;
  transform.y = 0;
}

function adjustScale(slot, factor) {
  const transform = activeCase().transforms[slot];
  transform.scale = Math.max(0.05, Math.min(8, transform.scale * factor));
}

function rotateImage(slot) {
  const transform = activeCase().transforms[slot];
  transform.rotation = (transform.rotation + 90) % 360;
  autoFit(slot);
}

function addShape(slot, type) {
  const item = activeCase();
  item.shapes[slot].push({ type, x: 50, y: 50, w: 64, h: 64 });
  state.selectedShape = { slot, index: item.shapes[slot].length - 1 };
}

function addTextShape(slot) {
  const text = prompt("표시할 문구를 입력하세요.", "파손 발생");
  if (!text) return;
  const item = activeCase();
  item.shapes[slot].push({ type: "label", x: 50, y: 50, fontSize: 15, text });
  state.selectedShape = { slot, index: item.shapes[slot].length - 1 };
}

function deleteSelectedOrLastShape(slot) {
  const item = activeCase();
  if (state.selectedShape?.slot === slot) {
    item.shapes[slot].splice(state.selectedShape.index, 1);
    state.selectedShape = null;
    return;
  }
  item.shapes[slot].pop();
}

function startDrag(event) {
  if (event.target.closest(".shape")) return;
  const frame = event.currentTarget;
  const slot = frame.dataset.slot;
  selectSlot(slot);
  if (!activeCase().images[slot]) return;
  frame.setPointerCapture(event.pointerId);
  const transform = activeCase().transforms[slot];
  state.drag = {
    slot,
    startX: event.clientX,
    startY: event.clientY,
    originX: transform.x,
    originY: transform.y,
  };
}

function startShapeMove(event, slot, index) {
  event.preventDefault();
  event.stopPropagation();
  const frame = event.currentTarget.closest(".image-frame");
  const shape = activeCase().shapes[slot][index];
  state.selectedSlot = slot;
  state.selectedShape = { slot, index };
  state.shapeDrag = {
    mode: "move",
    slot,
    index,
    frame,
    startX: event.clientX,
    startY: event.clientY,
    originX: shape.x,
    originY: shape.y,
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  render();
}

function startShapeResize(event, slot, index) {
  event.preventDefault();
  event.stopPropagation();
  const frame = event.currentTarget.closest(".image-frame");
  const shape = activeCase().shapes[slot][index];
  state.selectedSlot = slot;
  state.selectedShape = { slot, index };
  state.shapeDrag = {
    mode: "resize",
    slot,
    index,
    frame,
    startX: event.clientX,
    startY: event.clientY,
    originW: shape.w || 70,
    originH: shape.h || 48,
    originFontSize: shape.fontSize || 15,
  };
}

function moveShapeDrag(event) {
  if (!state.shapeDrag) return;
  const drag = state.shapeDrag;
  const item = activeCase();
  const shape = item.shapes[drag.slot][drag.index];
  if (!shape) return;

  if (drag.mode === "move") {
    const rect = drag.frame.getBoundingClientRect();
    shape.x = Math.max(0, Math.min(100, drag.originX + ((event.clientX - drag.startX) / rect.width) * 100));
    shape.y = Math.max(0, Math.min(100, drag.originY + ((event.clientY - drag.startY) / rect.height) * 100));
  } else {
    if (shape.type === "label") {
      const delta = Math.max(event.clientX - drag.startX, event.clientY - drag.startY);
      shape.fontSize = Math.max(8, Math.min(72, drag.originFontSize + Math.round(delta / 4)));
    } else {
      shape.w = Math.max(24, drag.originW + event.clientX - drag.startX);
      shape.h = Math.max(18, drag.originH + event.clientY - drag.startY);
    }
  }
  renderImageSlot($("#paper"), item, drag.slot);
}

function endShapeDrag() {
  state.shapeDrag = null;
}

function moveDrag(event) {
  if (!state.drag) return;
  const transform = activeCase().transforms[state.drag.slot];
  transform.x = state.drag.originX + event.clientX - state.drag.startX;
  transform.y = state.drag.originY + event.clientY - state.drag.startY;
  renderImageSlot($("#paper"), activeCase(), state.drag.slot);
}

function endDrag() {
  state.drag = null;
}

function zoomWithWheel(event) {
  event.preventDefault();
  const slot = event.currentTarget.dataset.slot;
  selectSlot(slot);
  adjustScale(slot, event.deltaY < 0 ? 1.05 : 0.95);
  renderImageSlot($("#paper"), activeCase(), slot);
}

function openUploadForFrame(event) {
  const slot = event.currentTarget.dataset.slot;
  selectSlot(slot);
  const input = $(`.dropzone[data-slot="${slot}"] input`);
  input?.click();
}

function pasteImageIntoSelectedSlot(event) {
  if (isEditableTarget(event.target)) return;
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  event.preventDefault();
  loadImageFile(file, state.selectedSlot);
}

function deleteSelectedImageWithKey(event) {
  if (event.key !== "Delete" || isEditableTarget(event.target)) return;
  const item = activeCase();
  const slot = state.selectedSlot;
  if (state.selectedShape?.slot === slot) {
    event.preventDefault();
    item.shapes[slot].splice(state.selectedShape.index, 1);
    state.selectedShape = null;
    render();
    return;
  }
  const hasGeneratedMap = slot === "map" && Boolean($('.image-frame[data-slot="map"].has-map'));
  if (!item.images[slot] && !hasGeneratedMap) return;
  event.preventDefault();
  clearImage(slot);
  render();
}

function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function printAll(titleOverride) {
  const root = $("#printRoot");
  root.innerHTML = "";
  state.cases.forEach((item) => {
    const clone = $("#paper").cloneNode(true);
    renderPaper(clone, item);
    clone.id = "";
    $$(".image-frame", clone).forEach((frame) => frame.classList.remove("selected"));
    root.appendChild(clone);
  });
  const previousTitle = document.title;
  if (titleOverride) document.title = titleOverride;
  window.print();
  if (titleOverride) {
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }
}

function quickSave() {
  printAll(buildQuickSaveName(activeCase()));
}

function buildQuickSaveName(item) {
  const raw = [item.date, item.address, item.request, item.author].filter(Boolean).join("_");
  return sanitizeFileName(raw || "민원_현장사진");
}

function sanitizeFileName(value) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

bindInputs();
render();
