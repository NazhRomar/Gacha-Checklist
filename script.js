import { games } from './data.js';

let state = JSON.parse(localStorage.getItem("gacha_v18")) || {
    checked: {},
    hidden: [],
    menus: [],
    energy: {},
    hideMonthly: false,
    lastD: 0,
    lastW: 0,
    lastM: 0,
    up: null,
    rs: null,
};

// --- Save & Global Functions ---
window.save = (isReset = false) => {
    state.up = new Date().toLocaleString();
    if (isReset) state.rs = new Date().toLocaleString();
    localStorage.setItem("gacha_v18", JSON.stringify(state));
    document.getElementById("last-updated").innerText = state.up || "-";
    document.getElementById("last-reset").innerText = state.rs || "-";
};

window.setEnergy = (gid) => {
    const g = games.find((x) => x.id === gid);
    const eData = state.energy[gid] || { val: 0, time: Date.now() };
    const val = prompt(`Enter current energy for ${g.name} (Max: ${g.cap})`, eData.val || 0);
    if (val !== null && val !== "") {
        state.energy[gid] = { val: Math.min(Math.max(0, parseInt(val) || 0), g.cap), time: Date.now() };
        window.save();
        buildDashboard();
    }
};

// --- UI Logic ---
function buildDashboard() {
    // Energy Header
    document.getElementById("energy-header").innerHTML = games
        .map(g => `
            <div class="energy-box ${g.style}" onclick="setEnergy('${g.id}')">
                <div class="energy-top">
                    <img src="images/${g.img}" class="energy-img">
                    <span id="val-${g.id}" class="energy-val-group">0/${g.cap}</span>
                </div>
                <div class="energy-bottom">
                    <span id="next-${g.id}">0m 00s</span>
                    <span id="full-${g.id}">Capped</span>
                </div>
            </div>`).join("");

    // Game Sections
    document.getElementById("main-dashboard").innerHTML = games
        .map(g => `
            <div class="game-section ${g.style} ${!state.hidden.includes(g.id) ? "visible" : ""}">
                <div class="game-header"><h2 class="game-title">${g.name}</h2></div>
                <div class="task-grid">
                    <div class="task-column"><div class="column-title">Daily</div>${g.daily.map((t, i) => drawItem(g.id, "d", i, t)).join("")}</div>
                    <div class="task-column"><div class="column-title">Weekly</div>${g.weekly.map((t, i) => drawItem(g.id, "w", i, t)).join("")}</div>
                    ${!state.hideMonthly ? `<div class="task-column"><div class="column-title">Monthly</div>${g.monthly.map((t, i) => drawItem(g.id, "m", i, t)).join("")}</div>` : ""}
                </div>
            </div>`).join("");

    updateMenu();
    updateLiveText();
}

function drawItem(gid, type, idx, t) {
    const id = `${gid}-${type}-${idx}`;
    const isObj = typeof t === "object";
    const label = isObj ? t.label : t;
    const checked = state.checked[id] ? "checked" : "";
    const open = state.menus.includes(id);

    // FIX: Calculate Counter Logic
    let counterLabel = "";
    if (isObj) {
        const done = t.sub.filter((_, si) => state.checked[`${id}-s-${si}`]).length;
        const total = t.min || t.sub.length;
        counterLabel = ` <span class="text-secondary">(${done}/${total})</span>`;
    }

    return `
        <div class="checklist-wrapper">
            <div class="checklist-main" onclick="toggleTask('${id}', ${isObj}, ${isObj ? t.sub.length : 0})">
                <input type="checkbox" class="form-check-input" ${checked} onclick="event.stopPropagation(); toggleTask('${id}', ${isObj}, ${isObj ? t.sub.length : 0})">
                <span class="task-label ${state.checked[id] ? "strikethrough" : ""}">${label}${counterLabel}</span>
            </div>
            ${isObj ? `<div class="checklist-toggle-box ${open ? "active" : ""}" onclick="toggleMenu('${id}', event)"><span class="toggle-arrow ${open ? "rotated" : ""}">▼</span></div>` : ""}
        </div>
        ${isObj ? `<div class="subtask-container ${open ? "open" : ""}">
            ${t.sub.map((s, si) => `
                <div class="checklist-wrapper">
                    <div class="checklist-main" onclick="toggleTask('${id}-s-${si}')">
                        <input type="checkbox" class="form-check-input" ${state.checked[`${id}-s-${si}`] ? "checked" : ""} onclick="event.stopPropagation(); toggleTask('${id}-s-${si}')">
                        <span class="task-label ${state.checked[`${id}-s-${si}`] ? "strikethrough" : ""}">${s}</span>
                    </div>
                </div>`).join("")}
        </div>` : ""}`;
}

