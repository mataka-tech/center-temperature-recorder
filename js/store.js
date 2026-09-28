export const STORAGE_KEY = "center-temp-auto-record-v1";

export const STATUS_LABEL = {
  not_started: "未開始",
  measuring: "測定中",
  remeasure_wait: "再測定待ち",
  reheating: "追加加熱中",
  completed: "完了",
};

export function defaultMenus() {
  return [
    {
      id: "hamburg",
      name: "ハンバーグ",
      method: "焼き物",
      batch: "1バッチ目",
      standardTemp: 75,
      holdSeconds: 2,
      extraHeatSeconds: 60,
      requiredPoints: 3,
      status: "not_started",
      measurements: [],
      nextPoint: 1,
      extraHeatDone: true,
    },
    {
      id: "chicken",
      name: "鶏肉の煮物",
      method: "煮物",
      batch: "1バッチ目",
      standardTemp: 75,
      holdSeconds: 2,
      extraHeatSeconds: 60,
      requiredPoints: 1,
      status: "not_started",
      measurements: [],
      nextPoint: 1,
      extraHeatDone: true,
    },
    {
      id: "veg",
      name: "野菜炒め",
      method: "炒め物",
      batch: "1バッチ目",
      standardTemp: 75,
      holdSeconds: 2,
      extraHeatSeconds: 60,
      requiredPoints: 3,
      status: "not_started",
      measurements: [],
      nextPoint: 1,
      extraHeatDone: true,
    },
  ];
}

export function createInitialState() {
  return {
    screen: "menu",
    currentTargetId: null,
    recorder: "作業者A",
    terminal: "Terminal-04",
    menus: defaultMenus(),
    pendingTemp: null,
    pendingAssignVisible: false,
    extraHeat: null,
    warning: null,
    demoPauseDone: false,
    demoPausedUI: false,
    soundEnabled: true,
    recorderHistory: [],
    orphanArmed: false,
    chickenFailDone: false,
    settingsOpen: false,
    operatorOpen: false,
    currentTemp: 62.0,
    tempPhase: "idle",
    holdStartedAt: null,
    lastRecordedKey: null,
    unselectedAlertKey: null,
    incompleteAlertKey: null,
    reheatAlertKey: null,
    office: "サンプル営業所",
    meal: "昼食",
    targetDate: "2026年9月25日",
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return { ...createInitialState(), ...parsed, settingsOpen: false, operatorOpen: false };
  } catch {
    return createInitialState();
  }
}

export function persistState(state) {
  const copy = { ...state };
  delete copy.settingsOpen;
  delete copy.operatorOpen;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
}

export function resetState() {
  const next = createInitialState();
  persistState(next);
  return next;
}

export function actualCount(menu) {
  const passedPoints = new Set(
    menu.measurements.filter((m) => m.pass && m.kind !== "fail").map((m) => m.point)
  );
  return passedPoints.size;
}

export function passedMeasurements(menu) {
  return menu.measurements.filter((m) => m.pass && m.kind !== "fail");
}

export function failsForPoint(menu, point) {
  return menu.measurements.filter((m) => m.point === point && m.kind === "fail");
}

export function scriptedTarget(state, menu, point, isRetest) {
  if (menu.id === "hamburg") {
    return [76.1, 75.8, 76.3][point - 1];
  }
  if (menu.id === "chicken") {
    if (isRetest || state.chickenFailDone) return 76.0;
    return 72.4;
  }
  return [75.6, 76.4, 75.9][point - 1];
}

export function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function menuById(state, id) {
  return state.menus.find((m) => m.id === id);
}

export function currentMenu(state) {
  return state.currentTargetId ? menuById(state, state.currentTargetId) : null;
}

export function describeIncomplete(menu) {
  const n = actualCount(menu);
  const remain = menu.requiredPoints - n;
  const unmetFail = menu.measurements.some(
    (m) => m.kind === "fail" && !menu.measurements.some((x) => x.point === m.point && x.kind === "retest" && x.pass)
  );
  if (menu.status === "completed" && n >= menu.requiredPoints && !unmetFail && menu.extraHeatDone) {
    return null;
  }
  if (menu.status === "reheating" || (menu.status !== "completed" && !menu.extraHeatDone && unmetFail)) {
    return {
      priority: 3,
      title: menu.name,
      statusLine: "追加加熱中",
      detail: "追加加熱後の再測定が必要です",
    };
  }
  if (menu.status === "remeasure_wait" || unmetFail) {
    return {
      priority: 2,
      title: menu.name,
      statusLine: "再測定待ち",
      detail: "基準温度未達のため、再測定が必要です",
    };
  }
  if (menu.status === "measuring" || (n > 0 && n < menu.requiredPoints)) {
    return {
      priority: 1,
      title: menu.name,
      statusLine: `測定中：${n}／${menu.requiredPoints}点`,
      detail: remain > 0 ? `あと${remain}点の測定が必要です` : "",
    };
  }
  return {
    priority: 4,
    title: menu.name,
    statusLine: `未着手：${n}／${menu.requiredPoints}点`,
    detail: "",
  };
}

export function listIncomplete(state) {
  const items = state.menus
    .map((menu) => {
      const info = describeIncomplete(menu);
      return info ? { ...info, id: menu.id } : null;
    })
    .filter(Boolean);
  if (state.pendingTemp) {
    items.push({
      id: "pending",
      priority: 5,
      title: "一時保留中の測定値",
      statusLine: "一時保留",
      detail: "測定対象が未確定です",
    });
  }
  items.sort((a, b) => a.priority - b.priority);
  return items;
}

export function pickResumeMenuId(items) {
  return items.find((item) => item.id !== "pending")?.id || null;
}
