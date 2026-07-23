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
  $("#hwpxSaveButton").addEventListener("click", exportHwpx);
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
  // Store transforms in the frame's unscaled CSS pixels. The page preview may
  // be visually reduced to fit the editor, while HWPX uses the original size.
  const frameWidth = frame.clientWidth || rect.width;
  const frameHeight = frame.clientHeight || rect.height;
  const rotated = Math.abs(transform.rotation % 180) === 90;
  const w = rotated ? transform.naturalHeight : transform.naturalWidth;
  const h = rotated ? transform.naturalWidth : transform.naturalHeight;
  transform.scale = Math.max(frameWidth / w, frameHeight / h);
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
  const rect = frame.getBoundingClientRect();
  state.drag = {
    slot,
    startX: event.clientX,
    startY: event.clientY,
    originX: transform.x,
    originY: transform.y,
    // Convert pointer movement from rendered pixels back to CSS pixels.
    scaleX: (frame.clientWidth || rect.width) / rect.width,
    scaleY: (frame.clientHeight || rect.height) / rect.height,
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
  transform.x = state.drag.originX + (event.clientX - state.drag.startX) * state.drag.scaleX;
  transform.y = state.drag.originY + (event.clientY - state.drag.startY) * state.drag.scaleY;
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

let hwpxTemplatePromise = null;

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hwpxUnits(mm) {
  return Math.round(mm * 283.465);
}

function textXml(value) {
  const parts = String(value ?? "").split(/\r?\n/);
  return parts.map((part, index) => `${index ? "<hp:lineBreak/>" : ""}<hp:t>${xmlEscape(part)}</hp:t>`).join("");
}

function hwpxParagraph(content, charPr = 0, paraPr = 0, pageBreak = 0) {
  return `<hp:p id="0" hp:paraPrIDRef="${paraPr}" hp:styleIDRef="0" hp:pageBreak="${pageBreak}" hp:columnBreak="0" hp:merged="0"><hp:run hp:charPrIDRef="${charPr}">${content}</hp:run><hp:linesegarray><hp:lineseg hp:textpos="0" hp:vertpos="0" hp:vertsize="1000" hp:textheight="1000" hp:baseline="850" hp:spacing="600" hp:horzpos="0" hp:horzsize="42520" hp:flags="393216"/></hp:linesegarray></hp:p>`;
}

// HWPX elements use namespaces, but their attributes are deliberately
// unqualified.  Prefixing them (for example hp:paraPrIDRef) creates XML that
// is well-formed yet rejected by Hancom as a damaged document.
function unqualifiedHwpxAttributes(xml) {
  return xml.replace(/(\s)(?:hp|hc|hh):([A-Za-z][\w-]*)(=)/g, "$1$2$3");
}

function hwpxCell(content, widthMm, heightMm, colSpan = 1, paraPr = 20, charPr = 0, borderFill = 3) {
  const body = typeof content === "string"
    ? (content.trimStart().startsWith("<hp:run")
      ? `<hp:p id="2147483648" hp:paraPrIDRef="${paraPr}" hp:styleIDRef="0" hp:pageBreak="0" hp:columnBreak="0" hp:merged="0">${content}<hp:linesegarray><hp:lineseg hp:textpos="0" hp:vertpos="0" hp:vertsize="1000" hp:textheight="1000" hp:baseline="850" hp:spacing="600" hp:horzpos="0" hp:horzsize="42520" hp:flags="393216"/></hp:linesegarray></hp:p>`
      : hwpxParagraph(content, charPr, paraPr))
    : hwpxParagraph(content, charPr, paraPr);
  return `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${borderFill}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${body}</hp:subList><hp:cellAddr colAddr="__COL__" rowAddr="__ROW__"/><hp:cellSpan colSpan="${colSpan}" rowSpan="1"/><hp:cellSz width="${hwpxUnits(widthMm)}" height="${hwpxUnits(heightMm)}"/><hp:cellMargin left="141" right="141" top="70" bottom="70"/></hp:tc>`;
}

function hwpxRow(cells, rowIndex) {
  // colAddr is the first grid column occupied by the cell, not its ordinal
  // position in the row. Advance it by colSpan so merged metadata/photo cells
  // do not all start at adjacent columns and overlap in Hangul.
  let colAddr = 0;
  const resolvedCells = cells.map((cell) => {
    const span = Number(cell.match(/<hp:cellSpan colSpan="(\d+)"/)?.[1] || 1);
    const resolved = cell.replace("__COL__", colAddr).replace("__ROW__", rowIndex);
    colAddr += span;
    return resolved;
  });
  return `<hp:tr>${resolvedCells.join("")}</hp:tr>`;
}

function hwpxPicture(image, widthMm, heightMm, pictureIndex) {
  // hp:pic is not a lightweight image tag. Hancom requires its complete
  // drawing-object geometry; a bare hp:pic/hc:img pair is ZIP-valid XML but
  // is rejected by Hangul as a damaged HWPX document.
  const frameRatio = image.width / image.height;
  const cellRatio = widthMm / heightMm;
  const displayWidthMm = frameRatio > cellRatio ? widthMm : heightMm * frameRatio;
  const displayHeightMm = frameRatio > cellRatio ? widthMm / frameRatio : heightMm;
  const width = hwpxUnits(displayWidthMm);
  const height = hwpxUnits(displayHeightMm);
  const objectId = 1147780917 + pictureIndex;
  const instanceId = 74039094 + pictureIndex;
  return `<hp:run hp:charPrIDRef="0"><hp:pic id="${objectId}" zOrder="${pictureIndex}" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instanceId}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${width}" height="${height}"/><hp:curSz width="${width}" height="${height}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(width / 2)}" centerY="${Math.round(height / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${width}" y="0"/><hc:pt2 x="${width}" y="${height}"/><hc:pt3 x="0" y="${height}"/></hp:imgRect><hp:imgClip left="0" right="${width}" top="0" bottom="${height}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hc:img binaryItemIDRef="${image.id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>민원지 작성기에서 합성한 이미지</hp:shapeComment></hp:pic></hp:run>`;
}

function hwpxTableRow(cells, rowHeight) {
  return hwpxRow(cells.map((cell) => cell(rowHeight)));
}

function buildCaseTable(item, images) {
  // The template's A4 margins leave 42,520 HWPUNIT (150 mm) of usable width.
  // The previous 184 mm table exceeded that area and made Hancom place it
  // outside the first page. Keep every cell and image inside the text area.
  const contentWidth = 184;
  const halfWidth = contentWidth / 2;
  const imageHeight = 101;
  const metaHeight = 13;
  const titleHeight = 12;
  const mapHeight = 103;
  const locationHeight = 13;
  const captionHeight = 11;
  const noteHeight = String(item.memo || "").trim() ? 15 : 0;
  const tableHeight = metaHeight + titleHeight + mapHeight + locationHeight
    + imageHeight + captionHeight + noteHeight;
  let rowIndex = 0;
  const row = (cells) => hwpxRow(cells, rowIndex++);
  const textCell = (label, value, width, height, charPr = 0, paraPr = 20, colSpan = 1, borderFill = 3) =>
    hwpxCell(`${textXml(label)}${textXml(value)}`, width, height, colSpan, paraPr, charPr, borderFill);
  let pictureIndex = 0;
  const pictureCell = (slot, width, height, colSpan = 1) =>
    hwpxCell(hwpxPicture(images[slot], width, height, pictureIndex++), width, height, colSpan, 20, 0, 3);

  const rows = [
    row([
      textCell("", item.date, 48, metaHeight, 7, 20, 2, 4),
      textCell("내용 : ", item.request, 92, metaHeight, 7, 20, 3, 4),
      textCell("", item.author, 44, metaHeight, 7, 20, 1, 4),
    ]),
    row([textCell("", item.title || "위치도 및 현장사진", contentWidth, titleHeight, 8, 20, 6, 4)]),
    row([pictureCell("map", contentWidth, mapHeight, 6)]),
    row([textCell("주 소 : ", formatLocation(item), contentWidth, locationHeight, 9, 20, 6)]),
  ];

  if (item.layout === "double") {
    rows.push(row([
      // Six grid columns let the 48:92:44 metadata row use 2:3:1 spans and
      // let the two photo cells each occupy an equal 3-column half.
      pictureCell("photo1", halfWidth, imageHeight, 3),
      pictureCell("photo2", halfWidth, imageHeight, 3),
    ]));
  } else {
    rows.push(row([pictureCell("photo1", contentWidth, imageHeight, 6)]));
  }
  rows.push(row([textCell("", "현장사진", contentWidth, captionHeight, 9, 20, 6)]));
  if (noteHeight) rows.push(row([textCell("", item.memo, contentWidth, noteHeight, 10, 20, 6, 4)]));

  return `<hp:tbl id="1000000001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="6" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${hwpxUnits(contentWidth)}" widthRelTo="ABSOLUTE" height="${hwpxUnits(tableHeight)}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${rows.join("")}</hp:tbl>`;
}

function buildHwpxSection(items, imagesByCase, templateSectionXml) {
  const [firstItem, ...followingItems] = items;
  // Keep the section properties produced by Hangul itself. Reconstructing
  // secPr by hand made Hangul accept the package but discard its body.
  const pageLayout = templateSectionXml.replace(
    /<hp:margin[^>]*\/>/,
    '<hp:margin header="0" footer="0" gutter="0" left="3685" right="3685" top="5669" bottom="1134"/>'
  );
  // The blank template contains one paragraph solely to host secPr. Appending
  // the first table after that paragraph consumed a line on page 1, so Hangul
  // moved the entire table to page 2. Reuse its empty run for the first table.
  const firstTable = firstItem ? buildCaseTable(firstItem, imagesByCase[0]) : "";
  const withFirstTable = pageLayout.replace(
    '<hp:run charPrIDRef="0"><hp:t/></hp:run>',
    `<hp:run charPrIDRef="0">${firstTable}</hp:run>`
  );
  const followingSections = followingItems.map((item, index) =>
    hwpxParagraph(buildCaseTable(item, imagesByCase[index + 1]), 0, 0, 1)
  ).join("");
  return unqualifiedHwpxAttributes(withFirstTable.replace("</hs:sec>", `${followingSections}</hs:sec>`));
}

function ensureHwpxTableStyles(headerXml) {
  const centeredPara = `<hh:paraPr id="20" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="CENTER" vertical="CENTER"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="100" unit="HWPUNIT"/><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
  const solidBorder = `<hh:borderFill id="3" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.1 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.1 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.1 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.1 mm" color="#000000"/><hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`;
  const noBorder = `<hh:borderFill id="4" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`;
  const titleLineBorder = `<hh:borderFill id="5" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.5 mm" color="#000000"/><hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`;
  const headlineFont = `<hh:font id="2" face="HY헤드라인M" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="7" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>`;
  const char = (id, height, fontId, bold = false, underline = false) => `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="${fontId}" latin="${fontId}" hanja="${fontId}" japanese="${fontId}" other="${fontId}" symbol="${fontId}" user="${fontId}"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}${underline ? '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>' : ''}</hh:charPr>`;
  // 1/100 point: title 20pt, every other export text 15pt.
  const tableChars = `${char(7, 1500, 0)}${char(8, 2000, 2, false, true)}${char(9, 1500, 0)}${char(10, 1500, 0)}`;
  let updated = headerXml;
  if (!updated.includes('<hh:paraPr id="20"')) {
    updated = updated
      .replace(/<hh:paraProperties itemCnt="(\d+)">/, (_, count) => `<hh:paraProperties itemCnt="${Number(count) + 1}">`)
      .replace('</hh:paraProperties>', `${centeredPara}</hh:paraProperties>`);
  }
  if (!updated.includes('<hh:borderFill id="3"')) {
    updated = updated
      .replace(/<hh:borderFills itemCnt="(\d+)">/, (_, count) => `<hh:borderFills itemCnt="${Number(count) + 3}">`)
      .replace('</hh:borderFills>', `${solidBorder}${noBorder}${titleLineBorder}</hh:borderFills>`);
  }
  if (!updated.includes('face="HY헤드라인M"')) {
    updated = updated.replace(/<hh:fontface([^>]*)fontCnt="(\d+)"([^>]*)>([\s\S]*?)<\/hh:fontface>/g,
      (_, before, count, after, body) => `<hh:fontface${before}fontCnt="${Number(count) + 1}"${after}>${body}${headlineFont}</hh:fontface>`);
  }
  if (!updated.includes('<hh:charPr id="7"')) {
    updated = updated
      .replace(/<hh:charProperties itemCnt="(\d+)">/, (_, count) => `<hh:charProperties itemCnt="${Number(count) + 4}">`)
      .replace('</hh:charProperties>', `${tableChars}</hh:charProperties>`);
  }
  return updated;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = dataUrl;
  });
}

