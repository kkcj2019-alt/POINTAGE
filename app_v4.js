/**
 * POINTAGE PRO - LOGIQUE DE L'APPLICATION
 * Spécificités : Formatage auto (740 -> 07:40), shifts de nuit (21h - 5h)
 */

// ==========================================================================
// 1. GESTION DE L'ÉTAT ET PERSISTANCE (LOCAL STORAGE)
// ==========================================================================
let state = {
    employees: [],
    activeEmployeeId: null,
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(), // 0 = Janvier, 11 = Décembre
    pointages: {}, // Format: { employeeId: { "YYYY-MM-DD": { ... } } }
    customHolidays: {}, // Format: { "YYYY-MM-DD": "Motif" }
    dayDetails: {}, // Format: { employeeId: { "YYYY-MM-DD": { note, isEvent, eventName, eventWorked } } }
    rattrapages: {}, // Format: { employeeId: { debts: [ { id, date, hours, reason } ], recoveries: { "YYYY-MM": hours } } }
    absencePeriods: {}, // Format: { employeeId: [ { id, start, end, type, isPaid, isRecover } ] }
    absenceAlerts: { // Nouveaux paramètres d'alerte configurables
        warnMin: 3, warnMax: 4,
        adviseMin: 5, adviseMax: 6,
        releaseMin: 7
    },
    companyStructure: {} // Format: { "Dept": ["Fonc1", "Fonc2"] }
};

let editingAbsenceIndex = null;
let editingRattrapageIndex = null;

function getEasterDate(year) {
    const f = Math.floor,
          G = year % 19,
          C = f(year / 100),
          H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
          I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)),
          J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
          L = I - J,
          month = 3 + f((L + 40) / 44),
          day = L + 28 - 31 * f(month / 4);
    return new Date(year, month - 1, day);
}

function getHolidays(year) {
    const holidays = {};
    
    // Fériés fixes CI
    holidays[`${year}-01-01`] = "Jour de l'An";
    holidays[`${year}-05-01`] = "Fête du Travail";
    holidays[`${year}-08-07`] = "Fête Nationale";
    holidays[`${year}-08-15`] = "Assomption";
    holidays[`${year}-11-01`] = "Toussaint";
    holidays[`${year}-11-15`] = "Journée de la Paix";
    holidays[`${year}-12-25`] = "Noël";
    
    // Fériés mobiles chrétiens CI
    const easter = getEasterDate(year);
    
    const easterMonday = new Date(easter);
    easterMonday.setDate(easter.getDate() + 1);
    holidays[formatDateISO(easterMonday)] = "Lundi de Pâques";
    
    const ascension = new Date(easter);
    ascension.setDate(easter.getDate() + 39);
    holidays[formatDateISO(ascension)] = "Ascension";
    
    const pentecostMonday = new Date(easter);
    pentecostMonday.setDate(easter.getDate() + 50);
    holidays[formatDateISO(pentecostMonday)] = "Lundi de Pentecôte";
    
    // Fériés mobiles musulmans CI
    if (year === 2025) {
        holidays["2025-03-26"] = "Nuit du Destin";
        holidays["2025-03-31"] = "Korité (Aïd al-Fitr)";
        holidays["2025-06-07"] = "Tabaski (Aïd al-Adha)";
        holidays["2025-09-05"] = "Maouloud (Mawlid)";
    }
    else if (year === 2026) {
        holidays["2026-03-16"] = "Nuit du Destin";
        holidays["2026-03-20"] = "Korité (Aïd al-Fitr)";
        holidays["2026-05-27"] = "Tabaski (Aïd al-Adha)";
        holidays["2026-08-25"] = "Maouloud (Mawlid)";
    }
    else if (year === 2027) {
        holidays["2027-03-05"] = "Nuit du Destin";
        holidays["2027-03-09"] = "Korité (Aïd al-Fitr)";
        holidays["2027-05-16"] = "Tabaski (Aïd al-Adha)";
        holidays["2027-08-15"] = "Maouloud (Mawlid)";
    }
    
    return holidays;
}

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getHolidaysForMonth(year, month) {
    const defaultHolidays = getHolidays(year);
    const monthStr = String(month + 1).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;
    const result = {};
    
    Object.keys(defaultHolidays).forEach(dateKey => {
        if (dateKey.startsWith(prefix)) {
            result[dateKey] = defaultHolidays[dateKey];
        }
    });
    
    if (state.customHolidays) {
        Object.keys(state.customHolidays).forEach(dateKey => {
            if (dateKey.startsWith(prefix)) {
                result[dateKey] = state.customHolidays[dateKey];
            }
        });
    }
    
    return result;
}

let selectedDeptConfig = null;

function populateEmployeeFormSelects(selectedDeptValue = "", selectedFoncValue = "", formType = "add") {
    let roleInputId = "employee-role-input";
    let deptInputId = "employee-departement-input";
    let dropdownId  = "add-role-dropdown";
    if (formType === "edit") {
        roleInputId = "edit-employee-role-input";
        deptInputId = "edit-employee-departement-input";
        dropdownId  = "edit-role-dropdown";
    } else if (formType === "bulk") {
        roleInputId = "bulk-employee-role-input";
        deptInputId = "bulk-employee-departement-input";
        dropdownId  = "bulk-role-dropdown";
    }

    const roleInput = document.getElementById(roleInputId);
    const deptInput = document.getElementById(deptInputId);
    const dropdown  = document.getElementById(dropdownId);
    if (!roleInput || !dropdown) return;

    if (!state.companyStructure) state.companyStructure = {};
    const rolesWithDept = [];
    Object.entries(state.companyStructure).forEach(([dept, foncs]) => {
        if (Array.isArray(foncs)) foncs.forEach(f => { if (f) rolesWithDept.push({ name: f, dept: dept }); });
    });
    if (state.employees) {
        const existingNames = new Set(rolesWithDept.map(r => r.name));
        state.employees.forEach(emp => {
            if (emp.role && !existingNames.has(emp.role)) {
                rolesWithDept.push({ name: emp.role, dept: emp.departement || "" });
            }
        });
    }
    if (rolesWithDept.length === 0) {
        rolesWithDept.push({ name: "Employé", dept: "" });
        rolesWithDept.push({ name: "Manager", dept: "" });
    }

    const sortedRoles = rolesWithDept.sort((a, b) => a.name.localeCompare(b.name));

    function showDropdown(filter) {
        const q = (filter || "").trim().toLowerCase();
        const matches = q ? sortedRoles.filter(r => r.name.toLowerCase().includes(q)) : sortedRoles;
        if (matches.length === 0) { dropdown.style.display = "none"; return; }
        dropdown.innerHTML = "";
        matches.forEach(r => {
            const item = document.createElement("div");
            item.className = "ac-item";
            item.innerHTML = r.name + (r.dept ? '<span class="ac-dept">(' + r.dept + ')</span>' : '');
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                roleInput.value = r.name;
                if (deptInput) {
                    let fd = "";
                    Object.entries(state.companyStructure || {}).forEach(([d, fs]) => {
                        if (Array.isArray(fs) && fs.includes(r.name)) fd = d;
                    });
                    deptInput.value = fd || r.dept || "Général";
                }
                dropdown.style.display = "none";
            });
            dropdown.appendChild(item);
        });
        const parentFormGroup = roleInput.closest('.form-group');
        const groupRect = parentFormGroup ? parentFormGroup.getBoundingClientRect() : { left: 0, top: 0 };
        const rect = roleInput.getBoundingClientRect();
        dropdown.style.left = (rect.left - groupRect.left) + "px";
        dropdown.style.top = (rect.height + 2) + "px";
        dropdown.style.width = rect.width + "px";
        dropdown.style.display = "block";
    }

    if (roleInput._acBound) {
        roleInput.removeEventListener("input", roleInput._acBound);
        roleInput.removeEventListener("focus", roleInput._acFocusBound);
        roleInput.removeEventListener("blur", roleInput._acBlurBound);
    }

    const onInput = () => { showDropdown(roleInput.value); };
    const onFocus = () => { showDropdown(roleInput.value); };
    const onBlur  = () => { setTimeout(() => { dropdown.style.display = "none"; }, 150); };

    roleInput._acBound = onInput;
    roleInput._acFocusBound = onFocus;
    roleInput._acBlurBound = onBlur;
    roleInput.addEventListener("input", onInput);
    roleInput.addEventListener("focus", onFocus);
    roleInput.addEventListener("blur", onBlur);

    if (selectedFoncValue) roleInput.value = selectedFoncValue;

    const updateDept = () => {
        const val = roleInput.value.trim();
        if (deptInput) {
            let foundDept = "";
            Object.entries(state.companyStructure || {}).forEach(([dept, foncs]) => {
                if (Array.isArray(foncs) && foncs.includes(val)) foundDept = dept;
            });
            deptInput.value = foundDept || (val ? "Général" : "");
        }
    };
    updateDept();
    roleInput._deptUpdater = updateDept;
}

function renderStructureConfigModal() {
    const deptListContainer = document.getElementById("dept-list-container");
    const funcListContainer = document.getElementById("func-list-container");
    const funcPanelInactive = document.getElementById("func-panel-inactive");
    const funcPanelActive = document.getElementById("func-panel-active");
    const selectedDeptLabel = document.getElementById("selected-dept-label");
    
    if (!deptListContainer) return;
    
    // Rendu des départements
    deptListContainer.innerHTML = "";
    const depts = Object.keys(state.companyStructure || {}).sort();
    
    if (depts.length === 0) {
        deptListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px;">Aucun département configuré.</div>';
    } else {
        depts.forEach(d => {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.justify = "space-between";
            row.style.alignItems = "center";
            row.style.padding = "8px 12px";
            row.style.borderRadius = "var(--border-radius-sm)";
            row.style.background = d === selectedDeptConfig ? "rgba(59, 130, 246, 0.1)" : "var(--bg-input)";
            row.style.border = d === selectedDeptConfig ? "1px solid var(--accent-primary)" : "1px solid transparent";
            row.style.cursor = "pointer";
            
            const nameSpan = document.createElement("span");
            nameSpan.textContent = d;
            nameSpan.style.fontWeight = d === selectedDeptConfig ? "600" : "400";
            nameSpan.style.color = d === selectedDeptConfig ? "var(--accent-primary)" : "var(--text-primary)";
            nameSpan.style.fontSize = "0.85rem";
            nameSpan.style.flex = "1";
            nameSpan.addEventListener("click", () => {
                selectedDeptConfig = d;
                renderStructureConfigModal();
            });
            row.appendChild(nameSpan);

            const actionsDiv = document.createElement("div");
            actionsDiv.style.display = "flex";
            actionsDiv.style.alignItems = "center";
            actionsDiv.style.gap = "8px";

            // Edit Department Button
            const editBtn = document.createElement("button");
            editBtn.innerHTML = "&#9998;"; // Pencil icon
            editBtn.style.background = "none";
            editBtn.style.border = "none";
            editBtn.style.color = "var(--accent-primary)";
            editBtn.style.fontSize = "1rem";
            editBtn.style.cursor = "pointer";
            editBtn.style.padding = "0 4px";
            editBtn.title = "Renommer le département";
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const newName = prompt(`Renommer le département "${d}" en :`, d);
                if (newName && newName.trim() && newName.trim() !== d) {
                    const trimmedName = newName.trim();
                    if (state.companyStructure[trimmedName]) {
                        alert("Un département portant ce nom existe déjà.");
                        return;
                    }
                    // Transférer les fonctions
                    state.companyStructure[trimmedName] = state.companyStructure[d];
                    delete state.companyStructure[d];

                    // Cascader sur les employés
                    state.employees.forEach(emp => {
                        if (emp.departement === d) {
                            emp.departement = trimmedName;
                        }
                    });

                    if (selectedDeptConfig === d) selectedDeptConfig = trimmedName;
                    saveStateToLocalStorage();
                    renderStructureConfigModal();
                    generateRecapTable();
                }
            });
            actionsDiv.appendChild(editBtn);
            
            // Delete Department Button
            const delBtn = document.createElement("button");
            delBtn.innerHTML = "&times;";
            delBtn.style.background = "none";
            delBtn.style.border = "none";
            delBtn.style.color = "var(--accent-danger)";
            delBtn.style.fontSize = "1.2rem";
            delBtn.style.cursor = "pointer";
            delBtn.style.padding = "0 4px";
            delBtn.title = "Supprimer le département";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Voulez-vous supprimer le département "${d}" et toutes ses fonctions associées ?`)) {
                    delete state.companyStructure[d];
                    if (selectedDeptConfig === d) selectedDeptConfig = null;
                    saveStateToLocalStorage();
                    renderStructureConfigModal();
                    generateRecapTable();
                }
            });
            actionsDiv.appendChild(delBtn);
            
            row.appendChild(actionsDiv);
            deptListContainer.appendChild(row);
        });
    }
    
    // Rendu des fonctions
    if (selectedDeptConfig && state.companyStructure[selectedDeptConfig]) {
        if (funcPanelInactive) funcPanelInactive.style.display = "none";
        if (funcPanelActive) funcPanelActive.style.display = "block";
        if (selectedDeptLabel) selectedDeptLabel.textContent = `Département actif: ${selectedDeptConfig}`;
        
        funcListContainer.innerHTML = "";
        const foncs = state.companyStructure[selectedDeptConfig].sort();
        
        if (foncs.length === 0) {
            funcListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px;">Aucune fonction dans ce département.</div>';
        } else {
            foncs.forEach(f => {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.justify = "space-between";
                row.style.alignItems = "center";
                row.style.padding = "6px 12px";
                row.style.borderRadius = "var(--border-radius-sm)";
                row.style.background = "var(--bg-input)";
                row.style.fontSize = "0.85rem";
                
                const nameSpan = document.createElement("span");
                nameSpan.textContent = f;
                nameSpan.style.flex = "1";
                row.appendChild(nameSpan);

                const actionsDiv = document.createElement("div");
                actionsDiv.style.display = "flex";
                actionsDiv.style.alignItems = "center";
                actionsDiv.style.gap = "8px";

                // Edit Function Button
                const editBtn = document.createElement("button");
                editBtn.innerHTML = "&#9998;"; // Pencil icon
                editBtn.style.background = "none";
                editBtn.style.border = "none";
                editBtn.style.color = "var(--accent-primary)";
                editBtn.style.fontSize = "1rem";
                editBtn.style.cursor = "pointer";
                editBtn.style.padding = "0 4px";
                editBtn.title = "Renommer la fonction";
                editBtn.addEventListener("click", () => {
                    const newName = prompt(`Renommer la fonction "${f}" en :`, f);
                    if (newName && newName.trim() && newName.trim() !== f) {
                        const trimmedName = newName.trim();
                        if (state.companyStructure[selectedDeptConfig].includes(trimmedName)) {
                            alert("Cette fonction existe déjà dans ce département.");
                            return;
                        }
                        // Remplacer dans le tableau
                        state.companyStructure[selectedDeptConfig] = state.companyStructure[selectedDeptConfig].map(x => x === f ? trimmedName : x);

                        // Cascader sur les employés de ce département
                        state.employees.forEach(emp => {
                            if (emp.role === f && emp.departement === selectedDeptConfig) {
                                emp.role = trimmedName;
                            }
                        });

                        saveStateToLocalStorage();
                        renderStructureConfigModal();
                        generateRecapTable();
                    }
                });
                actionsDiv.appendChild(editBtn);
                
                // Delete Function Button
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "&times;";
                delBtn.style.background = "none";
                delBtn.style.border = "none";
                delBtn.style.color = "var(--accent-danger)";
                delBtn.style.fontSize = "1.2rem";
                delBtn.style.cursor = "pointer";
                delBtn.style.padding = "0 4px";
                delBtn.title = "Supprimer la fonction";
                delBtn.addEventListener("click", () => {
                    if (confirm(`Voulez-vous supprimer la fonction "${f}" ?`)) {
                        state.companyStructure[selectedDeptConfig] = state.companyStructure[selectedDeptConfig].filter(x => x !== f);
                        saveStateToLocalStorage();
                        renderStructureConfigModal();
                        generateRecapTable();
                    }
                });
                actionsDiv.appendChild(delBtn);
                
                row.appendChild(actionsDiv);
                funcListContainer.appendChild(row);
            });
        }
    } else {
        if (funcPanelInactive) funcPanelInactive.style.display = "block";
        if (funcPanelActive) funcPanelActive.style.display = "none";
    }
}
// === AUTHENTICATION LOGIC ===
function setupAuthUI() {
    if (!state.currentUser) return;
    
    document.getElementById("current-username-display").textContent = state.currentUser.username;
    
    if (state.currentUser.role === "ADMIN") {
        const manageBtn = document.getElementById("manage-users-btn");
        if (manageBtn) manageBtn.style.display = "flex";
        
        const closeBtn = document.getElementById("close-month-btn");
        if (closeBtn) closeBtn.style.display = "inline-flex";
    } else {
        const manageBtn = document.getElementById("manage-users-btn");
        if (manageBtn) manageBtn.style.display = "none";
        
        const closeBtn = document.getElementById("close-month-btn");
        if (closeBtn) closeBtn.style.display = "none";
    }
}

// Initialisation de l'application
document.addEventListener("DOMContentLoaded", () => {
    // Montrer l'écran de connexion immédiatement avec indicateur de chargement Firebase
    document.getElementById("login-overlay").style.display = "flex";
    showLoginLoading(true);
    
    // Failsafe: si Firebase ne répond pas en 15s, activer le bouton login quand même
    const loginFailsafe = setTimeout(() => {
        showLoginLoading(false);
        const loadingDiv = document.getElementById("firebase-loading-msg");
        if (loadingDiv) {
            loadingDiv.innerHTML = '<span style="color:#f59e0b">⚠️ Connexion lente. Vous pouvez vous connecter en mode local.</span>';
            loadingDiv.style.display = "flex";
        }
    }, 15000);
    
    try {
        setupEventListeners();
    } catch(err) {
        console.error("Erreur setupEventListeners:", err);
    }
    
    // Firebase se chargera dans loadStateFromLocalStorage et appellera refreshAllViews
    try {
        loadStateFromLocalStorage();
    } catch(err) {
        console.error("Erreur loadStateFromLocalStorage:", err);
        showLoginLoading(false);
        if (state.users.length === 0) {
            state.users.push({ id: "usr-default-admin", username: "admin", password: "", role: "ADMIN" });
            saveStateToLocalStorage();
        }
        clearTimeout(loginFailsafe);
    }
    
    // Initialise les icônes Lucide
    lucide.createIcons();
});

function showLoginLoading(isLoading) {
    let loadingDiv = document.getElementById("firebase-loading-msg");
    const loginBtn = document.querySelector("#login-form button[type='submit']");
    if (isLoading) {
        if (!loadingDiv) {
            loadingDiv = document.createElement("div");
            loadingDiv.id = "firebase-loading-msg";
            loadingDiv.style.cssText = "text-align:center; padding: 10px; color: #6b7280; font-size: 0.85rem; display:flex; align-items:center; justify-content:center; gap:8px;";
            loadingDiv.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='animation: spin 1s linear infinite;'><path d='M21 12a9 9 0 1 1-6.219-8.56'/></svg><span>Connexion à la base de données...</span>`;
            const style = document.createElement("style");
            style.textContent = "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
            document.head.appendChild(style);
            const form = document.getElementById("login-form");
            form.insertBefore(loadingDiv, form.querySelector(".modal-footer, button[type='submit']"));
        }
        loadingDiv.style.display = "flex";
        if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = "Chargement..."; }
    } else {
        if (loadingDiv) loadingDiv.style.display = "none";
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = "Se connecter"; }
    }
}

let isFirebaseInitialized = false;

function loadStateFromLocalStorage() {
    // --- 1. SESSION (clé dédiée pour ne pas être écrasée) ---
    try {
        const sessionRaw = localStorage.getItem("pps_session");
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
            const elapsed = Date.now() - (session.loginTime || 0);
            if (session.currentUser && elapsed < SESSION_TIMEOUT_MS) {
                state.currentUser = session.currentUser;
                document.getElementById("login-overlay").style.display = "none";
            } else {
                state.currentUser = null;
                localStorage.removeItem("pps_session");
            }
        } else {
            // Compatibilité ancienne version : lire l'ancien localStorage
            const old = localStorage.getItem("pointage_pro_state_local");
            if (old) {
                const oldParsed = JSON.parse(old);
                if (oldParsed.currentUser) {
                    // Migrer la session vers la nouvelle clé et conserver le user
                    state.currentUser = oldParsed.currentUser;
                    localStorage.setItem("pps_session", JSON.stringify({
                        currentUser: oldParsed.currentUser,
                        loginTime: Date.now()
                    }));
                    document.getElementById("login-overlay").style.display = "none";
                }
            }
        }
    } catch(e) { state.currentUser = null; }

    // --- 2. PRÉFÉRENCES (mois, année, employé actif) ---
    try {
        const prefsRaw = localStorage.getItem("pps_prefs");
        if (prefsRaw) {
            const prefs = JSON.parse(prefsRaw);
            const yr = parseInt(prefs.currentYear);
            const mo = parseInt(prefs.currentMonth);
            state.currentYear  = (!isNaN(yr)) ? yr : new Date().getFullYear();
            state.currentMonth = (!isNaN(mo)) ? mo : new Date().getMonth();
            state.activeEmployeeId = prefs.activeEmployeeId || null;
        } else {
            // Compatibilité ancienne version
            const old = localStorage.getItem("pointage_pro_state_local");
            if (old) {
                const oldParsed = JSON.parse(old);
                const oldYr = parseInt(oldParsed.currentYear);
                const oldMo = parseInt(oldParsed.currentMonth);
                state.currentYear = (!isNaN(oldYr)) ? oldYr : new Date().getFullYear();
                state.currentMonth = (!isNaN(oldMo)) ? oldMo : new Date().getMonth();
                state.activeEmployeeId = oldParsed.activeEmployeeId || null;
                // Sauvegarder dans la nouvelle clé pour la prochaine fois
                localStorage.setItem("pps_prefs", JSON.stringify({
                    currentYear: state.currentYear,
                    currentMonth: state.currentMonth,
                    activeEmployeeId: state.activeEmployeeId
                }));
            } else {
                state.currentYear  = new Date().getFullYear();
                state.currentMonth = new Date().getMonth();
            }
        }
    } catch(e) {
        state.currentYear  = new Date().getFullYear();
        state.currentMonth = new Date().getMonth();
    }

    // Initialisation des propriétés par défaut
    if (!state.customHolidays) state.customHolidays = {};
    if (!state.dayDetails) state.dayDetails = {};
    if (!state.rattrapages) state.rattrapages = {};
    if (!state.absencePeriods) state.absencePeriods = {};
    if (!state.companyStructure) state.companyStructure = {};
    if (!state.users) state.users = [];
    if (!state.closedMonths) state.closedMonths = [];
    if (!state.employees) state.employees = [];
    if (!state.pointages) state.pointages = {};
    if (!state.absenceAlerts) state.absenceAlerts = { warnMin: 3, warnMax: 4, adviseMin: 5, adviseMax: 6, releaseMin: 7 };

    // 2. Migration des anciennes données si nécessaire
    const oldSavedState = localStorage.getItem("pointage_pro_state");

    // 3. Connexion à Firebase avec timeout de sécurité
    if (typeof database === 'undefined' || !database) {
        console.warn("Firebase non disponible - mode local");
        isFirebaseInitialized = true;
        if (state.users.length === 0) {
            state.users.push({ id: "usr-default-admin", username: "admin", password: "", role: "ADMIN" });
        }
        showLoginLoading(false);
        refreshAllViews();
        return;
    }
    const dbRef = database.ref('globalState');

    // Timeout : si Firebase ne répond pas en 6 secondes, on utilise le mode local
    const firebaseTimeout = setTimeout(() => {
        if (!isFirebaseInitialized) {
            console.warn("Firebase timeout - mode local activé");
            isFirebaseInitialized = true;
            // Ajouter admin de secours si aucun utilisateur
            if (state.users.length === 0) {
                state.users.push({ id: "usr-default-admin", username: "admin", password: "", role: "ADMIN" });
            }
            showLoginLoading(false);
            // Afficher un avertissement discret
            const loadingDiv = document.getElementById("firebase-loading-msg");
            if (loadingDiv) {
                loadingDiv.innerHTML = `<span style="color:#f59e0b">⚠️ Mode hors-ligne. Vérifiez votre connexion Internet.</span>`;
                loadingDiv.style.display = "flex";
            }
            refreshAllViews();
        }
    }, 10000);
    
    dbRef.on('value', (snapshot) => {
        clearTimeout(firebaseTimeout);
        const data = snapshot.val();
        if (data) {
            // Mettre à jour l'état global avec les données Firebase
            state.employees = data.employees || [];
            state.pointages = data.pointages || {};
            state.customHolidays = data.customHolidays || {};
            state.dayDetails = data.dayDetails || {};
            state.rattrapages = data.rattrapages || {};
            state.absencePeriods = data.absencePeriods || {};
            state.companyStructure = data.companyStructure || {};
            state.users = data.users || [];
            state.closedMonths = data.closedMonths || [];
            state.absenceAlerts = data.absenceAlerts || { warnMin: 3, warnMax: 4, adviseMin: 5, adviseMax: 6, releaseMin: 7 };
            
            // S'assurer qu'il y a toujours un admin si la liste est vide
            if (state.users.length === 0) {
                state.users.push({ id: "usr-default-admin", username: "admin", password: "", role: "ADMIN" });
            }
            
            isFirebaseInitialized = true;
            showLoginLoading(false);
            refreshAllViews();
        } else {
            // Firebase est vide, on migre l'ancien LocalStorage si présent
            if (oldSavedState) {
                try {
                    const oldState = JSON.parse(oldSavedState);
                    state.employees = oldState.employees || [];
                    state.pointages = oldState.pointages || {};
                    state.customHolidays = oldState.customHolidays || {};
                    state.dayDetails = oldState.dayDetails || {};
                    state.rattrapages = oldState.rattrapages || {};
                    state.absencePeriods = oldState.absencePeriods || {};
                    state.companyStructure = oldState.companyStructure || {};
                    state.users = oldState.users || [];
                    state.closedMonths = oldState.closedMonths || [];
                    state.absenceAlerts = oldState.absenceAlerts || { warnMin: 3, warnMax: 4, adviseMin: 5, adviseMax: 6, releaseMin: 7 };
                    
                    if (state.users.length === 0) {
                        state.users.push({ id: "usr-" + Date.now(), username: "admin", password: "", role: "ADMIN" });
                    }
                    saveStateToLocalStorage();
                } catch(e) {}
            } else {
                createDemoData();
            }
            isFirebaseInitialized = true;
            showLoginLoading(false);
            refreshAllViews();
        }
    }, (error) => {
        // Gestionnaire d'erreur Firebase
        clearTimeout(firebaseTimeout);
        console.error("Erreur Firebase:", error);
        isFirebaseInitialized = true;
        if (state.users.length === 0) {
            state.users.push({ id: "usr-default-admin", username: "admin", password: "", role: "ADMIN" });
        }
        showLoginLoading(false);
        const loadingDiv = document.getElementById("firebase-loading-msg");
        if (loadingDiv) {
            loadingDiv.innerHTML = `<span style="color:#ef4444">❌ Erreur de connexion à la base de données (${error.code}). Vérifiez vos règles Firebase.</span>`;
            loadingDiv.style.display = "flex";
        }
        refreshAllViews();
    });
}

// Debounce pour Firebase : évite d'envoyer à chaque frappe
let firebaseSaveTimer = null;
// Flag pour détecter si l'utilisateur tape dans le tableau de pointage
let isTypingInTable = false;

function saveStateToLocalStorage() {
    // 1. Sauvegarder la session dans une clé dédiée
    if (state.currentUser) {
        localStorage.setItem("pps_session", JSON.stringify({
            currentUser: state.currentUser,
            loginTime: Date.now()
        }));
    }

    // 2. Sauvegarder les préférences (mois, année, employé actif)
    localStorage.setItem("pps_prefs", JSON.stringify({
        currentYear: state.currentYear,
        currentMonth: state.currentMonth,
        activeEmployeeId: state.activeEmployeeId
    }));

    // 3. Maintenir la compatibilité avec l'ancienne clé (pour les fonctions qui lisent encore l'ancienne clé)
    const localState = {
        currentUser: state.currentUser,
        activeEmployeeId: state.activeEmployeeId,
        currentYear: state.currentYear,
        currentMonth: state.currentMonth,
        loginTime: state.currentUser ? Date.now() : 0
    };
    localStorage.setItem("pointage_pro_state_local", JSON.stringify(localState));
    
    // 2. Synchroniser avec Firebase avec debounce de 1500ms
    if (isFirebaseInitialized) {
        clearTimeout(firebaseSaveTimer);
        firebaseSaveTimer = setTimeout(() => {
            const globalState = {
                employees: state.employees || [],
                pointages: state.pointages || {},
                customHolidays: state.customHolidays || {},
                dayDetails: state.dayDetails || {},
                rattrapages: state.rattrapages || {},
                absencePeriods: state.absencePeriods || {},
                companyStructure: state.companyStructure || {},
                users: state.users || [],
                closedMonths: state.closedMonths || [],
                absenceAlerts: state.absenceAlerts || { warnMin: 3, warnMax: 4, adviseMin: 5, adviseMax: 6, releaseMin: 7 }
            };
            database.ref('globalState').set(globalState);
        }, 1500);
    }
}

function createDemoData() {
    state.employees = [
        { id: "emp-1", matricule: "MAT-001", name: "Alassane Diallo", role: "Superviseur Jour" },
        { id: "emp-2", matricule: "MAT-002", name: "Marie-Thérèse Konan", role: "Opératrice de Saisie" },
        { id: "emp-3", matricule: "MAT-003", name: "Koffi Kra", role: "Agent de Sécurité (Nuit)" }
    ];
    state.activeEmployeeId = "emp-1";
    state.currentYear = new Date().getFullYear();
    state.currentMonth = new Date().getMonth();
    
    if (state.users.length === 0) {
        state.users.push({ id: "usr-" + Date.now(), username: "admin", password: "", role: "ADMIN" });
    }

    state.pointages = {
        "emp-1": {
            [`${state.currentYear}-${String(state.currentMonth + 1).padStart(2, '0')}-01`]: {
                arrivee: "07:30", pause: "12:00", reprise: "13:00", fin: "17:30",
                nuitActive: false, nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
            }
        }
    };
    saveStateToLocalStorage();
}

// ==========================================================================
// 2. PARSAGE ET FORMATAGE D'HEURE AUTOMATIQUE
// ==========================================================================
/**
 * Formate une saisie utilisateur en format HH:MM de manière intelligente.
 * Exemples :
 * - "7" -> "07:00"
 * - "740" -> "07:40"
 * - "12" -> "12:00"
 * - "1830" -> "18:30"
 * - "08h15" -> "08:15"
 * - "9.45" -> "09:45"
 * - "21:00" -> "21:00"
 */
function formatTimeInput(value) {
    value = value.trim();
    if (value.toUpperCase() === 'MP') return 'MP';
    
    value = value.replace(':', '');
    if (!value) return '';
    
    let hours = 0;
    let minutes = 0;
    
    if (/^\d{1,4}$/.test(value)) {
        if (value.length === 1 || value.length === 2) {
            hours = parseInt(value, 10);
            minutes = 0;
        } else if (value.length === 3) {
            hours = parseInt(value.substring(0, 1), 10);
            minutes = parseInt(value.substring(1), 10);
        } else if (value.length === 4) {
            hours = parseInt(value.substring(0, 2), 10);
            minutes = parseInt(value.substring(2), 10);
        }
    } else {
        // Tente de découper avec des séparateurs communs (h, H, ., ,)
        const parts = value.split(/[:hH.,]/);
        if (parts.length >= 1) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
        }
    }
    
    // Validation des limites de l'heure
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null; // Format invalide
    }
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ==========================================================================
// 3. LOGIQUE DE CALCUL DES HEURES (JOUR ET NUIT CÔTE D'IVOIRE)
// ==========================================================================
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
}

