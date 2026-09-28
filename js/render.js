import { icons, methodIcon } from "./icons.js?v=6";
import { STATUS_LABEL, actualCount, passedMeasurements, currentMenu, listIncomplete, pickResumeMenuId } from "./store.js?v=6";

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function render(state, root) {
  root.innerHTML = `
    <div class="app-shell">
      ${renderHeader(state)}
      ${renderScreen(state)}
      ${state.warning === "leak" ? renderLeakModal(state) : ""}
      ${state.warning === "dayComplete" ? renderDayCompleteModal() : ""}
      ${state.settingsOpen ? renderSettings(state) : ""}
      ${state.operatorOpen ? renderOperator(state) : ""}
      ${state.pendingAssignVisible ? renderAssignModal(state) : ""}
    </div>
  `;
}

function renderHeader(state) {
  return `
    <header class="header">
      <div class="header-left">
        <div class="system-name">中心温度自動記録システム</div>
        <span class="demo-badge">デモ</span>
        <div class="header-divider"></div>
        <div class="header-meta">${icons.building}<span>サンプル営業所</span></div>
        <div class="header-meta">${icons.meal}<span>昼食</span></div>
        <div class="header-meta"><span>対象日：2026年9月25日</span></div>
      </div>
      <div class="header-right">
        <div class="header-person">${icons.person}<span>${esc(state.recorder)}</span></div>
        <div class="header-person">${icons.terminal}<span>${esc(state.terminal)}</span></div>
        <button class="settings-btn" data-action="open-settings" aria-label="設定">${icons.gear}</button>
      </div>
    </header>
  `;
}

function renderScreen(state) {
  switch (state.screen) {
    case "measure":
      return `<main class="page">${renderMeasure(state)}</main>`;
    case "unselected":
      return `<main class="page">${renderUnselected(state)}</main>`;
    case "reheat":
      return `<main class="page">${renderReheat(state)}</main>`;
    case "batchComplete":
      return `<main class="page">${renderComplete(state)}</main>`;
    case "admin":
      return `<main class="page">${renderAdmin(state)}</main>`;
    default:
      return `<main class="page">${renderMenu(state)}</main>`;
  }
}

function actionLabel(menu) {
  const n = actualCount(menu);
  if (menu.status === "completed") return "結果を見る →";
  if (menu.status === "not_started") return "選択して開始 →";
  return "測定を再開 →";
}

function statusLeft(menu) {
  const n = actualCount(menu);
  if (menu.status === "not_started") return "未開始";
  if (menu.status === "completed") return `完了 ${n}／${menu.requiredPoints}点`;
  if (menu.status === "remeasure_wait") return "再測定待ち";
  if (menu.status === "reheating") return "追加加熱中";
  if (menu.status === "measuring") return `測定中 ${n}／${menu.requiredPoints}点`;
  return `${STATUS_LABEL[menu.status]} ${n}／${menu.requiredPoints}点`;
}

function renderNavToMenu() {
  return `
    <div class="nav-back-wrap">
      <button class="btn btn-secondary nav-back-btn" data-action="nav-to-menu">← メニュー選択に戻る</button>
    </div>
  `;
}

function renderMenu(state) {
  const cards = state.menus
    .map((menu) => {
      const n = actualCount(menu);
      return `
        <button class="menu-card" data-action="select-menu" data-id="${menu.id}">
          <div class="menu-icon">${methodIcon(menu.method)}</div>
          <h2>${esc(menu.name)}</h2>
          <div class="menu-method">${esc(menu.method)}</div>
          <div class="menu-rows">
            <div class="menu-row"><span>基準温度</span><strong>${menu.standardTemp}℃</strong></div>
            <div class="menu-row"><span>追加加熱時間</span><strong>${menu.extraHeatSeconds}秒</strong></div>
            <div class="menu-row"><span>必要測定点数</span><strong>${menu.requiredPoints}点</strong></div>
            <div class="menu-row"><span>バッチ番号</span><strong>${esc(menu.batch)}</strong></div>
            <div class="menu-row"><span>現在の状態</span><strong>${STATUS_LABEL[menu.status]}</strong></div>
            <div class="menu-row"><span>現在の測定点数</span><strong>${n}／${menu.requiredPoints}点</strong></div>
          </div>
          <div class="menu-card-footer">
            <span class="status-pill status-${menu.status}">${statusLeft(menu)}</span>
            <span class="card-action">${actionLabel(menu)}</span>
          </div>
        </button>
      `;
    })
    .join("");

  return `
    <div class="menu-page-head">
      <div>
        <h1 class="page-title">本日のメニュー</h1>
        <p class="page-desc">測定するメニューを選択してください。選択後、自動で測定を開始します。</p>
      </div>
      <button class="btn btn-primary cook-complete-btn" data-action="finish-cooking">調理完了</button>
    </div>
    <div class="menu-grid">${cards}</div>
  `;
}

