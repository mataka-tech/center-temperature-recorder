import { render } from "./render.js?v=6";
import {
  initAudio,
  playIncompleteMeasurementAlarm,
  playAdditionalHeatingNotice,
  playMeasurementCompleteSound,
  clearIncompleteAlarmKey,
} from "./audio.js?v=6";
import {
  loadState,
  persistState,
  resetState,
  actualCount,
  currentMenu,
  scriptedTarget,
  nowStamp,
  failsForPoint,
  listIncomplete,
  pickResumeMenuId,
  menuById,
} from "./store.js?v=6";

const root = document.getElementById("app");
let state = loadState();
let simTimer = null;
let heatTimer = null;
let orphanTimer = null;
let recordingLock = false;
let targetTemp = 76.1;
let riseFrom = 62;
let riseStarted = 0;
let riseMs = 5200;

function livePatchTemp() {
  const el = document.querySelector("[data-live-temp]");
  if (el) el.textContent = `${Number(state.currentTemp).toFixed(1)}℃`;
  const note = document.querySelector("[data-live-note]");
  if (note) {
    note.textContent = state.tempPhase === "hold" ? "基準温度で安定確認中…" : "温度上昇中…";
  }
}

function commit(patch, { full = true } = {}) {
  state = { ...state, ...patch };
  persistState(state);
  if (full) render(state, root);
}

function startMeasureSim() {
  stopMeasureSim();
  recordingLock = false;
  const menu = currentMenu(state);
  if (!menu || state.screen !== "measure" || state.demoPausedUI || state.pendingAssignVisible) return;
  const isRetest = failsForPoint(menu, menu.nextPoint).length > 0;
  targetTemp = scriptedTarget(state, menu, menu.nextPoint, isRetest);
  riseFrom = 61.5 + Math.random() * 1.4;
  riseStarted = performance.now();
  riseMs = 4600;
  commit({ currentTemp: riseFrom, tempPhase: "rising", holdStartedAt: null });
  simTimer = setInterval(tickMeasure, 80);
}

function stopMeasureSim() {
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
}

function tickMeasure() {
  const menu = currentMenu(state);
  if (!menu || state.screen !== "measure" || state.demoPausedUI) {
    stopMeasureSim();
    return;
  }
  const t = Math.min(1, (performance.now() - riseStarted) / riseMs);
  const eased = 1 - Math.pow(1 - t, 2);
  let temp = riseFrom + (targetTemp - riseFrom) * eased;
  if (t >= 1) temp = targetTemp;
  const atPeak = t >= 1;
  const above = temp >= menu.standardTemp;
  const next = {
    currentTemp: temp,
    tempPhase: above ? "hold" : "rising",
    holdStartedAt: state.holdStartedAt,
  };
  if (above || atPeak) {
    if (!state.holdStartedAt) next.holdStartedAt = Date.now();
  } else {
    next.holdStartedAt = null;
  }
  state = { ...state, ...next };
  persistState(state);
  livePatchTemp();

  if (state.holdStartedAt && Date.now() - state.holdStartedAt >= menu.holdSeconds * 1000) {
    autoRecord(temp);
  }
}

function autoRecord(value) {
  const menu = currentMenu(state);
  if (!menu) return;
  const rounded = Number(value.toFixed(1));
  const key = `${menu.id}-${menu.nextPoint}-${rounded}`;
  if (state.lastRecordedKey === key) return;
  if (recordingLock) return;
  recordingLock = true;
  stopMeasureSim();

  const pass = rounded >= menu.standardTemp;
  const isRetest = failsForPoint(menu, menu.nextPoint).length > 0;
  const record = {
    point: menu.nextPoint,
    value: rounded,
    time: nowStamp(),
    pass,
    recorder: state.recorder,
    terminal: state.terminal,
    kind: pass ? (isRetest ? "retest" : "normal") : "fail",
  };

  const menus = state.menus.map((m) => {
    if (m.id !== menu.id) return m;
    const measurements = [...m.measurements, record];
    if (!pass) {
      return { ...m, measurements, status: "remeasure_wait", extraHeatDone: false };
    }
    return {
      ...m,
      measurements,
      nextPoint: m.nextPoint + 1,
      extraHeatDone: true,
      status: "measuring",
    };
  });

  const updated = menus.find((m) => m.id === menu.id);
  const count = actualCount(updated);

  if (!pass) {
    const heatingMenus = menus.map((m) => (m.id === menu.id ? { ...m, status: "reheating" } : m));
    state = {
      ...state,
      menus: heatingMenus,
      lastRecordedKey: key,
      chickenFailDone: menu.id === "chicken" ? true : state.chickenFailDone,
      screen: "reheat",
      extraHeat: {
        remaining: 5,
        specifiedSeconds: menu.extraHeatSeconds,
        point: menu.nextPoint,
        failedValue: record.value,
      },
      tempPhase: "idle",
    };
    persistState(state);
    render(state, root);
    playAdditionalHeatingNotice(state.soundEnabled);
    startHeatCountdown();
    return;
  }

  playMeasurementCompleteSound(state.soundEnabled);

  const shouldDemoPause = menu.id === "hamburg" && count === 2 && !state.demoPauseDone;

  if (shouldDemoPause) {
    state = {
      ...state,
      menus: menus.map((m) => (m.id === "hamburg" ? { ...m, status: "measuring" } : m)),
      lastRecordedKey: key,
      demoPauseDone: true,
      demoPausedUI: true,
      currentTemp: rounded,
      tempPhase: "idle",
    };
    persistState(state);
    render(state, root);
    return;
  }

  if (count >= updated.requiredPoints) {
    const doneMenus = menus.map((m) =>
      m.id === menu.id ? { ...m, status: "completed", nextPoint: m.requiredPoints + 1 } : m
    );
    state = {
      ...state,
      menus: doneMenus,
      lastRecordedKey: key,
      screen: "batchComplete",
      demoPausedUI: false,
      currentTargetId: menu.id,
      orphanArmed: true,
      tempPhase: "idle",
    };
    persistState(state);
    render(state, root);
    return;
  }

  state = {
    ...state,
    menus,
    lastRecordedKey: key,
    demoPausedUI: false,
    currentTemp: Math.max(58, rounded - 14),
    tempPhase: "rising",
    holdStartedAt: null,
  };
  persistState(state);
  render(state, root);
  setTimeout(startMeasureSim, 800);
}