function minutesToHoursStr(totalMinutes) {
    if (totalMinutes === null || totalMinutes < 0) return '00:00';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minutesToDecimal(totalMinutes) {
    if (totalMinutes === null || totalMinutes < 0) return '0h';
    if (totalMinutes === 10400) return '173.33h';
    const decimal = totalMinutes / 60;
    
    const hours = Math.floor(decimal);
    let fraction = decimal - hours;
    
    // Arrondi au centième le plus proche pour comparer les tranches
    fraction = Math.round(fraction * 100) / 100;
    
    let finalFraction;
    if (fraction === 0) {
        finalFraction = 0;
    } else if (fraction >= 0.01 && fraction <= 0.30) {
        finalFraction = fraction; // Valeur réelle
    } else if (fraction >= 0.31 && fraction <= 0.50) {
        finalFraction = 0.5; // Arrondi à 0.5
    } else if (fraction >= 0.51 && fraction <= 0.69) {
        finalFraction = fraction; // Valeur réelle
    } else if (fraction >= 0.70 && fraction <= 0.99) {
        finalFraction = 1.0; // Heure suivante
    } else {
        finalFraction = fraction;
    }
    
    const finalValue = hours + finalFraction;
    
    return (Math.round(finalValue * 100) / 100) + 'h';
}

function getActiveSegments(startStr, pauseStr, resumeStr, endStr) {
    const start = timeToMinutes(startStr);
    const pause = timeToMinutes(pauseStr);
    const resume = timeToMinutes(resumeStr);
    const end = timeToMinutes(endStr);
    const segments = [];
    
    if (start !== null && end !== null) {
        let endAdjusted = end;
        if (end < start) endAdjusted += 24 * 60;
        
        if (pause !== null && resume !== null) {
            let pStart = pause;
            if (pStart < start) pStart += 24 * 60;
            let pEnd = resume;
            if (pEnd < pStart) pEnd += 24 * 60;
            
            if (pStart >= start && pEnd <= endAdjusted) {
                segments.push({ s: start, e: pStart });
                segments.push({ s: pEnd, e: endAdjusted });
            } else {
                segments.push({ s: start, e: endAdjusted });
            }
        } else if (pause !== null) {
            let pStart = pause;
            if (pStart < start) pStart += 24 * 60;
            if (pStart >= start && pStart <= endAdjusted) {
                segments.push({ s: start, e: pStart });
            } else {
                segments.push({ s: start, e: endAdjusted });
            }
        } else if (resume !== null) {
            let pEnd = resume;
            if (pEnd < start) pEnd += 24 * 60;
            if (pEnd >= start && pEnd <= endAdjusted) {
                segments.push({ s: pEnd, e: endAdjusted });
            } else {
                segments.push({ s: start, e: endAdjusted });
            }
        } else {
            segments.push({ s: start, e: endAdjusted });
        }
    } else if (start !== null && pause !== null) {
        let pStart = pause;
        if (pStart < start) pStart += 24 * 60;
        segments.push({ s: start, e: pStart });
    } else if (resume !== null && end !== null) {
        let endAdjusted = end;
        if (end < resume) endAdjusted += 24 * 60;
        segments.push({ s: resume, e: endAdjusted });
    }
    return segments;
}

/**
 * Calcule les minutes totales travaillées sur un shift.
 * Gère le passage de minuit (ex: Arrivée 22h, Fin 04h) et déduit le temps de pause.
 */
function calculateShiftMinutes(startStr, pauseStr, resumeStr, endStr) {
    const segments = getActiveSegments(startStr, pauseStr, resumeStr, endStr);
    let total = 0;
    segments.forEach(seg => {
        total += (seg.e - seg.s);
    });
    return total;
}

/**
 * Détermine le nombre de minutes qui se situent dans l'intervalle de nuit légal (21:00 - 05:00).
 */
function getNightOverlapMinutes(start, end) {
    // Intervalles de nuit sur une période de 2 jours (en minutes depuis minuit jour 1) :
    // Intervalle 1 : Jour 1 (00:00 - 05:00) -> [0, 300]
    // Intervalle 2 : Jour 1-2 (21:00 - 05:00) -> [1260, 1740]
    // Intervalle 3 : Jour 2-3 (21:00 - 05:00) -> [2700, 3180]
    const nightIntervals = [
        { s: 0, e: 300 },
        { s: 1260, e: 1740 },
        { s: 2700, e: 3180 }
    ];
    
    let overlap = 0;
    for (const interval of nightIntervals) {
        const overlapStart = Math.max(start, interval.s);
        const overlapEnd = Math.min(end, interval.e);
        if (overlapStart < overlapEnd) {
            overlap += (overlapEnd - overlapStart);
        }
    }
    return overlap;
}

/**
 * Calcule les minutes du shift qui tombent dans l'intervalle légal de nuit (21h - 5h).
 * Prend en compte la déduction de la pause si elle se trouve pendant la nuit.
 */
function calculateLegalNightMinutes(startStr, pauseStr, resumeStr, endStr) {
    const segments = getActiveSegments(startStr, pauseStr, resumeStr, endStr);
    let totalNight = 0;
    segments.forEach(seg => {
        totalNight += getNightOverlapMinutes(seg.s, seg.e);
    });
    return totalNight;
}

/**
 * Calcule et unifie toutes les durées journalières selon le type de journée (MP, Rendement, Événement, Absence...).
 */
function getRowCalculations(data, detail, periodPaid) {
    let mpMode = data.arrivee && data.arrivee.toUpperCase() === "MP";
    
    let rawJourMinutes = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
    let rawNuitMinutes = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
    let pointedMinutes = rawJourMinutes + rawNuitMinutes;
    let totalMinutes = pointedMinutes;
    
    let legalNightMinutes = 0;
    let legalDayMinutes = 0;
    
    if (mpMode) {
        totalMinutes = 480; // 8h
        legalDayMinutes = 480;
        legalNightMinutes = 0;
    } else if (periodPaid === true || data.status === "accident" || data.status === "conge" || data.status === "malade" || data.status === "faute_entreprise") {
        totalMinutes = 480; // 8h payées
        legalDayMinutes = 480;
        legalNightMinutes = 0;
    } else if (data.status === "permission_payee") {
        totalMinutes = 480; // 8h payées (permission payée)
        legalDayMinutes = 480;
        legalNightMinutes = 0;
    } else if (detail && detail.isEvent) {
        totalMinutes = detail.eventWorked ? 480 : 0;
        legalDayMinutes = totalMinutes;
        legalNightMinutes = 0;
    } else if (data.status && data.status !== "present") {
        totalMinutes = 0;
        legalDayMinutes = 0;
        legalNightMinutes = 0;
    } else {
        const overlapJour = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
        const overlapNuit = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
        legalNightMinutes = overlapJour + overlapNuit;
        legalDayMinutes = Math.max(0, totalMinutes - legalNightMinutes);
    }
    
    return {
        totalMinutes,
        legalDayMinutes,
        legalNightMinutes,
        pointedMinutes
    };
}

// ==========================================================================
// 4. CONFIGURATION ET CONTRÔLES DU DASHBOARD
// ==========================================================================
function initializeSelectors() {
    // Sélecteur de mois
    const monthSelector = document.getElementById("month-selector");
    if (monthSelector) {
        monthSelector.value = String(state.currentMonth);
    }
    
    // Sélecteur d'année (5 ans en arrière et 5 ans en avant)
    const yearSelector = document.getElementById("year-selector");
    const currentYear = new Date().getFullYear();
    yearSelector.innerHTML = "";
    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        if (y === state.currentYear) {
            option.selected = true;
        }
        yearSelector.appendChild(option);
    }
    
    // Peupler le sélecteur de jour pour l'ajout de férié
    updateHolidayDaySelector();
}

function updateHolidayDaySelector() {
    const holidayDaySelect = document.getElementById("holiday-add-day");
    if (!holidayDaySelect) return;
    
    const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
    const currentVal = parseInt(holidayDaySelect.value) || 1;
    holidayDaySelect.innerHTML = "";
    
    for (let d = 1; d <= daysInMonth; d++) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        holidayDaySelect.appendChild(opt);
    }
    
    // Restaurer la sélection si possible
    if (currentVal <= daysInMonth) {
        holidayDaySelect.value = currentVal;
    }
}

// ==========================================================================
// CENTRAL REFRESH LOGIC
// ==========================================================================
function refreshAllViews() {
    initializeSelectors();
    renderEmployeeList();
    renderHolidaysList();
    if (state.currentUser) {
        document.getElementById("login-overlay").style.display = "none";
    } else {
        document.getElementById("login-overlay").style.display = "flex";
    }
    const activeTab = document.querySelector(".tab-content.active");
    if (activeTab) {
        refreshTabContent(activeTab.id);
    }
}

function refreshTabContent(targetId) {
    if (targetId === "tab-pointage") {
        generateTable();
    } else if (targetId === "tab-recap") {
        generateRecapTable();
    } else if (targetId === "tab-suivi") {
        initSuiviTab();
    } else if (targetId === "tab-rapport-presence") {
        syncRapportDatesWithGlobal();
        initRapportTab();
        generatePresenceReport();
    } else if (targetId === "tab-parametres") {
        initParametresTab();
    }
}

function getActiveTabId() {
    const active = document.querySelector(".tab-btn.active");
    return active ? active.getAttribute("data-tab") : "tab-pointage";
}

function printSuiviReport() {
    const dateInput = document.getElementById("suivi-date-input");
    if (!dateInput || !dateInput.value) { alert("Veuillez sélectionner une date."); return; }
    window.print();
}

function setupEventListeners() {
    // Filtres
    document.getElementById("month-selector").addEventListener("change", (e) => {
        state.currentMonth = parseInt(e.target.value, 10);
        // Sauvegarder les préférences immédiatement dans la clé dédiée
        localStorage.setItem("pps_prefs", JSON.stringify({
            currentYear: state.currentYear,
            currentMonth: state.currentMonth,
            activeEmployeeId: state.activeEmployeeId
        }));
        saveStateToLocalStorage();
        updateHolidayDaySelector();
        
        // Synchroniser le filtre local des inactifs avec le mois global
        const inactMonthSel = document.getElementById("inactive-filter-month");
        if (inactMonthSel) inactMonthSel.value = state.currentMonth;
        
        refreshAllViews();
    });
    
    document.getElementById("year-selector").addEventListener("change", (e) => {
        state.currentYear = parseInt(e.target.value, 10);
        // Sauvegarder les préférences immédiatement dans la clé dédiée
        localStorage.setItem("pps_prefs", JSON.stringify({
            currentYear: state.currentYear,
            currentMonth: state.currentMonth,
            activeEmployeeId: state.activeEmployeeId
        }));
        saveStateToLocalStorage();
        updateHolidayDaySelector();
        
        // Mettre à jour l'affichage de l'année en grand
        const yearDisplay = document.getElementById("current-year-display");
        if (yearDisplay) yearDisplay.textContent = state.currentYear;

        // Synchroniser le filtre local des inactifs avec l'année globale
        const inactYearSel = document.getElementById("inactive-filter-year");
        if (inactYearSel) inactYearSel.value = state.currentYear;
        
        refreshAllViews();
    });
    
    // Onglets (Tabs)
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            document.getElementById(targetId).classList.add("active");
            
            // Sauvegarder l'onglet actif
            localStorage.setItem("activeTab", targetId);
            
            // Toujours rafraîchir le contenu de l'onglet activé
            refreshTabContent(targetId);
        });
    });
    
    // Alert settings modal
    const configAlertsBtn = document.getElementById("config-alerts-btn");
    const alertModal = document.getElementById("alert-settings-modal");
    if (configAlertsBtn && alertModal) {
        configAlertsBtn.addEventListener("click", () => {
            const alerts = state.absenceAlerts;
            document.getElementById("alert-warn-min").value = alerts.warnMin;
            document.getElementById("alert-warn-max").value = alerts.warnMax;
            document.getElementById("alert-advise-min").value = alerts.adviseMin;
            document.getElementById("alert-advise-max").value = alerts.adviseMax;
            document.getElementById("alert-release-min").value = alerts.releaseMin;
            alertModal.classList.add("active");
        });
        
        const saveAlertBtn = document.getElementById("save-alert-settings-btn");
        if (saveAlertBtn) {
            saveAlertBtn.addEventListener("click", () => {
                state.absenceAlerts = {
                    warnMin: parseInt(document.getElementById("alert-warn-min").value) || 3,
                    warnMax: parseInt(document.getElementById("alert-warn-max").value) || 4,
                    adviseMin: parseInt(document.getElementById("alert-advise-min").value) || 5,
                    adviseMax: parseInt(document.getElementById("alert-advise-max").value) || 6,
                    releaseMin: parseInt(document.getElementById("alert-release-min").value) || 7
                };
                saveStateToLocalStorage();
                alertModal.classList.remove("active");
                generateRecapTable();
            });
        }
    }
    
    // Bouton de Nuit
    const nightToggleCb = document.getElementById("show-night-columns-cb");
    if (nightToggleCb) {
        nightToggleCb.addEventListener("change", () => {
            updateTableNightVisibility(false);
        });
    }
    
    // Effacer le mois
    document.getElementById("clear-month-btn").addEventListener("click", () => {
        if (confirm("Voulez-vous vraiment effacer toutes les saisies pour ce mois ?")) {
            clearActiveMonthData();
        }
    });

    const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener("click", () => {
            document.querySelector(".app-container").classList.toggle("sidebar-collapsed");
        });
    }

    // Appliquer 173.33h par défaut à l'employé actif
    const applyDefaultBtn = document.getElementById("apply-default-month-btn");
    if (applyDefaultBtn) {
        applyDefaultBtn.addEventListener("click", () => {
            if (!state.activeEmployeeId) return;
            if (confirm("Voulez-vous appliquer le pointage par défaut (173.33h) à cet employé pour ce mois-ci ? Les saisies existantes seront écrasées.")) {
                applyDefaultPointingToEmployees([state.activeEmployeeId]);
            }
        });
    }

    // Thèmes (Clair / Sombre)
    const lightBtn = document.getElementById("light-theme-btn");
    const darkBtn = document.getElementById("dark-theme-btn");
    
    // Détecter le thème actif initial
    const currentTheme = localStorage.getItem("pointage_theme") || "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    if (currentTheme === "dark") {
        darkBtn.classList.add("active");
        lightBtn.classList.remove("active");
    }

    lightBtn.addEventListener("click", () => {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("pointage_theme", "light");
        lightBtn.classList.add("active");
        darkBtn.classList.remove("active");
    });

    darkBtn.addEventListener("click", () => {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("pointage_theme", "dark");
        darkBtn.classList.add("active");
        lightBtn.classList.remove("active");
    });

    // Modals
    const modal = document.getElementById("add-employee-modal");
    const addBtn = document.getElementById("add-employee-btn");
    const closeBtns = document.querySelectorAll(".close-modal-btn");
    const form = document.getElementById("add-employee-form");

    addBtn.addEventListener("click", () => {
        populateEmployeeFormSelects("", "", "add");
        modal.classList.add("active");
        // Pr\u00e9remplir le transport par d\u00e9faut \u00e0 30 000 FCFA
        const transportInput = document.getElementById("employee-transport-input");
        if (transportInput && !transportInput.value) {
            transportInput.value = "30000";
        }
        document.getElementById("employee-matricule-input").focus();
    });

    closeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Fermer le modal parent (pas seulement le modal d'ajout)
            const parentModal = btn.closest(".modal");
            if (parentModal) {
                parentModal.classList.remove("active");
                // Reset le formulaire du modal fermé, si présent
                const modalForm = parentModal.querySelector("form");
                if (modalForm) modalForm.reset();
            }
        });
    });

    // Recherche d'employés
    const searchInput = document.getElementById("employee-search");
    const clearSearchBtn = document.getElementById("clear-search-btn");
    
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const hasValue = searchInput.value.trim().length > 0;
            if (clearSearchBtn) clearSearchBtn.style.display = hasValue ? 'flex' : 'none';
            renderEmployeeList();
        });
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            clearSearchBtn.style.display = 'none';
            renderEmployeeList();
        });
    }
    
    const showInactiveCb = document.getElementById("show-inactive-cb");
    if (showInactiveCb) {
        showInactiveCb.addEventListener("change", () => {
            renderEmployeeList();
        });
    }

    const recapDepSelect = document.getElementById("recap-filter-departement");
    if (recapDepSelect) {
        recapDepSelect.addEventListener("change", generateRecapTable);
    }
    const recapFoncSelect = document.getElementById("recap-filter-fonction");
    if (recapFoncSelect) {
        recapFoncSelect.addEventListener("change", generateRecapTable);
    }

    const bulkDefaultBtn = document.getElementById("bulk-default-pointing-btn");
    const bulkClearBtn = document.getElementById("bulk-clear-selection-btn");
    
    if (bulkDefaultBtn) {
        bulkDefaultBtn.addEventListener("click", () => {
            const selectedIds = Array.from(document.querySelectorAll(".emp-select-cb:checked")).map(cb => cb.value);
            if (selectedIds.length === 0) return;
            
            if (confirm(`Voulez-vous appliquer le pointage par défaut (173.33h) pour ${selectedIds.length} employé(s) ce mois-ci ?`)) {
                applyDefaultPointingToEmployees(selectedIds);
            }
        });
    }
    
    if (bulkClearBtn) {
        bulkClearBtn.addEventListener("click", () => {
            document.querySelectorAll(".emp-select-cb:checked").forEach(cb => cb.checked = false);
            toggleBulkActionBar();
        });
    }

    // --- Modal Pointage Groupé ---
    const bulkCustomPointingModal = document.getElementById("bulk-custom-pointing-modal");
    const openGroupPointingBtn = document.getElementById("open-group-pointing-btn");
    const bulkCustomPointingBtn = document.getElementById("bulk-custom-pointing-btn");
    let groupPointingRememberedIds = [];
    let groupPointingLastFuncFilter = "";

    const BP_TIME_IDS = ["bulk-pointing-arr","bulk-pointing-pau","bulk-pointing-rep","bulk-pointing-fin","bulk-pointing-narr","bulk-pointing-npau","bulk-pointing-nrep","bulk-pointing-nfin"];

    function refreshGroupPointingEmpList(preselectedIds) {
        const empList = document.getElementById("bulk-pointing-employee-list");
        const countLabel = document.getElementById("bulk-custom-pointing-count-label");
        const funcFilter = document.getElementById("bulk-pointing-func-filter");
        const dayVal = parseInt(document.getElementById("bulk-pointing-date").value);
        const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
        const dateKey = (dayVal >= 1 && dayVal <= daysCount)
            ? `${state.currentYear}-${String(state.currentMonth + 1).padStart(2,'0')}-${String(dayVal).padStart(2,'0')}`
            : null;

        const activeEmps = (state.employees || []).filter(e => e.isActive !== false);

        // Populate function filter
        const funcs = new Set();
        activeEmps.forEach(e => { if (e.role) funcs.add(e.role); });
        const prevFunc = funcFilter.value;
        funcFilter.innerHTML = '<option value="">Toutes</option>';
        [...funcs].sort().forEach(f => {
            const o = document.createElement("option");
            o.value = f; o.textContent = f;
            funcFilter.appendChild(o);
        });
        funcFilter.value = prevFunc || "";

        const selectedFunc = funcFilter.value;
        const filteredEmps = selectedFunc ? activeEmps.filter(e => e.role === selectedFunc) : activeEmps;

        empList.innerHTML = "";
        filteredEmps.forEach(emp => {
            const existing = (dateKey && state.pointages[emp.id] && state.pointages[emp.id][dateKey]) ? state.pointages[emp.id][dateKey] : null;
            const hasData = existing && (existing.arrivee || existing.pause || existing.reprise || existing.fin || existing.nuitDebut);
            const isAdmin = state.currentUser && state.currentUser.role === "ADMIN";

            const label = document.createElement("label");
            label.style.cssText = "display:flex; align-items:center; gap:8px; padding:5px 6px; cursor:pointer; font-size:0.82rem; border-bottom:1px solid var(--border-color);";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "bulk-pointing-emp-cb";
            cb.value = emp.id;
            if (hasData) {
                cb.checked = true;
                cb.disabled = !isAdmin;
            } else if (preselectedIds && preselectedIds.includes(emp.id)) {
                cb.checked = true;
            }
            cb.addEventListener("change", () => {
                countLabel.textContent = document.querySelectorAll(".bulk-pointing-emp-cb:checked").length + " employé(s) sélectionné(s)";
            });

            const nameSpan = document.createElement("span");
            nameSpan.textContent = (emp.matricule ? emp.matricule + " — " : "") + emp.name;

            label.appendChild(cb);
            label.appendChild(nameSpan);

            if (hasData) {
                const infoSpan = document.createElement("span");
                const parts = [];
                if (existing.arrivee) parts.push("A:" + existing.arrivee);
                if (existing.pause) parts.push("P:" + existing.pause);
                if (existing.reprise) parts.push("R:" + existing.reprise);
                if (existing.fin) parts.push("F:" + existing.fin);
                if (existing.nuitDebut) parts.push("N:" + existing.nuitDebut);
                infoSpan.style.cssText = "color:var(--accent-day); font-size:0.7rem; margin-left:auto; white-space:nowrap; font-weight:600;";
                infoSpan.textContent = parts.join(" ");
                label.appendChild(infoSpan);
            } else if (emp.role) {
                const roleSpan = document.createElement("span");
                roleSpan.style.cssText = "color:var(--text-muted); font-size:0.72rem; margin-left:auto; white-space:nowrap;";
                roleSpan.textContent = emp.role;
                label.appendChild(roleSpan);
            }

            empList.appendChild(label);
        });

        countLabel.textContent = document.querySelectorAll(".bulk-pointing-emp-cb:checked").length + " employé(s) sélectionné(s)";
    }

    function openGroupPointingModal(preselectedIds) {
        if (!bulkCustomPointingModal) return;

        const ids = preselectedIds && preselectedIds.length > 0 ? preselectedIds : groupPointingRememberedIds;
        groupPointingRememberedIds = ids;

        const today = new Date();
        let defDate = "";
        if (today.getFullYear() === state.currentYear && today.getMonth() === state.currentMonth) {
            defDate = today.getDate();
        }
        document.getElementById("bulk-pointing-date").value = defDate;
        document.getElementById("bulk-pointing-absence-cb").checked = false;
        document.getElementById("bulk-pointing-night-cb").checked = false;
        BP_TIME_IDS.forEach(id => { const el = document.getElementById(id); if (el) { el.value = ""; el.readOnly = false; el.style.opacity = "1"; } });
        document.getElementById("bulk-pointing-hours-container").style.opacity = "1";
        document.getElementById("bulk-pointing-hours-container").style.pointerEvents = "auto";
        document.getElementById("bulk-pointing-night-container").style.display = "none";

        refreshGroupPointingEmpList(ids);
        const funcFilterEl = document.getElementById("bulk-pointing-func-filter");
        if (funcFilterEl && groupPointingLastFuncFilter) {
            funcFilterEl.value = groupPointingLastFuncFilter;
            refreshGroupPointingEmpList(ids);
        }
        bulkCustomPointingModal.classList.add("active");
    }

    if (openGroupPointingBtn) {
        openGroupPointingBtn.addEventListener("click", () => openGroupPointingModal([]));
    }
    if (bulkCustomPointingBtn) {
        bulkCustomPointingBtn.addEventListener("click", () => {
            const ids = Array.from(document.querySelectorAll(".emp-select-cb:checked")).map(cb => cb.value);
            openGroupPointingModal(ids.length > 0 ? ids : []);
        });
    }

    const selectAllBtn = document.getElementById("bulk-pointing-select-all");
    const unselectAllBtn = document.getElementById("bulk-pointing-unselect-all");
    const funcFilterSelect = document.getElementById("bulk-pointing-func-filter");
    if (selectAllBtn) selectAllBtn.addEventListener("click", () => {
        document.querySelectorAll(".bulk-pointing-emp-cb:not(:disabled)").forEach(cb => cb.checked = true);
        document.getElementById("bulk-custom-pointing-count-label").textContent = document.querySelectorAll(".bulk-pointing-emp-cb:checked").length + " employé(s) sélectionné(s)";
    });
    if (unselectAllBtn) unselectAllBtn.addEventListener("click", () => {
        document.querySelectorAll(".bulk-pointing-emp-cb:not(:disabled)").forEach(cb => cb.checked = false);
        document.getElementById("bulk-custom-pointing-count-label").textContent = "0 employé(s) sélectionné(s)";
    });
    if (funcFilterSelect) funcFilterSelect.addEventListener("change", () => {
        groupPointingLastFuncFilter = funcFilterSelect.value;
        const checkedIds = Array.from(document.querySelectorAll(".bulk-pointing-emp-cb:checked")).map(cb => cb.value);
        refreshGroupPointingEmpList(checkedIds);
    });

    const bulkPointingDateInput = document.getElementById("bulk-pointing-date");
    if (bulkPointingDateInput) {
        bulkPointingDateInput.addEventListener("change", () => {
            const checkedIds = Array.from(document.querySelectorAll(".bulk-pointing-emp-cb:checked")).map(cb => cb.value);
            refreshGroupPointingEmpList(checkedIds);
        });
    }

    if (bulkCustomPointingModal) {
        document.getElementById("bulk-pointing-absence-cb").addEventListener("change", (e) => {
            const c = document.getElementById("bulk-pointing-hours-container");
            c.style.opacity = e.target.checked ? "0.3" : "1";
            c.style.pointerEvents = e.target.checked ? "none" : "auto";
        });

        document.getElementById("bulk-pointing-night-cb").addEventListener("change", (e) => {
            document.getElementById("bulk-pointing-night-container").style.display = e.target.checked ? "grid" : "none";
        });

        bulkCustomPointingModal.querySelectorAll(".time-input").forEach(input => {
            input.addEventListener("input", (e) => {
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length >= 3) {
                    const formatted = formatTimeInput(val);
                    if (formatted !== null) {
                        e.target.value = formatted;
                        const visible = BP_TIME_IDS.filter(id => { const el = document.getElementById(id); return el && el.offsetParent !== null && !el.readOnly; });
                        const idx = visible.indexOf(e.target.id);
                        if (idx >= 0 && idx < visible.length - 1) {
                            document.getElementById(visible[idx + 1]).focus();
                        }
                    }
                }
            });
            input.addEventListener("blur", (e) => {
                const formatted = formatTimeInput(e.target.value);
                if (formatted !== null) e.target.value = formatted;
            });
        });

        document.getElementById("confirm-bulk-custom-pointing-btn").addEventListener("click", () => {
            const dayVal = parseInt(document.getElementById("bulk-pointing-date").value);
            const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
            if (isNaN(dayVal) || dayVal < 1 || dayVal > daysCount) {
                alert("Veuillez entrer un jour valide (1 à " + daysCount + ").");
                return;
            }

            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dayStr = String(dayVal).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;

            const selectedIds = Array.from(document.querySelectorAll(".bulk-pointing-emp-cb:checked")).map(cb => cb.value);
            if (selectedIds.length === 0) { alert("Veuillez sélectionner au moins un employé."); return; }

            const isAbsent = document.getElementById("bulk-pointing-absence-cb").checked;
            const isNight = document.getElementById("bulk-pointing-night-cb").checked;

            const getT = (id) => {
                let v = document.getElementById(id).value;
                let fmt = formatTimeInput(v);
                return fmt !== null ? fmt : v;
            };

            const arr = getT("bulk-pointing-arr");
            const pau = getT("bulk-pointing-pau");
            const rep = getT("bulk-pointing-rep");
            const fin = getT("bulk-pointing-fin");
            const narr = getT("bulk-pointing-narr");
            const npau = getT("bulk-pointing-npau");
            const nrep = getT("bulk-pointing-nrep");
            const nfin = getT("bulk-pointing-nfin");

            let applyCount = 0;

            selectedIds.forEach(empId => {
                if (!state.pointages[empId]) state.pointages[empId] = {};
                const existing = state.pointages[empId][dateKey] || {};

                if (isAbsent) {
                    state.pointages[empId][dateKey] = {
                        arrivee: "", pause: "", reprise: "", fin: "",
                        nuitActive: false, nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
                        status: "absent", observation: existing.observation || ""
                    };
                } else {
                    state.pointages[empId][dateKey] = {
                        arrivee: arr || existing.arrivee || "",
                        pause: pau || existing.pause || "",
                        reprise: rep || existing.reprise || "",
                        fin: fin || existing.fin || "",
                        nuitActive: isNight,
                        nuitDebut: isNight ? (narr || existing.nuitDebut || "") : (existing.nuitDebut || ""),
                        nuitPause: isNight ? (npau || existing.nuitPause || "") : (existing.nuitPause || ""),
                        nuitReprise: isNight ? (nrep || existing.nuitReprise || "") : (existing.nuitReprise || ""),
                        nuitFin: isNight ? (nfin || existing.nuitFin || "") : (existing.nuitFin || ""),
                        status: "present",
                        observation: existing.observation || ""
                    };
                }
                applyCount++;
            });

            saveStateToLocalStorage();
            generateTable();
            alert(`Pointage appliqué avec succès pour ${applyCount} employé(s).`);

            BP_TIME_IDS.forEach(id => { const el = document.getElementById(id); if (el) { el.value = ""; } });
            const checkedIds = selectedIds;
            refreshGroupPointingEmpList(checkedIds);
        });
    }

    // Structure Config Modal Global Access
    window.openStructureConfigModal = function() {
        selectedDeptConfig = null;
        renderStructureConfigModal();
        const structModal = document.getElementById("config-structure-modal");
        if (structModal) structModal.classList.add("active");
    };

    // Add Dept
    const addDeptBtn = document.getElementById("add-dept-btn");
    const newDeptInput = document.getElementById("new-dept-name");
    if (addDeptBtn && newDeptInput) {
        addDeptBtn.addEventListener("click", () => {
            const name = newDeptInput.value.trim();
            if (!name) return;
            if (!state.companyStructure) state.companyStructure = {};
            if (state.companyStructure[name]) {
                alert("Ce département existe déjà.");
                return;
            }
            state.companyStructure[name] = [];
            newDeptInput.value = "";
            saveStateToLocalStorage();
            selectedDeptConfig = name;
            renderStructureConfigModal();
        });
    }

    // Add Function
    const addFuncBtn = document.getElementById("add-func-btn");
    const newFuncInput = document.getElementById("new-func-name");
    if (addFuncBtn && newFuncInput) {
        addFuncBtn.addEventListener("click", () => {
            const name = newFuncInput.value.trim();
            if (!name || !selectedDeptConfig) return;
            if (state.companyStructure[selectedDeptConfig].includes(name)) {
                alert("Cette fonction existe déjà dans ce département.");
                return;
            }
            state.companyStructure[selectedDeptConfig].push(name);
            newFuncInput.value = "";
            saveStateToLocalStorage();
            renderStructureConfigModal();
        });
    }

    // Bulk assign function events
    const bulkAssignBtn = document.getElementById("bulk-assign-role-btn");
    const bulkAssignModal = document.getElementById("bulk-assign-role-modal");
    if (bulkAssignBtn && bulkAssignModal) {
        bulkAssignBtn.addEventListener("click", () => {
            const selectedIds = Array.from(document.querySelectorAll(".emp-select-cb:checked")).map(cb => cb.value);
            if (selectedIds.length === 0) return;

            const countLabel = document.getElementById("bulk-assign-count-label");
            if (countLabel) {
                countLabel.textContent = `Affecter une fonction à ${selectedIds.length} employé(s) sélectionné(s).`;
            }

            populateEmployeeFormSelects("", "", "bulk");
            bulkAssignModal.classList.add("active");
        });
    }

    const confirmBulkAssignBtn = document.getElementById("confirm-bulk-assign-btn");
    const bulkFoncSelect = document.getElementById("bulk-employee-role-input");
    if (confirmBulkAssignBtn && bulkAssignModal) {
        confirmBulkAssignBtn.addEventListener("click", () => {
            const selectedRole = bulkFoncSelect.value;
            if (!selectedRole) {
                alert("Veuillez sélectionner une fonction.");
                return;
            }

            const selectedOpt = bulkFoncSelect.options[bulkFoncSelect.selectedIndex];
            const resolvedDept = selectedOpt ? (selectedOpt.getAttribute("data-dept") || "Non Défini") : "Non Défini";

            const selectedIds = Array.from(document.querySelectorAll(".emp-select-cb:checked")).map(cb => cb.value);
            
            selectedIds.forEach(id => {
                const emp = state.employees.find(e => e.id === id);
                if (emp) {
                    emp.role = selectedRole;
                    emp.departement = resolvedDept;
                }
            });

            saveStateToLocalStorage();
            renderEmployeeList();
            updateActiveEmployeeUI();
            generateRecapTable();

            // Fermer modal et nettoyer la sélection
            bulkAssignModal.classList.remove("active");
            document.querySelectorAll(".emp-select-cb:checked").forEach(cb => cb.checked = false);
            toggleBulkActionBar();
        });
    }

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const matricule = document.getElementById("employee-matricule-input").value.trim();
        const name = document.getElementById("employee-name-input").value.trim();
        const role = document.getElementById("employee-role-input").value.trim();
        const departement = document.getElementById("employee-departement-input").value.trim();
        
        if (name && matricule) {
            // Vérifier l'unicité du matricule
            const existingMat = state.employees.find(e => e.matricule && e.matricule.toLowerCase() === matricule.toLowerCase());
            if (existingMat) {
                alert(`Le matricule "${matricule}" est déjà utilisé par ${existingMat.name}.`);
                return;
            }
            
            const tauxTransportVal = document.getElementById("employee-transport-input").value.trim();
            const startDateVal = document.getElementById("employee-start-date-input").value;
            const newEmp = {
                id: "emp-" + Date.now(),
                matricule: matricule,
                name: name,
                role: role || "Employé",
                departement: departement || "Non Défini",
                isRendement: document.getElementById("employee-rendement-cb").checked,
                tauxTransport: tauxTransportVal ? parseFloat(tauxTransportVal) : 30000,
                startDate: startDateVal || null
            };
            state.employees.push(newEmp);
            state.activeEmployeeId = newEmp.id;
            
            saveStateToLocalStorage();
            updateActiveEmployeeUI();
            refreshAllViews();
            
            modal.classList.remove("active");
            form.reset();
        }
    });

    const editForm = document.getElementById("edit-employee-form");
    if (editForm) {
        editForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const id = document.getElementById("edit-employee-id").value;
            const matricule = document.getElementById("edit-employee-matricule-input").value.trim();
            const name = document.getElementById("edit-employee-name-input").value.trim();
            const role = document.getElementById("edit-employee-role-input").value.trim();
            const departement = document.getElementById("edit-employee-departement-input").value.trim();
            const isActive = document.getElementById("edit-employee-active-cb").checked;
            
            const empIndex = state.employees.findIndex(emp => emp.id === id);
            if (empIndex >= 0 && name && matricule) {
                // Vérifier l'unicité du matricule (hors cet employé)
                const existingMat = state.employees.find(e => e.id !== id && e.matricule && e.matricule.toLowerCase() === matricule.toLowerCase());
                if (existingMat) {
                    alert(`Le matricule "${matricule}" est déjà utilisé par ${existingMat.name}.`);
                    return;
                }
                
                state.employees[empIndex].matricule = matricule;
                state.employees[empIndex].name = name;
                state.employees[empIndex].role = role || "Employé";
                state.employees[empIndex].departement = departement || "Non Défini";
                state.employees[empIndex].isRendement = document.getElementById("edit-employee-rendement-cb").checked;
                const editTauxVal = document.getElementById("edit-employee-transport-input").value.trim();
                state.employees[empIndex].tauxTransport = editTauxVal ? parseFloat(editTauxVal) : 0;
                state.employees[empIndex].startDate = document.getElementById("edit-employee-start-date-input").value || null;
                
                if (!isActive) {
                    state.employees[empIndex].inactiveFrom = {
                        month: parseInt(document.getElementById("edit-employee-inact-month").value, 10),
                        year: parseInt(document.getElementById("edit-employee-inact-year").value, 10)
                    };
                } else {
                    delete state.employees[empIndex].inactiveFrom;
                }
                
                saveStateToLocalStorage();
                updateActiveEmployeeUI();
                refreshAllViews();
                
                document.getElementById("edit-employee-modal").classList.remove("active");
            }
        });
    }

    const dayDetailsForm = document.getElementById("day-details-form");
    if (dayDetailsForm) {
        dayDetailsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!state.activeEmployeeId) return;
            const dateKey = document.getElementById("day-details-date").value;
            const note = document.getElementById("day-details-note").value;
            const isEvent = document.getElementById("day-details-event-active-cb").checked;
            const eventName = document.getElementById("day-details-event-name").value;
            const eventWorked = document.getElementById("day-details-event-worked-cb").checked;
            
            if (!state.dayDetails[state.activeEmployeeId]) state.dayDetails[state.activeEmployeeId] = {};
            state.dayDetails[state.activeEmployeeId][dateKey] = { note, isEvent, eventName, eventWorked };
            
            saveStateToLocalStorage();
            generateTable();
            document.getElementById("day-details-modal").classList.remove("active");
        });
        
        const eventActiveCb = document.getElementById("day-details-event-active-cb");
        if(eventActiveCb) {
            eventActiveCb.addEventListener("change", function() {
                document.getElementById("day-details-event-details").style.display = this.checked ? "block" : "none";
            });
        }
    }

    // Unified print button — adapts to active tab
    document.getElementById("header-print-btn").addEventListener("click", () => {
        const activeTab = getActiveTabId();
        if (activeTab === "tab-pointage") {
            printAll();
        } else if (activeTab === "tab-recap") {
            printRecapDashboard();
        } else if (activeTab === "tab-rapport-presence") {
            printPresenceReport();
        } else if (activeTab === "tab-synthese") {
            exportSynthesisPDF(state.employees.map(e => e.id));
        } else if (activeTab === "tab-suivi") {
            window.print();
        } else if (activeTab === "tab-ajustements") {
            window.print();
        } else {
            window.print();
        }
    });
    
    // Initialiser les écouteurs de formulaires
    setupAbsenceAddListener();
}