function renderMeasure(state) {
  const menu = currentMenu(state);
  if (!menu) {
    return `<p>測定対象がありません。</p>`;
  }
  const n = actualCount(menu);
  const currentPoint = Math.min(menu.nextPoint, menu.requiredPoints);
  const rows = [
    ["メニュー", menu.name],
    ["調理方法", menu.method],
    ["バッチ番号", menu.batch],
    ["同一条件", "はい"],
    ["必要測定数", `${menu.requiredPoints}点`],
    ["現在の測定点", `${currentPoint}／${menu.requiredPoints}点`],
    ["基準温度", `${menu.standardTemp}℃`],
    ["追加加熱時間", `${menu.extraHeatSeconds}秒`],
    ["記録者", state.recorder],
    ["端末", state.terminal],
  ]
    .map(([k, v]) => `<span>${esc(k)}</span><strong>${esc(v)}</strong>`)
    .join("");

  const points = Array.from({ length: menu.requiredPoints }, (_, i) => {
    const point = i + 1;
    const done = passedMeasurements(menu).some((m) => m.point === point);
    const current = !done && point === currentPoint && !state.demoPausedUI;
    const cls = done ? "done" : current ? "current" : "";
    const body = done ? "✓" : String(point);
    return `<div class="point ${cls}">${body}</div>`;
  }).join("");

  const logs = menu.measurements
    .map(
      (m) => `
      <div class="log-item">
        <span class="muted">測定点</span><strong>${m.point}点目${m.kind === "fail" ? "（未達）" : m.kind === "retest" ? "（再測定）" : ""}</strong>
        <span class="muted">測定値</span><strong>${m.value.toFixed(1)}℃</strong>
        <span class="muted">測定時刻</span><span>${esc(m.time)}</span>
        <span class="muted">合否</span><span class="${m.pass ? "pass" : "fail"}">${m.pass ? "合格" : "不合格"}</span>
      </div>`
    )
    .join("") || `<p class="muted">まだ自動記録はありません。</p>`;

  const paused = state.demoPausedUI;
  return `
    <div class="measure-layout">
      <aside class="panel left-panel">
        <h2 class="section-title">測定条件</h2>
        <div class="kv">${rows}</div>
        <div class="section-split"></div>
        <h2 class="section-title">測定ポイント</h2>
        <div class="points">${points}</div>
        <div class="section-split"></div>
        <h2 class="section-title">自動記録ログ</h2>
        ${logs}
        ${renderNavToMenu()}
      </aside>
      <section class="panel right-panel">
        <div class="receive-head">${icons.thermo}<span>${paused ? "中心温度 自動受信 一時停止中" : "中心温度 自動受信中"}</span></div>
        <div class="temp-display" data-live-temp>${state.currentTemp.toFixed(1)}℃</div>
        <div class="temp-note" data-live-note>${
          paused
            ? "デモ：必要点数到達前で自動進行を一時停止しています"
            : state.tempPhase === "hold"
              ? "基準温度で安定確認中…"
              : "温度上昇中…"
        }</div>
        <div class="temp-foot">測定点${currentPoint}／${menu.requiredPoints} ／ 基準${menu.standardTemp}℃以上で${menu.holdSeconds}秒間安定すると自動記録します</div>
      </section>
    </div>
  `;
}

