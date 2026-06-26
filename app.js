const STORAGE_KEY = "memo-day-events";
const API_EVENTS_URL = "/api/events";
const HOUR_START = 8;
const HOUR_END = 23;
const PX_PER_HOUR = 80;
const DEFAULT_SLOT_MINUTES = 30;
const DRAG_STEP_MINUTES = 5;

const state = {
  selectedDate: toDateKey(new Date()),
  calendarMonth: new Date(),
  selectedColor: "mint",
  events: loadLocalEvents(),
  pendingSlot: null,
  suppressPendingClick: false,
  activeNoteEventId: null,
};

const form = document.querySelector("#taskForm");
const titleInput = document.querySelector("#taskTitle");
const startInput = document.querySelector("#startTime");
const durationInput = document.querySelector("#duration");
const taskDateInput = document.querySelector("#taskDate");
const timeline = document.querySelector("#timeline");
const dateTitle = document.querySelector("#dateTitle");
const datePicker = document.querySelector("#datePicker");
const calendarGrid = document.querySelector("#calendarGrid");
const monthLabel = document.querySelector("#monthLabel");
const eventTemplate = document.querySelector("#eventTemplate");
const saveStatus = document.querySelector("#saveStatus");
const noteDialog = document.querySelector("#noteDialog");
const noteDialogTitle = document.querySelector("#noteDialogTitle");
const noteDialogTime = document.querySelector("#noteDialogTime");
const eventNoteInput = document.querySelector("#eventNoteInput");
const saveEventNoteButton = document.querySelector("#saveEventNote");
const clearEventNoteButton = document.querySelector("#clearEventNote");

initialize();

function initialize() {
  const now = new Date();
  startInput.value = roundToNextQuarter(now);
  taskDateInput.value = state.selectedDate;
  datePicker.value = state.selectedDate;

  document.querySelector("#todayButton").addEventListener("click", () => selectDate(toDateKey(new Date())));
  document.querySelector("#prevDay").addEventListener("click", () => shiftSelectedDate(-1));
  document.querySelector("#nextDay").addEventListener("click", () => shiftSelectedDate(1));
  document.querySelector("#prevMonth").addEventListener("click", () => shiftMonth(-1));
  document.querySelector("#nextMonth").addEventListener("click", () => shiftMonth(1));
  document.querySelector("#clearForm").addEventListener("click", resetForm);
  document.querySelector("#closeNoteDialog").addEventListener("click", closeNoteDialog);
  dateTitle.addEventListener("click", () => datePicker.showPicker ? datePicker.showPicker() : datePicker.click());
  datePicker.addEventListener("change", (event) => selectDate(event.target.value));
  noteDialog.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-note]")) closeNoteDialog();
  });
  saveEventNoteButton.addEventListener("click", saveActiveEventNote);
  clearEventNoteButton.addEventListener("click", clearActiveEventNote);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !noteDialog.hidden) closeNoteDialog();
  });

  document.querySelectorAll(".color-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedColor = button.dataset.color;
      document.querySelectorAll(".color-chip").forEach((chip) => chip.classList.remove("active"));
      button.classList.add("active");
    });
  });

  form.addEventListener("submit", addEvent);
  render();
  loadSavedEvents();
}

async function addEvent(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) return;

  const startMinutes = timeToMinutes(startInput.value);
  const duration = Number(durationInput.value);
  const endMinutes = startMinutes + duration;

  state.events.push({
    id: crypto.randomUUID(),
    title,
    date: taskDateInput.value,
    start: startInput.value,
    duration,
    end: minutesToTime(endMinutes),
    color: state.selectedColor,
    note: "",
    createdAt: new Date().toISOString(),
  });

  state.selectedDate = taskDateInput.value;
  state.calendarMonth = parseDateKey(state.selectedDate);
  await persistEvents();
  titleInput.value = "";
  render();
  titleInput.focus();
}

function render() {
  taskDateInput.value = state.selectedDate;
  datePicker.value = state.selectedDate;
  dateTitle.textContent = formatDateTitle(state.selectedDate);
  renderTimeline();
  renderCalendar();
}

function renderTimeline() {
  timeline.innerHTML = "";

  for (let hour = HOUR_START; hour <= HOUR_END; hour += 1) {
    const row = document.createElement("div");
    row.className = "hour-row";
    const label = document.createElement("span");
    label.className = "hour-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    row.append(label);
    timeline.append(row);
  }

  const layer = document.createElement("div");
  layer.className = "event-layer";
  layer.addEventListener("pointerdown", handleTimelinePointerDown);
  timeline.append(layer);

  const dayEvents = getEventsForDate(state.selectedDate);
  if (dayEvents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "这一天还没有安排，左边写一张便签试试。";
    layer.append(empty);
  }

  layoutEvents(dayEvents).forEach((item) => layer.append(renderEventCard(item)));
  renderPendingSlot(layer);

  if (state.selectedDate === toDateKey(new Date())) {
    const line = document.createElement("div");
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    line.className = "now-line";
    line.style.top = `${minutesToTop(minutes)}px`;
    line.dataset.time = minutesToTime(minutes);
    layer.append(line);
  }
}