// ==========================================================================
// 5. GESTION DES EMPLOYÉS
// ==========================================================================
function isEmployeeActive(emp) {
    if (!emp.inactiveFrom) return true;
    if (state.currentYear < emp.inactiveFrom.year) return true;
    if (state.currentYear > emp.inactiveFrom.year) return false;
    return state.currentMonth <= emp.inactiveFrom.month;
}

function renderEmployeeList() {
    const list = document.getElementById("employee-list");
    list.innerHTML = "";
    
    if (state.employees.length === 0) {
        list.innerHTML = `<li class="info-tip" style="padding: 10px;">Aucun employé.</li>`;
        return;
    }

    // Recherche
    const searchInput = document.getElementById("employee-search");
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
    
    // Filtre inactif
    const showInactiveCb = document.getElementById("show-inactive-cb");
    const showInactive = showInactiveCb ? showInactiveCb.checked : false;
    
    // Trier par matricule (numérique puis alphabétique)
    const sortedEmployees = [...state.employees].sort((a, b) => {
        const matA = (a.matricule || "").toLowerCase();
        const matB = (b.matricule || "").toLowerCase();
        const numA = parseInt(matA.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(matB.replace(/[^0-9]/g, ''), 10) || 0;
        
        if (numA !== numB) return numA - numB;
        return matA.localeCompare(matB, 'fr', { numeric: true });
    });
    
    // Filtrer
    const filteredEmployees = sortedEmployees.filter(emp => {
        // Filtrer par statut actif/inactif
        if (!showInactive && !isEmployeeActive(emp)) return false;
        
        // Filtrer par recherche
        if (!searchTerm) return true;
        const nameMatch = emp.name.toLowerCase().includes(searchTerm);
        const matriculeMatch = (emp.matricule || "").toLowerCase().includes(searchTerm);
        return nameMatch || matriculeMatch;
    });
    
    if (filteredEmployees.length === 0) {
        list.innerHTML = `<li class="info-tip" style="padding: 10px;">Aucun résultat trouvé.</li>`;
        return;
    }

    filteredEmployees.forEach(emp => {
        const li = document.createElement("li");
        const isActive = isEmployeeActive(emp);
        li.className = `employee-item ${emp.id === state.activeEmployeeId ? 'active' : ''} ${!isActive ? 'inactive-emp' : ''}`;
        li.setAttribute("data-id", emp.id);
        if (!isActive) {
            li.style.opacity = "0.6";
        }
        
        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" class="emp-select-cb" value="${emp.id}" style="cursor: pointer;">
                <div class="employee-item-info">
                    <span class="employee-matricule">${emp.matricule || '—'} ${!isActive ? '(Inactif)' : ''}</span>
                    <strong>${emp.name}</strong>
                    <span class="employee-role">${emp.role}</span>
                </div>
            </div>
            <div style="display: flex; gap: 4px;">
                <button class="edit-employee-btn btn-text btn-sm" title="Modifier" style="padding: 4px;">
                    <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="delete-employee-btn btn-text btn-sm" title="Supprimer cet employé" style="padding: 4px; color: var(--accent-danger);">
                    <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
        
        // Clic sur l'élément (sélection)
        li.addEventListener("click", (e) => {
            if (e.target.closest("input[type='checkbox']")) {
                toggleBulkActionBar();
                return;
            }
            if (e.target.closest(".delete-employee-btn")) {
                e.stopPropagation();
                if (confirm(`Voulez-vous supprimer l'employé "${emp.name}" ? Toutes ses données de pointage seront perdues.`)) {
                    deleteEmployee(emp.id);
                }
                return;
            }
            if (e.target.closest(".edit-employee-btn")) {
                e.stopPropagation();
                openEditModal(emp);
                return;
            }
            
            state.activeEmployeeId = emp.id;
            saveStateToLocalStorage();
            
            // Mettre à jour l'UI active
            document.querySelectorAll(".employee-item").forEach(item => item.classList.remove("active"));
            li.classList.add("active");
            
            updateActiveEmployeeUI();
            generateTable();
            renderRattrapagesDashboard();
            
            // Afficher la carte de rattrapage
            const rattrapageCard = document.getElementById("rattrapage-card");
            if (rattrapageCard) rattrapageCard.style.display = "block";
        });

        list.appendChild(li);
    });
    
    // Initialise les icônes dans la liste générée
    lucide.createIcons();
    toggleBulkActionBar();
    // Mettre à jour les boutons fonction dans le pointage
    if (typeof renderPointageFonctionsBar === "function") {
        renderPointageFonctionsBar();
    }
}

function toggleBulkActionBar() {
    const selectedCount = document.querySelectorAll(".emp-select-cb:checked").length;
    const bar = document.getElementById("bulk-actions-bar");
    if (bar) {
        bar.style.display = selectedCount > 0 ? "flex" : "none";
    }
}

function openEditModal(emp) {
    const modal = document.getElementById("edit-employee-modal");
    document.getElementById("edit-employee-id").value = emp.id;
    document.getElementById("edit-employee-matricule-input").value = emp.matricule || "";
    document.getElementById("edit-employee-name-input").value = emp.name || "";
    populateEmployeeFormSelects(emp.departement || "", emp.role || "", "edit");
    document.getElementById("edit-employee-rendement-cb").checked = emp.isRendement || false;
    document.getElementById("edit-employee-transport-input").value = emp.tauxTransport > 0 ? emp.tauxTransport : "";
    document.getElementById("edit-employee-start-date-input").value = emp.startDate || "";
    
    const activeCb = document.getElementById("edit-employee-active-cb");
    const inactGroup = document.getElementById("inactivation-month-group");
    const monthSel = document.getElementById("edit-employee-inact-month");
    const yearSel = document.getElementById("edit-employee-inact-year");
    
    // Initialiser les select
    monthSel.innerHTML = "";
    ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"].forEach((m, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = m;
        monthSel.appendChild(opt);
    });
    
    yearSel.innerHTML = "";
    const currYear = new Date().getFullYear();
    for (let y = currYear - 5; y <= currYear + 5; y++) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    }
    
    if (emp.inactiveFrom) {
        activeCb.checked = false;
        inactGroup.style.display = "block";
        monthSel.value = emp.inactiveFrom.month;
        yearSel.value = emp.inactiveFrom.year;
    } else {
        activeCb.checked = true;
        inactGroup.style.display = "none";
        monthSel.value = state.currentMonth;
        yearSel.value = state.currentYear;
    }
    
    activeCb.onchange = function() {
        inactGroup.style.display = this.checked ? "none" : "block";
    };
    
    modal.classList.add("active");
}


function updateActiveEmployeeUI() {
    const title = document.getElementById("active-employee-name");
    const matriculeEl = document.getElementById("active-employee-matricule");
    const activeEmp = state.employees.find(e => e.id === state.activeEmployeeId);
    
    if (activeEmp) {
        title.textContent = activeEmp.name;
        if (matriculeEl) {
            matriculeEl.textContent = `Matricule : ${activeEmp.matricule || '—'} • ${activeEmp.role}`;
        }
    } else {
        title.textContent = "Sélectionnez un employé";
        if (matriculeEl) matriculeEl.textContent = "";
    }
}

// Sélectionner un employé par ID (utilisé par les boutons fonction)
function selectEmployee(empId) {
    state.activeEmployeeId = empId;
    saveStateToLocalStorage();
    renderEmployeeList();
    updateActiveEmployeeUI();
    generateTable();
    renderRattrapagesDashboard();
    const rattrapageCard = document.getElementById("rattrapage-card");
    if (rattrapageCard) rattrapageCard.style.display = "block";
}

function deleteEmployee(id) {
    state.employees = state.employees.filter(e => e.id !== id);
    delete state.pointages[id]; // Nettoyage des données associées
    
    if (state.activeEmployeeId === id) {
        state.activeEmployeeId = state.employees.length > 0 ? state.employees[0].id : null;
    }
    
    saveStateToLocalStorage();
    renderEmployeeList();
    updateActiveEmployeeUI();
    generateTable();
}

// ==========================================================================
// 6. GÉNÉRATION DU TABLEAU DE POINTAGE ET CALCULS MENSUELS
// ==========================================================================
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getDayName(year, month, day) {
    const date = new Date(year, month, day);
    const options = { weekday: 'short' }; // Lun, Mar, Mer...
    return date.toLocaleDateString('fr-FR', options);
}

function updateTableNightVisibility(autoDetect = false) {
    const table = document.getElementById("pointage-table");
    const cb = document.getElementById("show-night-columns-cb");
    if (!table) return;
    
    if (autoDetect && state.activeEmployeeId && cb) {
        const empPointage = state.pointages[state.activeEmployeeId] || {};
        const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
        let anyNightActive = false;
        
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            const data = empPointage[dateKey];
            if (data && (data.nuitDebut || data.nuitPause || data.nuitReprise || data.nuitFin)) {
                anyNightActive = true;
                break;
            }
        }
        cb.checked = anyNightActive;
    }
    
    if (cb && cb.checked) {
        table.classList.add("show-night");
    } else {
        table.classList.remove("show-night");
    }
}

function updateTableRendementVisibility() {
    const table = document.getElementById("pointage-table");
    if (!table) return;
    
    const activeEmp = state.employees.find(e => e.id === state.activeEmployeeId);
    if (activeEmp && activeEmp.isRendement) {
        table.classList.add("show-rendement");
    } else {
        table.classList.remove("show-rendement");
    }
}

function generateTable() {
    const tbody = document.getElementById("table-body");
    const synthTbody = document.getElementById("synth-table-body");
    if (tbody) tbody.innerHTML = "";
    if (synthTbody) synthTbody.innerHTML = "";
    
    // Alertes
    const unworkedAlertPanel = document.getElementById("unworked-alert-panel");
    const unworkedAlertText = document.getElementById("unworked-alert-text");
    if (unworkedAlertPanel) unworkedAlertPanel.style.display = "none";
    
    // Fériés
    renderHolidaysList();
    
    // Rattrapages
    renderRattrapagesDashboard();
    
    if (!state.activeEmployeeId) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 30px; color: var(--text-muted);">Veuillez sélectionner ou ajouter un employé pour commencer le pointage.</td></tr>`;
        updateSummaryKPIs(0, 0, 0, 0);
        return;
    }
    
    // Bloquer le pointage si l'employé est inactif pour le mois courant
    const activeEmp = state.employees.find(e => e.id === state.activeEmployeeId);
    if (activeEmp && !isEmployeeActive(activeEmp)) {
        const inactiveSince = activeEmp.inactiveFrom;
        let sinceLabel = '';
        if (inactiveSince) {
            const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
            // Le mois inactif effectif = mois suivant inactiveFrom
            let inactMonth = inactiveSince.month + 1;
            let inactYear = inactiveSince.year;
            if (inactMonth > 11) { inactMonth = 0; inactYear++; }
            sinceLabel = `depuis ${monthNames[inactMonth]} ${inactYear}`;
        }
        tbody.innerHTML = `
            <tr><td colspan="15">
                <div style="text-align:center; padding:40px 20px;">
                    <div style="display:inline-flex; flex-direction:column; align-items:center; gap:16px; background:#fef2f2; border:2px solid #fecaca; border-radius:16px; padding:32px 48px; max-width:520px;">
                        <div style="width:56px;height:56px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;">
                            <svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#dc2626' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='4.93' y1='4.93' x2='19.07' y2='19.07'/></svg>
                        </div>
                        <div>
                            <div style="font-size:1.1rem;font-weight:700;color:#b91c1c;margin-bottom:6px;">Employé Inactif</div>
                            <div style="font-size:0.9rem;color:#7f1d1d;">
                                <strong>${activeEmp.name}</strong> est marqué comme inactif ${sinceLabel}.<br>
                                Le pointage est désactivé pour ce mois.
                            </div>
                        </div>
                        <div style="font-size:0.8rem;color:#dc2626;background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:10px 18px;">
                            💡 Pour réactiver cet employé, modifiez son profil dans <strong>Employés &amp; Paramètres</strong>.
                        </div>
                    </div>
                </div>
            </td></tr>
        `;
        if (synthTbody) synthTbody.innerHTML = '';
        updateSummaryKPIs(0, 0, 0, 0);
        // Masquer les boutons d'action
        const applyDefaultBtn2 = document.getElementById('apply-default-month-btn');
        if (applyDefaultBtn2) applyDefaultBtn2.style.display = 'none';
        const clearMonthBtn2 = document.getElementById('clear-month-btn');
        if (clearMonthBtn2) clearMonthBtn2.style.display = 'none';
        return;
    }
    
    updateTableNightVisibility(true);
    updateTableRendementVisibility();
    
    const monthStr = String(state.currentMonth + 1).padStart(2, '0');
    const currentMonthKey = `${state.currentYear}-${monthStr}`;
    const isMonthClosed = state.closedMonths && state.closedMonths.includes(currentMonthKey);
    
    // UI elements that should be disabled when closed
    const badgeClosed = document.getElementById("closed-month-badge");
    if (badgeClosed) badgeClosed.style.display = isMonthClosed ? "inline-flex" : "none";
    
    const applyDefaultBtn = document.getElementById("apply-default-month-btn");
    if (applyDefaultBtn) applyDefaultBtn.style.display = isMonthClosed ? "none" : "flex";
    
    const clearMonthBtn = document.getElementById("clear-month-btn");
    if (clearMonthBtn) clearMonthBtn.style.display = isMonthClosed ? "none" : "flex";
    
    const bulkDefaultBtn = document.getElementById("bulk-default-pointing-btn");
    if (bulkDefaultBtn) bulkDefaultBtn.style.display = isMonthClosed ? "none" : "flex";
    
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const empPointage = state.pointages[state.activeEmployeeId] || {};
    const empDetails = state.dayDetails[state.activeEmployeeId] || {};
    const holidays = getHolidaysForMonth(state.currentYear, state.currentMonth);
    
    let totalJourMin = 0;
    let totalNuitMin = 0;
    let totalHoursMin = 0;
    let workedDaysCount = 0;
    let paidUnworkedDays = 0;
    let paidUnworkedMinutes = 0;
    let unworkedWorkingDays = [];
    let unworkedDateKeys = [];
    let absentDaysCount = 0;
    let cumulativeMin = 0; // Running cumulative for synthesis tab
    let totalWorkingDaysInMonth = 0; // Count of working days in month
    
    for (let day = 1; day <= daysCount; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(state.currentMonth + 1).padStart(2, '0');
        const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
        const dayName = getDayName(state.currentYear, state.currentMonth, day);
        
        const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
        const isHoliday = !!holidays[dateKey];
        const isWorkingDay = !isWeekend && !isHoliday;
        
        const storedData = empPointage[dateKey];
        const data = storedData ? { ...storedData } : {
            arrivee: "", pause: "", reprise: "", fin: "",
            nuitActive: false,
            nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
            status: "", observation: ""
        };
        
        // Auto-assign absent for unworked working days by default
        if (!storedData || !data.status) {
            const hasPointage = !!(data.arrivee || data.pause || data.reprise || data.fin || data.nuitDebut);
            if (hasPointage) {
                data.status = "present";
            } else if (isWorkingDay) {
                data.status = "absent";
                data._isAutoAbsent = true; // Pour savoir s'il faut le rappeler
            } else {
                data.status = "present";
            }
        }
        const detail = empDetails[dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
        
        // Auto-detect if day falls in an absence period
        let periodPaid = null;
        let isDeclaredAbsenceDay = false; // jour déclaré via le formulaire d'ajustement
        if (state.absencePeriods && state.absencePeriods[state.activeEmployeeId]) {
            const currentObjDate = new Date(dateKey);
            for (const period of state.absencePeriods[state.activeEmployeeId]) {
                const startObj = new Date(period.start);
                const endObj = new Date(period.end);
                if (currentObjDate >= startObj && currentObjDate <= endObj) {
                    if (!data.arrivee && !data.nuitActive) {
                        data.status = period.type; // Override empty day with period type
                        periodPaid = period.isPaid;
                        isDeclaredAbsenceDay = true; // Ce jour vient d'une déclaration
                    }
                }
            }
        }
        
        // We already have isWeekend and isHoliday above
        const weekendClass = isWeekend ? "weekend" : "";
        const holidayClass = isHoliday ? "holiday" : "";
        const nightActiveClass = data.nuitActive ? "night-active" : "";
        
        const calcs = getRowCalculations(data, detail, periodPaid);
        const legalDayMinutes = calcs.legalDayMinutes;
        const legalNightMinutes = calcs.legalNightMinutes;
        const totalMinutes = calcs.totalMinutes;
        
        if (!isWeekend && !isHoliday && totalMinutes === 0 && (data.status === "present" || data._isAutoAbsent)) {
            unworkedWorkingDays.push(`${dayStr}/${monthStr}`);
            unworkedDateKeys.push(dateKey);
        }
        
        if (isWorkingDay) totalWorkingDaysInMonth++;
        
        totalJourMin += legalDayMinutes;
        totalNuitMin += legalNightMinutes;
        totalHoursMin += totalMinutes;
        cumulativeMin += totalMinutes;
        
        // Comptage jours travaillés : exclure les jours issus d'une déclaration d'absence
        if (isDeclaredAbsenceDay) {
            // Jour déclaré = pas un jour réellement travaillé
            if (periodPaid === true && totalMinutes > 0 && isWorkingDay) {
                paidUnworkedDays++;
                paidUnworkedMinutes += totalMinutes;
            }
        } else if (totalMinutes > 0 || data.rendementActive === true) {
            // Jour réellement travaillé (pointage manuel ou rendement)
            workedDaysCount++;
        }
        
        const tr = document.createElement("tr");
        tr.className = `${weekendClass} ${holidayClass} ${nightActiveClass}`;
        tr.setAttribute("data-date", dateKey);
        
        let dayLabel = `<strong>${dayStr}</strong> <span style="font-size:0.75rem; text-transform: capitalize; color: var(--text-muted);">${dayName}</span>`;
        if (isHoliday) {
            dayLabel += `<div style="font-size:0.65rem; color:#dc2626; font-weight:600; margin-top:2px;">${holidays[dateKey]}</div>`;
        }
        
        
        const hasNote = detail.note || detail.isEvent;
        const noteColor = hasNote ? "var(--accent-day)" : "var(--text-muted)";
        
        const isRendementChecked = data.rendementActive === true;
        
        // --- NOUVEAU: Restrictions Admin ---
        const isAdmin = state.currentUser && state.currentUser.role === "ADMIN";
        
        // Bloquer la modification des champs s'ils sont déjà remplis et que l'utilisateur n'est pas ADMIN
        const getFieldDisabled = (val) => {
            if (isMonthClosed) return 'disabled="disabled"';
            if (val && String(val).trim() !== "" && !isAdmin) return 'disabled="disabled"';
            return '';
        };
        const getFieldStyle = (val) => {
            if (isMonthClosed) return 'background-color: #f1f5f9; cursor: not-allowed;';
            if (val && String(val).trim() !== "" && !isAdmin) return 'background-color: #f1f5f9; cursor: not-allowed;';
            return '';
        };
        
        const disabledAttr = isMonthClosed ? 'disabled="disabled"' : '';
        const readonlyStyle = isMonthClosed ? 'background-color: #f1f5f9; cursor: not-allowed;' : '';
        // Status et Rendement ne sont verrouillés que si le mois est clos, ou si on veut aussi les verrouiller s'ils sont déjà pointés ? On utilise disabledAttr standard pour eux, sauf la ligne entière si on veut tout verrouiller. Pour le statut, on va le laisser tel quel ou le verrouiller s'il y a un pointage horaire.
        const rowHasPointage = (data.arrivee || data.pause || data.reprise || data.fin || data.nuitDebut);
        const lockRowForNonAdmin = rowHasPointage && !isAdmin ? 'disabled="disabled"' : disabledAttr;
        const lockRowStyleForNonAdmin = rowHasPointage && !isAdmin ? 'background-color: #f1f5f9; cursor: not-allowed;' : readonlyStyle;
        
        tr.innerHTML = `
            <td class="col-day">${dayLabel}</td>
            
            <!-- Statut de Présence -->
            <td class="status-cell">
                <select class="status-select" data-field="status" style="width: 100%; font-size: 0.75rem; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-input);" ${lockRowForNonAdmin}>
                    <option value="present" ${data.status === 'present' ? 'selected' : ''}>Présent</option>
                    <option value="absent" ${data.status === 'absent' ? 'selected' : ''}>Absent</option>
                    <option value="permission" ${data.status === 'permission' ? 'selected' : ''}>Permission</option>
                    <option value="permission_payee" ${data.status === 'permission_payee' ? 'selected' : ''}>Permission Payée</option>
                    <option value="faute_entreprise" ${data.status === 'faute_entreprise' ? 'selected' : ''}>Faute Entreprise</option>
                    <option value="malade" ${data.status === 'malade' ? 'selected' : ''}>Malade</option>
                    <option value="accident" ${data.status === 'accident' ? 'selected' : ''}>Accident T.</option>
                    <option value="conge" ${data.status === 'conge' ? 'selected' : ''}>Congé</option>
                    <option value="autre" ${data.status === 'autre' ? 'selected' : ''}>Autre</option>
                </select>
            </td>
            
            <!-- Rendement active checkbox -->
            <td class="col-rendement-cell" style="text-align: center; vertical-align: middle;">
                <label class="rendement-toggle" style="margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                    <input type="checkbox" class="rendement-active-cb" data-field="rendementActive" ${data.rendementActive ? 'checked' : ''} ${lockRowForNonAdmin} style="cursor: pointer; width: 16px; height: 16px;">
                </label>
            </td>
            
            <!-- Shift Jour -->
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="arrivee" value="${data.arrivee || ''}" placeholder="08:00" ${getFieldDisabled(data.arrivee)} style="${getFieldStyle(data.arrivee)} ${data.status === 'present' && (!data.arrivee || data.arrivee.trim() === '') ? 'border: 2px solid #ef4444; background-color: #fee2e2;' : ''}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="pause" value="${data.pause || ''}" placeholder="12:00" ${getFieldDisabled(data.pause)} style="${getFieldStyle(data.pause)}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="reprise" value="${data.reprise || ''}" placeholder="13:00" ${getFieldDisabled(data.reprise)} style="${getFieldStyle(data.reprise)}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="fin" value="${data.fin || ''}" placeholder="17:00" ${getFieldDisabled(data.fin)} style="${getFieldStyle(data.fin)}"></td>
            
            <!-- Night Toggle -->
            <td class="col-toggle" style="text-align: center; vertical-align: middle;">
                <label class="night-toggle" style="margin: 0 auto;">
                    <input type="checkbox" class="nuit-active-cb" data-field="nuitActive" ${data.nuitActive ? 'checked' : ''} ${disabledAttr}>
                    <span class="slider" style="border-radius: 20px;"></span>
                </label>
            </td>
            
            <!-- Shift Nuit -->
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitDebut" value="${data.nuitDebut || ''}" placeholder="21:00" ${getFieldDisabled(data.nuitDebut)} style="${getFieldStyle(data.nuitDebut)}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitPause" value="${data.nuitPause || ''}" placeholder="00:00" ${getFieldDisabled(data.nuitPause)} style="${getFieldStyle(data.nuitPause)}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitReprise" value="${data.nuitReprise || ''}" placeholder="01:00" ${getFieldDisabled(data.nuitReprise)} style="${getFieldStyle(data.nuitReprise)}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitFin" value="${data.nuitFin || ''}" placeholder="05:00" ${getFieldDisabled(data.nuitFin)} style="${getFieldStyle(data.nuitFin)}"></td>
            
            <!-- Observations (Direct Input) -->
            <td class="notes-cell" style="padding: 4px;">
                <input type="text" class="obs-input" data-field="observation" value="${data.observation || ''}" placeholder="Ex: Retard..." ${getFieldDisabled(data.observation)} style="width: 100%; min-width: 120px; font-size: 0.8rem; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-family: inherit; ${getFieldStyle(data.observation)}">
            </td>
            
            <!-- Totaux -->
            <td class="total-cell val-total-jour">${minutesToHoursStr(legalDayMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDayMinutes)}</span></td>
            <td class="total-cell val-total-nuit">${minutesToHoursStr(legalNightMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNightMinutes)}</span></td>
            <td class="total-cell highlight-col val-total-global">${minutesToHoursStr(totalMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalMinutes)}</span></td>
        `;
        
        if (tbody) tbody.appendChild(tr);
        
        // --- Synthèse Row ---
        if (isWorkingDay && data.status && data.status !== 'present') {
            absentDaysCount++;
        }
        
        if (synthTbody) {
            const trSynth = document.createElement("tr");
            
            // Row background based on status
            let rowBg = '';
            if (isWeekend || isHoliday) {
                rowBg = 'background: rgba(241, 245, 249, 0.5);';
            } else if (data.status === 'absent') {
                rowBg = 'background: rgba(239, 68, 68, 0.04);';
            } else if (data.status === 'malade' || data.status === 'accident') {
                rowBg = 'background: rgba(234, 88, 12, 0.04);';
            } else if (data.status === 'permission' || data.status === 'permission_payee') {
                rowBg = 'background: rgba(217, 119, 6, 0.04);';
            } else if (data.status === 'conge') {
                rowBg = 'background: rgba(2, 132, 199, 0.04);';
            } else if (data.status === 'faute_entreprise') {
                rowBg = 'background: rgba(234, 179, 8, 0.06);';
            }
            
            trSynth.style.cssText = `border-bottom: 1px solid #f3f4f6; ${rowBg}`;
            
            const statusStyles = {
                present: 'color:#059669; background:#ecfdf5; border:1px solid #d1fae5;',
                absent: 'color:#dc2626; background:#fef2f2; border:1px solid #fee2e2;',
                permission: 'color:#d97706; background:#fffbeb; border:1px solid #fef3c7;',
                permission_payee: 'color:#d97706; background:#fffbeb; border:1px solid #fef3c7;',
                faute_entreprise: 'color:#b45309; background:#fef3c7; border:1px solid #fde68a;',
                malade: 'color:#ea580c; background:#fff7ed; border:1px solid #ffedd5;',
                accident: 'color:#e11d48; background:#fff1f2; border:1px solid #ffe4e6;',
                conge: 'color:#0284c7; background:#f0f9ff; border:1px solid #e0f2fe;',
                autre: 'color:#6b7280; background:#f9fafb; border:1px solid #f3f4f6;'
            };
            const sStyle = statusStyles[data.status] || 'color:#6b7280;';
            const sLabel = { present:'Présent', absent:'Absent', permission:'Permission', permission_payee:'Permission Payée', faute_entreprise:'Faute Entreprise', malade:'Maladie', accident:'Accident T.', conge:'Congé', autre:'Autre' };
            let displayStatus = data.status ? `<span style="${sStyle} padding:2px 8px; border-radius:20px; font-size:0.75rem; font-weight:600;">${sLabel[data.status] || data.status}</span>` : '-';
            
            // Détecter si ce jour est dans une période "à rattraper"
            let isRecoverDay = false;
            let recoverReason = '';
            if (state.absencePeriods && state.absencePeriods[state.activeEmployeeId]) {
                const currDateObj = new Date(dateKey);
                for (const ap of state.absencePeriods[state.activeEmployeeId]) {
                    if (ap.isRecover && new Date(ap.start) <= currDateObj && currDateObj <= new Date(ap.end)) {
                        isRecoverDay = true;
                        recoverReason = ap.reason || '';
                        break;
                    }
                }
            }
            if (isRecoverDay) {
                displayStatus += `<br><span style="color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 6px; border-radius:12px; font-size:0.68rem; font-weight:700; display:inline-block; margin-top:3px;">&#x27F3; À rattraper</span>`;
                if (recoverReason) {
                    displayStatus += `<br><span style="color:var(--text-muted); font-size:0.68rem; font-style:italic;">${recoverReason}</span>`;
                }
            }
            
            if (data.rendementActive) {
                if (calcs.pointedMinutes > 0) {
                    displayStatus += `<br><span style="color:#0284c7; font-size:0.7rem; font-weight:600; display:inline-block; margin-top:4px;">Rendement + ${minutesToDecimal(calcs.pointedMinutes)}</span>`;
                } else {
                    displayStatus += `<br><span style="color:#0284c7; font-size:0.7rem; font-weight:600; display:inline-block; margin-top:4px;">Rendement</span>`;
                }
            }
            
            // Day label
            let dayLabelSynth = `<strong>${dayStr}/${monthStr}</strong> <span style="font-size:0.75rem; color:#6b7280; text-transform:capitalize;">${dayName}</span>`;
            if (isHoliday) dayLabelSynth += `<br><span style="font-size:0.7rem; color:#dc2626; font-weight:600;">${holidays[dateKey]}</span>`;
            
            trSynth.innerHTML = `
                <td style="padding: 12px 16px; text-align: left;">${dayLabelSynth}</td>
                <td style="padding: 12px 16px; text-align: left;">${displayStatus}</td>
                <td style="padding: 12px 16px; text-align: center; font-weight: 500; color: var(--accent-day);">${legalDayMinutes > 0 ? `${minutesToHoursStr(legalDayMinutes)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDayMinutes)}</span>` : '<span style="color:#cbd5e1;">—</span>'}</td>
                <td style="padding: 12px 16px; text-align: center; font-weight: 500; color: var(--accent-night);">${legalNightMinutes > 0 ? `${minutesToHoursStr(legalNightMinutes)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNightMinutes)}</span>` : '<span style="color:#cbd5e1;">—</span>'}</td>
                <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: ${totalMinutes > 0 ? 'var(--accent-total)' : '#9ca3af'};">${totalMinutes > 0 ? `${minutesToHoursStr(totalMinutes)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalMinutes)}</span>` : '<span style="color:#cbd5e1;">—</span>'}</td>
            `;
            synthTbody.appendChild(trSynth);
        }
    }
    
    // Alerte Jours non travaillés
    if (unworkedWorkingDays.length > 0) {
        unworkedAlertPanel.style.display = "block";
        unworkedAlertText.innerHTML = `Attention, il n'y a aucun pointage pour les jours suivants : <strong>${unworkedWorkingDays.join(", ")}</strong>. Vérifiez si cela est normal (absence, maladie) ou s'il s'agit d'un oubli.`;
        
        const validateBtn = document.getElementById("validate-absences-btn");
        if (validateBtn) {
            validateBtn.onclick = function() {
                const modal = document.getElementById("validate-absences-modal");
                const listDiv = document.getElementById("validate-absences-list");
                const selectAllCb = document.getElementById("validate-absences-select-all");
                const confirmBtn = document.getElementById("confirm-validate-absences-btn");
                
                listDiv.innerHTML = "";
                selectAllCb.checked = true;
                
                // Populate the list
                unworkedDateKeys.forEach((dKey, index) => {
                    const labelStr = unworkedWorkingDays[index]; // e.g. "12/06"
                    
                    const itemDiv = document.createElement("div");
                    itemDiv.style.display = "flex";
                    itemDiv.style.alignItems = "center";
                    itemDiv.style.gap = "8px";
                    itemDiv.style.padding = "4px 8px";
                    itemDiv.style.background = "var(--bg-input)";
                    itemDiv.style.borderRadius = "4px";
                    
                    itemDiv.innerHTML = `
                        <input type="checkbox" class="absence-day-cb" value="${dKey}" id="cb-abs-${dKey}" checked>
                        <label for="cb-abs-${dKey}" style="cursor: pointer; margin: 0; flex: 1;">${labelStr}</label>
                    `;
                    listDiv.appendChild(itemDiv);
                });
                
                // Select all behavior
                selectAllCb.onchange = function() {
                    const cbs = listDiv.querySelectorAll(".absence-day-cb");
                    cbs.forEach(cb => cb.checked = this.checked);
                };
                
                // Confirm behavior
                confirmBtn.onclick = function() {
                    const selectedKeys = Array.from(listDiv.querySelectorAll(".absence-day-cb:checked")).map(cb => cb.value);
                    
                    if (selectedKeys.length === 0) {
                        modal.classList.remove("active");
                        return;
                    }
                    
                    if (!state.pointages[state.activeEmployeeId]) {
                        state.pointages[state.activeEmployeeId] = {};
                    }
                    
                    selectedKeys.forEach(dKey => {
                        if (!state.pointages[state.activeEmployeeId][dKey]) {
                            state.pointages[state.activeEmployeeId][dKey] = {
                                arrivee: "", pause: "", reprise: "", fin: "",
                                nuitActive: false,
                                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
                                status: "absent"
                            };
                        } else {
                            state.pointages[state.activeEmployeeId][dKey].status = "absent";
                        }
                    });
                    
                    saveStateToLocalStorage();
                    generateTable();
                    modal.classList.remove("active");
                };
                
                modal.classList.add("active");
            };
        }
    } else {
        unworkedAlertPanel.style.display = "none";
    }
    
    attachTableInputEvents();
    updateSummaryKPIs(totalJourMin, totalNuitMin, workedDaysCount, totalHoursMin, totalWorkingDaysInMonth);
    
    let totalRattrapageMins = 0;
    let remainingDebtMins = 0;
    if (state.activeEmployeeId && state.rattrapages && state.rattrapages[state.activeEmployeeId]) {
        state.rattrapages[state.activeEmployeeId].forEach(r => {
            if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                totalRattrapageMins += r.minutes;
            } else if (!r.recovered) {
                remainingDebtMins += r.minutes;
            }
        });
    }
    
    const finalTotalMin = Math.max(0, totalHoursMin - totalRattrapageMins);
    
    // Update OLD synthesis KPI elements (kept for compatibility)
    const elSynthAbsences = document.getElementById("synth-absences");
    if (elSynthAbsences) elSynthAbsences.textContent = absentDaysCount;
    const elSynthRattrapage = document.getElementById("synth-rattrapage");
    if (elSynthRattrapage) elSynthRattrapage.textContent = minutesToHoursStr(remainingDebtMins);
    const elSynthTotal = document.getElementById("synth-total");
    if (elSynthTotal) elSynthTotal.textContent = minutesToHoursStr(finalTotalMin);

    // Update NEW synthesis KPI elements
    const elSynthTotalPaid = document.getElementById("synth-total-paid");
    if (elSynthTotalPaid) elSynthTotalPaid.innerHTML = `${minutesToHoursStr(totalHoursMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalHoursMin)}</span>`;
    
    const elSynthTotalNight = document.getElementById("synth-total-night");
    if (elSynthTotalNight) elSynthTotalNight.innerHTML = `${minutesToHoursStr(totalNuitMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalNuitMin)}</span>`;
    
    const elSynthToRecover = document.getElementById("synth-to-recover");
    if (elSynthToRecover) elSynthToRecover.innerHTML = `${minutesToHoursStr(remainingDebtMins)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(remainingDebtMins)}</span>`;
    
    const elSynthAbsencesCount = document.getElementById("synth-absences-count");
    if (elSynthAbsencesCount) elSynthAbsencesCount.textContent = absentDaysCount;
    
    // Mise à jour de la case "Payés Non Travaillés"
    const elPaidUnworkedCard = document.getElementById("synth-paid-unworked-card");
    const elPaidUnworked = document.getElementById("synth-paid-unworked");
    if (elPaidUnworkedCard && elPaidUnworked) {
        if (paidUnworkedDays > 0) {
            elPaidUnworkedCard.style.display = "";
            elPaidUnworked.innerHTML = `${paidUnworkedDays}j — ${minutesToHoursStr(paidUnworkedMinutes)} <span style="font-size:0.7em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(paidUnworkedMinutes)}</span>`;
        } else {
            elPaidUnworkedCard.style.display = "none";
        }
    }
    
    // Period label
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const elPeriodLabel = document.getElementById("synth-period-label");
    if (elPeriodLabel) {
        const emp = state.employees.find(e => e.id === state.activeEmployeeId);
        elPeriodLabel.textContent = `${emp ? emp.name + ' — ' : ''}${monthNames[state.currentMonth]} ${state.currentYear}`;
    }
    
    // Synthesis table footer (totals row)
    const synthFooter = document.getElementById("synth-table-footer");
    if (synthFooter) {
        synthFooter.innerHTML = `
            <tr style="background: #f0fdf4; border-top: 2px solid #10b981; font-weight: 700; font-size: 0.9rem;">
                <td colspan="2" style="padding: 14px 16px; text-align: left; color: #059669;">📊 TOTAUX DU MOIS (${workedDaysCount} jour${workedDaysCount > 1 ? 's' : ''} / ${totalWorkingDaysInMonth} ouvrables)</td>
                <td style="padding: 14px 16px; text-align: center; color: var(--accent-day);">${minutesToHoursStr(totalJourMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalJourMin)}</span></td>
                <td style="padding: 14px 16px; text-align: center; color: var(--accent-night);">${minutesToHoursStr(totalNuitMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalNuitMin)}</span></td>
                <td style="padding: 14px 16px; text-align: center; color: #059669; font-size: 1rem;">${minutesToHoursStr(totalHoursMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalHoursMin)}</span></td>
            </tr>
        `;
    }
}