function renderUnselected(state) {
  const p = state.pendingTemp;
  return `
    <section class="error-screen">
      <div class="modal-icon">${icons.warn}</div>
      <h1 class="hero-msg">測定対象が選択されていません</h1>
      <p class="sub-msg">この温度はまだ正式に記録されていません</p>
      <div class="meta-box">
        <div>受信温度：<strong>${p ? p.value.toFixed(1) : "--"}℃</strong></div>
        <div>受信時刻：<strong>${p ? esc(p.time) : "--"}</strong></div>
      </div>
      <button class="btn btn-primary" data-action="unselected-to-menu">メニューを選択してください</button>
    </section>
  `;
}

function renderReheat(state) {
  const menu = currentMenu(state);
  const extra = state.extraHeat;
  const specified = extra?.specifiedSeconds ?? menu?.extraHeatSeconds ?? 60;
  return `
    <section class="reheat-screen">
      <div class="modal-icon">${icons.warn}</div>
      <h1 class="hero-msg">基準温度未達</h1>
      <p class="sub-msg">追加加熱してください</p>
      <div class="meta-box">
        <div>測定値：<strong>${extra ? extra.failedValue.toFixed(1) : "--"}℃</strong></div>
        <div>基準温度：<strong>${menu ? menu.standardTemp : 75}℃</strong></div>
        <div>メニュー：<strong>${menu ? esc(menu.name) : ""}</strong></div>
        <div>バッチ：<strong>${menu ? esc(menu.batch) : ""}</strong></div>
        <div>測定点：<strong>${extra ? extra.point : ""}点目</strong></div>
        <div>規定の追加加熱時間：<strong>${specified}秒</strong></div>
      </div>
      <p class="demo-heat-note">デモでは5秒に短縮して進行します</p>
      <div class="countdown" data-live-count>${extra ? extra.remaining : 5}</div>
      <p>追加加熱の残り時間（秒）</p>
      ${renderNavToMenu()}
    </section>
  `;
}