function frameSize(slot, item) {
  const frame = $(`#paper .image-frame[data-slot="${slot}"]`);
  const rect = frame?.getBoundingClientRect();
  // Transform offsets are stored in the element's CSS pixel coordinate system.
  // clientWidth/clientHeight stay stable when the preview is scaled to fit the UI;
  // boundingClientRect does not, which previously shifted the composited image.
  if (frame?.clientWidth && frame.clientHeight) {
    return { width: frame.clientWidth, height: frame.clientHeight };
  }
  if (rect?.width && rect.height) return { width: rect.width, height: rect.height };
  const mapRect = $("#paper .map-frame")?.getBoundingClientRect();
  const width = mapRect?.width || 680;
  const pxPerMm = (mapRect?.height || 390) / 103;
  return {
    width: item.layout === "double" ? width / 2 : width,
    height: 101 * pxPerMm,
  };
}

async function composeImage(item, slot) {
  const size = frameSize(slot, item);
  // Canvas CSS pixels are 96 dpi. Keeping this 1:1 makes the PNG's intrinsic
  // dimensions equal to the HTML frame dimensions that Hangul expects. A 2x
  // retina canvas made Hancom render the bitmap at twice the intended size and
  // clip its right/bottom portions inside the table cell.
  const scale = 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, size.width, size.height);

  const image = await loadImage(item.images[slot]);
  if (image) {
    const transform = item.transforms[slot];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size.width, size.height);
    ctx.clip();
    ctx.translate(size.width / 2 + transform.x, size.height / 2 + transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.scale, transform.scale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2, image.naturalWidth, image.naturalHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = "#7b8794";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("이미지 없음", size.width / 2, size.height / 2);
  }

  item.shapes[slot].forEach((shape) => {
    const x = (shape.x / 100) * size.width;
    const y = (shape.y / 100) * size.height;
    ctx.save();
    ctx.translate(x, y);
    if (shape.type === "circle" || shape.type === "dashed") {
      ctx.strokeStyle = "#db2f24";
      ctx.lineWidth = 3;
      if (shape.type === "dashed") ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.ellipse(0, 0, (shape.w || 64) / 2, (shape.h || 64) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === "label") {
      ctx.fillStyle = "#111";
      ctx.font = `700 ${shape.fontSize || 15}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      String(shape.text || "").split(/\r?\n/).forEach((line, index, lines) => {
        ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * ((shape.fontSize || 15) * 1.25));
      });
    }
    ctx.restore();
  });
  return {
    data: dataUrlToBytes(canvas.toDataURL("image/png")),
    width: canvas.width,
    height: canvas.height,
  };
}

async function getHwpxTemplate() {
  if (!hwpxTemplatePromise) {
    if (window.MINWON_HWPX_TEMPLATE_BASE64) {
      const binary = atob(window.MINWON_HWPX_TEMPLATE_BASE64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      hwpxTemplatePromise = Promise.resolve(bytes.buffer);
    } else {
      hwpxTemplatePromise = fetch("hwpx-template.hwpx").then((response) => {
        if (!response.ok) throw new Error("HWPX 템플릿을 불러오지 못했습니다.");
        return response.arrayBuffer();
      });
    }
  }
  return hwpxTemplatePromise;
}

async function exportHwpx() {
  const button = $("#hwpxSaveButton");
  if (!window.JSZip) {
    alert("HWPX 생성 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.");
    return;
  }
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "HWPX 생성 중…";
  try {
    const template = await getHwpxTemplate();
    const zip = await window.JSZip.loadAsync(template);
    zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
    const imagesByCase = [];
    for (const item of state.cases) {
      imagesByCase.push({
        map: await composeImage(item, "map"),
        photo1: await composeImage(item, "photo1"),
        photo2: await composeImage(item, "photo2"),
      });
    }
    const imageRefs = imagesByCase.map((images, caseIndex) => {
      const refs = {
        map: { id: `image${caseIndex * 3 + 1}`, width: images.map.width, height: images.map.height },
        photo1: { id: `image${caseIndex * 3 + 2}`, width: images.photo1.width, height: images.photo1.height },
        photo2: { id: `image${caseIndex * 3 + 3}`, width: images.photo2.width, height: images.photo2.height },
      };
      zip.file(`BinData/${refs.map.id}.png`, images.map.data);
      zip.file(`BinData/${refs.photo1.id}.png`, images.photo1.data);
      zip.file(`BinData/${refs.photo2.id}.png`, images.photo2.data);
      return refs;
    });

    const templateSectionXml = await zip.file("Contents/section0.xml").async("string");
    let sectionXml = buildHwpxSection(state.cases, imageRefs, templateSectionXml);
    zip.file("Contents/section0.xml", sectionXml);
    const templateHeaderXml = await zip.file("Contents/header.xml").async("string");
    zip.file("Contents/header.xml", ensureHwpxTableStyles(templateHeaderXml));
    // The Hancom-created template deliberately uses an empty ODF manifest.
    // Binary resources belong in the package manifest (content.hpf), including
    // those from the first case, not only additional pages.
    const contentHpf = await zip.file("Contents/content.hpf").async("string");
    const hpfEntries = imageRefs.flatMap((refs) => Object.values(refs))
      // Hancom distinguishes embedded images from linked files through this
      // package-manifest flag (the OWPML spelling is intentionally Embed*ed*).
      // Without it, it shows a "그림 경로" dialog for BinData/imageN.png.
      .map((image) => `<opf:item id="${image.id}" href="BinData/${image.id}.png" media-type="image/png" isEmbeded="1"/>`)
      .join("");
    zip.file("Contents/content.hpf", contentHpf.replace("</opf:manifest>", `${hpfEntries}</opf:manifest>`));
    zip.file("Preview/PrvText.txt", state.cases.map((item) => `${item.title}\n${item.address}\n${item.request}`).join("\n\n"));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${buildQuickSaveName(activeCase()) || "민원_현장사진"}.hwpx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert(`HWPX 내보내기에 실패했습니다.\n${error.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
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