function updateSummaryKPIs(dayMin, nightMin, workedDays, totalMin, totalWorkingDays) {
    let totalRattrapageMins = 0;
    if (state.activeEmployeeId && state.rattrapages && state.rattrapages[state.activeEmployeeId]) {
        state.rattrapages[state.activeEmployeeId].forEach(r => {
            if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                totalRattrapageMins += r.minutes;
            }
        });
    }
    
    const finalTotalMin = Math.max(0, totalMin - totalRattrapageMins);

    document.getElementById("kpi-day-hours").innerHTML = `${minutesToHoursStr(dayMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(dayMin)}</span>`;
    document.getElementById("kpi-night-hours").innerHTML = `${minutesToHoursStr(nightMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(nightMin)}</span>`;
    document.getElementById("kpi-days-worked").textContent = `${workedDays} jour${workedDays > 1 ? 's' : ''}`;
    
    let totalHtml = `${minutesToHoursStr(finalTotalMin)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(finalTotalMin)}</span>`;
    if (totalRattrapageMins > 0) {
        totalHtml += `<div style="font-size:0.7rem; color:var(--accent-warning); margin-top:4px;">(Déduit : ${minutesToHoursStr(totalRattrapageMins)} de rattrapage)</div>`;
    }
    document.getElementById("kpi-total-hours").innerHTML = totalHtml;
    
    // Calcul transport : taux mensuel base proratisé
    const kpiTransport = document.getElementById("kpi-transport");
    if (kpiTransport) {
        const activeEmp = state.employees.find(e => e.id === state.activeEmployeeId);
        const taux = activeEmp && activeEmp.tauxTransport ? parseFloat(activeEmp.tauxTransport) : 0;
        if (taux > 0 && totalWorkingDays > 0) {
            const totalTransport = (taux * workedDays) / totalWorkingDays;
            kpiTransport.innerHTML = `<strong>${totalTransport.toLocaleString('fr-FR', {minimumFractionDigits:0, maximumFractionDigits:0})}</strong> <span class="kpi-decimal">(${workedDays}/${totalWorkingDays}j ouvrables)</span>`;
            const transportCard = document.getElementById("kpi-transport-card");
            if (transportCard) transportCard.style.display = "";
        } else {
            const transportCard = document.getElementById("kpi-transport-card");
            if (transportCard) transportCard.style.display = "none";
        }
    }
}

// ==========================================================================
// X. TABLEAU DE BORD RECAPITULATIF
// ==========================================================================
function generateRecapTable() {
    const tbody = document.getElementById("recap-table-body");
    const container = document.getElementById("recap-alerts-container");
    if (!tbody || !container) return;
    
    tbody.innerHTML = "";
    
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const holidays = getHolidaysForMonth(state.currentYear, state.currentMonth);
    let totalWorkingDaysInMonth = 0;
    
    for (let day = 1; day <= daysCount; day++) {
        const dateKey = `${state.currentYear}-${String(state.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayName = getDayName(state.currentYear, state.currentMonth, day);
        const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
        const isHoliday = !!holidays[dateKey];
        if (!isWeekend && !isHoliday) {
            totalWorkingDaysInMonth++;
        }
    }
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const recapPeriodLabel = document.getElementById("recap-period-label");
    
    let alertStats = { ok: 0, warn: 0, advise: 0, release: 0 };
    
    let activeEmployees = state.employees.filter(emp => {
        const showInactiveCb = document.getElementById("show-inactive-cb");
        const showInactive = showInactiveCb ? showInactiveCb.checked : false;
        if (!showInactive && !isEmployeeActive(emp)) return false;
        return true;
    });

    if(recapPeriodLabel) {
        recapPeriodLabel.innerHTML = `${monthNames[state.currentMonth]} ${state.currentYear} <span style="margin: 0 8px;">|</span> <span style="color:var(--accent-day); font-weight:700;">${activeEmployees.length} employé(s) actif(s)</span>`;
    }

    const filterDepSelect = document.getElementById("recap-filter-departement");
    const filterFoncSelect = document.getElementById("recap-filter-fonction");
    let currentDep = filterDepSelect ? filterDepSelect.value : "ALL";
    let currentFonc = filterFoncSelect ? filterFoncSelect.value : "ALL";

    if (filterDepSelect && filterFoncSelect) {
        const uniqueDeps = Object.keys(state.companyStructure || {}).sort();
        let uniqueFoncs = [];
        if (currentDep === "ALL") {
            uniqueFoncs = [...new Set(Object.values(state.companyStructure || {}).flat())].sort();
        } else if (state.companyStructure[currentDep]) {
            uniqueFoncs = state.companyStructure[currentDep].sort();
        }
        
        filterDepSelect.innerHTML = '<option value="ALL">Tous les départements</option>';
        uniqueDeps.forEach(dep => {
            const opt = document.createElement("option");
            opt.value = dep;
            opt.textContent = dep;
            if (dep === currentDep) opt.selected = true;
            filterDepSelect.appendChild(opt);
        });
        
        if (currentFonc !== "ALL" && !uniqueFoncs.includes(currentFonc)) {
            currentFonc = "ALL";
        }
        
        filterFoncSelect.innerHTML = '<option value="ALL">Toutes les fonctions</option>';
        uniqueFoncs.forEach(fonc => {
            const opt = document.createElement("option");
            opt.value = fonc;
            opt.textContent = fonc;
            if (fonc === currentFonc) opt.selected = true;
            filterFoncSelect.appendChild(opt);
        });
    }

    activeEmployees = activeEmployees.filter(emp => {
        if (currentDep !== "ALL" && (emp.departement || "Non Défini") !== currentDep) return false;
        if (currentFonc !== "ALL" && (emp.role || "Employé") !== currentFonc) return false;
        return true;
    });

    activeEmployees.sort((a, b) => {
        const numA = parseInt((a.matricule || "").replace(/\D/g, '')) || 0;
        const numB = parseInt((b.matricule || "").replace(/\D/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return (a.matricule || "").localeCompare(b.matricule || "");
    });

    activeEmployees.forEach(emp => {
        const empPointage = state.pointages[emp.id] || {};
        const empDetails = state.dayDetails[emp.id] || {};
        
        let totalJourM = 0, totalNuitM = 0, totalHoursM = 0;
        let workedDays = 0, absentDays = 0;
        
        for (let day = 1; day <= daysCount; day++) {
            const dateKey = `${state.currentYear}-${String(state.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayName = getDayName(state.currentYear, state.currentMonth, day);
            const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
            const isHoliday = !!holidays[dateKey];
            const isWorkingDay = !isWeekend && !isHoliday;
            const currentDateStr = `${state.currentYear}-${String(state.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const currentObjDate = new Date(currentDateStr);
            currentObjDate.setHours(0,0,0,0);
            
            // Un jour ouvrable est attendu s'il est >= à la date d'embauche (ou si pas de date d'embauche)
            let isExpectedWorkingDay = isWorkingDay;
            if (emp.startDate) {
                const startD = new Date(emp.startDate);
                startD.setHours(0,0,0,0);
                if (currentObjDate < startD) {
                    isExpectedWorkingDay = false;
                }
            }
            
            const storedData = empPointage[dateKey];
            const data = storedData ? { ...storedData } : {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false, nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
                status: ""
            };
            
            if (!storedData || !data.status) {
                const hasPointage = !!(data.arrivee || data.pause || data.reprise || data.fin || data.nuitDebut);
                if (hasPointage) data.status = "present";
                else if (isExpectedWorkingDay) data.status = "absent";
                else data.status = "present"; // Considéré comme présent pour ne pas pénaliser si avant embauche
            }
            
            const detail = empDetails[dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
            
            let periodPaid = null;
            let isDeclaredAbsenceDay = false;
            if (state.absencePeriods && state.absencePeriods[emp.id]) {
                const currentObjDate = new Date(dateKey);
                for (const period of state.absencePeriods[emp.id]) {
                    if (currentObjDate >= new Date(period.start) && currentObjDate <= new Date(period.end)) {
                        if (!data.arrivee && !data.nuitActive) {
                            periodPaid = period.isPaid;
                            isDeclaredAbsenceDay = true;
                        }
                    }
                }
            }
            
            const calcs = getRowCalculations(data, detail, periodPaid);
            totalJourM += calcs.legalDayMinutes;
            totalNuitM += calcs.legalNightMinutes;
            totalHoursM += calcs.totalMinutes;
            
            if (!isDeclaredAbsenceDay && (calcs.totalMinutes > 0 || data.rendementActive === true)) workedDays++;
            if (isWorkingDay && data.status && data.status !== 'present') absentDays++;
        }

        // Si le pointage forfaitaire 173.33h est actif pour ce mois (via flag), forcer 0 absence
        const defaultFlagKey = `_default_${state.currentYear}_${state.currentMonth}`;
        const hasDefaultFlag = empPointage[defaultFlagKey] === true;
        // Aussi : si le total mensuel atteint au moins 173h (10380 min), considérer forfait complet → 0 absence
        const hasFullMonth = totalHoursM >= 10380;
        if (hasDefaultFlag || hasFullMonth) {
            absentDays = 0;
            workedDays = totalWorkingDaysInMonth;
        }
        

        let totalRattrapageMins = 0;
        if (state.rattrapages && state.rattrapages[emp.id]) {
            state.rattrapages[emp.id].forEach(r => {
                if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                    totalRattrapageMins += r.minutes;
                }
            });
        }
        let finalTotalHours = Math.max(0, totalHoursM - totalRattrapageMins);
        
        let transportStr = "—";
        let taux = emp.tauxTransport ? parseFloat(emp.tauxTransport) : 0;
        if (taux > 0 && totalWorkingDaysInMonth > 0) {
            const tAmount = (taux * workedDays) / totalWorkingDaysInMonth;
            transportStr = `${tAmount.toLocaleString('fr-FR', {maximumFractionDigits:0})} FCFA`;
        }
        
        // Alert logic
        let alertStatus = '<span style="color:#059669; font-weight:600;"><i data-lucide="check-circle" style="width:14px;height:14px;vertical-align:-2px;"></i> OK</span>';
        let alertBg = '';
        const alerts = state.absenceAlerts;
        
        if (absentDays >= alerts.releaseMin) {
            alertStatus = '<span style="color:#be123c; font-weight:600;"><i data-lucide="alert-octagon" style="width:14px;height:14px;vertical-align:-2px;"></i> À libérer</span>';
            alertBg = 'background: rgba(225, 29, 72, 0.05);';
            alertStats.release++;
        } else if (absentDays >= alerts.adviseMin && absentDays <= alerts.adviseMax) {
            alertStatus = '<span style="color:#c2410c; font-weight:600;"><i data-lucide="help-circle" style="width:14px;height:14px;vertical-align:-2px;"></i> À conseiller</span>';
            alertBg = 'background: rgba(234, 88, 12, 0.05);';
            alertStats.advise++;
        } else if (absentDays >= alerts.warnMin && absentDays <= alerts.warnMax) {
            alertStatus = '<span style="color:#b45309; font-weight:600;"><i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:-2px;"></i> Avertissement</span>';
            alertBg = 'background: rgba(217, 119, 6, 0.05);';
            alertStats.warn++;
        } else {
            alertStats.ok++;
        }
        
        const tr = document.createElement("tr");
        tr.style.cssText = `border-bottom: 1px solid #e5e7eb; cursor: pointer; ${alertBg}`;
        tr.setAttribute("data-emp-id", emp.id);
        tr.onclick = (e) => {
            if (e.target.closest(".print-emp-btn")) return;
            state.activeEmployeeId = emp.id;
            saveStateToLocalStorage();
            renderEmployeeList();
            generateTable();
            document.querySelector('.tab-btn[data-tab="tab-pointage"]').click();
        };
        
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight:600; color:#1f2937;">${emp.name}</td>
            <td style="padding: 12px 16px; color:#6b7280; font-size:0.8rem;">${emp.matricule || '—'}</td>
            <td style="padding: 12px 16px; text-align:center; color:#059669; font-weight:600;">${workedDays}</td>
            <td style="padding: 12px 16px; text-align:center; color:#dc2626; font-weight:600;">${absentDays}</td>
            <td style="padding: 12px 16px; text-align:center;">${minutesToHoursStr(totalJourM)}</td>
            <td style="padding: 12px 16px; text-align:center;">${minutesToHoursStr(totalNuitM)}</td>
            <td style="padding: 12px 16px; text-align:center; font-weight:700; color:#0f172a;">${minutesToHoursStr(finalTotalHours)}</td>
            <td style="padding: 12px 16px; text-align:center; color:#0284c7; font-weight:600;">${transportStr}</td>
            <td style="padding: 12px 16px; text-align:center;">${alertStatus}</td>
            <td style="padding: 8px 12px; text-align:center;">
                <button class="print-emp-btn" title="Imprimer cet employé" data-emp-id="${emp.id}"
                    style="background:none; border:1px solid #d1d5db; border-radius:4px; padding:4px 8px; cursor:pointer; color:#6b7280; font-size:0.75rem; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;"
                    onmouseover="this.style.borderColor='#3b82f6';this.style.color='#3b82f6';"
                    onmouseout="this.style.borderColor='#d1d5db';this.style.color='#6b7280';">
                    <i data-lucide="printer" style="width:12px;height:12px;"></i>
                </button>
            </td>
        `;
        
        // Attacher l'écouteur sur le bouton d'impression individuel
        const printBtn = tr.querySelector(".print-emp-btn");
        if (printBtn) {
            printBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                printRecapDashboard(emp.id);
            });
        }
        
        tbody.appendChild(tr);
    });
    
    container.innerHTML = `
        <div style="flex:1; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:1.2rem; font-weight:700; color:#059669;">${alertStats.ok}</div>
            <div style="font-size:0.75rem; color:#047857; font-weight:600;">Employés OK</div>
        </div>
        <div style="flex:1; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:1.2rem; font-weight:700; color:#d97706;">${alertStats.warn}</div>
            <div style="font-size:0.75rem; color:#b45309; font-weight:600;">Avertissements</div>
        </div>
        <div style="flex:1; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:1.2rem; font-weight:700; color:#ea580c;">${alertStats.advise}</div>
            <div style="font-size:0.75rem; color:#c2410c; font-weight:600;">À Conseiller</div>
        </div>
        <div style="flex:1; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:1.2rem; font-weight:700; color:#e11d48;">${alertStats.release}</div>
            <div style="font-size:0.75rem; color:#be123c; font-weight:600;">À Libérer</div>
        </div>
    `;
    lucide.createIcons();
}

function printRecapDashboard(employeeId = null) {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const periodLabel = `${monthNames[state.currentMonth]} ${state.currentYear}`;

    const filterDep = document.getElementById("recap-filter-departement");
    const filterFonc = document.getElementById("recap-filter-fonction");
    const filterDepLabel = filterDep && filterDep.value !== "ALL" ? ` — Département : ${filterDep.value}` : "";
    const filterFoncLabel = filterFonc && filterFonc.value !== "ALL" ? ` — Fonction : ${filterFonc.value}` : "";

    const tbody = document.getElementById("recap-table-body");
    if (!tbody) return;

    let tableRowsHTML = "";
    const rows = tbody.querySelectorAll("tr");

    if (employeeId) {
        const emp = state.employees.find(e => e.id === employeeId);
        rows.forEach(row => {
            const empName = row.querySelector("td:first-child");
            if (emp && empName && empName.textContent.trim() === emp.name) {
                tableRowsHTML += buildPrintRow(row);
            }
        });
    } else {
        rows.forEach(row => {
            tableRowsHTML += buildPrintRow(row);
        });
    }

    const titleSuffix = employeeId
        ? (() => { const e = state.employees.find(e => e.id === employeeId); return e ? ` \u2014 ${e.name}` : ""; })()
        : "";

    const printHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>R\u00e9capitulatif Mensuel ${periodLabel}${titleSuffix}</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
        .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #1f2937; }
        .print-header h1 { font-size: 14px; font-weight: 700; color: #1f2937; }
        .print-header p { font-size: 10px; color: #6b7280; margin-top: 2px; }
        .print-meta { text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        thead tr { background: #1f2937; }
        thead th { padding: 8px 10px; text-align: left; font-weight: 600; color: #fff; font-size: 10px; }
        thead th:not(:first-child) { text-align: center; }
        tbody tr { border-bottom: 1px solid #e5e7eb; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        tbody td { padding: 7px 10px; vertical-align: middle; font-size: 10px; }
        tbody td:not(:first-child):not(:nth-child(2)) { text-align: center; }
        .status-ok { color: #059669; font-weight: 600; }
        .status-warn { color: #d97706; font-weight: 600; }
        .status-advise { color: #ea580c; font-weight: 600; }
        .status-release { color: #e11d48; font-weight: 600; }
        .print-footer { margin-top: 15px; font-size: 9px; color: #9ca3af; text-align: right; }
    </style>
</head>
<body>
    <div class="print-header">
        <div>
            <h1>R\u00e9capitulatif Mensuel \u2014 ${periodLabel}${titleSuffix}</h1>
            <p>${filterDepLabel ? "D\u00e9partement : " + filterDep.value : "Tous les d\u00e9partements"}${filterFoncLabel ? " / Fonction : " + filterFonc.value : ""}</p>
        </div>
        <div class="print-meta">
            <p>Imprim\u00e9 le : ${new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'})}</p>
            <p>Nombre d'employ\u00e9s affich\u00e9s : ${rows.length}</p>
        </div>
    </div>
    <table>
        <thead>
            <tr>
                <th style="text-align:left;">Employ\u00e9</th>
                <th>Matricule</th>
                <th>D\u00e9partement</th>
                <th>Fonction</th>
                <th>Pr\u00e9sent (j)</th>
                <th>Absent (j)</th>
                <th>H. Jour</th>
                <th>H. Nuit</th>
                <th>Total Pay\u00e9</th>
                <th>Transport</th>
                <th>Statut Alerte</th>
            </tr>
        </thead>
        <tbody>
            ${tableRowsHTML}
        </tbody>
    </table>
    <div class="print-footer">Document g\u00e9n\u00e9r\u00e9 automatiquement par PointagePro</div>
    <script>
        window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
    <\/script>
</body>
</html>`;

    const printWin = window.open("", "_blank", "width=1200,height=800");
    if (printWin) {
        printWin.document.write(printHTML);
        printWin.document.close();
    }
}

function buildPrintRow(tr) {
    const cells = tr.querySelectorAll("td");
    if (!cells || cells.length < 8) return "";

    const empName = cells[0] ? cells[0].textContent.trim() : "";
    const emp = state.employees.find(e => e.name === empName);
    const dept = emp ? (emp.departement || "\u2014") : "\u2014";
    const role = emp ? (emp.role || "\u2014") : "\u2014";
    const mat = cells[1] ? cells[1].textContent.trim() : "\u2014";
    const present = cells[2] ? cells[2].textContent.trim() : "\u2014";
    const absent = cells[3] ? cells[3].textContent.trim() : "\u2014";
    const hJour = cells[4] ? cells[4].textContent.trim() : "\u2014";
    const hNuit = cells[5] ? cells[5].textContent.trim() : "\u2014";
    const total = cells[6] ? cells[6].textContent.trim() : "\u2014";
    const transport = cells[7] ? cells[7].textContent.trim() : "\u2014";
    const alertText = cells[8] ? cells[8].textContent.trim() : "\u2014";

    let alertClass = "status-ok";
    if (alertText.toLowerCase().includes("lib\u00e9r")) alertClass = "status-release";
    else if (alertText.toLowerCase().includes("conseiller")) alertClass = "status-advise";
    else if (alertText.toLowerCase().includes("avertissement")) alertClass = "status-warn";

    return `<tr>
            <td style="font-weight:600;">${empName}</td>
            <td style="text-align:center;">${mat}</td>
            <td style="text-align:center;">${dept}</td>
            <td style="text-align:center;">${role}</td>
            <td style="text-align:center;">${present}</td>
            <td style="text-align:center; color:#dc2626; font-weight:600;">${absent}</td>
            <td style="text-align:center;">${hJour}</td>
            <td style="text-align:center;">${hNuit}</td>
            <td style="text-align:center; font-weight:700;">${total}</td>
            <td style="text-align:center; color:#0284c7; font-weight:600;">${transport}</td>
            <td style="text-align:center;" class="${alertClass}">${alertText}</td>
        </tr>`;
}

function clearActiveMonthData() {
    if (!state.activeEmployeeId) return;
    
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const empPointage = state.pointages[state.activeEmployeeId] || {};
    
    for (let day = 1; day <= daysCount; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(state.currentMonth + 1).padStart(2, '0');
        const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
        delete empPointage[dateKey];
    }
    
    // Supprimer aussi le flag de pointage forfaitaire du mois
    const defaultFlagKey = `_default_${state.currentYear}_${state.currentMonth}`;
    delete empPointage[defaultFlagKey];
    
    state.pointages[state.activeEmployeeId] = empPointage;
    saveStateToLocalStorage();
    generateTable();
}

function applyDefaultPointingToEmployees(employeeIds) {
    const TARGET_MINUTES = 10400; // 173h20 = 173.33h
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const holidays = getHolidaysForMonth(state.currentYear, state.currentMonth);
    
    // Identifier les jours ouvrables (lundi au vendredi, hors jours fériés)
    const workingDays = [];
    for (let day = 1; day <= daysCount; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(state.currentMonth + 1).padStart(2, '0');
        const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
        const dayName = getDayName(state.currentYear, state.currentMonth, day);
        
        const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
        const isHoliday = !!holidays[dateKey];
        
        if (!isWeekend && !isHoliday) {
            workingDays.push(dateKey);
        }
    }
    
    if (workingDays.length === 0) {
        alert("Aucun jour ouvrable trouvé dans ce mois.");
        return;
    }
    
    // Distribuer 10400 minutes sur les jours ouvrables
    // On divise équitablement pour qu'aucun jour ouvrable ne soit à 0 (ce qui déclencherait une absence)
    let remainingMinutes = TARGET_MINUTES;
    const baseMinutesPerDay = Math.floor(TARGET_MINUTES / workingDays.length);
    
    const dailyMinutesArray = workingDays.map((_, index) => {
        if (index === workingDays.length - 1) {
            return remainingMinutes;
        } else {
            remainingMinutes -= baseMinutesPerDay;
            return baseMinutesPerDay;
        }
    });
    
    employeeIds.forEach(empId => {
        // Ne pas appliquer si l'employé est inactif pour ce mois
        const emp = state.employees.find(e => e.id === empId);
        if (emp && !isEmployeeActive(emp)) return;

        if (!state.pointages[empId]) {
            state.pointages[empId] = {};
        }

        
        // Nettoyer d'abord le mois
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            delete state.pointages[empId][dateKey];
        }

        // Marquer ce mois comme pointage forfaitaire (173.33h) pour cet employé
        const defaultKey = `_default_${state.currentYear}_${state.currentMonth}`;
        state.pointages[empId][defaultKey] = true;
        
        workingDays.forEach((dateKey, index) => {
            const minToAssign = dailyMinutesArray[index];
            if (minToAssign <= 0) return;
            
            // Construire l'horaire pour atteindre minToAssign minutes
            // Si minToAssign == 480, 08:00 - 12:00, 13:00 - 17:00
            // Si c'est différent, on met 08:00 jusqu'à la fin
            let arrivee = "08:00";
            let pause = "";
            let reprise = "";
            let fin = "";
            
            if (minToAssign === 480) {
                pause = "12:00";
                reprise = "13:00";
                fin = "17:00";
            } else {
                // On ajoute minToAssign à 08:00
                let totalMinEnd = (8 * 60) + minToAssign;
                const h = Math.floor(totalMinEnd / 60);
                const m = totalMinEnd % 60;
                fin = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
            
            state.pointages[empId][dateKey] = {
                arrivee: arrivee,
                pause: pause,
                reprise: reprise,
                fin: fin,
                nuitActive: false,
                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
            };
        });
    });
    
    saveStateToLocalStorage();
    document.querySelectorAll(".emp-select-cb:checked").forEach(cb => cb.checked = false);
    toggleBulkActionBar();
    generateTable();
    alert(`Le pointage par défaut a été appliqué avec succès. Total : 173.33h (173h20).`);
}

// ==========================================================================
// 7. GESTION DES ÉVÉNEMENTS DU TABLEAU & FORMATAGE AUTO EN DIRECT
// ==========================================================================
/**
 * Calcule le prochain champ de saisie selon une navigation intelligente :
 * - Après "fin" (fin du shift jour) : si nuit active sur cette ligne → nuitDebut ; sinon → arrivée du JOUR SUIVANT
 * - Après "nuitFin" : toujours → arrivée du JOUR SUIVANT
 * - Sinon : champ suivant dans l'ordre du DOM
 */
function getNextInput(currentInput, allInputs, idx) {
    const field = currentInput.getAttribute("data-field");
    const tr = currentInput.closest("tr");
    
    if (field === "fin") {
        // Vérifier si la nuit est active pour cette ligne
        const dateKey = tr.getAttribute("data-date");
        const empPointage = state.pointages[state.activeEmployeeId] || {};
        const data = empPointage[dateKey];
        const nightActive = data && data.nuitActive;
        
        if (nightActive) {
            // Aller à nuitDebut (le champ suivant dans le DOM)
            return idx + 1 < allInputs.length ? allInputs[idx + 1] : null;
        } else {
            // Sauter directement à l'arrivée du jour suivant
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                return nextTr.querySelector(".time-input[data-field='arrivee']");
            }
            return null;
        }
    } else if (field === "nuitFin") {
        // Après la fin du shift nuit → arrivée du jour suivant
        const nextTr = tr.nextElementSibling;
        if (nextTr) {
            return nextTr.querySelector(".time-input[data-field='arrivee']");
        }
        return null;
    } else {
        // Navigation standard : champ suivant dans le DOM
        return idx + 1 < allInputs.length ? allInputs[idx + 1] : null;
    }
}

function attachTableInputEvents() {
    const tbody = document.getElementById("table-body");
    
    // 1. Écouter les modifications des champs heures
    const allInputs = Array.from(tbody.querySelectorAll(".time-input"));
    
    allInputs.forEach((input, idx) => {
        input.addEventListener("focus", function() {
            this.select();
            isTypingInTable = true;
        });

        input.addEventListener("blur", function() {
            const rawVal = this.value.trim();
            if (rawVal === "") {
                this.classList.remove("invalid-input");
                saveInputValue(this);
                // Libérer le flag seulement si aucun autre champ du tableau n'est focalisé
                setTimeout(() => {
                    if (!document.activeElement || !document.activeElement.classList.contains("time-input")) {
                        isTypingInTable = false;
                    }
                }, 50);
                return;
            }
            
            const formatted = formatTimeInput(rawVal);
            if (formatted !== null) {
                this.value = formatted;
                this.classList.remove("invalid-input");
            } else {
                this.classList.add("invalid-input");
            }
            
            saveInputValue(this);
            // Libérer le flag seulement si aucun autre champ du tableau n'est focalisé
            setTimeout(() => {
                if (!document.activeElement || !document.activeElement.classList.contains("time-input")) {
                    isTypingInTable = false;
                }
            }, 50);
        });

        input.addEventListener("input", function() {
            // Filtrer les caractères non autorisés
            this.value = this.value.replace(/[^0-9:hH.,mpMP]/g, '');
            
            const rawVal = this.value.trim();
            
            // Détection MP : si l'utilisateur tape "MP", auto-format et avancer
            if (rawVal.toUpperCase() === 'MP') {
                this.value = 'MP';
                this.classList.remove("invalid-input");
                saveInputValue(this);
                const tr = this.closest("tr");
                if (tr) recalculateRow(tr);
                const nextInput = getNextInput(this, allInputs, idx);
                if (nextInput) {
                    setTimeout(() => nextInput.focus(), 0);
                }
                return;
            }
            
            // AUTO-FOCUS : dès que l'utilisateur a tapé suffisamment de chiffres
            const digitsOnly = rawVal.replace(/[^0-9]/g, '');
            
            // Déclenchement sur 4 chiffres (ex: 0740)
            // ou sur 3 chiffres si le 1er est >= 3 (ex: 740, 800, 900 — impossible d'ajouter un 4e chiffre valide)
            const shouldAutoForward =
                digitsOnly.length === 4 ||
                (digitsOnly.length === 3 && parseInt(digitsOnly[0], 10) >= 3);
            
            if (shouldAutoForward) {
                const formatted = formatTimeInput(rawVal);
                if (formatted !== null) {
                    this.value = formatted;
                    this.classList.remove("invalid-input");
                    saveInputValue(this);
                    // Navigation intelligente
                    const nextInput = getNextInput(this, allInputs, idx);
                    if (nextInput) {
                        setTimeout(() => nextInput.focus(), 0);
                    }
                }
            }
        });

        input.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.blur();
                const nextInput = getNextInput(this, allInputs, idx);
                if (nextInput) {
                    nextInput.focus();
                }
            }
        });
    });
    
    // 2. Écouter le basculement du shift nuit (checkbox)
    tbody.querySelectorAll(".nuit-active-cb").forEach(toggle => {
        toggle.addEventListener("change", function() {
            const tr = this.closest("tr");
            const dateKey = tr.getAttribute("data-date");
            const active = this.checked;
            
            if (active) {
                tr.classList.add("night-active");
            } else {
                tr.classList.remove("night-active");
            }
            
            // Mettre à jour l'état
            updateStateField(dateKey, "nuitActive", active);
            
            // Déplier/Replier dynamiquement les colonnes nuit du tableau entier
            updateTableNightVisibility();
            
            // Recalculer la ligne et le dashboard
            recalculateRow(tr);
        });
    });
    
    // 3. Écouter le basculement du mode Rendement par journée
    tbody.querySelectorAll(".rendement-active-cb").forEach(toggle => {
        toggle.addEventListener("change", function() {
            const tr = this.closest("tr");
            const dateKey = tr.getAttribute("data-date");
            const active = this.checked;
            
            // Mettre à jour l'état (boolean)
            updateStateField(dateKey, "rendementActive", active);
            
            // Recalculer la ligne et le dashboard
            recalculateRow(tr);
        });
    });
    
    // 4. Écouter le clic sur le bouton détails/notes
    tbody.querySelectorAll(".open-day-details-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const tr = this.closest("tr");
            const dateKey = tr.getAttribute("data-date");
            openDayDetailsModal(dateKey);
        });
    });
}