function renderEventCard(item) {
  const card = eventTemplate.content.firstElementChild.cloneNode(true);
  const startMinutes = timeToMinutes(item.start);
  const height = Math.max(34, (item.duration / 60) * PX_PER_HOUR - 8);
  const compactClass = item.duration <= 15 ? "is-tiny" : item.duration <= 30 ? "is-compact" : "";

  card.classList.add(item.color);
  if (compactClass) card.classList.add(compactClass);
  card.style.top = `${minutesToTop(startMinutes) + 4}px`;
  card.style.height = `${height}px`;
  card.style.left = `calc(${(item.column / item.columns) * 100}% + 18px)`;
  card.style.width = `calc(${100 / item.columns}% - 28px)`;
  card.type = "button";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.dataset.eventId = item.id;
  card.dataset.startMinutes = String(startMinutes);
  card.setAttribute("aria-label", `查看或添加 ${item.title} 的备注`);
  if (hasNote(item)) card.classList.add("has-note");
  card.querySelector("strong").textContent = item.title;
  card.querySelector("span").textContent = `${item.start} - ${item.end}`;
  card.querySelector(".delete-event").addEventListener("click", async (event) => {
    event.stopPropagation();
    state.events = state.events.filter((event) => event.id !== item.id);
    await persistEvents();
    render();
  });
  card.querySelector(".open-note").addEventListener("pointerdown", (event) => event.stopPropagation());
  card.querySelector(".open-note").addEventListener("click", (event) => {
    event.stopPropagation();
    openNoteDialog(item.id);
  });
  card.querySelector(".resize-event").addEventListener("pointerdown", (event) => beginEventResize(event, item.id));
  card.querySelector(".resize-event").addEventListener("click", (event) => event.stopPropagation());
  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".delete-event, .open-note, .resize-event")) return;
    event.stopPropagation();
  });
  card.addEventListener("click", () => openNoteDialog(item.id));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openNoteDialog(item.id);
  });

  return card;
}

function openNoteDialog(eventId) {
  const item = state.events.find((event) => event.id === eventId);
  if (!item) return;

  state.activeNoteEventId = eventId;
  noteDialogTitle.textContent = item.title;
  noteDialogTime.textContent = `${item.date} · ${item.start} - ${item.end}`;
  eventNoteInput.value = item.note || "";
  noteDialog.hidden = false;
  document.body.classList.add("is-dialog-open");
  window.setTimeout(() => eventNoteInput.focus(), 0);
}

function closeNoteDialog() {
  state.activeNoteEventId = null;
  noteDialog.hidden = true;
  document.body.classList.remove("is-dialog-open");
}

async function saveActiveEventNote() {
  const item = getActiveNoteEvent();
  if (!item) return;

  item.note = eventNoteInput.value.trim();
  item.updatedAt = new Date().toISOString();
  await persistEvents();
  render();
  closeNoteDialog();
}

async function clearActiveEventNote() {
  const item = getActiveNoteEvent();
  if (!item) return;

  item.note = "";
  item.updatedAt = new Date().toISOString();
  eventNoteInput.value = "";
  await persistEvents();
  render();
  setSaveStatus("已清空备注");
}

function getActiveNoteEvent() {
  return state.events.find((event) => event.id === state.activeNoteEventId);
}

function hasNote(event) {
  return Boolean(event.note && event.note.trim());
}

function beginEventResize(event, eventId) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const item = state.events.find((eventItem) => eventItem.id === eventId);
  const card = event.currentTarget.closest(".event-card");
  if (!item || !card) return;

  const startY = event.clientY;
  const originalDuration = Number(item.duration);
  const startMinutes = timeToMinutes(item.start);
  const maxDuration = HOUR_END * 60 - startMinutes;
  let nextDuration = originalDuration;
  let moved = false;

  card.classList.add("is-resizing");
  setSaveStatus(`${item.start} - ${item.end}，向下拖动可加时`);

  const handleMove = (moveEvent) => {
    const deltaMinutes = Math.round(((moveEvent.clientY - startY) / PX_PER_HOUR) * 60 / DRAG_STEP_MINUTES) * DRAG_STEP_MINUTES;
    const candidate = clampDuration(originalDuration + deltaMinutes, maxDuration);
    if (candidate === nextDuration) return;

    moved = true;
    nextDuration = candidate;
    updateEventResizePreview(card, item, startMinutes, nextDuration);
  };

  const handleUp = async () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    card.classList.remove("is-resizing");

    if (!moved || nextDuration === originalDuration) {
      setSaveStatus("未调整时长");
      return;
    }

    item.duration = nextDuration;
    item.end = minutesToTime(startMinutes + nextDuration);
    item.updatedAt = new Date().toISOString();
    await persistEvents();
    render();
    setSaveStatus(`已调整为 ${item.start} - ${item.end}`);
  };

  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp);
}

