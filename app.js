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
    let deptInputId = "employee-departement-input";
    let roleSelectId = "employee-role-input";
    if (formType === "edit") {
        deptInputId = "edit-employee-departement-input";
        roleSelectId = "edit-employee-role-input";
    } else if (formType === "bulk") {
        deptInputId = "bulk-employee-departement-input";
        roleSelectId = "bulk-employee-role-input";
    }
    const deptInput = document.getElementById(deptInputId);
    const foncSelect = document.getElementById(roleSelectId);
    if (!deptInput || !foncSelect) return;
    
    // Remplir les fonctions regroupées par département
    foncSelect.innerHTML = '<option value="">Sélectionnez une fonction...</option>';
    const depts = Object.keys(state.companyStructure || {}).sort();
    
    depts.forEach(dept => {
        const group = document.createElement("optgroup");
        group.label = dept;
        const foncs = state.companyStructure[dept].sort();
        foncs.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            opt.setAttribute("data-dept", dept);
            if (f === selectedFoncValue && (dept === selectedDeptValue || !selectedDeptValue)) {
                opt.selected = true;
            }
            group.appendChild(opt);
        });
        if (foncs.length > 0) {
            foncSelect.appendChild(group);
        }
    });

    // Mettre à jour le département selon la fonction sélectionnée
    const updateDeptFromSelectedFonc = () => {
        const selectedOpt = foncSelect.options[foncSelect.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
            deptInput.value = selectedOpt.getAttribute("data-dept") || "Non Défini";
        } else {
            deptInput.value = "";
        }
    };

    updateDeptFromSelectedFonc();
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
    loadStateFromLocalStorage();
    
    // Check authentication
    if (!state.currentUser) {
        document.getElementById("login-overlay").style.display = "flex";
    } else {
        document.getElementById("login-overlay").style.display = "none";
        setupAuthUI();
    }
    
    initializeSelectors();
    renderEmployeeList();
    updateActiveEmployeeUI();
    generateTable();
    renderHolidaysList();
    setupEventListeners();
    
    // Afficher la carte rattrapage si un employé est déjà actif
    if (state.activeEmployeeId) {
        const rattrapageCard = document.getElementById("rattrapage-card");
        if (rattrapageCard) rattrapageCard.style.display = "block";
    }
    
    // Initialise les icônes Lucide
    lucide.createIcons();
});

let isFirebaseInitialized = false;

function loadStateFromLocalStorage() {
    // 1. Charger l'état local (préférences de l'utilisateur courant)
    const localSavedState = localStorage.getItem("pointage_pro_state_local");
    if (localSavedState) {
        try {
            const local = JSON.parse(localSavedState);
            state.currentUser = local.currentUser || null;
            state.activeEmployeeId = local.activeEmployeeId || null;
            state.currentYear = local.currentYear !== undefined ? local.currentYear : new Date().getFullYear();
            state.currentMonth = local.currentMonth !== undefined ? local.currentMonth : new Date().getMonth();
        } catch (e) {
            console.error("Erreur locale", e);
        }
    } else {
        state.currentYear = new Date().getFullYear();
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

    // 3. Connexion à Firebase
    const dbRef = database.ref('globalState');
    
    dbRef.on('value', (snapshot) => {
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
            
            isFirebaseInitialized = true;
            refreshAllViews();
        } else {
            // Firebase est vide, on migre l'ancien LocalStorage si présent
            isFirebaseInitialized = true;
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
                        state.users.push({ id: "usr-" + Date.now(), username: "admin", password: "admin", role: "ADMIN" });
                    }
                    saveStateToLocalStorage();
                } catch(e) {}
            } else {
                createDemoData();
            }
            refreshAllViews();
        }
    });
}

function refreshAllViews() {
    setupAuthUI();
    initializeSelectors();
    renderEmployeeList();
    updateActiveEmployeeUI();
    generateTable();
    renderHolidaysList();
    const recapTab = document.getElementById("tab-recap");
    if (recapTab && recapTab.classList.contains("active") && typeof generateRecapTable === "function") {
        generateRecapTable();
    }
}