function openDayDetailsModal(dateKey) {
    if (!state.activeEmployeeId) return;
    
    const modal = document.getElementById("day-details-modal");
    document.getElementById("day-details-date").value = dateKey;
    document.getElementById("day-details-title").textContent = `Détails du Jour : ${dateKey.split('-').reverse().join('/')}`;
    
    if (!state.dayDetails[state.activeEmployeeId]) {
        state.dayDetails[state.activeEmployeeId] = {};
    }
    
    const details = state.dayDetails[state.activeEmployeeId][dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
    
    document.getElementById("day-details-note").value = details.note || "";
    document.getElementById("day-details-event-active-cb").checked = details.isEvent || false;
    document.getElementById("day-details-event-name").value = details.eventName || "";
    document.getElementById("day-details-event-worked-cb").checked = details.eventWorked !== false; // par défaut true
    
    const eventDetailsSection = document.getElementById("day-details-event-details");
    eventDetailsSection.style.display = details.isEvent ? "block" : "none";
    
    modal.classList.add("active");
}

function saveInputValue(inputElement) {
    const tr = inputElement.closest("tr");
    const dateKey = tr.getAttribute("data-date");
    const field = inputElement.getAttribute("data-field");
    const value = inputElement.value;
    
    updateStateField(dateKey, field, value);
    recalculateRow(tr);
}

function updateStateField(dateKey, field, value) {
    if (!state.activeEmployeeId) return;
    
    if (!state.pointages[state.activeEmployeeId]) {
        state.pointages[state.activeEmployeeId] = {};
    }
    
    if (!state.pointages[state.activeEmployeeId][dateKey]) {
        state.pointages[state.activeEmployeeId][dateKey] = {
            arrivee: "", pause: "", reprise: "", fin: "",
            nuitActive: false,
            nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
            status: "absent" // or whatever default
        };
    }
    
    state.pointages[state.activeEmployeeId][dateKey][field] = value;
    
    // Si l'utilisateur saisit une heure (pointage), on force le statut à "present"
    const timeFields = ['arrivee', 'pause', 'reprise', 'fin', 'nuitDebut', 'nuitPause', 'nuitReprise', 'nuitFin'];
    if (timeFields.includes(field)) {
        const d = state.pointages[state.activeEmployeeId][dateKey];
        if (d.arrivee || d.pause || d.reprise || d.fin || d.nuitDebut) {
            d.status = "present";
            const selectEl = document.querySelector(`tr[data-date="${dateKey}"] .status-select`);
            if (selectEl) selectEl.value = "present";
        }
        
        // Annuler le flag forfaitaire quand l'utilisateur édite manuellement un jour
        const [yr, mo] = dateKey.split("-");
        const defaultFlagKey = `_default_${yr}_${parseInt(mo, 10) - 1}`;
        delete state.pointages[state.activeEmployeeId][defaultFlagKey];
    }
    
    saveStateToLocalStorage();
}

function recalculateRow(trElement) {
    const dateKey = trElement.getAttribute("data-date");
    const empPointage = state.pointages[state.activeEmployeeId] || {};
    const data = empPointage[dateKey] || {
        arrivee: "", pause: "", reprise: "", fin: "",
        nuitActive: false,
        nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
    };
    
    const empDetails = state.dayDetails[state.activeEmployeeId] || {};
    const detail = empDetails[dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
    
    // Vérifier si ce jour tombe dans une période d'absence
    let periodPaid = null;
    if (state.absencePeriods && state.absencePeriods[state.activeEmployeeId]) {
        const currentObjDate = new Date(dateKey);
        for (const period of state.absencePeriods[state.activeEmployeeId]) {
            const startObj = new Date(period.start);
            const endObj = new Date(period.end);
            if (currentObjDate >= startObj && currentObjDate <= endObj) {
                if (!data.arrivee && !data.nuitActive) {
                    periodPaid = period.isPaid;
                }
            }
        }
    }
    
    // Utiliser la fonction unifiée getRowCalculations
    const calcs = getRowCalculations(data, detail, periodPaid);
    const { totalMinutes, legalDayMinutes, legalNightMinutes } = calcs;
    
    // Afficher les résultats sur la ligne
    trElement.querySelector(".val-total-jour").innerHTML = `${minutesToHoursStr(legalDayMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDayMinutes)}</span>`;
    trElement.querySelector(".val-total-nuit").innerHTML = `${minutesToHoursStr(legalNightMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNightMinutes)}</span>`;
    trElement.querySelector(".val-total-global").innerHTML = `${minutesToHoursStr(totalMinutes)}<span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalMinutes)}</span>`;
    
    recalculateEntireMonthKPIs();
}

function recalculateEntireMonthKPIs() {
    const tbody = document.getElementById("table-body");
    const rows = tbody.querySelectorAll("tr");
    
    let totalJourMin = 0;
    let totalNuitMin = 0;
    let totalHoursMin = 0;
    let workedDaysCount = 0;
    
    rows.forEach(tr => {
        const dateKey = tr.getAttribute("data-date");
        if (!dateKey) return;
        
        const empPointage = state.pointages[state.activeEmployeeId] || {};
        const data = empPointage[dateKey];
        if (!data) return;
        
        const empDetails = state.dayDetails[state.activeEmployeeId] || {};
        const detail = empDetails[dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
        
        // Vérifier si ce jour tombe dans une période d'absence
        let periodPaid = null;
        let isDeclaredAbsenceDay = false;
        if (state.absencePeriods && state.absencePeriods[state.activeEmployeeId]) {
            const currentObjDate = new Date(dateKey);
            for (const period of state.absencePeriods[state.activeEmployeeId]) {
                const startObj = new Date(period.start);
                const endObj = new Date(period.end);
                if (currentObjDate >= startObj && currentObjDate <= endObj) {
                    if (!data.arrivee && !data.nuitActive) {
                        periodPaid = period.isPaid;
                        isDeclaredAbsenceDay = true;
                    }
                }
            }
        }
        
        const calcs = getRowCalculations(data, detail, periodPaid);
        const { totalMinutes, legalDayMinutes, legalNightMinutes } = calcs;
        
        totalJourMin += legalDayMinutes;
        totalNuitMin += legalNightMinutes;
        totalHoursMin += totalMinutes;
        // Exclure les jours déclarés du compteur de jours travaillés
        if (!isDeclaredAbsenceDay && (totalMinutes > 0 || data.rendementActive === true)) {
            workedDaysCount++;
        }
    });
    
    updateSummaryKPIs(totalJourMin, totalNuitMin, workedDaysCount, totalHoursMin);
}

// ==========================================================================
// 8. EXPORTATION DES DONNÉES (EXCEL/CSV)
// ==========================================================================
function exportToCSV() {
    if (!state.activeEmployeeId) return;
    
    const activeEmp = state.employees.find(e => e.id === state.activeEmployeeId);
    const empName = activeEmp ? activeEmp.name : "Employe";
    const monthNames = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
    const monthLabel = monthNames[state.currentMonth];
    
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const empPointage = state.pointages[state.activeEmployeeId] || {};
    
    let csvContent = `Fiche de Pointage - ${empName} - ${monthLabel} ${state.currentYear}\n`;
    csvContent += `Date;Arrivee Jour;Pause Jour;Reprise Jour;Fin Jour;Nuit Active;Debut Nuit;Pause Nuit;Reprise Nuit;Fin Nuit;Heures Jour (Split);Heures Nuit (Split);Total\n`;
    
    let totalJourM = 0;
    let totalNuitM = 0;
    let totalHoursM = 0;

    for (let day = 1; day <= daysCount; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(state.currentMonth + 1).padStart(2, '0');
        const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
        const dayName = getDayName(state.currentYear, state.currentMonth, day);
        
        const data = empPointage[dateKey] || {
            arrivee: "", pause: "", reprise: "", fin: "",
            nuitActive: false,
            nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
        };
        
        const rawJourMinutes = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
        const rawNuitMinutes = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
        const totalMinutes = rawJourMinutes + rawNuitMinutes;
        
        const overlapJour = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
        const overlapNuit = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
        const legalNightMinutes = overlapJour + overlapNuit;
        
        const legalDayMinutes = Math.max(0, totalMinutes - legalNightMinutes);
        
        totalJourM += legalDayMinutes;
        totalNuitM += legalNightMinutes;
        totalHoursM += totalMinutes;
        
        csvContent += `${dayStr}/${monthStr}/${state.currentYear} (${dayName});`;
        csvContent += `${data.arrivee || ''};${data.pause || ''};${data.reprise || ''};${data.fin || ''};`;
        csvContent += `${data.nuitActive ? 'OUI' : 'NON'};`;
        csvContent += `${data.nuitDebut || ''};${data.nuitPause || ''};${data.nuitReprise || ''};${data.nuitFin || ''};`;
        csvContent += `${minutesToHoursStr(legalDayMinutes)};${minutesToHoursStr(legalNightMinutes)};${minutesToHoursStr(totalMinutes)}\n`;
    }
    
    let totalRattrapageMins = 0;
    if (state.rattrapages && state.rattrapages[state.activeEmployeeId]) {
        state.rattrapages[state.activeEmployeeId].forEach(r => {
            if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                totalRattrapageMins += r.minutes;
            }
        });
    }
    
    let finalTotalHoursM = Math.max(0, totalHoursM - totalRattrapageMins);
    
    if (totalRattrapageMins > 0) {
        csvContent += `\nHeures a rattraper (deduites);;;;;;;;;;;-${minutesToHoursStr(totalRattrapageMins)}\n`;
    }
    
    csvContent += `\nTOTAUX;;;;;;;;;;${minutesToHoursStr(totalJourM)};${minutesToHoursStr(totalNuitM)};${minutesToHoursStr(finalTotalHoursM)}\n`;

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const fileName = `pointage_${empName.replace(/\s+/g, '_').toLowerCase()}_${monthLabel.toLowerCase()}_${state.currentYear}.csv`;
    link.setAttribute("download", fileName);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================================
// 9. EXPORTATION LOT (TOUS LES EMPLOYÉS)
// ==========================================================================
/**
 * Exporte un fichier CSV pour CHAQUE employé, puis les télécharge séquentiellement.
 */
function exportAllToCSV() {
    if (!state.employees || state.employees.length === 0) {
        alert("Aucun employé à exporter.");
        return;
    }
    
    const monthNames = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
                        "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
    const monthLabel = monthNames[state.currentMonth];
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    
    state.employees.forEach((emp, i) => {
        const empPointage = state.pointages[emp.id] || {};
        
        let csvContent = `Fiche de Pointage - ${emp.name} (${emp.role}) - ${monthLabel} ${state.currentYear}\n`;
        csvContent += `Date;Arrivée Jour;Pause Jour;Reprise Jour;Fin Jour;Nuit Active;Début Nuit;Pause Nuit;Reprise Nuit;Fin Nuit;Heures Jour;Heures Nuit;Total\n`;
        
        let totalJourM = 0, totalNuitM = 0, totalHoursM = 0;
        
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            const dayName = getDayName(state.currentYear, state.currentMonth, day);
            
            const data = empPointage[dateKey] || {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false,
                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
            };
            
            const rawJourMinutes = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const rawNuitMinutes = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const totalMinutes = rawJourMinutes + rawNuitMinutes;
            const overlapJour = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const overlapNuit = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const legalNightMinutes = overlapJour + overlapNuit;
            const legalDayMinutes = Math.max(0, totalMinutes - legalNightMinutes);
            
            totalJourM += legalDayMinutes;
            totalNuitM += legalNightMinutes;
            totalHoursM += totalMinutes;
            
            csvContent += `${dayStr}/${monthStr}/${state.currentYear} (${dayName});`;
            csvContent += `${data.arrivee || ''};${data.pause || ''};${data.reprise || ''};${data.fin || ''};`;
            csvContent += `${data.nuitActive ? 'OUI' : 'NON'};`;
            csvContent += `${data.nuitDebut || ''};${data.nuitPause || ''};${data.nuitReprise || ''};${data.nuitFin || ''};`;
            csvContent += `${minutesToHoursStr(legalDayMinutes)};${minutesToHoursStr(legalNightMinutes)};${minutesToHoursStr(totalMinutes)}\n`;
        }
        
        let totalRattrapageMins = 0;
        if (state.rattrapages && state.rattrapages[emp.id]) {
            state.rattrapages[emp.id].forEach(r => {
                if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                    totalRattrapageMins += r.minutes;
                }
            });
        }
        
        let finalTotalHoursM = Math.max(0, totalHoursM - totalRattrapageMins);
        
        if (totalRattrapageMins > 0) {
            csvContent += `\nHeures a rattraper (deduites);;;;;;;;;;;-${minutesToHoursStr(totalRattrapageMins)}\n`;
        }
        
        csvContent += `\nTOTAUX;;;;;;;;;;${minutesToHoursStr(totalJourM)};${minutesToHoursStr(totalNuitM)};${minutesToHoursStr(finalTotalHoursM)}\n`;
        
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const fileName = `pointage_${emp.name.replace(/\s+/g, '_').toLowerCase()}_${monthLabel.toLowerCase()}_${state.currentYear}.csv`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        
        // Délai pour permettre au navigateur de traiter chaque téléchargement
        setTimeout(() => {
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, i * 400);
    });
}

/**
 * Imprime les fiches de pointage de TOUS les employés, une page par employé.
 */
function printAll() {
    if (state.employees.length === 0) {
        alert("Aucun employé à imprimer.");
        return;
    }
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const monthLabel = monthNames[state.currentMonth];
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    
    const container = document.getElementById("print-batch-container");
    container.innerHTML = "";
    
    state.employees.forEach(emp => {
        const empPointage = state.pointages[emp.id] || {};
        
        // Vérifier s'il y a un shift nuit pour cet employé ce mois
        let hasNight = false;
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            if (empPointage[dateKey] && empPointage[dateKey].nuitActive) {
                hasNight = true;
                break;
            }
        }
        
        let rowsHtml = "";
        let totalJourM = 0, totalNuitM = 0, totalHoursM = 0;
        
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            const dayName = getDayName(state.currentYear, state.currentMonth, day);
            const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
            
            const data = empPointage[dateKey] || {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false,
                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
            };
            
            const rawJourMinutes = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const rawNuitMinutes = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const totalMinutes = rawJourMinutes + rawNuitMinutes;
            const overlapJour = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const overlapNuit = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const legalNightMinutes = overlapJour + overlapNuit;
            const legalDayMinutes = Math.max(0, totalMinutes - legalNightMinutes);
            
            totalJourM += legalDayMinutes;
            totalNuitM += legalNightMinutes;
            totalHoursM += totalMinutes;
            
            const nightCols = hasNight ? `
                <td>${data.nuitActive ? (data.nuitDebut || '-') : '-'}</td>
                <td>${data.nuitActive ? (data.nuitPause || '-') : '-'}</td>
                <td>${data.nuitActive ? (data.nuitReprise || '-') : '-'}</td>
                <td>${data.nuitActive ? (data.nuitFin || '-') : '-'}</td>
            ` : '';
            
            rowsHtml += `
                <tr class="${isWeekend ? 'weekend' : ''} ${data.nuitActive ? 'night-active' : ''}">
                    <td><strong>${dayStr}</strong> <small>${dayName}</small></td>
                    <td>${data.arrivee || '-'}</td>
                    <td>${data.pause || '-'}</td>
                    <td>${data.reprise || '-'}</td>
                    <td>${data.fin || '-'}</td>
                    ${nightCols}
                    <td>${minutesToHoursStr(legalDayMinutes)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDayMinutes)}</span></td>
                    <td>${minutesToHoursStr(legalNightMinutes)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNightMinutes)}</span></td>
                    <td><strong>${minutesToHoursStr(totalMinutes)}</strong><br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalMinutes)}</span></td>
                </tr>
            `;
        }
        
        const nightHeaders = hasNight ? `
            <th>Début Nuit</th>
            <th>Pause Nuit</th>
            <th>Reprise Nuit</th>
            <th>Fin Nuit</th>
        ` : '';
        
        const pageDiv = document.createElement("div");
        pageDiv.className = "print-page";
        pageDiv.innerHTML = `
            <div class="print-header">
                <h2>${emp.name}</h2>
                <p style="color:#1d4ed8; font-weight:600; font-size:0.9rem;">${emp.matricule || '—'}</p>
                <p>${emp.role} &mdash; Fiche de Pointage : ${monthLabel} ${state.currentYear}</p>
                <p style="font-size:0.8rem; color:#888;">Heures de nuit légales : 21h00 – 05h00 (Côte d'Ivoire)</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Arrivée</th>
                        <th>Pause</th>
                        <th>Reprise</th>
                        <th>Fin Jour</th>
                        ${nightHeaders}
                        <th>Total Jour</th>
                        <th>Total Nuit</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr style="font-weight:bold; border-top: 2px solid #333;">
                        <td colspan="${hasNight ? 9 : 5}">TOTAUX DU MOIS</td>
                        <td>${minutesToHoursStr(totalJourM)} (${minutesToDecimal(totalJourM)})</td>
                        <td>${minutesToHoursStr(totalNuitM)} (${minutesToDecimal(totalNuitM)})</td>
                        <td>${minutesToHoursStr(totalHoursM)} (${minutesToDecimal(totalHoursM)})</td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.appendChild(pageDiv);
    });
    
    // Activer le mode batch (masque l'app, affiche le container)
    document.body.classList.add("print-batch-mode");
    
    // Ouvrir la boîte d'impression
    window.print();
    
    // Restaurer l'interface après impression
    setTimeout(() => {
        document.body.classList.remove("print-batch-mode");
        container.innerHTML = "";
    }, 1000);
}

// ==========================================================================
// 10. EXPORT PDF (via nouvelle fenêtre navigateur)
// ==========================================================================
/**
 * Génère un document HTML dans une nouvelle fenêtre, prêt à être
 * imprimé ou sauvegardé en PDF (Ctrl+P → "Enregistrer en PDF").
 * @param {string[]} employeeIds - Tableau des IDs à inclure
 */
function exportToPDF(employeeIds) {
    if (!employeeIds || employeeIds.length === 0 || !employeeIds[0]) {
        alert("Veuillez sélectionner un employé.");
        return;
    }
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const monthLabel = monthNames[state.currentMonth];
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    
    let pagesHtml = "";
    
    employeeIds.forEach((empId, empIndex) => {
        const emp = state.employees.find(e => e.id === empId);
        if (!emp) return;
        
        const empPointage = state.pointages[emp.id] || {};
        
        // Vérifier s'il y a un shift nuit pour cet employé ce mois
        let hasNight = false;
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            if (empPointage[dateKey] && empPointage[dateKey].nuitActive) {
                hasNight = true;
                break;
            }
        }
        
        let rowsHtml = "";
        let totalJourM = 0, totalNuitM = 0, totalHoursM = 0;
        
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            const dayName = getDayName(state.currentYear, state.currentMonth, day);
            const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
            
            const data = empPointage[dateKey] || {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false,
                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: ""
            };
            
            const rawJour = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const rawNuit = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const total = rawJour + rawNuit;
            const overlapJour = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            const overlapNuit = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            const legalNight = overlapJour + overlapNuit;
            const legalDay = Math.max(0, total - legalNight);
            
            totalJourM += legalDay;
            totalNuitM += legalNight;
            totalHoursM += total;
            
            const bg = isWeekend ? '#fff8e1' : (day % 2 === 0 ? '#f8f9fa' : '#ffffff');
            const nightBg = data.nuitActive ? '#f3e8ff' : '';
            
            const nightCols = hasNight ? `
                <td style="${data.nuitActive ? `background:${nightBg}` : 'color:#bbb'}">${data.nuitActive ? (data.nuitDebut || '&mdash;') : '&mdash;'}</td>
                <td style="${data.nuitActive ? `background:${nightBg}` : 'color:#bbb'}">${data.nuitActive ? (data.nuitPause || '&mdash;') : '&mdash;'}</td>
                <td style="${data.nuitActive ? `background:${nightBg}` : 'color:#bbb'}">${data.nuitActive ? (data.nuitReprise || '&mdash;') : '&mdash;'}</td>
                <td style="${data.nuitActive ? `background:${nightBg}` : 'color:#bbb'}">${data.nuitActive ? (data.nuitFin || '&mdash;') : '&mdash;'}</td>
            ` : '';
            
            rowsHtml += `
                <tr style="background:${bg}">
                    <td style="text-align:left; padding-left:5px; white-space:nowrap;"><strong>${dayStr}</strong> <span style="color:#999; font-size:0.8em;">${dayName}</span></td>
                    <td>${data.arrivee || '&mdash;'}</td>
                    <td style="color:#888">${data.pause || '&mdash;'}</td>
                    <td style="color:#888">${data.reprise || '&mdash;'}</td>
                    <td>${data.fin || '&mdash;'}</td>
                    ${nightCols}
                    <td style="color:#1d4ed8; font-weight:600">${minutesToHoursStr(legalDay)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDay)}</span></td>
                    <td style="color:#7c3aed; font-weight:600">${minutesToHoursStr(legalNight)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNight)}</span></td>
                    <td style="color:#059669; font-weight:700; font-size:1.05em">${minutesToHoursStr(total)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(total)}</span></td>
                </tr>
            `;
        }
        
        let totalRattrapageMins = 0;
        if (state.rattrapages && state.rattrapages[emp.id]) {
            state.rattrapages[emp.id].forEach(r => {
                if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                    totalRattrapageMins += r.minutes;
                }
            });
        }
        
        let finalTotalHoursM = Math.max(0, totalHoursM - totalRattrapageMins);
        
        let rattrapageHtml = '';
        if (totalRattrapageMins > 0) {
            rattrapageHtml = `
            <tr style="border-top:1px solid #cbd5e1; background:#fdf2f8;">
                <td colspan="${hasNight ? 9 : 5}" style="text-align:right; font-weight:700; padding:8px; color:#be185d;">HEURES À RATTRAPER (DÉDUITES) &rarr;</td>
                <td colspan="2"></td>
                <td style="font-weight:700; color:#be185d; font-size:1.05em;">- ${minutesToHoursStr(totalRattrapageMins)}</td>
            </tr>`;
        }

        const nightHeaders = hasNight ? `
            <th style="background:#ede9fe; color:#6d28d9">Début Nuit</th>
            <th style="background:#ede9fe; color:#6d28d9">Pause Nuit</th>
            <th style="background:#ede9fe; color:#6d28d9">Reprise Nuit</th>
            <th style="background:#ede9fe; color:#6d28d9">Fin Nuit</th>
        ` : '';
        
        const pageBreak = empIndex > 0 ? 'page-break-before: always;' : '';
        
        pagesHtml += `
        <div class="employee-page" style="${pageBreak} padding: 8px 14px; font-family: Arial, sans-serif; font-size: 0.72rem;">
            <!-- En-tête -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1d4ed8; padding-bottom:6px; margin-bottom:8px;">
                <div>
                    <h1 style="font-size:1rem; color:#0f172a; margin:0;">${emp.name}</h1>
                    <p style="color:#1d4ed8; font-weight:600; margin:1px 0 0; font-size:0.78rem;">${emp.matricule || '—'}</p>
                    <p style="color:#64748b; margin:1px 0 0; font-size:0.78rem;">${emp.role}</p>
                </div>
                <div style="text-align:right;">
                    <p style="font-size:0.9rem; font-weight:700; color:#1d4ed8; margin:0;">Fiche de Pointage</p>
                    <p style="font-size:0.8rem; color:#475569; margin:2px 0 0;">${monthLabel} ${state.currentYear}</p>
                    <p style="font-size:0.65rem; color:#94a3b8; margin:2px 0 0;">Heures légales de nuit : 21h00 – 05h00</p>
                </div>
            </div>
            
            <!-- Résumé KPI -->
            <div style="display:flex; gap:6px; margin-bottom:8px;">
                <div style="flex:1; background:#dbeafe; border-radius:5px; padding:5px 8px; text-align:center;">
                    <div style="font-size:0.65rem; color:#1d4ed8; font-weight:600; text-transform:uppercase;">Heures Jour</div>
                    <div style="font-size:0.9rem; font-weight:700; color:#1e3a8a;">${minutesToHoursStr(totalJourM)} <span style="font-size:0.8em;font-weight:800;color:#ea580c;background:#fff7ed;padding:1px 4px;border-radius:4px;border:1px solid #fdba74;">${minutesToDecimal(totalJourM)}</span></div>
                </div>
                <div style="flex:1; background:#ede9fe; border-radius:5px; padding:5px 8px; text-align:center;">
                    <div style="font-size:0.65rem; color:#6d28d9; font-weight:600; text-transform:uppercase;">Heures Nuit</div>
                    <div style="font-size:0.9rem; font-weight:700; color:#4c1d95;">${minutesToHoursStr(totalNuitM)} <span style="font-size:0.8em;font-weight:800;color:#ea580c;background:#fff7ed;padding:1px 4px;border-radius:4px;border:1px solid #fdba74;">${minutesToDecimal(totalNuitM)}</span></div>
                </div>
                <div style="flex:1; background:#d1fae5; border-radius:5px; padding:5px 8px; text-align:center;">
                    <div style="font-size:0.65rem; color:#059669; font-weight:600; text-transform:uppercase;">Total À Payer</div>
                    <div style="font-size:0.9rem; font-weight:700; color:#065f46;">${minutesToHoursStr(finalTotalHoursM)} <span style="font-size:0.8em;font-weight:800;color:#ea580c;background:#fff7ed;padding:1px 4px;border-radius:4px;border:1px solid #fdba74;">${minutesToDecimal(finalTotalHoursM)}</span></div>
                </div>
            </div>
            
            <!-- Tableau -->
            <table style="width:100%; border-collapse:collapse; font-size:0.62rem;">
                <thead>
                    <tr>
                        <th style="background:#1d4ed8; color:white; padding:4px 4px;">Date</th>
                        <th style="background:#1e40af; color:white; padding:4px 4px;">Arrivée</th>
                        <th style="background:#1e40af; color:#bfdbfe; padding:4px 4px;">Pause</th>
                        <th style="background:#1e40af; color:#bfdbfe; padding:4px 4px;">Reprise</th>
                        <th style="background:#1e40af; color:white; padding:4px 4px;">Fin Jour</th>
                        ${nightHeaders}
                        <th style="background:#1d4ed8; color:white; padding:4px 4px;">Total Jour</th>
                        <th style="background:#6d28d9; color:white; padding:4px 4px;">Total Nuit</th>
                        <th style="background:#059669; color:white; padding:4px 4px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    ${rattrapageHtml}
                    <tr style="border-top:2px solid #333; background:#f1f5f9;">
                        <td colspan="${hasNight ? 9 : 5}" style="text-align:right; font-weight:700; padding:8px; color:#475569;">TOTAL À PAYER &rarr;</td>
                        <td style="font-weight:700; color:#1d4ed8;">${minutesToHoursStr(totalJourM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalJourM)}</span></td>
                        <td style="font-weight:700; color:#6d28d9;">${minutesToHoursStr(totalNuitM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalNuitM)}</span></td>
                        <td style="font-weight:800; color:#059669; font-size:1.05em;">${minutesToHoursStr(finalTotalHoursM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(finalTotalHoursM)}</span></td>
                    </tr>
                </tbody>
            </table>
            
            <!-- Zone de signatures -->
            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:8px; border-top:1px solid #e2e8f0;">
                <div style="text-align:center; width:45%;">
                    <p style="font-size:0.75rem; color:#475569; margin-bottom:8px;">Signature de l'employé</p>
                    <div style="border-top:1px solid #333; padding-top:3px; font-size:0.65rem; color:#94a3b8;">Date et Signature</div>
                </div>
                <div style="text-align:center; width:45%;">
                    <p style="font-size:0.75rem; color:#475569; margin-bottom:8px;">Signature du responsable</p>
                    <div style="border-top:1px solid #333; padding-top:3px; font-size:0.65rem; color:#94a3b8;">Date et Signature</div>
                </div>
            </div>
        </div>
        `;
    });
    
    // Ouvrir dans une nouvelle fenêtre et lancer l'impression
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Fiche de Pointage &mdash; ${monthLabel} ${state.currentYear}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; font-size: 0.65rem; }
        th, td { border: 1px solid #cbd5e1; padding: 2px 3px; text-align: center; vertical-align: middle; }
        @media print {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            @page { margin: 3mm; size: A4 portrait; }
            body { margin: 0; zoom: 1 !important; }
            table { zoom: 0.65; }
            .employee-page { page-break-after: always; page-break-inside: avoid; height: 285mm; max-height: 285mm; overflow: hidden; box-sizing: border-box; }
            .employee-page:last-child { page-break-after: avoid; }
        }
        .no-print { text-align: center; padding: 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
        .no-print button {
            background: #1d4ed8; color: white; border: none; padding: 10px 24px;
            border-radius: 6px; font-size: 1rem; cursor: pointer; margin: 0 6px;
        }
        .no-print button:hover { background: #1e40af; }
        @media print { .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="no-print">
        <p style="margin-bottom:10px; color:#475569;">Aperçu avant impression / PDF</p>
        <button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
        <button onclick="window.close()" style="background:#64748b;">✕ Fermer</button>
    </div>
    ${pagesHtml}
</body>
</html>`);
    win.document.close();
    
    // Attendre le chargement puis imprimer automatiquement
    win.onload = function() {
        setTimeout(() => win.print(), 300);
    };
}