function finishReheat() {
  stopHeat();
  const menus = state.menus.map((m) =>
    m.id === state.currentTargetId ? { ...m, status: "measuring", extraHeatDone: true } : m
  );
  state = { ...state, extraHeat: null, menus, screen: "measure", holdStartedAt: null };
  persistState(state);
  render(state, root);
  startMeasureSim();
}

function startHeatCountdown() {
  stopHeat();
  if (state.extraHeat && state.extraHeat.remaining > 5) {
    commit({ extraHeat: { ...state.extraHeat, remaining: 5 } });
  }
  heatTimer = setInterval(() => {
    if (!state.extraHeat) {
      stopHeat();
      return;
    }
    const remaining = Math.max(0, state.extraHeat.remaining - 1);
    commit({ extraHeat: { ...state.extraHeat, remaining } }, { full: false });
    const countEl = document.querySelector("[data-live-count]");
    if (countEl) countEl.textContent = String(remaining);
    if (remaining <= 0) {
      stopHeat();
      setTimeout(finishReheat, 350);
    }
  }, 1000);
}

function stopHeat() {
  if (heatTimer) {
    clearInterval(heatTimer);
    heatTimer = null;
  }
}

function receiveOrphanTemp() {
  if (state.screen !== "menu") return;
  if (state.currentTargetId) return;
  if (state.pendingTemp) return;
  if (state.warning) return;
  const pendingTemp = { value: 76.5, time: nowStamp() };
  state = {
    ...state,
    pendingTemp,
    screen: "unselected",
    unselectedAlertKey: `unselected-${pendingTemp.time}`,
  };
  persistState(state);
  render(state, root);
}

function armOrphanWatch() {
  if (orphanTimer) {
    clearTimeout(orphanTimer);
    orphanTimer = null;
  }
}

function selectMenu(id) {
  initAudio();
  const target = state.menus.find((m) => m.id === id);
  if (!target) return;

  if (target.status === "completed") {
    commit({ screen: "batchComplete", currentTargetId: id, warning: null, demoPausedUI: false });
    return;
  }

  if (state.pendingTemp) {
    const menus = state.menus.map((m) =>
      m.id === id ? { ...m, status: m.status === "not_started" ? "measuring" : m.status } : m
    );
    commit({
      currentTargetId: id,
      menus,
      pendingAssignVisible: true,
      screen: "menu",
      warning: null,
    });
    return;
  }

  if (target.status === "reheating" && state.extraHeat) {
    commit({
      currentTargetId: id,
      screen: "reheat",
      warning: null,
      demoPausedUI: false,
      pendingAssignVisible: false,
    });
    startHeatCountdown();
    return;
  }

  const menus = state.menus.map((m) =>
    m.id === id ? { ...m, status: m.status === "completed" ? m.status : "measuring" } : m
  );
  commit({
    currentTargetId: id,
    menus,
    screen: "measure",
    warning: null,
    demoPausedUI: false,
    pendingAssignVisible: false,
  });
  startMeasureSim();
}

function assignPending() {
  const menu = currentMenu(state);
  const pending = state.pendingTemp;
  if (!menu || !pending) return;
  recordingLock = false;
  commit({ pendingAssignVisible: false, pendingTemp: null, screen: "measure", lastRecordedKey: null });
  autoRecord(pending.value);
}