window.toggleTask = (id, isP, count) => {
    // 1. Toggle the state of the item actually clicked
    state.checked[id] = !state.checked[id];

    // 2. Parent -> Children logic
    // If you click the main "Errands" checkbox, sync all sub-tasks to match
    if (isP) {
        for (let i = 0; i < count; i++) {
            state.checked[`${id}-s-${i}`] = state.checked[id];
        }
    }

    // 3. Child -> Parent logic (The Fix)
    // If you clicked a sub-task, check if the parent's "min" requirement is now met
    if (id.includes("-s-")) {
        const parentId = id.split("-s-")[0]; // e.g., "zzz-d-3"
        const [gid, type, idx] = parentId.split("-");
        
        // Find the game and task data
        const g = games.find(x => x.id === gid);
        const taskTypeMap = { d: "daily", w: "weekly", m: "monthly" };
        const task = g[taskTypeMap[type]][idx];

        if (typeof task === "object") {
            const done = task.sub.filter((_, si) => state.checked[`${parentId}-s-${si}`]).length;
            const target = task.min || task.sub.length;
            
            // Auto-check the parent if threshold is reached, otherwise uncheck it
            state.checked[parentId] = done >= target;
        }
    }

    window.save();
    buildDashboard();
};

window.toggleMenu = (id, e) => {
    e.stopPropagation();
    state.menus = state.menus.includes(id) ? state.menus.filter((m) => m !== id) : [...state.menus, id];
    window.save();
    buildDashboard();
};

// Attach functions to window so inline HTML onclicks can find them (since this is a module)
window.buildDashboard = buildDashboard;

// --- Timer Logic ---
function updateLiveText() {
    const now = Date.now();
    games.forEach((g) => {
        const eData = state.energy[g.id] || { val: 0, time: now };
        const msec = now - eData.time;
        const gained = Math.floor(msec / (g.rate * 60000));
        const current = Math.min(eData.val + gained, g.cap);
        const valEl = document.getElementById(`val-${g.id}`);
        if(valEl) valEl.innerText = `${current}/${g.cap}`;

        if (current < g.cap) {
            const totalMinsLeft = (g.cap - current) * g.rate - (Math.floor(msec / 60000) % g.rate);
            const finish = new Date(now + totalMinsLeft * 60000);
            document.getElementById(`full-${g.id}`).innerText = finish.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const nextSecs = g.rate * 60 - (Math.floor(msec / 1000) % (g.rate * 60));
            document.getElementById(`next-${g.id}`).innerText = `${Math.floor(nextSecs / 60)}m ${String(nextSecs % 60).padStart(2, "0")}s`;
        } else {
            document.getElementById(`full-${g.id}`).innerText = "Capped";
            document.getElementById(`next-${g.id}`).innerText = "0m 00s";
        }
    });

    const pad = (n) => n.toString().padStart(2, "0");
    const d = getReset("d") - now;
    document.getElementById("daily-timer").innerText = `${pad(Math.floor(d / 3600000))}:${pad(Math.floor((d % 3600000) / 60000))}:${pad(Math.floor((d % 60000) / 1000))}`;
    document.getElementById("weekly-timer").innerText = Math.ceil((getReset("w") - now) / 86400000) + "d";
    document.getElementById("monthly-timer").innerText = Math.ceil((getReset("m") - now) / 86400000) + "d";
}

function getReset(type) {
    const now = new Date();
    let r = new Date();
    r.setHours(4, 0, 0, 0);
    if (type === "d") { if (now >= r) r.setDate(r.getDate() + 1); }
    else if (type === "w") { 
        const d = r.getDay(), diff = (1 - d + 7) % 7; 
        r.setDate(r.getDate() + (diff === 0 && now >= r ? 7 : diff)); 
    }
    else { r.setDate(1); if (now >= r) r.setMonth(r.getMonth() + 1); }
    return r.getTime();
}

function updateMenu() {
    // We use window.toggleConfig(...) instead of trying to access 'state' directly
    let html = `<li><a class="dropdown-item d-flex align-items-center gap-2" href="#" onclick="toggleConfig('monthly'); return false;">
        <input type="checkbox" class="form-check-input mt-0" ${state.hideMonthly ? "checked" : ""}> Hide Monthly Column
    </a></li><hr class="dropdown-divider">`;

    html += games.map(g => `<li><a class="dropdown-item d-flex align-items-center gap-2" href="#" onclick="toggleConfig('game', '${g.id}'); return false;">
        <input type="checkbox" class="form-check-input mt-0" ${!state.hidden.includes(g.id) ? "checked" : ""}> ${g.name}
    </a></li>`).join("");

    document.getElementById("visibility-menu").innerHTML = html;
}

// New global function to handle menu clicks
window.toggleConfig = (type, id) => {
    if (type === 'monthly') {
        state.hideMonthly = !state.hideMonthly;
    } else if (type === 'game') {
        if (state.hidden.includes(id)) {
            state.hidden = state.hidden.filter(h => h !== id);
        } else {
            state.hidden = [...state.hidden, id];
        }
    }
    window.save();
    buildDashboard();
};

// --- Init ---
if (state.lastD < getReset("d") - 86400000) {
    games.forEach((g) => {
        g.daily.forEach((t, i) => {
            // 1. Delete the main task key
            delete state.checked[`${g.id}-d-${i}`];

            // 2. Check if this task has sub-items (like ZZZ Errands) and delete them too
            if (typeof t === "object" && t.sub) {
                t.sub.forEach((_, si) => {
                    delete state.checked[`${g.id}-d-${i}-s-${si}`];
                });
            }
        });
    });
    
    state.lastD = Date.now();
    window.save(true);
}

buildDashboard();
setInterval(updateLiveText, 1000);