// ==========================================================================
// 10b. EXPORT SYNTHÈSE PDF
// ==========================================================================
function exportSynthesisPDF(employeeIds) {
    if (!employeeIds || employeeIds.length === 0 || !employeeIds[0]) {
        alert("Veuillez sélectionner un employé.");
        return;
    }
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const monthLabel = monthNames[state.currentMonth];
    const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
    const holidays = getHolidaysForMonth(state.currentYear, state.currentMonth);
    
    let pagesHtml = "";
    
    employeeIds.forEach((empId, empIndex) => {
        const emp = state.employees.find(e => e.id === empId);
        if (!emp) return;
        
        const empPointage = state.pointages[emp.id] || {};
        const empDetails = state.dayDetails[emp.id] || {};
        
        let rowsHtml = "";
        let totalJourM = 0, totalNuitM = 0, totalHoursM = 0;
        let workedDays = 0, absentDays = 0, totalWorkingDays = 0;
        
        for (let day = 1; day <= daysCount; day++) {
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(state.currentMonth + 1).padStart(2, '0');
            const dateKey = `${state.currentYear}-${monthStr}-${dayStr}`;
            const dayName = getDayName(state.currentYear, state.currentMonth, day);
            const isWeekend = dayName.startsWith("sam") || dayName.startsWith("dim");
            const isHoliday = !!holidays[dateKey];
            const isWorkingDay = !isWeekend && !isHoliday;
            
            if (isWorkingDay) totalWorkingDays++;
            
            const storedData = empPointage[dateKey];
            const data = storedData ? { ...storedData } : {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false,
                nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
                status: "", observation: ""
            };
            
            // Auto-assign status like generateTable
            if (!storedData || !data.status) {
                const hasPointage = !!(data.arrivee || data.pause || data.reprise || data.fin || data.nuitDebut);
                if (hasPointage) data.status = "present";
                else if (isWorkingDay) data.status = "absent";
                else data.status = "present";
            }
            
            const detail = empDetails[dateKey] || { note: "", isEvent: false, eventName: "", eventWorked: true };
            
            // Absence periods
            let periodPaid = null;
            let isDeclaredAbsenceDay = false;
            if (state.absencePeriods && state.absencePeriods[emp.id]) {
                const currentObjDate = new Date(dateKey);
                for (const period of state.absencePeriods[emp.id]) {
                    if (currentObjDate >= new Date(period.start) && currentObjDate <= new Date(period.end)) {
                        if (!data.arrivee && !data.nuitActive) {
                            data.status = period.type;
                            periodPaid = period.isPaid;
                            isDeclaredAbsenceDay = true;
                        }
                    }
                }
            }
            
            let mpMode = data.arrivee && data.arrivee.toUpperCase() === "MP";
            let rawJour = calculateShiftMinutes(data.arrivee, data.pause, data.reprise, data.fin);
            let rawNuit = data.nuitActive ? calculateShiftMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
            let totalMinutes = rawJour + rawNuit;
            let legalNight = 0, legalDay = 0;
            
            if (mpMode) {
                totalMinutes = 480; legalDay = 480;
            } else if (periodPaid === true || data.status === "accident" || data.status === "conge" || data.status === "malade" || data.status === "faute_entreprise") {
                totalMinutes = 480; legalDay = 480;
            } else if (data.status === "permission_payee") {
                totalMinutes = 480; legalDay = 480;
            } else if (detail.isEvent) {
                totalMinutes = detail.eventWorked ? 480 : 0;
                legalDay = totalMinutes;
            } else if (data.status !== "present") {
                totalMinutes = 0; legalDay = 0; legalNight = 0;
            } else {
                const overlapJ = calculateLegalNightMinutes(data.arrivee, data.pause, data.reprise, data.fin);
                const overlapN = data.nuitActive ? calculateLegalNightMinutes(data.nuitDebut, data.nuitPause, data.nuitReprise, data.nuitFin) : 0;
                legalNight = overlapJ + overlapN;
                legalDay = Math.max(0, totalMinutes - legalNight);
            }
            
            totalJourM += legalDay;
            totalNuitM += legalNight;
            totalHoursM += totalMinutes;
            // Exclure les jours déclarés du compteur de jours travaillés
            if (!isDeclaredAbsenceDay && (totalMinutes > 0 || data.rendementActive === true)) workedDays++;
            if (isWorkingDay && data.status && data.status !== 'present') absentDays++;
            
            // Status badge
            const statusLabels = { present:'Présent', absent:'Absent', permission:'Permission', permission_payee:'Permission Payée', faute_entreprise:'Faute Entreprise', malade:'Maladie', accident:'Accident T.', conge:'Congé', autre:'Autre' };
            const statusColors = { present:'#059669', absent:'#dc2626', permission:'#d97706', permission_payee:'#d97706', faute_entreprise:'#b45309', malade:'#ea580c', accident:'#e11d48', conge:'#0284c7', autre:'#6b7280' };
            const statusBgs = { present:'#ecfdf5', absent:'#fef2f2', permission:'#fffbeb', permission_payee:'#fffbeb', faute_entreprise:'#fef3c7', malade:'#fff7ed', accident:'#fff1f2', conge:'#f0f9ff', autre:'#f9fafb' };
            const sColor = statusColors[data.status] || '#6b7280';
            const sBg = statusBgs[data.status] || '#f9fafb';
            const sLabel = statusLabels[data.status] || data.status || '—';
            
            let displayStatus = `<span style="color:${sColor};background:${sBg};padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;white-space:nowrap;">${sLabel}</span>`;
            if (data.rendementActive) {
                const calcs = getRowCalculations(data, detail, periodPaid);
                if (calcs.pointedMinutes > 0) {
                    displayStatus += `<br><span style="color:#0284c7; font-size:0.65rem; font-weight:600; display:inline-block; margin-top:4px;">Rendement + ${minutesToDecimal(calcs.pointedMinutes)}</span>`;
                } else {
                    displayStatus += `<br><span style="color:#0284c7; font-size:0.65rem; font-weight:600; display:inline-block; margin-top:4px;">Rendement</span>`;
                }
            }
            
            // Row background
            let rowBg = isWeekend || isHoliday ? '#fefce8' : (day % 2 === 0 ? '#f8fafc' : '#ffffff');
            if (data.status === 'absent') rowBg = '#fef2f2';
            
            let dayLabel = `<strong>${dayStr}/${monthStr}</strong> <span style="color:#9ca3af;font-size:0.7rem;text-transform:capitalize;">${dayName}</span>`;
            if (isHoliday) dayLabel += `<br><span style="font-size:0.65rem;color:#dc2626;font-weight:600;">${holidays[dateKey]}</span>`;
            
            rowsHtml += `
                <tr style="background:${rowBg}">
                    <td style="text-align:left;padding:8px 10px;">${dayLabel}</td>
                    <td>${displayStatus}</td>
                    <td style="color:#1d4ed8;font-weight:600;">${legalDay > 0 ? `${minutesToHoursStr(legalDay)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalDay)}</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
                    <td style="color:#7c3aed;font-weight:600;">${legalNight > 0 ? `${minutesToHoursStr(legalNight)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(legalNight)}</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
                    <td style="color:#059669;font-weight:700;">${totalMinutes > 0 ? `${minutesToHoursStr(totalMinutes)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalMinutes)}</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
                </tr>
            `;
        }
        
        // Rattrapage
        let totalRattrapageMins = 0, remainingDebtMins = 0;
        if (state.rattrapages && state.rattrapages[emp.id]) {
            state.rattrapages[emp.id].forEach(r => {
                if (r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear) {
                    totalRattrapageMins += r.minutes;
                } else if (!r.recovered) {
                    remainingDebtMins += r.minutes;
                }
            });
        }
        let finalTotalHoursM = Math.max(0, totalHoursM - totalRattrapageMins);
        
        const pageBreak = empIndex > 0 ? 'page-break-before: always;' : '';
        
        pagesHtml += `
        <div style="${pageBreak} padding: 20px 28px; font-family: 'Segoe UI', Arial, sans-serif;">
            <!-- En-tête -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #059669; padding-bottom:14px; margin-bottom:18px;">
                <div>
                    <h1 style="font-size:1.3rem; color:#0f172a; margin:0;">${emp.name}</h1>
                    <p style="color:#059669; font-weight:600; margin:2px 0 0; font-size:0.85rem;">${emp.matricule || '—'}</p>
                    <p style="color:#64748b; margin:2px 0 0; font-size:0.85rem;">${emp.role}</p>
                </div>
                <div style="text-align:right;">
                    <p style="font-size:1.1rem; font-weight:700; color:#059669; margin:0;">📊 Synthèse Mensuelle</p>
                    <p style="font-size:1rem; color:#475569; margin:4px 0 0;">${monthLabel} ${state.currentYear}</p>
                </div>
            </div>
            
            <!-- KPI Cards -->
            <div style="display:flex; gap:10px; margin-bottom:18px;">
                <div style="flex:1; background:#dbeafe; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#1d4ed8; font-weight:600; text-transform:uppercase;">Heures Jour</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#1e3a8a;">${minutesToHoursStr(totalJourM)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalJourM)}</span></div>
                </div>
                <div style="flex:1; background:#ede9fe; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#6d28d9; font-weight:600; text-transform:uppercase;">Heures Nuit</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#4c1d95;">${minutesToHoursStr(totalNuitM)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalNuitM)}</span></div>
                </div>
                <div style="flex:1; background:#fef3c7; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#92400e; font-weight:600; text-transform:uppercase;">Jours Absents</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#78350f;">${absentDays} <span style="font-size:0.65em;color:#6b7280">/ ${totalWorkingDays} ouvrables</span></div>
                </div>
                ${remainingDebtMins > 0 ? `
                <div style="flex:1; background:#fff7ed; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#9a3412; font-weight:600; text-transform:uppercase;">À Rattraper</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#7c2d12;">${minutesToHoursStr(remainingDebtMins)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(remainingDebtMins)}</span></div>
                </div>` : ''}
                <div style="flex:1; background:#d1fae5; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#059669; font-weight:600; text-transform:uppercase;">Total À Payer</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#065f46;">${minutesToHoursStr(finalTotalHoursM)} <span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(finalTotalHoursM)}</span></div>
                </div>
                ${emp.tauxTransport > 0 && totalWorkingDays > 0 ? `
                <div style="flex:1; background:#e0f2fe; border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:0.7rem; color:#0284c7; font-weight:600; text-transform:uppercase;">🚌 Transport</div>
                    <div style="font-size:1.15rem; font-weight:700; color:#0c4a6e;">${((emp.tauxTransport * workedDays) / totalWorkingDays).toLocaleString('fr-FR', {maximumFractionDigits:0})}</div>
                    <div style="font-size:0.65rem;color:#6b7280;">${workedDays}/${totalWorkingDays}j ouvrables</div>
                </div>` : ''}
            </div>
            
            <!-- Tableau Synthèse -->
            <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                <thead>
                    <tr>
                        <th style="background:#059669; color:white; padding:8px 10px; text-align:left;">Date</th>
                        <th style="background:#059669; color:white; padding:8px 10px;">Statut</th>
                        <th style="background:#1d4ed8; color:white; padding:8px 10px;">Jour (H)</th>
                        <th style="background:#6d28d9; color:white; padding:8px 10px;">Nuit (H)</th>
                        <th style="background:#065f46; color:white; padding:8px 10px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    ${totalRattrapageMins > 0 ? `
                    <tr style="border-top:1px solid #cbd5e1; background:#fdf2f8;">
                        <td colspan="4" style="text-align:right; font-weight:700; padding:8px; color:#be185d;">RATTRAPAGE DÉDUIT &rarr;</td>
                        <td style="font-weight:700; color:#be185d;">- ${minutesToHoursStr(totalRattrapageMins)}</td>
                    </tr>` : ''}
                    <tr style="border-top:2px solid #059669; background:#ecfdf5;">
                        <td colspan="2" style="text-align:left; font-weight:700; padding:10px; color:#059669; font-size:0.8rem;">📊 TOTAUX (${workedDays} jour${workedDays > 1 ? 's' : ''} travaillé${workedDays > 1 ? 's' : ''})</td>
                        <td style="font-weight:700; color:#1d4ed8; font-size:0.85rem;">${minutesToHoursStr(totalJourM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalJourM)}</span></td>
                        <td style="font-weight:700; color:#6d28d9; font-size:0.85rem;">${minutesToHoursStr(totalNuitM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(totalNuitM)}</span></td>
                        <td style="font-weight:800; color:#059669; font-size:0.9rem;">${minutesToHoursStr(finalTotalHoursM)}<br><span style="font-size:0.85em;font-weight:800;color:#ea580c;background:#fff7ed;padding:2px 6px;border-radius:6px;border:1px solid #fdba74;display:inline-block;white-space:nowrap;margin-left:4px;">${minutesToDecimal(finalTotalHoursM)}</span></td>
                    </tr>
                </tbody>
            </table>
            
            <!-- Signatures -->
            <div style="display:flex; justify-content:space-between; margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0;">
                <div style="text-align:center; width:45%;">
                    <p style="font-size:0.8rem; color:#475569; margin-bottom:40px;">Signature de l'employé</p>
                    <div style="border-top:1px solid #333; padding-top:4px; font-size:0.75rem; color:#94a3b8;">Date et Signature</div>
                </div>
                <div style="text-align:center; width:45%;">
                    <p style="font-size:0.8rem; color:#475569; margin-bottom:40px;">Signature du responsable</p>
                    <div style="border-top:1px solid #333; padding-top:4px; font-size:0.75rem; color:#94a3b8;">Date et Signature</div>
                </div>
            </div>
        </div>
        `;
    });
    
    // Ouvrir dans une nouvelle fenêtre
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Synthèse Mensuelle &mdash; ${monthLabel} ${state.currentYear}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: center; }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.72; }
            @page { margin: 5mm; size: A4 portrait; }
        }
        .no-print { text-align: center; padding: 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
        .no-print button {
            background: #059669; color: white; border: none; padding: 10px 24px;
            border-radius: 6px; font-size: 1rem; cursor: pointer; margin: 0 6px;
        }
        .no-print button:hover { background: #047857; }
        @media print { .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="no-print">
        <p style="margin-bottom:10px; color:#475569;">Aperçu de la synthèse mensuelle</p>
        <button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
        <button onclick="window.close()" style="background:#64748b;">✕ Fermer</button>
    </div>
    ${pagesHtml}
</body>
</html>`);
    win.document.close();
    
    win.onload = function() {
        setTimeout(() => win.print(), 300);
    };
}

// ==========================================================================
// 10. GESTION DES JOURS FÉRIÉS
// ==========================================================================
function renderHolidaysList() {
    const list = document.getElementById("holidays-list");
    if (!list) return;
    list.innerHTML = "";
    
    if (!state.customHolidays) state.customHolidays = {};
    
    // Récupérer les fériés auto du mois
    const autoHolidays = getHolidaysForMonth(state.currentYear, state.currentMonth);
    
    const allEntries = Object.entries(autoHolidays).map(([date, name]) => ({ date, name, isAuto: true }));
    
    // Pas besoin d'ajouter customHolidays séparément car getHolidaysForMonth les inclut déjà
    
    if (allEntries.length === 0) {
        list.innerHTML = `<li style="text-align:center; color:var(--text-muted); font-size:0.85rem;">Aucun jour férié ce mois-ci</li>`;
    } else {
        // Trier par date
        allEntries.sort((a, b) => a.date.localeCompare(b.date));
        allEntries.forEach(h => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "6px 0";
            li.style.borderBottom = "1px solid var(--border-color)";
            
            const [y, m, d] = h.date.split('-');
            const displayDate = `${d}/${m}/${y}`;
            const typeLabel = h.isAuto ? '' : ' <em style="font-size:0.7rem;color:var(--text-muted);">(personnalisé)</em>';
            
            const deleteBtn = !h.isAuto ? `
                <button class="btn-text delete-holiday-btn" data-date="${h.date}" style="color:var(--accent-danger); padding:4px;">
                    <i data-lucide="trash" style="width:14px; height:14px;"></i>
                </button>` : `<span style="font-size:0.7rem; color:var(--accent-success); padding:4px;">✓ Auto</span>`;
            
            li.innerHTML = `
                <div>
                    <strong style="color:var(--accent-danger); font-size:0.9rem;">${displayDate}</strong>${typeLabel}
                    <div style="font-size:0.8rem; color:var(--text-primary);">${h.name}</div>
                </div>
                ${deleteBtn}
            `;
            list.appendChild(li);
        });
    }
    
    lucide.createIcons();
    
    document.querySelectorAll(".delete-holiday-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const dateKey = this.getAttribute("data-date");
            delete state.customHolidays[dateKey];
            saveStateToLocalStorage();
            renderHolidaysList();
            generateTable();
        });
    });
}

// ==========================================================================
// 11. GESTION DES HEURES À RATTRAPER
// ==========================================================================


function renderRattrapagesDashboard() {
    const debtsList = document.getElementById("rattrapage-debts-list");
    if (!debtsList || !state.activeEmployeeId) return;
    
    debtsList.innerHTML = "";
    if (!state.rattrapages) state.rattrapages = {};
    if (!state.rattrapages[state.activeEmployeeId]) state.rattrapages[state.activeEmployeeId] = [];
    
    const empRattrapages = state.rattrapages[state.activeEmployeeId];
    
    if (empRattrapages.length === 0) {
        debtsList.innerHTML = `<li style="text-align:center; padding:10px; color:var(--text-muted); font-size:0.8rem;">Aucune dette d'heures</li>`;
    } else {
        empRattrapages.forEach((r, index) => {
            const dateDisplay = r.date.split('-').reverse().join('/');
            const endDateDisplay = r.endDate ? r.endDate.split('-').reverse().join('/') : '';
            const dateRange = endDateDisplay && endDateDisplay !== dateDisplay ? `${dateDisplay} → ${endDateDisplay}` : dateDisplay;
            const statusColor = r.recovered ? 'var(--accent-success)' : '#d97706';
            const statusText = r.recovered ? '✓ Récupéré' : '⏳ En attente';
            const isAuto = !!r.periodId;
            const typeBadgeColors = {
                faute_entreprise: 'color:#b45309; background:#fef3c7;',
                absent: 'color:#dc2626; background:#fef2f2;',
                default: 'color:#6b7280; background:#f3f4f6;'
            };
            const typeBadgeStyle = typeBadgeColors[r.type] || typeBadgeColors.default;
            const typeLabels = {
                faute_entreprise: 'Faute Entreprise',
                absent: 'Absence',
                permission: 'Permission',
                malade: 'Maladie',
                autre: 'Autre'
            };
            const typeLabel = typeLabels[r.type] || (r.type || '');
            
            const li = document.createElement("li");
            li.style.cssText = "padding:8px 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:flex-start; font-size:0.8rem;";
            li.innerHTML = `
                <div style="flex: 1;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <strong>${dateRange}</strong> — <span style="font-weight:600; color:#1e293b;">${minutesToHoursStr(r.minutes)}</span>
                        ${isAuto ? `<span style="font-size:0.65rem; padding:1px 5px; border-radius:6px; ${typeBadgeStyle} font-weight:600;">${typeLabel}</span>` : ''}
                        ${isAuto ? `<span style="font-size:0.65rem; color:#0284c7; background:#f0f9ff; padding:1px 5px; border-radius:6px; font-weight:600;">Auto</span>` : ''}
                    </div>
                    ${r.reason ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px; font-style:italic;">${r.reason}</div>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:8px;">
                    <span style="color:${statusColor}; font-weight:600; font-size:0.72rem;">${statusText}</span>
                    ${!r.recovered
                        ? `<button class="btn-text recover-btn" data-index="${index}" style="font-size:0.7rem; color:var(--accent-day); border:1px solid var(--border-color); border-radius:4px; padding:3px 6px; cursor:pointer;">Récupéré</button>`
                        : `<button class="btn-text unrecover-btn" data-index="${index}" style="font-size:0.7rem; color:var(--text-muted); border:1px solid var(--border-color); border-radius:4px; padding:3px 6px; cursor:pointer;">Annuler</button>`
                    }
                    ${!isAuto ? `<button class="btn-text edit-debt-btn" data-index="${index}" style="color:var(--accent-primary); font-size:0.7rem; border:1px solid var(--border-color); border-radius:4px; padding:3px 6px; cursor:pointer;">✏️</button>` : ''}
                    <button class="btn-text delete-debt-btn" data-index="${index}" style="color:var(--accent-danger); font-size:0.7rem; border:1px solid var(--border-color); border-radius:4px; padding:3px 6px; cursor:pointer;">✕</button>
                </div>
            `;
            debtsList.appendChild(li);
        });
    }
    
    // Mettre à jour l'input read-only des heures récupérées ce mois-ci
    const monthRecoveredInput = document.getElementById("rattrapage-month-hours");
    if (monthRecoveredInput) {
        const recoveredThisMonthMins = empRattrapages.filter(r => r.recovered && r.recoveredMonth === state.currentMonth && r.recoveredYear === state.currentYear)
                                                     .reduce((acc, r) => acc + r.minutes, 0);
        monthRecoveredInput.value = recoveredThisMonthMins / 60;
        monthRecoveredInput.readOnly = true;
        monthRecoveredInput.style.backgroundColor = "var(--bg-input)";
        monthRecoveredInput.style.cursor = "not-allowed";
        
        recalculateEntireMonthKPIs();
    }
    
    // Mettre à jour le badge de solde
    const balanceBadge = document.getElementById("rattrapage-balance-badge");
    if (balanceBadge) {
        const pendingMins = empRattrapages.filter(r => !r.recovered).reduce((acc, r) => acc + r.minutes, 0);
        balanceBadge.textContent = pendingMins > 0 ? `⚠ ${minutesToHoursStr(pendingMins)} à rattraper` : 'Solde : 0h';
        balanceBadge.style.color = pendingMins > 0 ? '#b45309' : 'var(--text-primary)';
        balanceBadge.style.background = pendingMins > 0 ? '#fef3c7' : 'var(--bg-input)';
        balanceBadge.style.border = pendingMins > 0 ? '1px solid #fde68a' : '1px solid var(--border-color)';
    }
    
    // Réattacher les écouteurs de liste
    document.querySelectorAll(".delete-debt-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            state.rattrapages[state.activeEmployeeId].splice(idx, 1);
            saveStateToLocalStorage();
            renderRattrapagesDashboard();
        });
    });
    
    document.querySelectorAll(".recover-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            state.rattrapages[state.activeEmployeeId][idx].recovered = true;
            state.rattrapages[state.activeEmployeeId][idx].recoveredMonth = state.currentMonth;
            state.rattrapages[state.activeEmployeeId][idx].recoveredYear = state.currentYear;
            saveStateToLocalStorage();
            renderRattrapagesDashboard();
        });
    });
    
    document.querySelectorAll(".unrecover-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            state.rattrapages[state.activeEmployeeId][idx].recovered = false;
            delete state.rattrapages[state.activeEmployeeId][idx].recoveredMonth;
            delete state.rattrapages[state.activeEmployeeId][idx].recoveredYear;
            saveStateToLocalStorage();
            renderRattrapagesDashboard();
        });
    });

    document.querySelectorAll(".edit-debt-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            const r = state.rattrapages[state.activeEmployeeId][idx];
            
            editingRattrapageIndex = idx;
            
            document.getElementById("rattrapage-form-title").textContent = "Modifier la dette d'heures";
            document.getElementById("rattrapage-add-date").value = r.date;
            document.getElementById("rattrapage-add-hours").value = r.minutes / 60;
            document.getElementById("rattrapage-add-reason").value = r.reason || "";
            
            const actionArea = document.getElementById("rattrapage-action-area");
            actionArea.innerHTML = `
                <div style="display:flex; gap:8px;">
                    <button id="rattrapage-save-edit-btn" type="button" class="btn btn-primary btn-sm" style="flex:1; padding:8px;">Mettre à jour</button>
                    <button id="rattrapage-cancel-edit-btn" type="button" class="btn btn-secondary btn-sm" style="flex:1; padding:8px;">Annuler</button>
                </div>
            `;
            
            document.getElementById("rattrapage-cancel-edit-btn").addEventListener("click", resetRattrapageForm);
            document.getElementById("rattrapage-save-edit-btn").addEventListener("click", saveRattrapageEdit);
        });
    });
}

function resetRattrapageForm() {
    editingRattrapageIndex = null;
    document.getElementById("rattrapage-form-title").textContent = "Déclarer des heures à rattraper";
    document.getElementById("rattrapage-add-date").value = "";
    document.getElementById("rattrapage-add-hours").value = "8";
    document.getElementById("rattrapage-add-reason").value = "";
    document.getElementById("rattrapage-action-area").innerHTML = `
        <button id="rattrapage-add-btn" type="button" class="btn btn-primary btn-sm" style="width: 100%; padding: 8px;">Enregistrer la dette</button>
    `;
    setupRattrapageAddListener();
}

function saveRattrapageEdit() {
    if (editingRattrapageIndex === null) return;
    const dateInput = document.getElementById("rattrapage-add-date");
    const hoursInput = document.getElementById("rattrapage-add-hours");
    const reasonInput = document.getElementById("rattrapage-add-reason");
    
    const dateVal = dateInput ? dateInput.value : '';
    const hoursVal = hoursInput ? parseFloat(hoursInput.value) : 0;
    const reasonVal = reasonInput ? reasonInput.value.trim() : '';
    
    if (dateVal && !isNaN(hoursVal) && hoursVal > 0) {
        const minutes = Math.round(hoursVal * 60);
        
        state.rattrapages[state.activeEmployeeId][editingRattrapageIndex].date = dateVal;
        state.rattrapages[state.activeEmployeeId][editingRattrapageIndex].minutes = minutes;
        state.rattrapages[state.activeEmployeeId][editingRattrapageIndex].reason = reasonVal;
        
        saveStateToLocalStorage();
        resetRattrapageForm();
        renderRattrapagesDashboard();
    } else {
        alert("Veuillez indiquer une date et un nombre d'heures valides.");
    }
}

function setupRattrapageAddListener() {
    const btn = document.getElementById("rattrapage-add-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            if (!state.activeEmployeeId) {
                alert("Veuillez sélectionner un employé d'abord.");
                return;
            }
            const dateInput = document.getElementById("rattrapage-add-date");
            const hoursInput = document.getElementById("rattrapage-add-hours");
            const reasonInput = document.getElementById("rattrapage-add-reason");
            
            const dateVal = dateInput ? dateInput.value : '';
            const hoursVal = hoursInput ? parseFloat(hoursInput.value) : 0;
            const reasonVal = reasonInput ? reasonInput.value.trim() : '';
            
            if (dateVal && !isNaN(hoursVal) && hoursVal > 0) {
                const minutes = Math.round(hoursVal * 60);
                if (!state.rattrapages) state.rattrapages = {};
                if (!state.rattrapages[state.activeEmployeeId]) state.rattrapages[state.activeEmployeeId] = [];
                
                state.rattrapages[state.activeEmployeeId].push({
                    date: dateVal,
                    minutes: minutes,
                    reason: reasonVal,
                    recovered: false
                });
                
                saveStateToLocalStorage();
                
                if (dateInput) dateInput.value = "";
                if (hoursInput) hoursInput.value = "8";
                if (reasonInput) reasonInput.value = "";
                
                renderRattrapagesDashboard();
            } else {
                alert("Veuillez indiquer une date et un nombre d'heures valide.");
            }
        });
    }
}