function saveStateToLocalStorage() {
    // 1. Sauvegarder les données locales
    const localState = {
        currentUser: state.currentUser,
        activeEmployeeId: state.activeEmployeeId,
        currentYear: state.currentYear,
        currentMonth: state.currentMonth
    };
    localStorage.setItem("pointage_pro_state_local", JSON.stringify(localState));
    
    // 2. Synchroniser avec Firebase
    if (isFirebaseInitialized) {
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
        state.users.push({ id: "usr-" + Date.now(), username: "admin", password: "admin", role: "ADMIN" });
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
    monthSelector.value = state.currentMonth;
    
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

function setupEventListeners() {
    // Filtres
    document.getElementById("month-selector").addEventListener("change", (e) => {
        state.currentMonth = parseInt(e.target.value, 10);
        saveStateToLocalStorage();
        updateHolidayDaySelector();
        renderEmployeeList();
        generateTable();
        renderHolidaysList();
    });
    
    document.getElementById("year-selector").addEventListener("change", (e) => {
        state.currentYear = parseInt(e.target.value, 10);
        saveStateToLocalStorage();
        updateHolidayDaySelector();
        renderEmployeeList();
        generateTable();
        renderHolidaysList();
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
            
            if (targetId === "tab-recap") {
                generateRecapTable();
            }
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

    // Structure Config Modal Events
    const configStructureBtn = document.getElementById("config-structure-btn");
    const structModal = document.getElementById("config-structure-modal");
    if (configStructureBtn && structModal) {
        configStructureBtn.addEventListener("click", () => {
            selectedDeptConfig = null;
            renderStructureConfigModal();
            structModal.classList.add("active");
        });
    }

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

    // Listeners sur changement de fonction dans les formulaires d'employés (auto-détermination du département)
    const addFoncSelect = document.getElementById("employee-role-input");
    if (addFoncSelect) {
        addFoncSelect.addEventListener("change", () => {
            const deptInput = document.getElementById("employee-departement-input");
            const selectedOpt = addFoncSelect.options[addFoncSelect.selectedIndex];
            if (deptInput) {
                deptInput.value = selectedOpt && selectedOpt.value ? (selectedOpt.getAttribute("data-dept") || "") : "";
            }
        });
    }

    const editFoncSelect = document.getElementById("edit-employee-role-input");
    if (editFoncSelect) {
        editFoncSelect.addEventListener("change", () => {
            const deptInput = document.getElementById("edit-employee-departement-input");
            const selectedOpt = editFoncSelect.options[editFoncSelect.selectedIndex];
            if (deptInput) {
                deptInput.value = selectedOpt && selectedOpt.value ? (selectedOpt.getAttribute("data-dept") || "") : "";
            }
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

    const bulkFoncSelect = document.getElementById("bulk-employee-role-input");
    if (bulkFoncSelect) {
        bulkFoncSelect.addEventListener("change", () => {
            const deptInput = document.getElementById("bulk-employee-departement-input");
            const selectedOpt = bulkFoncSelect.options[bulkFoncSelect.selectedIndex];
            if (deptInput) {
                deptInput.value = selectedOpt && selectedOpt.value ? (selectedOpt.getAttribute("data-dept") || "") : "";
            }
        });
    }

    const confirmBulkAssignBtn = document.getElementById("confirm-bulk-assign-btn");
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

    // Impression du tableau de bord
    const printRecapBtn = document.getElementById("print-recap-btn");
    if (printRecapBtn) {
        printRecapBtn.addEventListener("click", () => {
            printRecapDashboard();
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
            const newEmp = {
                id: "emp-" + Date.now(),
                matricule: matricule,
                name: name,
                role: role || "Employé",
                departement: departement || "Non Défini",
                isRendement: document.getElementById("employee-rendement-cb").checked,
                tauxTransport: tauxTransportVal ? parseFloat(tauxTransportVal) : 30000
            };
            state.employees.push(newEmp);
            state.activeEmployeeId = newEmp.id;
            
            saveStateToLocalStorage();
            renderEmployeeList();
            updateActiveEmployeeUI();
            generateTable();
            
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
                
                if (!isActive) {
                    state.employees[empIndex].inactiveFrom = {
                        month: parseInt(document.getElementById("edit-employee-inact-month").value, 10),
                        year: parseInt(document.getElementById("edit-employee-inact-year").value, 10)
                    };
                } else {
                    delete state.employees[empIndex].inactiveFrom;
                }
                
                saveStateToLocalStorage();
                renderEmployeeList();
                updateActiveEmployeeUI();
                generateTable();
                
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

    // Export Excel/CSV
    document.getElementById("export-single-btn").addEventListener("click", exportToCSV);
    document.getElementById("export-all-btn").addEventListener("click", exportAllToCSV);
    
    // Impression Contextuelle (Pointage ou Synthèse)
    document.getElementById("print-single-btn").addEventListener("click", () => {
        const isSynthesisTab = document.querySelector('.tab-btn[data-tab="tab-synthese"]').classList.contains('active');
        if (isSynthesisTab) exportSynthesisPDF([state.activeEmployeeId]);
        else window.print();
    });
    
    document.getElementById("print-all-btn").addEventListener("click", () => {
        const isSynthesisTab = document.querySelector('.tab-btn[data-tab="tab-synthese"]').classList.contains('active');
        if (isSynthesisTab) exportSynthesisPDF(state.employees.map(e => e.id));
        else printAll();
    });
    
    // Export PDF Contextuel (Pointage ou Synthèse)
    document.getElementById("export-pdf-single-btn").addEventListener("click", () => {
        const isSynthesisTab = document.querySelector('.tab-btn[data-tab="tab-synthese"]').classList.contains('active');
        if (isSynthesisTab) exportSynthesisPDF([state.activeEmployeeId]);
        else exportToPDF([state.activeEmployeeId]);
    });
    
    document.getElementById("export-pdf-all-btn").addEventListener("click", () => {
        const isSynthesisTab = document.querySelector('.tab-btn[data-tab="tab-synthese"]').classList.contains('active');
        if (isSynthesisTab) exportSynthesisPDF(state.employees.map(e => e.id));
        else exportToPDF(state.employees.map(e => e.id));
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
    return state.currentMonth < emp.inactiveFrom.month;
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
        const disabledAttr = isMonthClosed ? 'disabled="disabled"' : '';
        const readonlyStyle = isMonthClosed ? 'background-color: #f1f5f9; cursor: not-allowed;' : '';
        
        tr.innerHTML = `
            <td class="col-day">${dayLabel}</td>
            
            <!-- Statut de Présence -->
            <td class="status-cell">
                <select class="status-select" data-field="status" style="width: 100%; font-size: 0.75rem; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-input);" ${disabledAttr}>
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
                    <input type="checkbox" class="rendement-active-cb" data-field="rendementActive" ${data.rendementActive ? 'checked' : ''} ${disabledAttr} style="cursor: pointer; width: 16px; height: 16px;">
                </label>
            </td>
            
            <!-- Shift Jour -->
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="arrivee" value="${data.arrivee || ''}" placeholder="08:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="pause" value="${data.pause || ''}" placeholder="12:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="reprise" value="${data.reprise || ''}" placeholder="13:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="day-cell"><input type="text" class="time-input t-jour" data-field="fin" value="${data.fin || ''}" placeholder="17:00" ${disabledAttr} style="${readonlyStyle}"></td>
            
            <!-- Night Toggle -->
            <td class="col-toggle" style="text-align: center; vertical-align: middle;">
                <label class="night-toggle" style="margin: 0 auto;">
                    <input type="checkbox" class="nuit-active-cb" data-field="nuitActive" ${data.nuitActive ? 'checked' : ''} ${disabledAttr}>
                    <span class="slider" style="border-radius: 20px;"></span>
                </label>
            </td>
            
            <!-- Shift Nuit -->
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitDebut" value="${data.nuitDebut || ''}" placeholder="21:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitPause" value="${data.nuitPause || ''}" placeholder="00:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitReprise" value="${data.nuitReprise || ''}" placeholder="01:00" ${disabledAttr} style="${readonlyStyle}"></td>
            <td class="night-cell"><input type="text" class="time-input t-nuit" data-field="nuitFin" value="${data.nuitFin || ''}" placeholder="05:00" ${disabledAttr} style="${readonlyStyle}"></td>
            
            <!-- Observations (Direct Input) -->
            <td class="notes-cell" style="padding: 4px;">
                <input type="text" class="obs-input" data-field="observation" value="${data.observation || ''}" placeholder="Ex: Retard..." ${disabledAttr} style="width: 100%; min-width: 120px; font-size: 0.8rem; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-family: inherit; ${readonlyStyle}">
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
        if (!showInactive) {
            if (emp.inactiveFrom) {
                const inactiveDate = new Date(emp.inactiveFrom.year, emp.inactiveFrom.month, 1);
                const currentMonthDate = new Date(state.currentYear, state.currentMonth, 1);
                if (inactiveDate <= currentMonthDate) return false;
            }
        }
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
            
            const storedData = empPointage[dateKey];
            const data = storedData ? { ...storedData } : {
                arrivee: "", pause: "", reprise: "", fin: "",
                nuitActive: false, nuitDebut: "", nuitPause: "", nuitReprise: "", nuitFin: "",
                status: ""
            };
            
            if (!storedData || !data.status) {
                const hasPointage = !!(data.arrivee || data.pause || data.reprise || data.fin || data.nuitDebut);
                if (hasPointage) data.status = "present";
                else if (isWorkingDay) data.status = "absent";
                else data.status = "present";
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
        });

        input.addEventListener("blur", function() {
            const rawVal = this.value.trim();
            if (rawVal === "") {
                this.classList.remove("invalid-input");
                saveInputValue(this);
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
    
    const user = state.users.find(u => u.username === userField && u.password === passField);
    
    if (user) {
        state.currentUser = user;
        saveStateToLocalStorage();
        document.getElementById("login-overlay").style.display = "none";
        document.getElementById("login-error").style.display = "none";
        setupAuthUI();
        generateTable(); // Refresh table to apply closure rules
    } else {
        document.getElementById("login-error").style.display = "block";
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
        
        if (confirm(`Voulez-vous vraiment clôturer le mois de ${monthLabel} ${state.currentYear} ?\n\nUne fois clôturé, les pointages de TOUS les employés pour ce mois ne pourront plus être modifiés.`)) {
            state.closedMonths.push(monthKey);
            saveStateToLocalStorage();
            generateTable(); // Refresh UI
            alert("Le mois a été clôturé avec succès.");
        }
    });
}