function renderComplete(state) {
  const menu = currentMenu(state) || state.menus.find((m) => m.status === "completed");
  if (!menu) return "";
  const rows = passedMeasurements(menu)
    .sort((a, b) => a.point - b.point)
    .map(
      (m) => `<tr><td>点${m.point}</td><td>${m.value.toFixed(1)}℃</td><td>${esc(m.time)}</td><td class="pass">合格</td></tr>`
    )
    .join("");
  const values = passedMeasurements(menu).map((m) => m.value);
  const min = values.length ? Math.min(...values).toFixed(1) : "--";
  return `
    <div class="complete-page">
      <div class="complete-top">
        <div>
          <h1 class="page-title">バッチ完了</h1>
          <p>${esc(menu.name)} ／ ${esc(menu.batch)} ／ 昼食</p>
        </div>
        <span class="save-badge">自動保存済み</span>
      </div>
      <div class="complete-grid">
        <section class="card">
          <h2>測定結果</h2>
          <table class="result-table">
            <thead><tr><th>測定点</th><th>中心温度</th><th>測定時刻</th><th>判定</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="menu-rows" style="margin-top:18px">
            <div class="menu-row"><span>必要測定数</span><strong>${menu.requiredPoints}点</strong></div>
            <div class="menu-row"><span>実測定数</span><strong>${actualCount(menu)}点</strong></div>
            <div class="menu-row"><span>最低温度</span><strong>${min}℃</strong></div>
            <div class="menu-row"><span>追加加熱</span><strong>完了</strong></div>
            <div class="menu-row"><span>記録者</span><strong>${esc(passedMeasurements(menu)[0]?.recorder || state.recorder)}</strong></div>
            <div class="menu-row"><span>端末</span><strong>${esc(state.terminal)}</strong></div>
          </div>
        </section>
        <div>
          <section class="judge-card">
            <h3>判定</h3>
            <div class="judge-big">合格</div>
            <p>記録は自動保存されました</p>
          </section>
          <section class="card">
            <p>このメニューのバッチは全て完了</p>
            <p>全バッチの記録は管理データに保存されています</p>
            <div class="stack-btns">
              <button class="btn btn-primary" data-action="open-admin">管理データを見る</button>
              <button class="btn btn-secondary" data-action="back-to-menu">メニュー選択へ戻る</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderAdmin(state) {
  const pendingRow = state.pendingTemp
    ? `<tr class="row-alert">
        <td>未割当</td><td>-</td><td>-</td><td>-</td><td>-</td>
        <td>${state.pendingTemp.value.toFixed(1)}℃</td>
        <td>${esc(state.pendingTemp.time)}</td>
        <td>測定者不明</td><td>${esc(state.terminal)}</td>
        <td>未判定</td><td>-</td><td>-</td>
        <td>測定対象不明／一時保留中の測定値</td>
      </tr>`
    : "";

  const rows = state.menus
    .map((menu) => {
      const n = actualCount(menu);
      const values = menu.measurements.map((m) => `${m.point}:${m.value.toFixed(1)}℃(${m.kind})`).join("<br>") || "-";
      const times = menu.measurements.map((m) => esc(m.time)).join("<br>") || "-";
      const recorders = menu.measurements.map((m) => esc(m.recorder)).join("<br>") || "-";
      const judges = menu.measurements.map((m) => (m.pass ? "合格" : "不合格")).join("<br>") || "-";
      const fails = menu.measurements.filter((m) => m.kind === "fail").map((m) => `${m.value.toFixed(1)}℃`).join(" / ") || "-";
      const retests = menu.measurements.filter((m) => m.kind === "retest").map((m) => `${m.value.toFixed(1)}℃`).join(" / ") || "-";
      const alerts = [];
      if (menu.status !== "completed" && n < menu.requiredPoints && menu.status !== "not_started") alerts.push("測定点数不足");
      if (menu.status === "remeasure_wait") alerts.push("再測定待ち");
      if (menu.measurements.some((m) => m.kind === "fail" && !menu.measurements.some((x) => x.point === m.point && x.kind === "retest" && x.pass))) {
        alerts.push("基準温度未達");
      }
      if (menu.status === "reheating") alerts.push("追加加熱未完了");
      const cls = alerts.length ? "row-alert" : "";
      return `<tr class="${cls}">
        <td>${esc(menu.name)}</td>
        <td>${esc(menu.method)}</td>
        <td>${esc(menu.batch)}</td>
        <td>${menu.requiredPoints}</td>
        <td>${n}</td>
        <td>${values}</td>
        <td>${times}</td>
        <td>${recorders}</td>
        <td>${esc(state.terminal)}</td>
        <td>${judges}</td>
        <td>${fails}</td>
        <td>${retests}</td>
        <td>${STATUS_LABEL[menu.status]}${alerts.length ? "／" + alerts.join("・") : ""}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="complete-top">
      <h1 class="page-title">管理データ</h1>
      <button class="btn btn-secondary" data-action="back-to-menu">メニュー選択へ戻る</button>
    </div>
    <div class="admin-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>メニュー</th><th>調理方法</th><th>バッチ</th><th>必要測定数</th><th>実測定数</th>
            <th>測定値</th><th>測定時刻</th><th>記録者</th><th>端末</th><th>合否</th>
            <th>未達履歴</th><th>再測定値</th><th>状態</th>
          </tr>
        </thead>
        <tbody>${pendingRow}${rows}</tbody>
      </table>
    </div>
  `;
}

function renderLeakModal(state) {
  const items = listIncomplete(state);
  const resumeId = state.resumeMenuId || pickResumeMenuId(items);
  const resume = items.find((item) => item.id === resumeId) || items[0];
  const list = items
    .map(
      (item) => `
      <div class="leak-item">
        <strong>${esc(item.title)}</strong>
        <div>${esc(item.statusLine)}</div>
        ${item.detail ? `<div class="sub-msg">${esc(item.detail)}</div>` : ""}
      </div>`
    )
    .join("");
  return `
    <div class="overlay">
      <div class="modal warn">
        <div class="modal-icon">${icons.warn}</div>
        <h2>まだ測定が終わっていないものがあります</h2>
        <p class="warn-body">必要な測定をすべて完了してから、調理を完了してください</p>
        <div class="leak-list">${list}</div>
        <div class="warn-actions">
          ${
            resume
              ? `<button class="btn btn-primary btn-wide" data-action="resume-incomplete">${esc(resume.title)}の測定に戻る</button>`
              : ""
          }
          <button class="btn btn-secondary btn-sub" data-action="dismiss-incomplete">メニュー選択に戻る</button>
        </div>
      </div>
    </div>
  `;
}

function renderDayCompleteModal() {
  return `
    <div class="overlay">
      <div class="modal">
        <h2>本日の調理・測定が完了しました</h2>
        <p class="sub-msg">すべての測定結果は自動保存されています</p>
        <div class="stack-btns">
          <button class="btn btn-primary" data-action="open-admin">管理データを見る</button>
          <button class="btn btn-secondary" data-action="close-day-complete">閉じる</button>
        </div>
      </div>
    </div>
  `;
}

function renderSettings(state) {
  return `
    <div class="overlay">
      <div class="modal">
        <h2>設定</h2>
        <div class="setting-row">
          <span>警告音</span>
          <button class="toggle ${state.soundEnabled ? "on" : ""}" data-action="toggle-sound">${state.soundEnabled ? "ON" : "OFF"}</button>
        </div>
        <div class="setting-row">
          <span>測定漏れの警告音をテスト</span>
          <button class="btn btn-secondary" data-action="test-incomplete-alarm">再生</button>
        </div>
        <div class="setting-row">
          <span>追加加熱の通知音をテスト</span>
          <button class="btn btn-secondary" data-action="test-heat-notice">再生</button>
        </div>
        <div class="setting-row">
          <span>測定完了音をテスト</span>
          <button class="btn btn-secondary" data-action="test-complete">再生</button>
        </div>
        <div class="setting-row">
          <span>測定者変更</span>
          <button class="btn btn-secondary" data-action="open-operator">変更する</button>
        </div>
        <div class="setting-row">
          <span>デモをリセット</span>
          <button class="btn btn-danger" data-action="reset-demo">デモをリセット</button>
        </div>
        <div class="setting-row">
          <span>対象未選択の温度受信</span>
          <button class="btn btn-secondary" data-action="simulate-orphan">受信を発生</button>
        </div>
        ${
          state.recorderHistory.length
            ? `<p class="sub-msg" style="margin-top:16px">測定者変更履歴</p>
               <div class="meta-box">${state.recorderHistory
                 .map((h) => `<div>${esc(h.at)}：${esc(h.from)} → ${esc(h.to)}</div>`)
                 .join("")}</div>`
            : ""
        }
        <div class="stack-btns">
          <button class="btn btn-secondary" data-action="close-settings">閉じる</button>
        </div>
        <p class="build-stamp">Build v6</p>
      </div>
    </div>
  `;
}

function renderOperator(state) {
  const people = ["作業者A", "作業者B", "作業者C"];
  return `
    <div class="overlay">
      <div class="modal">
        <h2>測定者変更</h2>
        <p class="sub-msg">変更後に受信する測定値から新しい記録者へ紐づけます。</p>
        <div class="operator-list">
          ${people
            .map(
              (p) =>
                `<button class="btn ${p === state.recorder ? "btn-primary" : "btn-secondary"}" data-action="set-recorder" data-name="${p}">${p}</button>`
            )
            .join("")}
        </div>
        <div class="stack-btns">
          <button class="btn btn-secondary" data-action="close-operator">閉じる</button>
        </div>
      </div>
    </div>
  `;
}

function renderAssignModal(state) {
  const menu = currentMenu(state);
  const p = state.pendingTemp;
  if (!menu || !p) return "";
  return `
    <div class="overlay">
      <div class="modal">
        <h2>一時保留温度の確認</h2>
        <div class="meta-box">
          <div>一時保留温度：<strong>${p.value.toFixed(1)}℃</strong></div>
          <div>受信時刻：<strong>${esc(p.time)}</strong></div>
          <div>選択メニュー：<strong>${esc(menu.name)}</strong></div>
          <div>バッチ：<strong>${esc(menu.batch)}</strong></div>
          <div>測定点：<strong>${menu.nextPoint}点目</strong></div>
          <div>記録者：<strong>${esc(state.recorder)}</strong></div>
        </div>
        <div class="stack-btns">
          <button class="btn btn-primary" data-action="assign-pending">この対象に記録する</button>
          <button class="btn btn-secondary" data-action="discard-pending">破棄して測り直す</button>
        </div>
      </div>
    </div>
  `;
}