// ==========================================================================
// 12. GESTION DES PÉRIODES D'ABSENCE
// ==========================================================================

const absenceTypeSelect = document.getElementById("absence-type");
const absenceIsPaid = document.getElementById("absence-is-paid");
const absenceIsRecover = document.getElementById("absence-is-recover");

if (absenceTypeSelect && absenceIsPaid && absenceIsRecover) {
    absenceTypeSelect.addEventListener("change", () => {
        const val = absenceTypeSelect.value;
        if (val === "faute_entreprise") {
            absenceIsPaid.checked = true;
            absenceIsRecover.checked = true;
        } else if (val === "conge" || val === "accident" || val === "malade") {
            absenceIsPaid.checked = true;
            absenceIsRecover.checked = false;
        } else if (val === "permission_payee") {
            absenceIsPaid.checked = true;
            absenceIsRecover.checked = false;
        } else if (val === "absent") {
            absenceIsPaid.checked = false;
            absenceIsRecover.checked = true;
        } else if (val === "permission") {
            absenceIsPaid.checked = false;
            absenceIsRecover.checked = false;
        } else {
            absenceIsPaid.checked = false;
            absenceIsRecover.checked = false;
        }
    });
}

function applyAbsencePeriodToPointage(period) {
    // Pointer automatiquement les jours de la période dans state.pointages + dayDetails
    if (!state.activeEmployeeId) return;
    const empId = state.activeEmployeeId;
    if (!state.pointages) state.pointages = {};
    if (!state.pointages[empId]) state.pointages[empId] = {};
    if (!state.dayDetails[empId]) state.dayDetails[empId] = {};

    // Statut à appliquer selon le type
    const typeToStatus = {
        faute_entreprise: 'faute_entreprise',
        absent: 'absent',
        permission: 'permission',
        permission_payee: 'permission',
        malade: 'malade',
        accident: 'accident',
        conge: 'conge',
        autre: 'autre'
    };
    const pointStatus = typeToStatus[period.type] || period.type;

    let curr = new Date(period.start);
    const endD = new Date(period.end);
    while (curr <= endD) {
        const dKey = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}-${String(curr.getDate()).padStart(2,'0')}`;
        const dayOfWeek = curr.getDay(); // 0=dim, 6=sam
        // Ne pointer que les jours ouvrables (lun-ven)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Ne pas écraser un pointage manuel (arrivée remplie)
            if (!state.pointages[empId][dKey]) state.pointages[empId][dKey] = {};
            if (!state.pointages[empId][dKey].arrivee) {
                state.pointages[empId][dKey].status = pointStatus;
            }
            // Toujours écrire la remarque (note)
            if (!state.dayDetails[empId][dKey]) {
                state.dayDetails[empId][dKey] = { note: '', isEvent: false, eventName: '', eventWorked: true };
            }
            if (!state.dayDetails[empId][dKey].note) {
                state.dayDetails[empId][dKey].note = period.reason;
            } else if (!state.dayDetails[empId][dKey].note.includes(period.reason)) {
                state.dayDetails[empId][dKey].note += ' | ' + period.reason;
            }
        }
        curr.setDate(curr.getDate() + 1);
    }
}

function removeAbsencePeriodFromPointage(period) {
    // Nettoyer le pointage automatique d'une période supprimée/modifiée
    if (!state.activeEmployeeId) return;
    const empId = state.activeEmployeeId;
    if (!state.pointages || !state.pointages[empId]) return;

    let curr = new Date(period.start);
    const endD = new Date(period.end);
    while (curr <= endD) {
        const dKey = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}-${String(curr.getDate()).padStart(2,'0')}`;
        // Ne retirer que si le statut correspond (pour ne pas écraser un statut manuel)
        if (state.pointages[empId][dKey] && state.pointages[empId][dKey].status === period.type) {
            delete state.pointages[empId][dKey].status;
        }
        // Nettoyer la note
        if (state.dayDetails[empId] && state.dayDetails[empId][dKey] && period.reason) {
            state.dayDetails[empId][dKey].note = state.dayDetails[empId][dKey].note
                .replace(period.reason, '').replace(/^\|\s*|\s*\|\s*$/g, '').replace(/\s*\|\s*\|\s*/g, ' | ').trim();
        }
        curr.setDate(curr.getDate() + 1);
    }
}

function createRattrapageDebt(period) {
    if (!period.isRecover) return;
    if (!state.activeEmployeeId) return;
    const empId = state.activeEmployeeId;
    if (!state.rattrapages) state.rattrapages = {};
    if (!state.rattrapages[empId]) state.rattrapages[empId] = [];

    // Compter les jours ouvrables de la période (lun-ven)
    let workingDays = 0;
    let curr = new Date(period.start);
    const endD = new Date(period.end);
    while (curr <= endD) {
        const dow = curr.getDay();
        if (dow !== 0 && dow !== 6) workingDays++;
        curr.setDate(curr.getDate() + 1);
    }
    const totalMinutesDebt = workingDays * 480; // 8h par jour

    // Créer ou mettre à jour la dette liée à cette période
    state.rattrapages[empId].push({
        date: period.start,
        endDate: period.end,
        minutes: totalMinutesDebt,
        reason: period.reason,
        type: period.type,
        periodId: period.id,
        recovered: false
    });
}

function removeRattrapageDebt(periodId) {
    if (!state.activeEmployeeId) return;
    const empId = state.activeEmployeeId;
    if (!state.rattrapages || !state.rattrapages[empId]) return;
    state.rattrapages[empId] = state.rattrapages[empId].filter(r => r.periodId !== periodId);
}

function setupAbsenceAddListener() {
    const btn = document.getElementById("absence-add-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            if (!state.activeEmployeeId) {
                alert("Veuillez sélectionner un employé d'abord.");
                return;
            }
            
            const type = document.getElementById("absence-type").value;
            const start = document.getElementById("absence-start").value;
            const end = document.getElementById("absence-end").value;
            const isPaid = document.getElementById("absence-is-paid").checked;
            const isRecover = document.getElementById("absence-is-recover").checked;
            const reason = document.getElementById("absence-reason").value.trim();
            
            if (!start || !end) {
                alert("Veuillez indiquer une date de début et de fin.");
                return;
            }
            
            if (!reason) {
                alert("Veuillez indiquer le motif / la cause (obligatoire).");
                return;
            }
            
            if (new Date(start) > new Date(end)) {
                alert("La date de fin ne peut pas être avant la date de début.");
                return;
            }
            
            if (!state.absencePeriods) state.absencePeriods = {};
            if (!state.absencePeriods[state.activeEmployeeId]) state.absencePeriods[state.activeEmployeeId] = [];
            
            const newPeriod = {
                id: Date.now().toString(),
                type,
                start,
                end,
                isPaid,
                isRecover,
                reason
            };

            state.absencePeriods[state.activeEmployeeId].push(newPeriod);
            
            // Auto-pointer les jours dans l'onglet Pointage + Remarques
            applyAbsencePeriodToPointage(newPeriod);

            // Créer la dette de rattrapage si coché
            if (isRecover) createRattrapageDebt(newPeriod);
            
            saveStateToLocalStorage();
            renderAbsencePeriods();
            renderRattrapagesDashboard();
            generateTable();
            
            document.getElementById("absence-start").value = "";
            document.getElementById("absence-end").value = "";
            document.getElementById("absence-reason").value = "";
        });
    }
}

function renderAbsencePeriods() {
    const list = document.getElementById("absence-periods-list");
    if (!list) return;
    
    list.innerHTML = "";
    
    if (!state.activeEmployeeId || !state.absencePeriods || !state.absencePeriods[state.activeEmployeeId] || state.absencePeriods[state.activeEmployeeId].length === 0) {
        list.innerHTML = `<li style="text-align:center; padding:10px; color:var(--text-muted); font-size:0.8rem;">Aucune période d'absence enregistrée</li>`;
        return;
    }
    
    const periods = state.absencePeriods[state.activeEmployeeId];
    
    periods.forEach((p, index) => {
        const li = document.createElement("li");
        li.style.cssText = "padding:8px 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;";
        
        const typeLabels = {
            "faute_entreprise": "Faute Entreprise",
            "absent": "Absence Injustifiée",
            "permission": "Permission",
            "permission_payee": "Permission Payée",
            "malade": "Maladie",
            "accident": "Accident de Travail",
            "conge": "Congé",
            "autre": "Autre"
        };
        const typeName = typeLabels[p.type] || p.type;
        
        let tagsHtml = "";
        if (p.isPaid) tagsHtml += `<span style="background:var(--accent-success); color:white; padding:2px 4px; border-radius:4px; font-size:0.6rem; margin-right:4px;">Payé</span>`;
        if (p.isRecover) tagsHtml += `<span style="background:var(--accent-warning); color:white; padding:2px 4px; border-radius:4px; font-size:0.6rem;">À rattraper</span>`;
        
        const startDisplay = p.start.split('-').reverse().join('/');
        const endDisplay = p.end.split('-').reverse().join('/');
        
        li.innerHTML = `
            <div style="flex: 1;">
                <strong style="color:var(--accent-day);">${startDisplay} au ${endDisplay}</strong>
                <div style="font-size:0.8rem; color:var(--text-primary); margin-top:2px;">${typeName} ${tagsHtml}</div>
                ${p.reason ? `<div style="font-size:0.7rem; color:var(--text-muted); font-style:italic;">Motif: ${p.reason}</div>` : ''}
            </div>
            <div style="display:flex; gap:6px;">
                <button class="btn-text edit-absence-btn" data-index="${index}" style="color:var(--accent-primary); font-size:0.7rem; border:1px solid var(--border-color); border-radius:4px; padding:4px; cursor:pointer;">✏️</button>
                <button class="btn-text delete-absence-btn" data-index="${index}" style="color:var(--accent-danger); font-size:0.7rem; border:1px solid var(--border-color); border-radius:4px; padding:4px; cursor:pointer;">✕</button>
            </div>
        `;
        list.appendChild(li);
    });
    
    document.querySelectorAll(".delete-absence-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            const period = state.absencePeriods[state.activeEmployeeId][idx];
            // Nettoyer pointage auto et dettes liées
            removeAbsencePeriodFromPointage(period);
            removeRattrapageDebt(period.id);
            state.absencePeriods[state.activeEmployeeId].splice(idx, 1);
            saveStateToLocalStorage();
            renderAbsencePeriods();
            renderRattrapagesDashboard();
            generateTable();
        });
    });

    document.querySelectorAll(".edit-absence-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const idx = parseInt(this.getAttribute("data-index"));
            const p = state.absencePeriods[state.activeEmployeeId][idx];
            
            editingAbsenceIndex = idx;
            
            document.getElementById("absence-form-title").textContent = "Modifier l'ajustement";
            const typeEl = document.getElementById("absence-type");
            if (typeEl) typeEl.value = p.type;
            document.getElementById("absence-is-paid").checked = p.isPaid;
            document.getElementById("absence-is-recover").checked = p.isRecover;
            document.getElementById("absence-start").value = p.start;
            document.getElementById("absence-end").value = p.end;
            document.getElementById("absence-reason").value = p.reason || "";
            
            const actionArea = document.getElementById("absence-action-area");
            actionArea.innerHTML = `
                <div style="display:flex; gap:8px;">
                    <button id="absence-save-edit-btn" type="button" class="btn btn-primary btn-sm" style="flex:1; padding:8px;">Mettre à jour</button>
                    <button id="absence-cancel-edit-btn" type="button" class="btn btn-secondary btn-sm" style="flex:1; padding:8px;">Annuler</button>
                </div>
            `;
            
            document.getElementById("absence-cancel-edit-btn").addEventListener("click", resetAbsenceForm);
            document.getElementById("absence-save-edit-btn").addEventListener("click", saveAbsenceEdit);
        });
    });
}

function resetAbsenceForm() {
    editingAbsenceIndex = null;
    document.getElementById("absence-form-title").textContent = "Déclarer un événement / absence";
    document.getElementById("absence-start").value = "";
    document.getElementById("absence-end").value = "";
    document.getElementById("absence-reason").value = "";
    const typeEl = document.getElementById("absence-type");
    if (typeEl) typeEl.value = "faute_entreprise";
    document.getElementById("absence-is-paid").checked = true;
    document.getElementById("absence-is-recover").checked = true;
    document.getElementById("absence-action-area").innerHTML = `
        <button id="absence-add-btn" type="button" class="btn btn-primary btn-sm" style="width: 100%; padding: 8px;">Enregistrer l'ajustement</button>
    `;
    setupAbsenceAddListener();
}

function saveAbsenceEdit() {
    if (editingAbsenceIndex === null) return;
    const type = document.getElementById("absence-type").value;
    const start = document.getElementById("absence-start").value;
    const end = document.getElementById("absence-end").value;
    const isPaid = document.getElementById("absence-is-paid").checked;
    const isRecover = document.getElementById("absence-is-recover").checked;
    const reason = document.getElementById("absence-reason").value.trim();
    
    if (!start || !end) {
        alert("Veuillez indiquer une date de début et de fin.");
        return;
    }
    if (!reason) {
        alert("Veuillez indiquer la cause ou le commentaire (obligatoire) pour cette période.");
        return;
    }
    if (new Date(start) > new Date(end)) {
        alert("La date de fin ne peut pas être avant la date de début.");
        return;
    }
    
    const oldPeriod = state.absencePeriods[state.activeEmployeeId][editingAbsenceIndex];
    
    // Nettoyer l'ancienne période (pointage auto + dette)
    removeAbsencePeriodFromPointage(oldPeriod);
    removeRattrapageDebt(oldPeriod.id);
    
    // Mettre à jour la période
    const updatedPeriod = {
        id: oldPeriod.id,
        type,
        start,
        end,
        isPaid,
        isRecover,
        reason
    };
    state.absencePeriods[state.activeEmployeeId][editingAbsenceIndex] = updatedPeriod;
    
    // Appliquer la nouvelle période (pointage auto + nouvelle dette si à rattraper)
    applyAbsencePeriodToPointage(updatedPeriod);
    if (isRecover) createRattrapageDebt(updatedPeriod);
    
    saveStateToLocalStorage();
    resetAbsenceForm();
    renderAbsencePeriods();
    renderRattrapagesDashboard();
    generateTable();
}

// S'assurer de rafraîchir les deux tableaux lors d'un changement d'employé actif
const originalUpdateActiveEmployeeUI = updateActiveEmployeeUI;
updateActiveEmployeeUI = function() {
    originalUpdateActiveEmployeeUI();
    renderAbsencePeriods();
};

// ==========================================================================
// NOUVEAU : AUTHENTIFICATION, GESTION UTILISATEURS ET CLÔTURE DE MOIS
// ==========================================================================

// --- Authentification ---
document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const userField = document.getElementById("login-username").value.trim();
    const passField = document.getElementById("login-password").value.trim();
    
    // Si Firebase n'est pas encore prêt, attendre et réessayer
    if (!isFirebaseInitialized) {
        const errorEl = document.getElementById("login-error");
        errorEl.textContent = "⏳ La base de données est encore en cours de chargement. Patientez quelques secondes et réessayez.";
        errorEl.style.display = "block";
        return;
    }
    
    const user = state.users.find(u => u.username === userField && u.password === passField);
    
    if (user) {
        if (user.password === "" && userField !== "") {
            const newPass = prompt("Première connexion. Veuillez définir un mot de passe pour votre compte :");
            if (newPass === null || newPass.trim() === "") {
                const errorEl = document.getElementById("login-error");
                errorEl.textContent = "Vous devez définir un mot de passe pour continuer.";
                errorEl.style.display = "block";
                return;
            }
            user.password = newPass.trim();
            saveStateToLocalStorage();
        }
        state.currentUser = user;
        saveStateToLocalStorage();
        document.getElementById("login-overlay").style.display = "none";
        document.getElementById("login-error").style.display = "none";
        setupAuthUI();
        renderEmployeeList();
        updateActiveEmployeeUI();
        generateTable();
        renderHolidaysList();
        if (state.activeEmployeeId) {
            const rattrapageCard = document.getElementById("rattrapage-card");
            if (rattrapageCard) rattrapageCard.style.display = "block";
        }
    } else {
        const errorEl = document.getElementById("login-error");
        errorEl.textContent = "Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe.";
        errorEl.style.display = "block";
    }
});

document.getElementById("logout-btn").addEventListener("click", () => {
    state.currentUser = null;
    saveStateToLocalStorage();
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-overlay").style.display = "flex";
});

// --- Gestion des Utilisateurs ---
const usersModal = document.getElementById("users-modal");
const manageUsersBtn = document.getElementById("manage-users-btn");

if (manageUsersBtn) {
    manageUsersBtn.addEventListener("click", () => {
        if (!state.currentUser || state.currentUser.role !== "ADMIN") return;
        renderUsersTable();
        usersModal.classList.add("active");
    });
}