function updateEventResizePreview(card, item, startMinutes, duration) {
  const height = Math.max(34, (duration / 60) * PX_PER_HOUR - 8);
  const end = minutesToTime(startMinutes + duration);

  card.style.height = `${height}px`;
  card.querySelector("span").textContent = `${item.start} - ${end}`;
  setSaveStatus(`预览 ${item.start} - ${end}`);
}

function renderPendingSlot(layer) {
  if (!state.pendingSlot || state.pendingSlot.date !== state.selectedDate) return;

  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "pending-slot";
  slot.style.top = `${minutesToTop(state.pendingSlot.startMinutes) + 4}px`;
  slot.style.height = `${Math.max(42, (state.pendingSlot.duration / 60) * PX_PER_HOUR - 8)}px`;
  slot.innerHTML = `
    <strong>${minutesToTime(state.pendingSlot.startMinutes)} - ${minutesToTime(
      state.pendingSlot.startMinutes + state.pendingSlot.duration,
    )}</strong>
    <span>再次点击填入左侧</span>
  `;

  slot.addEventListener("pointerdown", beginPendingSlotDrag);
  slot.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.suppressPendingClick) return;
    applyPendingSlotToForm();
  });

  layer.append(slot);
}

function handleTimelinePointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".event-card, .pending-slot, .delete-event, .open-note, .resize-event")) return;

  const layer = event.currentTarget;
  const minutes = snapMinutes(pointerMinutes(event, layer), DEFAULT_SLOT_MINUTES);
  state.pendingSlot = {
    date: state.selectedDate,
    startMinutes: clampSlotStart(minutes, DEFAULT_SLOT_MINUTES),
    duration: DEFAULT_SLOT_MINUTES,
  };
  renderTimeline();
  setSaveStatus(`已选 ${minutesToTime(state.pendingSlot.startMinutes)}，可拖动微调`);
}

function beginPendingSlotDrag(event) {
  event.preventDefault();
  event.stopPropagation();

  const startY = event.clientY;
  const originalStart = state.pendingSlot.startMinutes;
  let moved = false;

  const handleMove = (moveEvent) => {
    const deltaMinutes = Math.round(((moveEvent.clientY - startY) / PX_PER_HOUR) * 60 / DRAG_STEP_MINUTES) * DRAG_STEP_MINUTES;
    const nextStart = clampSlotStart(originalStart + deltaMinutes, state.pendingSlot.duration);
    if (nextStart !== state.pendingSlot.startMinutes) {
      moved = true;
      state.pendingSlot.startMinutes = nextStart;
      updatePendingSlotElement();
    }
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    if (moved) {
      state.suppressPendingClick = true;
      setSaveStatus(`已调到 ${minutesToTime(state.pendingSlot.startMinutes)}，再次点击填入左侧`);
      window.setTimeout(() => {
        state.suppressPendingClick = false;
      }, 160);
    }
  };

  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp);
}

function updatePendingSlotElement() {
  const slot = document.querySelector(".pending-slot");
  if (!slot || !state.pendingSlot) return;

  slot.style.top = `${minutesToTop(state.pendingSlot.startMinutes) + 4}px`;
  slot.querySelector("strong").textContent = `${minutesToTime(state.pendingSlot.startMinutes)} - ${minutesToTime(
    state.pendingSlot.startMinutes + state.pendingSlot.duration,
  )}`;
}

function applyPendingSlotToForm() {
  if (!state.pendingSlot) return;

  startInput.value = minutesToTime(state.pendingSlot.startMinutes);
  durationInput.value = String(state.pendingSlot.duration);
  taskDateInput.value = state.pendingSlot.date;
  state.selectedDate = state.pendingSlot.date;
  state.calendarMonth = parseDateKey(state.pendingSlot.date);
  setSaveStatus(`已填好 ${startInput.value} - ${minutesToTime(state.pendingSlot.startMinutes + state.pendingSlot.duration)}`);
  state.pendingSlot = null;
  render();
  titleInput.focus();
}

function renderCalendar() {
  calendarGrid.innerHTML = "";

  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  monthLabel.textContent = `${year}年 ${month + 1}月`;

  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const key = toDateKey(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = day.getDate();
    button.addEventListener("click", () => selectDate(key));

    if (day.getMonth() !== month) button.classList.add("is-muted");
    if (key === state.selectedDate) button.classList.add("is-selected");
    if (getEventsForDate(key).length > 0) button.classList.add("has-events");

    calendarGrid.append(button);
  }
}