function discardPending() {
  commit({ pendingAssignVisible: false, pendingTemp: null, screen: "measure" });
  startMeasureSim();
}

function tryFinishCooking() {
  initAudio();
  const incomplete = listIncomplete(state);
  if (incomplete.length) {
    const resumeMenuId = pickResumeMenuId(incomplete);
    const key = `leak-${incomplete.map((item) => item.id).join("-")}`;
    commit({
      warning: "leak",
      incompleteAlertKey: key,
      resumeMenuId,
      settingsOpen: false,
    });
    playIncompleteMeasurementAlarm(state.soundEnabled, key);
    return;
  }
  commit({ warning: "dayComplete", settingsOpen: false });
}

function resumePriorityMeasurement() {
  clearIncompleteAlarmKey(state.incompleteAlertKey);
  const id = state.resumeMenuId || pickResumeMenuId(listIncomplete(state));
  const menu = id ? menuById(state, id) : null;
  if (!menu) {
    commit({ warning: null, screen: "menu" });
    return;
  }
  if (menu.status === "reheating" && state.extraHeat) {
    commit({
      warning: null,
      currentTargetId: id,
      screen: "reheat",
      demoPausedUI: false,
    });
    startHeatCountdown();
    return;
  }
  const menus = state.menus.map((m) =>
    m.id === id ? { ...m, status: m.status === "completed" ? m.status : "measuring" } : m
  );
  commit({
    warning: null,
    currentTargetId: id,
    menus,
    screen: "measure",
    demoPausedUI: false,
  });
  startMeasureSim();
}

function dismissLeakModal() {
  clearIncompleteAlarmKey(state.incompleteAlertKey);
  commit({ warning: null, screen: "menu" });
}

function navToMenu() {
  stopMeasureSim();
  stopHeat();
  recordingLock = false;
  commit({
    screen: "menu",
    warning: null,
    pendingAssignVisible: false,
    settingsOpen: false,
  });
}

function backToMenu({ clearTarget = false } = {}) {
  stopMeasureSim();
  stopHeat();
  const patch = {
    screen: "menu",
    warning: null,
    pendingAssignVisible: false,
    settingsOpen: false,
  };
  if (clearTarget) {
    patch.currentTargetId = null;
    patch.orphanArmed = true;
  }
  commit(patch);
}

root.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  initAudio();

  if (action === "select-menu") selectMenu(btn.dataset.id);
  if (action === "open-settings") commit({ settingsOpen: true });
  if (action === "close-settings") commit({ settingsOpen: false });
  if (action === "toggle-sound") commit({ soundEnabled: !state.soundEnabled });
  if (action === "open-operator") commit({ operatorOpen: true, settingsOpen: false });
  if (action === "close-operator") commit({ operatorOpen: false });
  if (action === "set-recorder") {
    const name = btn.dataset.name;
    const recorderHistory = [...state.recorderHistory, { from: state.recorder, to: name, at: nowStamp() }];
    commit({ recorder: name, recorderHistory, operatorOpen: false });
  }
  if (action === "reset-demo") {
    stopMeasureSim();
    stopHeat();
    if (orphanTimer) clearTimeout(orphanTimer);
    state = resetState();
    render(state, root);
  }
  if (action === "nav-to-menu") navToMenu();
  if (action === "back-to-menu") {
    const fromComplete = state.screen === "batchComplete" || state.screen === "admin";
    backToMenu({ clearTarget: fromComplete });
  }
  if (action === "finish-cooking") tryFinishCooking();
  if (action === "resume-incomplete") resumePriorityMeasurement();
  if (action === "dismiss-incomplete") dismissLeakModal();
  if (action === "close-day-complete") commit({ warning: null });
  if (action === "test-incomplete-alarm") playIncompleteMeasurementAlarm(true, `test-leak-${Date.now()}`);
  if (action === "test-heat-notice") playAdditionalHeatingNotice(true);
  if (action === "test-complete") playMeasurementCompleteSound(true);
  if (action === "unselected-to-menu") {
    commit({ screen: "menu" });
  }
  if (action === "open-admin") commit({ screen: "admin", warning: null });
  if (action === "assign-pending") assignPending();
  if (action === "discard-pending") discardPending();
  if (action === "simulate-orphan") {
    commit({ settingsOpen: false, currentTargetId: null, screen: "menu" });
    receiveOrphanTemp();
  }
});

window.addEventListener("pointerdown", () => initAudio(), { once: true });

render(state, root);

if (state.screen === "measure" && !state.demoPausedUI) {
  startMeasureSim();
}
if (state.screen === "reheat" && state.extraHeat) {
  startHeatCountdown();
}
armOrphanWatch();