function renderUsersTable() {
    const tbody = document.getElementById("users-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    state.users.forEach(user => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${user.username}</td>
            <td>${user.password}</td>
            <td><span class="status-badge status-${user.role === 'ADMIN' ? 'present' : 'absence'}">${user.role}</span></td>
            <td>
                ${user.username !== 'admin' ? `<button class="btn-icon" onclick="deleteUser('${user.id}')" style="color:var(--accent-danger);" title="Supprimer"><i data-lucide="trash-2"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

document.getElementById("add-user-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("new-user-username").value.trim();
    const pass = document.getElementById("new-user-password").value.trim();
    const role = document.getElementById("new-user-role").value;
    
    if (state.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert("Ce nom d'utilisateur existe déjà.");
        return;
    }
    
    state.users.push({
        id: "usr-" + Date.now(),
        username: username,
        password: pass,
        role: role
    });
    
    saveStateToLocalStorage();
    renderUsersTable();
    e.target.reset();
});

window.deleteUser = function(userId) {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ?")) return;
    state.users = state.users.filter(u => u.id !== userId);
    saveStateToLocalStorage();
    renderUsersTable();
};

// --- Clôture du Mois ---
const closeMonthBtn = document.getElementById("close-month-btn");

if (closeMonthBtn) {
    closeMonthBtn.addEventListener("click", () => {
        if (!state.currentUser || state.currentUser.role !== "ADMIN") return;
        
        const monthStr = String(state.currentMonth + 1).padStart(2, '0');
        const monthKey = `${state.currentYear}-${monthStr}`;
        
        if (state.closedMonths.includes(monthKey)) {
            alert("Ce mois est déjà clôturé.");
            return;
        }
        
        // On récupère le libellé du mois directement depuis le sélecteur
        const monthSelector = document.getElementById("month-selector");
        const monthLabel = monthSelector.options[monthSelector.selectedIndex].text;
        
        // VALIDATION : vérifier si des employés sont présents mais n'ont pas d'heure de pointage
        let hasIncompletePointage = false;
        let incompleteDetails = "";
        
        state.employees.forEach(emp => {
            if (!isEmployeeActiveAtDate(emp, state.currentYear, state.currentMonth)) return;
            const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const dKey = `${state.currentYear}-${monthStr}-${String(i).padStart(2, '0')}`;
                const pt = state.pointages[emp.id] ? state.pointages[emp.id][dKey] : null;
                if (pt && pt.status === "present") {
                    if (!pt.arrivee || pt.arrivee.trim() === "") {
                        hasIncompletePointage = true;
                        incompleteDetails += `- ${emp.name} le ${String(i).padStart(2, '0')}/${monthStr}/${state.currentYear}\n`;
                    }
                }
            }
        });

        if (hasIncompletePointage) {
            alert(`Impossible de clôturer ce mois.\n\nCertains employés sont marqués "Présent" dans le Suivi Présence mais n'ont pas d'heures saisies dans l'onglet Pointage :\n\n${incompleteDetails}\nVeuillez d'abord remplir leurs heures de pointage.`);
            return;
        }
        
        if (confirm(`Voulez-vous vraiment clôturer le mois de ${monthLabel} ${state.currentYear} ?\n\nUne fois clôturé, les pointages de TOUS les employés pour ce mois ne pourront plus être modifiés.`)) {
            state.closedMonths.push(monthKey);
            saveStateToLocalStorage();
            generateTable(); // Refresh UI
            alert("Le mois a été clôturé avec succès.");
        }
    });
}

// ==========================================================================
// XX. MODULE SUIVI PRÉSENCE JOURNALIÈRE
// ==========================================================================

function getSortedEmployees() {
    return [...state.employees].sort((a, b) => {
        const matA = (a.matricule || "").toLowerCase();
        const matB = (b.matricule || "").toLowerCase();
        const numA = parseInt(matA.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(matB.replace(/[^0-9]/g, ''), 10) || 0;
        
        if (numA !== numB) return numA - numB;
        return matA.localeCompare(matB, 'fr', { numeric: true });
    });
}

let pointageSelectedRole = "all"; // "all" ou nom de fonction
let suiviSelectedDept = "all";
let rapportSelectedDept = "all";

// === FILTRE PAR FONCTION DANS LE POINTAGE ===
function renderPointageFonctionsBar() {
    const bar = document.getElementById("pointage-fonctions-bar");
    if (!bar) return;

    // Collecter toutes les fonctions des employés actifs
    const rolesSet = new Set();
    state.employees.forEach(emp => {
        if (isEmployeeActive(emp)) {
            rolesSet.add((emp.role || "Non Défini").trim());
        }
    });

    const roles = Array.from(rolesSet).sort();

    // Construire les boutons
    const span = bar.querySelector("span");
    // Supprimer les anciens boutons (garder le label)
    Array.from(bar.children).forEach(el => {
        if (el.tagName === "BUTTON") el.remove();
    });

    // Bouton "Tous"
    const allBtn = document.createElement("button");
    allBtn.className = `btn btn-sm ${pointageSelectedRole === "all" ? "btn-primary" : "btn-secondary"}`;
    allBtn.style.padding = "6px 14px";
    allBtn.textContent = "Tous";
    allBtn.onclick = () => {
        pointageSelectedRole = "all";
        renderPointageFonctionsBar();
        // Sélectionner le premier employé visible
        const sorted = getSortedEmployees().filter(e => isEmployeeActive(e));
        if (sorted.length > 0) selectEmployee(sorted[0].id);
    };
    bar.appendChild(allBtn);

    roles.forEach(role => {
        const btn = document.createElement("button");
        btn.className = `btn btn-sm ${pointageSelectedRole === role ? "btn-primary" : "btn-secondary"}`;
        btn.style.padding = "6px 14px";
        btn.textContent = role;
        btn.onclick = () => {
            pointageSelectedRole = role;
            renderPointageFonctionsBar();
            // Sélectionner le premier employé de cette fonction, par ordre de matricule
            const empsInRole = getSortedEmployees().filter(e => isEmployeeActive(e) && (e.role || "Non Défini").trim() === role);
            if (empsInRole.length > 0) {
                selectEmployee(empsInRole[0].id);
                showPointageNavForRole(role, empsInRole);
            }
        };
        bar.appendChild(btn);
    });

    if (window.lucide) lucide.createIcons();
}

function showPointageNavForRole(role, emps) {
    // Afficher un mini-navigateur sous la barre de fonctions pour changer d'employé
    let nav = document.getElementById("pointage-role-nav");
    if (!nav) {
        nav = document.createElement("div");
        nav.id = "pointage-role-nav";
        nav.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; padding: 8px 24px 0; align-items:flex-start;";
        // Insérer après le parent wrapper de la barre
        const bar = document.getElementById("pointage-fonctions-bar");
        const wrapper = bar.parentElement;
        wrapper.insertAdjacentElement("afterend", nav);
    }
    nav.innerHTML = `<span style="font-size:0.7rem;color:var(--text-muted);font-weight:600;margin-right:4px;align-self:center;">${role} (${emps.length}) :</span>`;
    emps.forEach(emp => {
        const firstName = (emp.name || "").split(" ")[0]; // Premier mot du nom
        const btn = document.createElement("button");
        btn.className = `btn btn-sm ${emp.id === state.activeEmployeeId ? "btn-primary" : "btn-secondary"}`;
        btn.style.cssText = "padding:5px 10px; font-size:0.78rem; display:flex; flex-direction:column; align-items:center; gap:1px; min-width:60px;";
        btn.innerHTML = `
            <span style="font-weight:700; letter-spacing:0.03em;">${emp.matricule || '—'}</span>
            <span style="font-size:0.65rem; opacity:0.85;">${firstName}</span>
        `;
        btn.title = emp.name;
        btn.onclick = () => {
            selectEmployee(emp.id);
            // Mettre à jour l'actif visuellement
            nav.querySelectorAll("button").forEach(b => {
                b.className = `btn btn-sm btn-secondary`;
            });
            btn.className = `btn btn-sm btn-primary`;
        };
        nav.appendChild(btn);
    });
}

// === RECHERCHE RAPIDE DANS LE POINTAGE ===
function filterPointageSearch(query) {
    const resultsDiv = document.getElementById("pointage-search-results");
    if (!resultsDiv) return;

    const q = query.trim().toLowerCase();
    if (!q) {
        resultsDiv.style.display = "none";
        resultsDiv.innerHTML = "";
        return;
    }

    const sortedEmps = getSortedEmployees().filter(e => isEmployeeActive(e));
    const matches = sortedEmps.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.matricule && e.matricule.toLowerCase().includes(q)) ||
        (e.role && e.role.toLowerCase().includes(q))
    );

    if (matches.length === 0) {
        resultsDiv.innerHTML = `<div style="padding:10px 14px; color:var(--text-muted); font-size:0.82rem;">Aucun résultat</div>`;
        resultsDiv.style.display = "block";
        return;
    }

    resultsDiv.innerHTML = "";
    matches.slice(0, 10).forEach(emp => {
        const firstName = (emp.name || "").split(" ")[0];
        const isActive = emp.id === state.activeEmployeeId;
        const item = document.createElement("div");
        item.style.cssText = `padding:8px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid var(--border-color); background:${isActive ? "var(--bg-input)" : "transparent"}; transition:background 0.15s;`;
        item.innerHTML = `
            <div style="flex-shrink:0; width:36px; height:36px; border-radius:50%; background:var(--accent-day); color:white; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">
                ${firstName.charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">${emp.name}</div>
                <div style="font-size:0.72rem; color:var(--text-muted);">${emp.matricule || '—'} · ${emp.role || 'N/A'}</div>
            </div>
        `;
        item.onmouseenter = () => item.style.background = "var(--bg-input)";
        item.onmouseleave = () => item.style.background = isActive ? "var(--bg-input)" : "transparent";
        item.onclick = () => {
            selectEmployee(emp.id);
            // Fermer le dropdown
            const input = document.getElementById("pointage-search-input");
            if (input) input.value = "";
            resultsDiv.style.display = "none";
            resultsDiv.innerHTML = "";
        };
        resultsDiv.appendChild(item);
    });

    resultsDiv.style.display = "block";
}

// Fermer la recherche quand on clique ailleurs
document.addEventListener("click", (e) => {
    const searchWrapper = document.getElementById("pointage-search-input");
    const resultsDiv = document.getElementById("pointage-search-results");
    if (resultsDiv && searchWrapper && !searchWrapper.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = "none";
    }
});

function initSuiviTab() {
    const today = new Date();
    const dateInput = document.getElementById("suivi-date-input");
    if (!dateInput.value) {
        dateInput.value = formatDateISO(today);
    }
    
    // Générer les boutons de filtre de département
    renderSuiviDeptsFilter();
    renderSuiviJournalier();
}

function renderSuiviDeptsFilter() {
    const container = document.getElementById("suivi-depts-filter");
    if (!container) return;
    
    // Récupérer tous les départements uniques des employés actifs
    const dateInput = document.getElementById("suivi-date-input").value;
    const [year, month] = dateInput.split('-').map(Number);
    
    const activeDepts = new Set();
    state.employees.forEach(emp => {
        if (isEmployeeActiveAtDate(emp, year, month - 1)) {
            activeDepts.add((emp.departement || "Non Défini").trim());
        }
    });
    
    const depts = ["all", ...Array.from(activeDepts).sort()];
    
    container.innerHTML = "";
    depts.forEach(dept => {
        const btn = document.createElement("button");
        btn.className = `btn btn-sm ${suiviSelectedDept === dept ? 'btn-primary' : 'btn-secondary'}`;
        btn.style.padding = "6px 12px";
        btn.textContent = dept === "all" ? "Tous" : dept;
        btn.onclick = () => {
            suiviSelectedDept = dept;
            renderSuiviDeptsFilter();
            renderSuiviJournalier();
        };
        container.appendChild(btn);
    });
}

function syncRapportDatesWithGlobal() {
    const reportStartInput = document.getElementById("suivi-report-start");
    const reportEndInput = document.getElementById("suivi-report-end");
    if (!reportStartInput || !reportEndInput) return;
    
    const today = new Date();
    const firstDay = new Date(state.currentYear, state.currentMonth, 1);
    reportStartInput.value = formatDateISO(firstDay);
    
    let endDate = today;
    // Si le mois sélectionné est différent du mois actuel, on met le dernier jour du mois
    if (today.getFullYear() !== state.currentYear || today.getMonth() !== state.currentMonth) {
        endDate = new Date(state.currentYear, state.currentMonth + 1, 0);
    }
    reportEndInput.value = formatDateISO(endDate);
}

function initRapportTab() {
    renderRapportDeptsFilter();

    // Auto-remplir les dates du rapport initialement
    const reportStartInput = document.getElementById("suivi-report-start");
    if (!reportStartInput.value) {
        syncRapportDatesWithGlobal();
    }
    
    // Remplir le datalist des employés pour le rapport
    const empDatalist = document.getElementById("suivi-report-emp-list");
    if (empDatalist) {
        empDatalist.innerHTML = '';
        const sortedEmps = getSortedEmployees();
        sortedEmps.forEach(emp => {
            const opt = document.createElement("option");
            opt.value = `${emp.matricule} - ${emp.name}`;
            opt.setAttribute("data-id", emp.id);
            empDatalist.appendChild(opt);
        });
    }

    generatePresenceReport();
}

function renderRapportDeptsFilter() {
    const container = document.getElementById("rapport-depts-filter");
    if (!container) return;
    
    const activeDepts = new Set();
    state.employees.forEach(emp => {
        activeDepts.add((emp.departement || "Non Défini").trim());
    });
    
    const depts = ["all", ...Array.from(activeDepts).sort()];
    
    container.innerHTML = "";
    depts.forEach(dept => {
        const btn = document.createElement("button");
        btn.className = `btn btn-sm ${rapportSelectedDept === dept ? 'btn-primary' : 'btn-secondary'}`;
        btn.style.padding = "6px 12px";
        btn.textContent = dept === "all" ? "Tous" : dept;
        btn.onclick = () => {
            rapportSelectedDept = dept;
            renderRapportDeptsFilter();
            generatePresenceReport();
        };
        container.appendChild(btn);
    });
}

function renderSuiviJournalier() {
    const tbody = document.getElementById("suivi-table-body");
    const tbodyDone = document.getElementById("suivi-table-done-body");
    if (!tbody || !tbodyDone) return;
    
    const dateInput = document.getElementById("suivi-date-input").value;
    if (!dateInput) {
        alert("Veuillez sélectionner une date.");
        return;
    }

    const [year, month, day] = dateInput.split('-').map(Number);
    const dateKey = dateInput;
    
    const sortedEmps = getSortedEmployees();
    tbody.innerHTML = "";
    tbodyDone.innerHTML = "";
    
    // Décoche "Select All"
    const selectAllCb = document.getElementById("suivi-select-all");
    if (selectAllCb) selectAllCb.checked = false;

    let pendingCount = 0;
    let doneCount = 0;

    // Render discreet weekday indicator for the current month
    const weekIndicatorEl = document.getElementById("suivi-weekday-indicator");
    if (weekIndicatorEl) {
        const daysInMonth = getDaysInMonth(year, month);
        const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
        let indicatorHTML = `<span style="font-size:0.72rem; color:var(--text-muted); font-weight:600; margin-right:6px;">Jours ouvrés :</span>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const dayOfWeek = dateObj.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            const dKey = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            let isPointed = false;
            sortedEmps.forEach(emp => {
                if (!isEmployeeActiveAtDate(emp, year, month - 1)) return;
                if (suiviSelectedDept !== "all" && (emp.departement || "Non Défini").trim() !== suiviSelectedDept) return;
                const pd = (state.pointages[emp.id] && state.pointages[emp.id][dKey]);
                if (pd && (pd.status === "present" || pd.arrivee)) isPointed = true;
            });
            const dayAbbr = ["Di","Lu","Ma","Me","Je","Ve","Sa"][dayOfWeek];
            const bg = isPointed ? "background:#10b981; color:#fff;" : "background:#ef4444; color:#fff;";
            indicatorHTML += `<span title="${dayAbbr} ${d} ${monthNames[month-1]}${isPointed ? ' (pointé)' : ' (à pointer)'}" style="display:inline-flex; flex-direction:column; align-items:center; min-width:22px; padding:2px 3px; border-radius:4px; font-size:0.6rem; line-height:1.1; cursor:default; ${bg}"><span style="font-weight:700;">${d}</span><span style="font-size:0.55rem; opacity:0.85;">${dayAbbr}</span></span>`;
        }
        weekIndicatorEl.innerHTML = indicatorHTML;
    }

    sortedEmps.forEach(emp => {
        // Ignorer les inactifs
        if (!isEmployeeActiveAtDate(emp, year, month - 1)) return; 
        
        // Filtrer par département sélectionné
        if (suiviSelectedDept !== "all" && (emp.departement || "Non Défini").trim() !== suiviSelectedDept) {
            return;
        }

        const searchInput = document.getElementById("suivi-search-input");
        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : "";
        if (searchVal) {
            const name = (emp.name || "").toLowerCase();
            const mat = (emp.matricule || "").toLowerCase();
            if (!name.includes(searchVal) && !mat.includes(searchVal)) return;
        }
        
        const pointageData = (state.pointages[emp.id] && state.pointages[emp.id][dateKey]) || {};
        const status = pointageData.status; // statut précis
        
        const dayDetail = (state.dayDetails[emp.id] && state.dayDetails[emp.id][dateKey]) || {};
        const motif = dayDetail.note || "";
        
        const isPresent = status === "present" || (pointageData.arrivee && pointageData.arrivee !== "");
        const isPaidAbsence = ["conge", "malade", "accident", "faute_entreprise", "permission_payee"].includes(status);
        
        let statusBadge = `<span class="status-badge status-absent">Absent</span>`;
        if (isPresent) {
            statusBadge = `<span class="status-badge status-present">Présent</span>`;
        } else if (isPaidAbsence) {
            statusBadge = `<span class="status-badge status-conge" title="Absence payée">${status}</span>`;
        } else if (status === "permission" || status === "autre") {
            statusBadge = `<span class="status-badge status-permission">${status}</span>`;
        }

        const startDateFormatted = emp.startDate ? new Date(emp.startDate).toLocaleDateString('fr-FR') : "N/A";

        // Déterminer s'il est "à pointer" (pas encore de statut défini pour ce jour) ou "déjà pointé"
        const isPending = !status;

        if (isPending) {
            pendingCount++;

            const motifVal = dayDetail.note || "";
            const obsVal = dayDetail.observation || "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox" class="suivi-row-cb" value="${emp.id}"></td>
                <td>${emp.matricule}</td>
                <td style="font-weight: 500;">
                    ${emp.name}
                    <br><span style="font-size: 0.8em; color: var(--text-muted);">Début: ${startDateFormatted}</span>
                </td>
                <td><span class="dept-badge">${emp.departement || 'N/A'}</span></td>
                <td><span class="status-badge" style="background:#94a3b8; color:#fff;">Non Pointé</span></td>
                <td><input type="text" class="modern-input" style="width:160px; padding:4px 8px;" placeholder="Motif absence..." value="${motifVal}" onchange="saveSuiviMotif('${emp.id}', '${dateKey}', this.value)"></td>
                <td><input type="text" class="modern-input" style="width:160px; padding:4px 8px;" placeholder="Observation..." value="${obsVal}" onchange="saveSuiviObservation('${emp.id}', '${dateKey}', this.value)"></td>
                <td>
                    <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-success" onclick="setSuiviPresence('${emp.id}', '${dateKey}', 'present')" style="padding: 4px 8px;">
                            <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Présent
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="setSuiviPresence('${emp.id}', '${dateKey}', 'absent')" style="padding: 4px 8px;">
                            <i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Absent
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        } else {
            doneCount++;

            const motifVal = dayDetail.note || "";
            const obsVal = dayDetail.observation || "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${emp.matricule}</td>
                <td style="font-weight: 500;">
                    ${emp.name}
                    <br><span style="font-size: 0.8em; color: var(--text-muted);">Début: ${startDateFormatted}</span>
                </td>
                <td><span class="dept-badge">${emp.departement || 'N/A'}</span></td>
                <td id="suivi-status-${emp.id}">${statusBadge}</td>
                <td><input type="text" class="modern-input" style="width:160px; padding:4px 8px;" placeholder="Motif absence..." value="${motifVal}" onchange="saveSuiviMotif('${emp.id}', '${dateKey}', this.value)"></td>
                <td><input type="text" class="modern-input" style="width:160px; padding:4px 8px;" placeholder="Observation..." value="${obsVal}" onchange="saveSuiviObservation('${emp.id}', '${dateKey}', this.value)"></td>
                <td>
                    <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                        <label style="cursor: pointer; padding: 4px 10px; border-radius: 4px; border: 1px solid #10b981; background: ${isPresent ? '#10b981' : 'transparent'}; color: ${isPresent ? '#fff' : '#10b981'}; display: flex; align-items: center; gap: 5px; transition: all 0.2s;">
                            <input type="radio" name="status-done-${emp.id}" style="display: none;" onchange="setSuiviPresence('${emp.id}', '${dateKey}', 'present')" ${isPresent ? 'checked' : ''}>
                            <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Présent
                        </label>
                        <label style="cursor: pointer; padding: 4px 10px; border-radius: 4px; border: 1px solid #ef4444; background: ${!isPresent ? '#ef4444' : 'transparent'}; color: ${!isPresent ? '#fff' : '#ef4444'}; display: flex; align-items: center; gap: 5px; transition: all 0.2s;">
                            <input type="radio" name="status-done-${emp.id}" style="display: none;" onchange="setSuiviPresence('${emp.id}', '${dateKey}', 'absent')" ${!isPresent ? 'checked' : ''}>
                            <i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Absent
                        </label>
                        <button class="btn btn-sm" onclick="clearSuiviPresenceEmploye('${emp.id}', '${dateKey}')" title="Effacer ce pointage" style="padding: 4px 8px; background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </td>
            `;
            tbodyDone.appendChild(tr);
        }
    });
    
    // Mettre à jour les compteurs
    document.getElementById("suivi-pending-count").textContent = pendingCount;
    document.getElementById("suivi-done-count").textContent = doneCount;
    
    lucide.createIcons();
}

function toggleSuiviSelectAll(cb) {
    document.querySelectorAll(".suivi-row-cb").forEach(box => {
        box.checked = cb.checked;
    });
}

// Effacer le pointage d'un seul employé pour un jour donné
window.clearSuiviPresenceEmploye = function(empId, dateKey) {
    if (state.pointages[empId] && state.pointages[empId][dateKey]) {
        delete state.pointages[empId][dateKey];
    }
    if (state.dayDetails[empId] && state.dayDetails[empId][dateKey]) {
        delete state.dayDetails[empId][dateKey];
    }
    saveStateToLocalStorage();
    renderSuiviJournalier();
    const reportTable = document.getElementById("suivi-report-table");
    if (reportTable && reportTable.style.display !== "none") generatePresenceReport();
};

function markBulkPresence(isPresent) {
    const dateKey = document.getElementById("suivi-date-input").value;
    if (!dateKey) return;
    
    const checkboxes = document.querySelectorAll(".suivi-row-cb:checked");
    if (checkboxes.length === 0) {
        alert("Veuillez sélectionner au moins un employé.");
        return;
    }
    
    let updated = 0;
    checkboxes.forEach(cb => {
        const empId = cb.value;
        if (!state.pointages[empId]) state.pointages[empId] = {};
        if (!state.pointages[empId][dateKey]) state.pointages[empId][dateKey] = {};
        
        if (isPresent) {
            state.pointages[empId][dateKey].status = "present";
        } else {
            state.pointages[empId][dateKey].status = "absent";
            state.pointages[empId][dateKey].arrivee = "";
            state.pointages[empId][dateKey].pause = "";
            state.pointages[empId][dateKey].reprise = "";
            state.pointages[empId][dateKey].fin = "";
            state.pointages[empId][dateKey].nuitActive = false;
        }
        updated++;
    });
    
    if (updated > 0) {
        saveStateToLocalStorage();
        renderSuiviJournalier();
        
        // Auto-actualiser le rapport s'il est déjà généré/affiché
        const reportTable = document.getElementById("suivi-report-table");
        if (reportTable && reportTable.style.display !== "none") {
            generatePresenceReport();
        }
    }
}

function setSuiviPresence(empId, dateKey, status) {
    if (!state.pointages[empId]) state.pointages[empId] = {};
    if (!state.pointages[empId][dateKey]) state.pointages[empId][dateKey] = {};
    
    if (status === "present") {
        state.pointages[empId][dateKey].status = "present";
    } else {
        state.pointages[empId][dateKey].status = "absent";
        state.pointages[empId][dateKey].arrivee = "";
        state.pointages[empId][dateKey].pause = "";
        state.pointages[empId][dateKey].reprise = "";
        state.pointages[empId][dateKey].fin = "";
        state.pointages[empId][dateKey].nuitActive = false;
    }
    
    saveStateToLocalStorage();
    renderSuiviJournalier();
    
    // Auto-actualiser le rapport s'il est déjà généré/affiché
    const reportTable = document.getElementById("suivi-report-table");
    if (reportTable && reportTable.style.display !== "none") {
        generatePresenceReport();
    }
}

function saveSuiviMotif(empId, dateKey, value) {
    if (!state.dayDetails[empId]) state.dayDetails[empId] = {};
    if (!state.dayDetails[empId][dateKey]) state.dayDetails[empId][dateKey] = {};
    state.dayDetails[empId][dateKey].note = value.trim();
    saveStateToLocalStorage();
    const reportTable = document.getElementById("suivi-report-table");
    if (reportTable && reportTable.style.display !== "none") generatePresenceReport();
}

function saveSuiviObservation(empId, dateKey, value) {
    if (!state.dayDetails[empId]) state.dayDetails[empId] = {};
    if (!state.dayDetails[empId][dateKey]) state.dayDetails[empId][dateKey] = {};
    state.dayDetails[empId][dateKey].observation = value.trim();
    saveStateToLocalStorage();
}

function generatePresenceReport() {
    const startInput = document.getElementById("suivi-report-start").value;
    const endInput = document.getElementById("suivi-report-end").value;
    const empFilterInput = document.getElementById("suivi-report-emp").value.trim();
    
    // Essayer de trouver l'employé sélectionné depuis l'input text (datalist)
    let empFilterId = "all";
    if (empFilterInput !== "") {
        const sortedEmps = getSortedEmployees();
        const matchedEmp = sortedEmps.find(e => `${e.matricule} - ${e.name}` === empFilterInput || e.name.toLowerCase().includes(empFilterInput.toLowerCase()) || (e.matricule && e.matricule.toLowerCase().includes(empFilterInput.toLowerCase())));
        if (matchedEmp) {
            empFilterId = matchedEmp.id;
        } else {
            // Si pas d'employé trouvé et champ non vide, on ne génère rien silencieusement
            return;
        }
    }
    
    if (!startInput || !endInput) {
        alert("Veuillez sélectionner les dates de début et de fin.");
        return;
    }
    
    const startDate = new Date(startInput);
    const endDate = new Date(endInput);
    
    if (startDate > endDate) {
        alert("La date de début doit être antérieure à la date de fin.");
        return;
    }
    
    const reportTable = document.getElementById("suivi-report-table");
    const tbody = document.getElementById("suivi-report-body");
    tbody.innerHTML = "";
    
    const sortedEmps = getSortedEmployees();
    
    sortedEmps.forEach(emp => {
        if (empFilterId !== "all" && emp.id !== empFilterId) return;
        if (rapportSelectedDept !== "all" && (emp.departement || "Non Défini").trim() !== rapportSelectedDept) return;
        
        let daysExpected = 0;
        let daysPresent = 0;
        let daysAbsentJustified = 0;
        let daysAbsentUnjustified = 0;
        let absenceDetails = [];
        
        // Parcourir chaque jour de la période
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            // Ignorer les jours avant l'embauche
            if (emp.startDate) {
                const empStart = new Date(emp.startDate);
                empStart.setHours(0,0,0,0);
                if (d < empStart) continue;
            }
            
            const year = d.getFullYear();
            const month = d.getMonth();
            
            if (!isEmployeeActiveAtDate(emp, year, month)) continue;
            
            const dateKey = formatDateISO(d);
            const dayOfWeek = d.getDay();
            const holidays = getHolidays(year);
            const isHoliday = !!holidays[dateKey];
            const isSunday = (dayOfWeek === 0);
            const isSaturday = (dayOfWeek === 6);
            
            const pointageData = (state.pointages[emp.id] && state.pointages[emp.id][dateKey]) || {};
            const status = pointageData.status || "absent";
            
            // Jours attendus : ni week-end ni férié
            let expected = false;
            if (!isSunday && !isSaturday && !isHoliday) {
                expected = true;
                daysExpected++;
            }
            
            // Si présent ou a pointé
            if (status === "present" || (pointageData.arrivee && pointageData.arrivee !== "")) {
                daysPresent++;
                if (!expected) daysExpected++; // S'il travaille un jour non ouvrable, on l'ajoute aux jours attendus
            } else if (expected) {
                // S'il ne vient pas un jour ouvrable
                if (status === "absent" || status === "autre" || status === "permission") {
                    const dayDetail = (state.dayDetails[emp.id] && state.dayDetails[emp.id][dateKey]) || {};
                    const note = (dayDetail.note || "").trim();
                    const noteLower = note.toLowerCase();
                    
                    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                    const noteDisplay = note !== "" ? note : "Non justifié";
                    const isJustified = noteLower && noteLower !== "" && noteLower !== "non justifié" && noteLower !== "non justifie";
                    const bgColor = isJustified ? '#ecfdf5' : '#fef2f2';
                    const borderColor = isJustified ? '#6ee7b7' : '#fca5a5';
                    const dateColor = isJustified ? '#065f46' : '#991b1b';
                    const motifColor = isJustified ? '#059669' : '#dc2626';
                    
                    absenceDetails.push(`
                        <div style="display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 10px; border: 1.5px solid ${borderColor}; border-radius: 8px; margin: 2px; background: ${bgColor}; min-width: 72px; max-width: 90px; text-align: center; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
                            <span style="font-size: 0.78em; font-weight: 800; color: ${dateColor}; line-height: 1.3; letter-spacing: 0.02em;">${dateStr}</span>
                            <span style="font-size: 0.72em; font-weight: 600; color: ${motifColor}; line-height: 1.3; word-break: break-word; width: 100%; text-align: center; margin-top: 2px;">${noteDisplay}</span>
                        </div>
                    `);
                    
                    if (isJustified) {
                        daysAbsentJustified++;
                    } else {
                        daysAbsentUnjustified++;
                    }
                } else {
                    // Les absences payées (congé, maladie...) réduisent le nb de jours attendus pour ne pas pénaliser le taux
                    daysExpected--;
                }
            }
        }
        
        // S'il n'était pas censé travailler de toute la période
        if (daysExpected === 0 && daysPresent === 0 && daysAbsentJustified === 0 && daysAbsentUnjustified === 0) return;
        
        const presenceRate = daysExpected > 0 ? Math.round((daysPresent / daysExpected) * 100) : 100;
        
        let obs = "";
        let obsClass = "";
        
        if (daysAbsentUnjustified === 0) {
            if (daysAbsentJustified === 0) {
                obs = "Assiduité parfaite";
                obsClass = "status-present";
            } else {
                obs = "Absences justifiées";
                obsClass = "status-conge";
            }
        } else if (daysAbsentUnjustified <= 2) {
            obs = "Quelques abs. injustifiées";
            obsClass = "status-permission";
        } else if (daysAbsentUnjustified <= 5) {
            obs = "Abs. injustifiées fréquentes";
            obsClass = "status-absent";
        } else {
            obs = "Risque de sanction";
            obsClass = "status-absent";
        }
        
        const startDateFormatted = emp.startDate ? new Date(emp.startDate).toLocaleDateString('fr-FR') : "N/A";
        const absenceHtml = absenceDetails.length > 0 ? absenceDetails.join('') : '<span style="color: var(--text-muted); font-size:0.8em;">-</span>';
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: 600; padding: 6px 8px; vertical-align: top; word-break: break-word;">
                <div style="font-size: 0.82em; color: var(--accent-day); font-weight:700;">${emp.matricule}</div>
                <div style="font-size: 0.88em; color: var(--text-primary); font-weight:600;">${emp.name}</div>
                <div style="font-size: 0.72em; color: var(--text-muted);">${startDateFormatted}</div>
            </td>
            <td class="col-expected" style="text-align:center; font-weight:700; font-size: 1em; vertical-align:middle;">${daysExpected}</td>
            <td class="col-present" style="text-align:center; color: #10b981; font-weight: bold; font-size: 1.1em; vertical-align:middle;">${daysPresent}</td>
            <td class="col-absences" style="padding: 4px 8px; vertical-align: middle;">
                <div style="display: flex; flex-wrap: nowrap; gap: 4px; align-items: center;">${absenceHtml}</div>
            </td>
            <td style="vertical-align:middle; padding: 6px 8px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="flex-grow: 1; background: #e0e0e0; height: 7px; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${presenceRate}%; background: ${presenceRate >= 90 ? '#10b981' : (presenceRate >= 70 ? '#f59e0b' : '#ef4444')}; height: 100%; border-radius:4px;"></div>
                    </div>
                    <span style="font-weight:700; font-size:1em;">${presenceRate}%</span>
                </div>
            </td>
            <td><span class="status-badge ${obsClass}">${obs}</span></td>
        `;
        tbody.appendChild(tr);
    });
    
    reportTable.style.display = "table";
    lucide.createIcons();
}

function setReportView(viewMode) {
    const reportTable = document.getElementById("suivi-report-table");
    if (!reportTable) return;
    
    // Nettoyer les classes
    reportTable.classList.remove("show-only-absences", "show-only-presence");
    
    // Nettoyer l'état actif des boutons
    document.getElementById("view-mixte-btn").classList.remove("btn-primary");
    document.getElementById("view-mixte-btn").classList.add("btn-secondary");
    document.getElementById("view-absence-btn").classList.remove("btn-primary");
    document.getElementById("view-absence-btn").classList.add("btn-secondary");
    document.getElementById("view-presence-btn").classList.remove("btn-primary");
    document.getElementById("view-presence-btn").classList.add("btn-secondary");
    
    if (viewMode === "absence") {
        reportTable.classList.add("show-only-absences");
        document.getElementById("view-absence-btn").classList.remove("btn-secondary");
        document.getElementById("view-absence-btn").classList.add("btn-primary");
    } else if (viewMode === "presence") {
        reportTable.classList.add("show-only-presence");
        document.getElementById("view-presence-btn").classList.remove("btn-secondary");
        document.getElementById("view-presence-btn").classList.add("btn-primary");
    } else {
        document.getElementById("view-mixte-btn").classList.remove("btn-secondary");
        document.getElementById("view-mixte-btn").classList.add("btn-primary");
    }
}

function printPresenceReport() {
    const startInput = document.getElementById("suivi-report-start").value;
    const endInput = document.getElementById("suivi-report-end").value;
    const empFilterInput = document.getElementById("suivi-report-emp").value.trim();
    
    if (!startInput || !endInput) {
        alert("Veuillez générer le rapport avant de l'imprimer.");
        return;
    }
    
    const formattedStart = new Date(startInput).toLocaleDateString('fr-FR');
    const formattedEnd = new Date(endInput).toLocaleDateString('fr-FR');
    
    // Injecter les dates dans le header d'impression
    const printDatesEl = document.getElementById("print-report-dates");
    if (printDatesEl) {
        printDatesEl.textContent = `Période du ${formattedStart} au ${formattedEnd}`;
    }
    
    // Injecter le nom de l'employé dans le header d'impression
    const printEmpEl = document.getElementById("print-report-emp-name");
    if (printEmpEl) {
        printEmpEl.textContent = empFilterInput !== "" ? `Employé : ${empFilterInput}` : "Tous les employés";
    }
    
    // Lancer l'impression
    window.print();
}

function isEmployeeActiveAtDate(emp, year, month) {
    if (!emp.inactiveFrom) return true;
    if (year < emp.inactiveFrom.year) return true;
    if (year > emp.inactiveFrom.year) return false;
    return month <= emp.inactiveFrom.month;
}

// === GESTION DU NOUVEL ONGLET PARAMETRES ===

function openEditModalById(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) openEditModal(emp);
}

function initParametresTab() {
    renderParamsTable();
    
    // Si l'onglet inactifs est affiché, on le met à jour
    const panelInactifs = document.getElementById('params-panel-inactifs');
    if (panelInactifs && panelInactifs.style.display !== 'none') {
        renderInactiveEmployeesTab();
    }
    updateInactiveCountBadge();
}

function renderParamsTable() {
    const tbody = document.getElementById("params-employees-body");
    const summaryContainer = document.getElementById("params-dept-summary");
    const deptFilterSelect = document.getElementById("params-dept-filter");
    if (!tbody || !summaryContainer || !deptFilterSelect) return;
    
    const searchInput = document.getElementById("params-search");
    const searchVal = searchInput ? searchInput.value.toLowerCase() : "";
    
    const showInactiveCheckbox = document.getElementById("params-show-inactive");
    const showInactive = showInactiveCheckbox ? showInactiveCheckbox.checked : false;
    
    const selectedDept = deptFilterSelect.value || "all";
    
    let allDepts = new Set();
    
    state.employees.forEach(e => allDepts.add((e.departement || "Non Défini").trim()));
    const deptsArray = Array.from(allDepts).sort();
    
    deptFilterSelect.innerHTML = `<option value="all">Tous les départements</option>`;
    deptsArray.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        deptFilterSelect.appendChild(opt);
    });
    if (deptsArray.includes(selectedDept)) {
        deptFilterSelect.value = selectedDept;
    }
    
    const sortedEmps = getSortedEmployees();
    tbody.innerHTML = "";
    
    let deptCounts = {};
    
    sortedEmps.forEach(emp => {
        const isInactive = emp.inactiveFrom != null;
        if (!showInactive && isInactive) return;
        
        const empDept = (emp.departement || "Non Défini").trim();
        
        if (selectedDept !== "all" && empDept !== selectedDept) return;
        if (searchVal && !(emp.name.toLowerCase().includes(searchVal) || (emp.matricule && emp.matricule.toLowerCase().includes(searchVal)))) return;
        
        deptCounts[empDept] = (deptCounts[empDept] || 0) + 1;
        
        const tr = document.createElement("tr");
        if (isInactive) tr.style.opacity = "0.6";
        
        const transportVal = emp.tauxTransport || 0;
        let nextMonth = emp.inactiveFrom ? emp.inactiveFrom.month + 1 : 0;
        let nextYear = emp.inactiveFrom ? emp.inactiveFrom.year : 0;
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }
        const statutBadge = isInactive 
            ? `<span class="badge" style="background:#fee2e2;color:#dc2626;border-color:#fecaca">Inactif depuis ${nextMonth+1}/${nextYear}</span>`
            : `<span class="badge" style="background:#dcfce7;color:#16a34a;border-color:#bbf7d0">Actif</span>`;
            
        tr.innerHTML = `
            <td><strong>${emp.matricule || '-'}</strong></td>
            <td>${emp.name}</td>
            <td>${emp.role || 'Non Défini'}</td>
            <td><span class="badge" style="background:var(--bg-input);color:var(--text-secondary)">${empDept}</span></td>
            <td>${emp.startDate ? new Date(emp.startDate).toLocaleDateString('fr-FR') : 'N/A'}</td>
            <td>${transportVal.toLocaleString('fr-FR')} F</td>
            <td>${statutBadge}</td>
            <td style="text-align:center;">
                <button class="btn btn-secondary btn-sm" onclick="openEditModalById('${emp.id}')" title="Modifier">
                    <i data-lucide="edit" style="width:14px;height:14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (window.lucide) {
        lucide.createIcons();
    }
    
    summaryContainer.innerHTML = "";
    for (const [dept, count] of Object.entries(deptCounts)) {
        const div = document.createElement("div");
        div.className = "card shadow-sm";
        div.style = "padding:10px 16px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--border-radius-md); display:flex; flex-direction:column; align-items:center; min-width:120px;";
        div.innerHTML = `
            <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">${dept}</span>
            <span style="font-size:1.5rem; font-weight:700; color:var(--text-primary);">${count}</span>
        `;
        summaryContainer.appendChild(div);
    }
}

// ==========================================================================
// SOUS-ONGLETS PARAMÈTRES (Actifs / Inactifs)
// ==========================================================================
function switchParamsSubTab(tab) {
    const panelActifs = document.getElementById('params-panel-actifs');
    const panelInactifs = document.getElementById('params-panel-inactifs');
    const btnActifs = document.getElementById('params-sub-tab-actifs');
    const btnInactifs = document.getElementById('params-sub-tab-inactifs');

    if (tab === 'actifs') {
        if (panelActifs) panelActifs.style.display = '';
        if (panelInactifs) panelInactifs.style.display = 'none';
        if (btnActifs) {
            btnActifs.style.borderBottom = '3px solid var(--accent-primary)';
            btnActifs.style.color = 'var(--accent-primary)';
        }
        if (btnInactifs) {
            btnInactifs.style.borderBottom = '3px solid transparent';
            btnInactifs.style.color = 'var(--text-muted)';
        }
    } else {
        if (panelActifs) panelActifs.style.display = 'none';
        if (panelInactifs) panelInactifs.style.display = '';
        if (btnInactifs) {
            btnInactifs.style.borderBottom = '3px solid #dc2626';
            btnInactifs.style.color = '#dc2626';
        }
        if (btnActifs) {
            btnActifs.style.borderBottom = '3px solid transparent';
            btnActifs.style.color = 'var(--text-muted)';
        }
        renderInactiveEmployeesTab();
        // Update count badge
        updateInactiveCountBadge();
    }
}

function updateInactiveCountBadge() {
    const monthSelect = document.getElementById('inactive-filter-month');
    const yearSelect = document.getElementById('inactive-filter-year');
    const badge = document.getElementById('inactive-count-badge');
    if (!badge) return;
    const filterMonth = (monthSelect && monthSelect.value !== "") ? parseInt(monthSelect.value) : state.currentMonth;
    const filterYear = (yearSelect && yearSelect.value !== "") ? parseInt(yearSelect.value) : state.currentYear;
    const count = getSortedEmployees().filter(emp => {
        if (!emp.inactiveFrom) return false;
        return !isEmployeeActiveAtDate(emp, filterYear, filterMonth);
    }).length;
    badge.textContent = count === 0 ? 'Aucun inactif' : `${count} inactif${count > 1 ? 's' : ''}`;
    badge.style.display = count === 0 ? 'none' : '';
}

// ==========================================================================
// ONGLET EMPLOYÉS INACTIFS
// ==========================================================================
function renderInactiveEmployeesTab() {

    const container = document.getElementById('inactive-emp-list-container');
    const monthSelect = document.getElementById('inactive-filter-month');
    const yearSelect = document.getElementById('inactive-filter-year');
    if (!container) return;


    // Populate year/month selectors on first call
    if (monthSelect && monthSelect.options.length === 0) {
        const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
        monthNames.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = m;
            monthSelect.appendChild(opt);
        });
    }
    if (yearSelect && yearSelect.options.length === 0) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear - 3; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
    }

    // Set defaults on first render
    if (monthSelect && !monthSelect.dataset.initialized) {
        monthSelect.value = state.currentMonth;
        yearSelect.value = state.currentYear;
        monthSelect.dataset.initialized = '1';
    }

    // Get selected filter month/year (default = current)
    const filterMonth = (monthSelect && monthSelect.value !== "") ? parseInt(monthSelect.value) : state.currentMonth;
    const filterYear = (yearSelect && yearSelect.value !== "") ? parseInt(yearSelect.value) : state.currentYear;

    // Find employees inactive for the selected month
    const inactiveEmps = getSortedEmployees().filter(emp => {
        if (!emp.inactiveFrom) return false;
        // Employee is inactive for filterMonth/filterYear if isEmployeeActiveAtDate returns false
        return !isEmployeeActiveAtDate(emp, filterYear, filterMonth);
    });

    const monthNames2 = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    if (inactiveEmps.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                <svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' style='margin-bottom:12px;opacity:0.4;'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>
                <div style='font-size:0.95rem;'>Aucun employé inactif pour <strong>${monthNames2[filterMonth]} ${filterYear}</strong>.</div>
            </div>`;
        return;
    }

    let html = `<div style='overflow-x:auto;'><table class='modern-table' style='width:100%;'>
        <thead><tr>
            <th>Matricule</th>
            <th>Nom Complet</th>
            <th>Fonction</th>
            <th>Département</th>
            <th>Date Embauche</th>
            <th>Dernier mois actif</th>
            <th>Inactif depuis</th>
            <th style='text-align:center;'>Action</th>
        </tr></thead><tbody>`;

    inactiveEmps.forEach(emp => {
        const lastActiveMonth = emp.inactiveFrom.month;
        const lastActiveYear = emp.inactiveFrom.year;
        let sinceMonth = lastActiveMonth + 1;
        let sinceYear = lastActiveYear;
        if (sinceMonth > 11) { sinceMonth = 0; sinceYear++; }

        html += `<tr style='opacity:0.85;'>
            <td><strong>${emp.matricule || '—'}</strong></td>
            <td>${emp.name}</td>
            <td>${emp.role || '—'}</td>
            <td><span class='badge' style='background:var(--bg-input);color:var(--text-secondary);'>${(emp.departement || 'Non Défini').trim()}</span></td>
            <td>${emp.startDate ? new Date(emp.startDate).toLocaleDateString('fr-FR') : 'N/A'}</td>
            <td><span class='badge' style='background:#dcfce7;color:#16a34a;border-color:#bbf7d0;'>${monthNames2[lastActiveMonth]} ${lastActiveYear}</span></td>
            <td><span class='badge' style='background:#fee2e2;color:#dc2626;border-color:#fecaca;'>À partir de ${monthNames2[sinceMonth]} ${sinceYear}</span></td>
            <td style='text-align:center;'>
                <button class='btn btn-secondary btn-sm' onclick="openEditModalById('${emp.id}')" title='Modifier / Réactiver'>
                    <i data-lucide='edit' style='width:14px;height:14px;'></i> Modifier
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    if (window.lucide) lucide.createIcons();
    updateInactiveCountBadge();
}

// Fonction pour effacer tout le pointage Suivi Présence d'un jour
window.clearSuiviPresenceCeJour = function() {
    const dateInput = document.getElementById("suivi-date-input");
    if (!dateInput || !dateInput.value) return;
    const dateVal = dateInput.value;
    
    // Reformater la date pour un affichage lisible
    const dateParts = dateVal.split('-');
    const dateAffichage = (dateParts.length === 3) ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : dateVal;
    
    if (!confirm(`Voulez-vous vraiment effacer TOUT le pointage du suivi présence pour le ${dateAffichage} ?\n\nAttention: Cela supprimera tous les statuts (Présent/Absent) et les observations de cette journée.`)) {
        return;
    }

    let updated = 0;
    state.employees.forEach(emp => {
        if (state.pointages[emp.id] && state.pointages[emp.id][dateVal]) {
            delete state.pointages[emp.id][dateVal];
            updated++;
        }
        if (state.dayDetails[emp.id] && state.dayDetails[emp.id][dateVal]) {
            delete state.dayDetails[emp.id][dateVal];
            updated++;
        }
    });

    if (updated > 0) {
        saveStateToLocalStorage();
        renderSuiviJournalier();
        alert("Le pointage de suivi présence du " + dateAffichage + " a été effacé avec succès.");
        
        // Auto-actualiser le rapport s'il est affiché
        const reportTable = document.getElementById("suivi-report-table");
        if (reportTable && reportTable.style.display !== "none") {
            generatePresenceReport();
        }
    } else {
        alert("Aucun pointage trouvé pour le " + dateAffichage + ".");
    }
};