function selectDate(dateKey) {
  if (!dateKey) return;
  state.selectedDate = dateKey;
  state.calendarMonth = parseDateKey(dateKey);
  render();
}

function shiftSelectedDate(amount) {
  const date = parseDateKey(state.selectedDate);
  date.setDate(date.getDate() + amount);
  selectDate(toDateKey(date));
}

function shiftMonth(amount) {
  state.calendarMonth = new Date(
    state.calendarMonth.getFullYear(),
    state.calendarMonth.getMonth() + amount,
    1,
  );
  renderCalendar();
}

function resetForm() {
  titleInput.value = "";
  startInput.value = roundToNextQuarter(new Date());
  durationInput.value = "60";
  taskDateInput.value = state.selectedDate;
  state.pendingSlot = null;
  renderTimeline();
  titleInput.focus();
}

function getEventsForDate(dateKey) {
  return state.events
    .filter((event) => event.date === dateKey)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

function layoutEvents(events) {
  const items = events.map((event) => ({
    ...event,
    startMinutes: timeToMinutes(event.start),
    endMinutes: timeToMinutes(event.start) + event.duration,
    column: 0,
    columns: 1,
  }));

  const groups = [];
  let currentGroup = [];
  let currentEnd = -1;

  items.forEach((event) => {
    if (currentGroup.length === 0 || event.startMinutes < currentEnd) {
      currentGroup.push(event);
      currentEnd = Math.max(currentEnd, event.endMinutes);
      return;
    }

    groups.push(currentGroup);
    currentGroup = [event];
    currentEnd = event.endMinutes;
  });

  if (currentGroup.length > 0) groups.push(currentGroup);

  groups.forEach((group) => {
    const columnEnds = [];

    group.forEach((event) => {
      let column = columnEnds.findIndex((end) => end <= event.startMinutes);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(event.endMinutes);
      } else {
        columnEnds[column] = event.endMinutes;
      }

      event.column = column;
    });

    const columns = Math.max(1, columnEnds.length);
    group.forEach((event) => {
      event.columns = columns;
    });
  });

  return items;
}

async function loadSavedEvents() {
  try {
    const response = await fetch(API_EVENTS_URL);
    if (!response.ok) throw new Error("No local file store");
    const savedEvents = await response.json();
    if (!Array.isArray(savedEvents)) throw new Error("Invalid event data");

    const merged = mergeEvents(savedEvents, state.events);
    state.events = merged;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));

    if (state.events.length !== savedEvents.length) {
      await persistEvents();
    } else {
      setSaveStatus("已从本地文件读取");
    }

    render();
  } catch {
    setSaveStatus("已用浏览器本地备份保存");
  }
}

async function persistEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  setSaveStatus("正在保存...");

  try {
    const response = await fetch(API_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.events),
    });

    if (!response.ok) throw new Error("Save failed");
    setSaveStatus("已保存到本地文件");
  } catch {
    setSaveStatus("已保存到浏览器本地");
  }
}

function loadLocalEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function mergeEvents(primaryEvents, secondaryEvents) {
  const byId = new Map();

  [...primaryEvents, ...secondaryEvents].forEach((event) => {
    if (!event || !event.id) return;
    byId.set(event.id, event);
  });

  return Array.from(byId.values());
}

function setSaveStatus(message) {
  saveStatus.textContent = message;
}

function minutesToTop(minutes) {
  return ((minutes - HOUR_START * 60) / 60) * PX_PER_HOUR;
}

function pointerMinutes(event, layer) {
  const rect = layer.getBoundingClientRect();
  const y = event.clientY - rect.top;
  return HOUR_START * 60 + (y / PX_PER_HOUR) * 60;
}

function snapMinutes(minutes, step) {
  return Math.round(minutes / step) * step;
}

function clampSlotStart(minutes, duration) {
  const min = HOUR_START * 60;
  const max = HOUR_END * 60 - duration;
  return Math.min(max, Math.max(min, minutes));
}

function clampDuration(duration, maxDuration) {
  return Math.min(maxDuration, Math.max(DRAG_STEP_MINUTES, duration));
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateTitle(dateKey) {
  const date = parseDateKey(dateKey);
  const today = toDateKey(new Date());
  const suffix = dateKey === today ? " 今天" : "";
  return `${date.getMonth() + 1}月${date.getDate()}日${suffix}`;
}

function roundToNextQuarter(date) {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  rounded.setMinutes(Math.ceil(minutes / 15) * 15, 0, 0);
  if (rounded.getHours() < HOUR_START) rounded.setHours(HOUR_START, 0, 0, 0);
  if (rounded.getHours() > HOUR_END) rounded.setHours(HOUR_START, 0, 0, 0);
  return `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
}
