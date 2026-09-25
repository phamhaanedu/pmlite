import { db, collection, getDocs, doc, setDoc, getDoc, updateDoc, writeBatch, deleteDoc, query, where, onSnapshot } from './firebase-config.js';

const urlParams = new URLSearchParams(window.location.search);
const currentProjectId = urlParams.get('projectId');

const headerProjectName = document.getElementById('headerProjectName');
const taskListBody = document.getElementById('taskListBody');
const btnSaveAll = document.getElementById('btnSaveAll');
const searchTaskInput = document.getElementById('searchTaskInput');

const newTaskName = document.getElementById('newTaskName');
const newTaskStatus = document.getElementById('newTaskStatus');
const newTaskBranch = document.getElementById('newTaskBranch');
const newTaskAssigneeContainer = document.getElementById('newTaskAssigneeContainer');
const newTaskAssigneeIds = document.getElementById('newTaskAssigneeIds');
const btnInlineAdd = document.getElementById('btnInlineAdd');

const assigneeModal = document.getElementById('assigneeModal');
const assigneeListContainer = document.getElementById('assigneeListContainer');
const searchAssigneeInput = document.getElementById('searchAssigneeInput');
const btnCancelAssignee = document.getElementById('btnCancelAssignee');
const btnConfirmAssignee = document.getElementById('btnConfirmAssignee');

let projectDevs = [];
let currentEditingAssigneeInput = null;
let currentEditingAssigneeContainer = null;
let currentUserProfile = null;
let currentProjectObj = null;
let isPMUser = false; // PM or Admin/PO
let allTasks = []; // Store tasks globally for view rendering
let currentView = 'list'; // 'list' or 'kanban'

// Wait for Firebase Auth to finish before fetching data
document.addEventListener("UserLoaded", async (e) => {
    const profile = e.detail;
    if (!profile) return;
    
    currentUserProfile = profile;

    if (!currentProjectId) {
        alert("Không tìm thấy Project ID.");
        window.location.href = "index.html";
        return;
    }

    await loadProjectDetails();
    await loadTasks();
    setupSearch();
    setupAssigneeModal();
    setupProjectDetailsActions();
    setupAccordions();
    setupViewToggle();

    btnInlineAdd.addEventListener("click", async () => {
        const name = newTaskName.value.trim();
        const status = newTaskStatus.value;
        const priority = document.getElementById("newTaskPriority") ? document.getElementById("newTaskPriority").value : 'medium';
        const branch = newTaskBranch.value.trim();
        const assignees = newTaskAssigneeIds.value ? JSON.parse(newTaskAssigneeIds.value) : [];

        if (!name) {
            alert("Vui lòng nhập tên công việc.");
            return;
        }

        try {
            const taskRef = doc(collection(db, "tasks"));
            const randomCode = Math.floor(1000 + Math.random() * 9000);
            const displayId = `#TASK-${randomCode}`;
            
            await setDoc(taskRef, {
                displayId: displayId,
                projectId: currentProjectId,
                name: name,
                status: status,
                assigneeIds: assignees,
                branch: branch,
                commitUrl: "",
                commits: [],
                sprint: "",
                category: "",
                startDate: "",
                deadline: "",
                endDate: "",
                note: "",
                createdAt: new Date()
            });

            newTaskName.value = "";
            newTaskStatus.value = "todo";
            newTaskBranch.value = "";
            newTaskAssigneeIds.value = "";
            newTaskAssigneeContainer.innerHTML = `<span style="color: var(--text-secondary); font-size: 0.9em; padding-left: 5px;">+ Thêm người</span>`;
            
            loadTasks();
        } catch (e) {
            console.error(e);
            alert("Lỗi khi thêm task: " + e.message);
        }
    });

    btnSaveAll.addEventListener("click", async () => {
        const dirtyRows = document.querySelectorAll("#taskListBody tr.main-row.dirty-row");
        if (dirtyRows.length === 0) return;

        try {
            const batch = writeBatch(db);
            
            dirtyRows.forEach(row => {
                const docId = row.dataset.id;
                const detailsRow = document.querySelector(`tr.details-row[data-id="${docId}"]`);
                
                const nameInput = row.querySelector(".edit-name").value.trim();
                const statusInput = row.querySelector(".edit-status").value;
                const priorityInput = row.querySelector(".edit-priority") ? row.querySelector(".edit-priority").value : 'medium';
                const branchInput = row.querySelector(".edit-branch").value.trim();
                const assigneeInput = row.querySelector(".edit-assignees").value;
                const assignees = assigneeInput ? JSON.parse(assigneeInput) : [];
                const tagsInputVal = row.querySelector(".edit-tags").value;
                const tagsList = tagsInputVal ? JSON.parse(tagsInputVal) : [];

                const sprintInput = detailsRow.querySelector(".edit-sprint").value.trim();
                const catInput = detailsRow.querySelector(".edit-category").value.trim();
                const startInput = detailsRow.querySelector(".edit-start").value;
                const deadInput = detailsRow.querySelector(".edit-deadline").value;
                const endInput = detailsRow.querySelector(".edit-end").value;
                const noteInput = detailsRow.querySelector(".edit-note").value.trim();

                if (docId && (nameInput || !isPMUser)) {
                    const ref = doc(db, "tasks", docId);
                    
                    let updateData = {};
                    if (isPMUser) {
                        updateData = {
                            name: nameInput,
                    status: statusInput,
                    priority: priorityInput,
                            branch: branchInput,
                            assigneeIds: assignees,
                            tags: tagsList,
                            sprint: sprintInput,
                            category: catInput,
                            startDate: startInput,
                            deadline: deadInput,
                            endDate: endInput,
                            note: noteInput,
                            updatedAt: new Date()
                        };
                    } else {
                        updateData = {
                            status: statusInput,
                            note: noteInput,
                            updatedAt: new Date()
                        };
                    }
                    
                    batch.update(ref, updateData);
                }
            });

            await batch.commit();
            if (window.logUserAction) window.logUserAction("Lưu thay đổi nhiều Tasks");
            alert(`Đã lưu thành công ${dirtyRows.length} tasks!`);
            loadTasks(); 
        } catch (err) {
            console.error(err);
            alert("Lỗi khi lưu nhiều dòng: " + err.message);
        }
    });
});

async function loadProjectDetails() {
    try {
        const pRef = doc(db, "projects", currentProjectId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
            const p = pSnap.data();
            currentProjectObj = p;
            headerProjectName.textContent = p.name || "Dự án không tên";
            
            // Check PM Rights
            isPMUser = false;
            if (currentUserProfile) {
                if (currentUserProfile.role === 'super_admin' || currentUserProfile.role === 'teacher') {
                    isPMUser = true;
                } else if (p.pmId === currentUserProfile.id || p.poId === currentUserProfile.id) {
                    isPMUser = true;
                }
            }
            
            // Load Links & Description
            document.getElementById('projectDescInput').value = p.description || '';
            
            // Function to update the <a> tags instead of input boxes
            const updateLinkTag = (id, url, defaultText) => {
                const aTag = document.getElementById(id);
                if (url && url.trim().length > 0) {
                    aTag.href = url;
                    aTag.textContent = url;
                    aTag.style.color = "var(--primary-color)";
                    aTag.style.textDecoration = "underline";
                } else {
                    aTag.href = "#";
                    aTag.textContent = defaultText;
                    aTag.style.color = "var(--text-secondary)";
                    aTag.style.textDecoration = "none";
                }
            };

            updateLinkTag('linkGit', p.linkGit, "Git Repository");
            updateLinkTag('linkUseCase', p.linkUseCase, "Use Case (Google Drive)");
            updateLinkTag('linkGdd', p.linkGdd, "Game Design Document (GDD)");
            updateLinkTag('linkWireframe', p.linkWireframe, "Wireframe / Design");

            // Access Control for Project Details
            if (!isPMUser) {
                document.getElementById('projectDescInput').disabled = true;
                document.getElementById('btnSaveProjectDetails').style.display = 'none';
                
                document.querySelectorAll('.btn-edit-link').forEach(btn => btn.style.display = 'none');
            } else {
                document.querySelectorAll('.btn-edit-link').forEach(btn => btn.style.display = 'inline-block');
            }
            
            const uSnap = await getDocs(collection(db, "users"));
            const allUsers = {};
            uSnap.forEach(d => { allUsers[d.id] = d.data(); });
            
            // Render the new team roles panel
            renderTeamRoles(p, allUsers);
            
            projectDevs = [];
            if (p.studentIds && Array.isArray(p.studentIds)) {
                p.studentIds.forEach(id => {
                    if (allUsers[id]) projectDevs.push({ id, ...allUsers[id] });
                });
            }
            
            newTaskAssigneeContainer.addEventListener('click', () => openAssigneeModal(newTaskAssigneeIds, newTaskAssigneeContainer));

        } else {
            headerProjectName.textContent = "Dự án không tồn tại";
        }
    } catch (e) {
        console.error(e);
    }
}

function setupProjectDetailsActions() {
    const btnSaveProjectDetails = document.getElementById('btnSaveProjectDetails');
    const projectDescInput = document.getElementById('projectDescInput');
    
    projectDescInput.addEventListener('input', () => {
        if (isPMUser) btnSaveProjectDetails.style.display = 'inline-block';
    });

    btnSaveProjectDetails.addEventListener('click', async () => {
        if (!isPMUser) return;
        try {
            const pRef = doc(db, "projects", currentProjectId);
            await updateDoc(pRef, {
                description: projectDescInput.value.trim()
            });
            alert("Đã lưu thông tin dự án!");
            btnSaveProjectDetails.style.display = 'none';
        } catch(e) {
            alert("Lỗi khi lưu: " + e.message);
        }
    });

    // Links Modal Logic
    const projectLinksModal = document.getElementById("projectLinksModal");
    const btnCancelLinks = document.getElementById("btnCancelLinks");
    const btnSaveLinks = document.getElementById("btnSaveLinks");
    
    const modalGitInput = document.getElementById("modalGitInput");
    const modalUseCaseInput = document.getElementById("modalUseCaseInput");
    const modalGddInput = document.getElementById("modalGddInput");
    const modalWireframeInput = document.getElementById("modalWireframeInput");

    document.querySelectorAll('.btn-edit-link').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!isPMUser || !currentProjectObj) return;
            
            modalGitInput.value = currentProjectObj.linkGit || '';
            modalUseCaseInput.value = currentProjectObj.linkUseCase || '';
            modalGddInput.value = currentProjectObj.linkGdd || '';
            modalWireframeInput.value = currentProjectObj.linkWireframe || '';
            
            projectLinksModal.style.display = 'flex';
        });
    });

    btnCancelLinks.addEventListener('click', () => {
        projectLinksModal.style.display = 'none';
    });

    btnSaveLinks.addEventListener('click', async () => {
        if (!isPMUser) return;
        try {
            const pRef = doc(db, "projects", currentProjectId);
            const newData = {
                linkGit: modalGitInput.value.trim(),
                linkUseCase: modalUseCaseInput.value.trim(),
                linkGdd: modalGddInput.value.trim(),
                linkWireframe: modalWireframeInput.value.trim()
            };
            await updateDoc(pRef, newData);
            alert("Đã lưu các đường dẫn!");
            projectLinksModal.style.display = 'none';
            
            // Reload the project info to reflect changes
            renderProjectInfo(currentProjectId);
        } catch(e) {
            alert("Lỗi khi lưu links: " + e.message);
        }
    });
}

function setupAssigneeModal() {
    btnCancelAssignee.addEventListener('click', () => {
        assigneeModal.style.display = 'none';
    });

    btnConfirmAssignee.addEventListener('click', async () => {
        const checkboxes = assigneeListContainer.querySelectorAll('input[type="checkbox"]:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        currentEditingAssigneeInput.value = JSON.stringify(selectedIds);
        currentEditingAssigneeInput.dataset.modified = "true";
        
        const event = new Event('input', { bubbles: true });
        currentEditingAssigneeInput.dispatchEvent(event);

        renderChips(selectedIds, currentEditingAssigneeContainer);
        assigneeModal.style.display = 'none';

        // Debug alerts to trace execution
        const trMain = currentEditingAssigneeInput.closest('tr');
        if (trMain && !trMain.classList.contains('add-row')) {
            const docId = trMain.dataset.id;
            if (docId) {
                try {
                    const ref = doc(db, "tasks", docId);
                    
                    // Chỉ cập nhật assigneeIds (và updated)
                    await updateDoc(ref, {
                        assigneeIds: selectedIds,
                        updatedAt: new Date()
                    });
                    
                    // Cập nhật lại dataset.original để checkDirty() chạy đúng
                    currentEditingAssigneeInput.dataset.original = currentEditingAssigneeInput.value;
                    const btnSaveAll = document.getElementById('btnSaveAll');
                    const allInputs = [
                        ...Array.from(trMain.querySelectorAll('input, select')),
                        ...(trMain.nextElementSibling && trMain.nextElementSibling.classList.contains('details-row') ? Array.from(trMain.nextElementSibling.querySelectorAll('input, select')) : [])
                    ];
                    let isDirty = false;
                    allInputs.forEach(input => {
                        if (input.value !== input.dataset.original) isDirty = true;
                    });
                    if (!isDirty) {
                        trMain.classList.remove('dirty-row');
                        trMain.style.background = "#fafafa";
                        const saveBtn = trMain.querySelector('.btn-save-row');
                        if (saveBtn) saveBtn.style.display = 'none';
                        if (document.querySelectorAll("#taskListBody tr.main-row.dirty-row").length === 0 && btnSaveAll) {
                            btnSaveAll.style.display = 'none';
                        }
                    }
                    
                    // Show success toast
                    let toast = document.getElementById('toast-assignee');
                    if (!toast) {
                        toast = document.createElement('div');
                        toast.id = 'toast-assignee';
                        toast.style = 'position:fixed;bottom:20px;right:20px;background:#4CAF50;color:white;padding:10px 20px;border-radius:4px;z-index:9999;transition:opacity 0.3s;';
                        document.body.appendChild(toast);
                    }
                    toast.textContent = "Đã lưu Assignee thành công!";
                    toast.style.opacity = '1';
                    setTimeout(() => toast.style.opacity = '0', 3000);
                    
                } catch (e) {
                    console.error("Lỗi auto-save assignees:", e);
                    alert("Lỗi Firebase: " + e.message);
                }
            }
        }
    });

    searchAssigneeInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        const items = assigneeListContainer.querySelectorAll('.assignee-item');
        items.forEach(item => {
            if(item.textContent.toLowerCase().includes(keyword)) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }
        });
    });
}

function openAssigneeModal(hiddenInput, containerElem) {
    currentEditingAssigneeInput = hiddenInput;
    currentEditingAssigneeContainer = containerElem;
    
    let selectedIds = [];
    if (hiddenInput.value) {
        try { selectedIds = JSON.parse(hiddenInput.value); } catch(e){}
    }

    assigneeListContainer.innerHTML = "";
    projectDevs.forEach(dev => {
        const div = document.createElement("div");
        div.className = "assignee-item";
        div.style = "display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid #eee;";
        
        const isChecked = selectedIds.includes(dev.id) ? "checked" : "";
        div.innerHTML = `
            <input type="checkbox" id="dev_${dev.id}" value="${dev.id}" ${isChecked}>
            <label for="dev_${dev.id}" style="cursor:pointer; flex: 1;">${dev.fullName} <span style="color:#888;font-size:0.85em">(${dev.email})</span></label>
        `;
        assigneeListContainer.appendChild(div);
    });

    searchAssigneeInput.value = "";
    assigneeModal.style.display = 'flex';
}

function renderChips(idsArray, container) {
    if (!idsArray || idsArray.length === 0) {
        container.innerHTML = `<span style="color: var(--text-secondary); font-size: 0.9em; padding-left: 5px;">+ Thêm người</span>`;
        return;
    }
    
    container.innerHTML = "";
    idsArray.forEach(id => {
        const dev = projectDevs.find(d => d.id === id);
        if (dev) {
            const shortName = dev.fullName.split(" ").pop();
            const chip = document.createElement("span");
            chip.style = "background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 12px; font-size: 0.8em; white-space: nowrap; font-weight: 500;";
            chip.textContent = shortName;
            container.appendChild(chip);
        }
    });
}

let unsubscribeTasks = null;

async function loadTasks() {
    if (unsubscribeTasks) {
        unsubscribeTasks();
    }

    try {
        const q = query(collection(db, "tasks"), where("projectId", "==", currentProjectId));
        
        // Listen for real-time updates
        unsubscribeTasks = onSnapshot(q, (querySnapshot) => {
            const tasksArray = [];
            querySnapshot.forEach((docSnap) => {
                tasksArray.push({ id: docSnap.id, ...docSnap.data() });
            });

            tasksArray.sort((a, b) => {
                // 1. Deleted tasks at the bottom
                if (a.isDeleted && !b.isDeleted) return 1;
                if (!a.isDeleted && b.isDeleted) return -1;
                
                // 2. Sort by Date desc
                let timeA = 0, timeB = 0;
                if (a.createdAt && typeof a.createdAt.toDate === 'function') timeA = a.createdAt.toDate().getTime();
                if (b.createdAt && typeof b.createdAt.toDate === 'function') timeB = b.createdAt.toDate().getTime();
                return timeB - timeA;
            });

            allTasks = tasksArray;
            renderTaskTable(allTasks);
            renderKanbanView(allTasks);
            if(typeof renderMatrixView === 'function') renderMatrixView(allTasks);
            if(typeof renderGanttView === 'function') renderGanttView(allTasks);
        }, (error) => {
            console.error("Lỗi khi lắng nghe tasks: ", error);
        });

    } catch (e) {
        console.error(e);
    }
}

function populateFilters(tasksArray) {
    const filterAssignee = document.getElementById("filterAssignee");
    const filterSprint = document.getElementById("filterSprint");
    const filterCategory = document.getElementById("filterCategory");
    const filterTag = document.getElementById("filterTag");
    
    // Save current values
    const currentAssignee = filterAssignee.value;
    const currentSprint = filterSprint.value;
    const currentCategory = filterCategory.value;
    const currentTag = filterTag.value;
    
    // Collect unique values
    const sprints = new Set();
    const categories = new Set();
    const tags = new Set();
    
    tasksArray.forEach(t => {
        if (t.sprint && t.sprint.trim()) sprints.add(t.sprint.trim());
        if (t.category && t.category.trim()) categories.add(t.category.trim());
        if (t.tags && Array.isArray(t.tags)) {
            t.tags.forEach(tag => {
                if (tag && tag.trim()) tags.add(tag.trim());
            });
        }
    });

    // Populate Assignees
    filterAssignee.innerHTML = '<option value="all">Tất cả Assignees</option>';
    projectDevs.forEach(dev => {
        filterAssignee.innerHTML += `<option value="${dev.id}">${dev.fullName || dev.email}</option>`;
    });

    // Populate Sprint
    filterSprint.innerHTML = '<option value="all">Tất cả Sprint</option>';
    Array.from(sprints).sort().forEach(s => {
        filterSprint.innerHTML += `<option value="${s}">${s}</option>`;
    });

    // Populate Category
    filterCategory.innerHTML = '<option value="all">Tất cả Category</option>';
    Array.from(categories).sort().forEach(c => {
        filterCategory.innerHTML += `<option value="${c}">${c}</option>`;
    });

    // Populate Tag
    filterTag.innerHTML = '<option value="all">Tất cả Tag</option>';
    Array.from(tags).sort().forEach(t => {
        filterTag.innerHTML += `<option value="${t}">${t}</option>`;
    });
    
    // Restore values if still exist
    if (currentAssignee && Array.from(filterAssignee.options).some(o => o.value === currentAssignee)) filterAssignee.value = currentAssignee;
    if (currentSprint && Array.from(filterSprint.options).some(o => o.value === currentSprint)) filterSprint.value = currentSprint;
    if (currentCategory && Array.from(filterCategory.options).some(o => o.value === currentCategory)) filterCategory.value = currentCategory;
    if (currentTag && Array.from(filterTag.options).some(o => o.value === currentTag)) filterTag.value = currentTag;
}

function renderTaskTable(tasksArray) {
    populateFilters(tasksArray);
    
    // Check if empty
    if(tasksArray.length === 0) {
        // Just clear everything except add-row
        const rows = Array.from(taskListBody.children);
        rows.forEach(child => {
            if (!child.classList.contains("add-row")) child.remove();
        });
        return;
    }

    const rows = Array.from(taskListBody.children);
    rows.forEach(child => {
        if (!child.classList.contains("add-row")) {
            child.remove();
        }
    });
    
    btnSaveAll.style.display = "none";
    
    tasksArray.forEach((t) => {
            const trMain = document.createElement("tr");
            trMain.dataset.id = t.id;
            trMain.className = "main-row";
            
            let statusColor = "";
            if(t.status === "backlog") statusColor = "color: #9E9E9E; font-weight: bold;";
            if(t.status === "todo") statusColor = "color: var(--text-secondary);";
            if(t.status === "inprogress") statusColor = "color: #F57C00; font-weight: bold;";
            if(t.status === "done") statusColor = "color: #388E3C; font-weight: bold;";

            const displayId = t.displayId || "TASK";
            const assigneesStr = JSON.stringify(t.assigneeIds || []);
            const tagsStr = JSON.stringify(t.tags || []);

            let isLate = false;
            let lateDays = 0;
            let isDueSoon = false;
            if (t.status !== 'done' && t.deadline) {
                const deadlineDate = new Date(t.deadline);
                deadlineDate.setHours(0,0,0,0);
                const today = new Date();
                today.setHours(0,0,0,0);
                
                const diffTime = deadlineDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) {
                    isLate = true;
                    lateDays = Math.abs(diffDays);
                } else if (diffDays <= 1) { // 0 or 1 day left
                    isDueSoon = true;
                }
            }
            
            if (isLate && !t.isDeleted) {
                trMain.style.background = "var(--status-danger-bg)";
            } else if (isDueSoon && !t.isDeleted) {
                trMain.style.background = "#fff3e0";
            }

            if (t.isDeleted && !isPMUser) {
                return; // Hide soft-deleted tasks from normal devs
            }
            
            if (t.isDeleted) {
                trMain.style.opacity = "0.5";
            }

            let badgeHtml = '';
            if (isLate) {
                badgeHtml = `<span style="background: var(--status-danger); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.85em; margin-left: 5px;">Trễ ${lateDays} ngày</span>`;
            } else if (isDueSoon) {
                badgeHtml = `<span style="background: #F57C00; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.85em; margin-left: 5px;">Tới hạn</span>`;
            }

            trMain.innerHTML = `
                <td>
                    <div style="font-size: 0.8em; color: var(--primary-color); font-weight: bold; margin-bottom: 3px;">
                        ${displayId}
                        ${badgeHtml}
                    </div>
                    <input type="text" class="grid-input edit-name" value="${t.name || ''}" data-original="${t.name || ''}" style="font-weight: 500; ${(isLate || isDueSoon) ? 'background: transparent;' : ''}">
                    
                    <div class="task-tags-container" style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; min-height: 20px;">
                        <!-- Tags will be rendered here -->
                    </div>
                    <input type="hidden" class="edit-tags" value='${tagsStr}' data-original='${tagsStr}'>
                </td>
                <td>
                    <select class="grid-select edit-priority" data-original="${t.priority || 'medium'}">
                        <option value="urgent" ${t.priority === 'urgent' ? 'selected' : ''}>🔴 Khẩn cấp</option>
                        <option value="high" ${t.priority === 'high' ? 'selected' : ''}>🟠 Cao</option>
                        <option value="medium" ${(!t.priority || t.priority === 'medium') ? 'selected' : ''}>🟡 Trung bình</option>
                        <option value="low" ${t.priority === 'low' ? 'selected' : ''}>🔵 Thấp</option>
                    </select>
                </td>
                <td>
                    <select class="grid-select edit-status" data-original="${t.status}" style="${statusColor}">
                        <option value="backlog" ${t.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                        <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
                        <option value="inprogress" ${t.status === 'inprogress' ? 'selected' : ''}>In Progress</option>
                        <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
                    </select>
                </td>
                <td>
                    <div class="assignee-chips-container edit-assignees-container" style="display: flex; flex-wrap: wrap; gap: 5px; cursor: pointer; min-height: 32px; align-items: center; padding: 4px; border: 1px dashed transparent; border-radius: 4px;" title="Click để gán người">
                        <!-- Chips go here -->
                    </div>
                    <input type="hidden" class="edit-assignees" value='${assigneesStr}' data-original='${assigneesStr}'>
                </td>
                <td>
                    <input type="text" class="grid-input edit-branch" value="${t.branch || ''}" data-original="${t.branch || ''}" style="font-family: monospace; font-size: 0.9em;" placeholder="Branch name">
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="icon-btn btn-save-row" title="Lưu thay đổi" style="display: none;">💾</button>
                    ${!t.isDeleted 
                        ? `<button class="icon-btn btn-delete-row" title="Xóa task" style="color: var(--status-danger);">🗑️</button>` 
                        : `<button class="icon-btn btn-restore-row" title="Khôi phục task" style="color: #4CAF50;">♻️</button>
                           <button class="icon-btn btn-hard-delete-row" title="Xóa vĩnh viễn (Cảnh báo: Tác động đến Git)" style="color: red; margin-left: 5px;">⚠️</button>`}
                    <button class="icon-btn btn-toggle-details" title="Chi tiết" style="color: var(--primary-color);">🔽</button>
                </td>
            `;

            const trDetails = document.createElement("tr");
            trDetails.dataset.id = t.id;
            trDetails.className = "details-row";
            trDetails.style.display = "none";
            trDetails.innerHTML = `
                <td colspan="5" style="background: #fafafa; padding: 15px; border-top: none; border-bottom: 2px solid var(--primary-color);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Sprint:</label>
                            <input type="text" class="grid-input edit-sprint" value="${t.sprint || ''}" data-original="${t.sprint || ''}" placeholder="Sprint 1...">
                        </div>
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Category:</label>
                            <input type="text" class="grid-input edit-category" value="${t.category || ''}" data-original="${t.category || ''}" placeholder="UI, Audio, Model...">
                        </div>
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Lịch sử Commit:</label>
                            <div style="margin-top: 5px; max-height: 80px; overflow-y: auto; font-size: 0.85em; border: 1px solid #eee; padding: 4px; border-radius: 4px; background: #fff;">
                                ${(t.commits && t.commits.length > 0) ? t.commits.map(c => 
                                    `<div style="margin-bottom: 4px; border-bottom: 1px dashed #ccc; padding-bottom: 2px;">
                                        <a href="${c.url}" target="_blank" style="color: #2196F3; font-weight: bold;">${c.message || 'Commit'}</a>
                                        <span style="color: #888; font-size: 0.9em; margin-left: 5px;">(${new Date(c.timestamp).toLocaleString()})</span>
                                    </div>`
                                ).join('') : '<span style="color:#999;">Chưa có commit</span>'}
                            </div>
                        </div>
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Start Date:</label>
                            <input type="date" class="grid-input edit-start" value="${t.startDate || ''}" data-original="${t.startDate || ''}">
                        </div>
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Deadline:</label>
                            <input type="date" class="grid-input edit-deadline" value="${t.deadline || ''}" data-original="${t.deadline || ''}">
                        </div>
                        <div>
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">End Date:</label>
                            <input type="date" class="grid-input edit-end" value="${t.endDate || ''}" data-original="${t.endDate || ''}">
                        </div>
                        <div style="grid-column: span 3;">
                            <label style="font-size: 0.85em; font-weight: 600; color: #555;">Ghi chú / Mô tả chi tiết:</label>
                            <input type="text" class="grid-input edit-note" value="${t.note || ''}" data-original="${t.note || ''}" placeholder="Nhập ghi chú...">
                        </div>
                    </div>
                </td>
            `;

            taskListBody.appendChild(trMain);
            taskListBody.appendChild(trDetails);

            const chipsContainer = trMain.querySelector('.edit-assignees-container');
            const hiddenAssigneeInput = trMain.querySelector('.edit-assignees');
            renderChips(t.assigneeIds || [], chipsContainer);

            if (isPMUser) {
                chipsContainer.addEventListener('click', () => {
                    openAssigneeModal(hiddenAssigneeInput, chipsContainer);
                });
            } else {
                chipsContainer.style.cursor = 'default';
            }
            
            // Render Tags
            const tagsContainer = trMain.querySelector('.task-tags-container');
            const hiddenTagsInput = trMain.querySelector('.edit-tags');
            
            const renderTags = () => {
                let currentTags = [];
                try { currentTags = JSON.parse(hiddenTagsInput.value); } catch(e){}
                
                tagsContainer.innerHTML = '';
                currentTags.forEach((tag, idx) => {
                    const tSpan = document.createElement('span');
                    tSpan.style = "background: #f1f3f4; color: #3c4043; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #dadce0;";
                    
                    if (isPMUser) {
                        tSpan.innerHTML = `<span>#${tag}</span> <strong style="cursor:pointer; color:#d32f2f;" title="Xóa tag này">×</strong>`;
                        tSpan.querySelector('strong').addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            currentTags.splice(idx, 1);
                            hiddenTagsInput.value = JSON.stringify(currentTags);
                            hiddenTagsInput.dispatchEvent(new Event('input'));
                            renderTags();
                        });
                    } else {
                        tSpan.innerHTML = `<span>#${tag}</span>`;
                    }
                    
                    tagsContainer.appendChild(tSpan);
                });
                
                const isAssignee = t.assigneeIds && currentUserProfile && t.assigneeIds.includes(currentUserProfile.id);
                const canEditFull = isPMUser || isAssignee;

                if (canEditFull) {
                    const addBtn = document.createElement('button');
                    addBtn.textContent = "+ Tag";
                    addBtn.style = "background: transparent; color: var(--primary-color); border: 1px dashed var(--primary-color); border-radius: 4px; font-size: 0.75em; padding: 2px 6px; cursor: pointer;";
                    addBtn.onclick = () => {
                        const newTag = prompt("Nhập tên Tag mới (Ví dụ: bug, ui, urgent):");
                        if(newTag && newTag.trim()) {
                            currentTags.push(newTag.trim().toLowerCase());
                            hiddenTagsInput.value = JSON.stringify(currentTags);
                            hiddenTagsInput.dispatchEvent(new Event('input'));
                            renderTags();
                        }
                    };
                    tagsContainer.appendChild(addBtn);
                }
            };
            
            renderTags();

            const toggleBtn = trMain.querySelector('.btn-toggle-details');
            toggleBtn.addEventListener('click', () => {
                if (trDetails.style.display === "none") {
                    trDetails.style.display = "table-row";
                    toggleBtn.textContent = "🔼";
                    if (!isLate) trMain.style.background = "#fafafa";
                } else {
                    trDetails.style.display = "none";
                    toggleBtn.textContent = "🔽";
                    if (!isLate) trMain.style.background = "transparent";
                }
            });

            const mainInputs = trMain.querySelectorAll('input:not([type="hidden"]), select');
            const detailInputs = trDetails.querySelectorAll('input:not([type="hidden"]), select');
            const allInputs = [...mainInputs, ...detailInputs];
            
            const isAssignee = t.assigneeIds && currentUserProfile && t.assigneeIds.includes(currentUserProfile.id);
            const canEditFull = isPMUser || isAssignee;

            // Lock fields for devs who are NOT assignees
            if (!canEditFull) {
                allInputs.forEach(input => {
                    input.disabled = true;
                    input.style.background = "transparent";
                    input.style.border = "none";
                });
            }
            
            if (t.isDeleted) {
                allInputs.forEach(input => input.disabled = true);
            }

            const saveBtn = trMain.querySelector('.btn-save-row');
            const delBtn = trMain.querySelector('.btn-delete-row');
            const resBtn = trMain.querySelector('.btn-restore-row');
            const hardDelBtn = trMain.querySelector('.btn-hard-delete-row');
            
            // Non-PM users cannot delete or restore tasks
            if (!isPMUser) {
                if (delBtn) delBtn.style.display = 'none';
                if (resBtn) resBtn.style.display = 'none';
                if (hardDelBtn) hardDelBtn.style.display = 'none';
            }
            
            const checkDirty = () => {
                let isDirty = false;
                allInputs.forEach(input => {
                    if (input.value !== input.dataset.original) {
                        isDirty = true;
                    }
                });
                
                if (isDirty) {
                    trMain.classList.add('dirty-row');
                    trDetails.style.background = "#fff4e5";
                    trMain.style.background = "#fff4e5";
                    if (saveBtn) saveBtn.style.display = 'inline-block';
                    if (delBtn) delBtn.style.display = 'none';
                    if (resBtn) resBtn.style.display = 'none';
                    btnSaveAll.style.display = 'inline-block';
                } else {
                    trMain.classList.remove('dirty-row');
                    trDetails.style.background = "#fafafa";
                    trMain.style.background = trDetails.style.display === "none" ? (t.isDeleted ? "transparent" : (isLate ? "var(--status-danger-bg)" : "transparent")) : "#fafafa";
                    if (saveBtn) saveBtn.style.display = 'none';
                    if (isPMUser) {
                        if (delBtn) delBtn.style.display = 'inline-block';
                        if (resBtn) resBtn.style.display = 'inline-block';
                    }
                    if (document.querySelectorAll("#taskListBody tr.main-row.dirty-row").length === 0) {
                        btnSaveAll.style.display = 'none';
                    }
                }
            };

            allInputs.forEach(input => {
                input.addEventListener('input', checkDirty);
                input.addEventListener('change', async (e) => {
                    checkDirty();
                    
                    // Auto-sync for Status
                    if (input.classList.contains('edit-priority')) {
                        try {
                            const ref = doc(db, "tasks", t.id);
                            await updateDoc(ref, { priority: input.value, updatedAt: new Date() });
                        } catch(e) { console.error(e); }
                    }
                    // Auto-sync for Status
                    if (input.classList.contains('edit-status')) {
                        try {
                            const ref = doc(db, "tasks", t.id);
                            
                            let endDate = t.endDate || "";
                            if (input.value === "done" && t.status !== "done" && !endDate) {
                                endDate = new Date().toISOString().split('T')[0];
                            }
                            
                            await updateDoc(ref, {
                                status: input.value,
                                endDate: endDate,
                                updatedAt: new Date()
                            });
                            // Tránh việc onSnapshot giật layout nếu không cần thiết
                            input.dataset.original = input.value;
                            checkDirty();
                            if (window.logUserAction) window.logUserAction("Đổi trạng thái task thành " + input.value);
                        } catch (err) {
                            console.error("Lỗi khi auto-sync status:", err);
                        }
                    }
                });
            });

            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    const nameInput = trMain.querySelector(".edit-name").value.trim();
                    const statusInput = trMain.querySelector(".edit-status").value;
                    const branchInput = trMain.querySelector(".edit-branch").value.trim();
                    const assigneeInput = trMain.querySelector(".edit-assignees").value;
                    const assignees = assigneeInput ? JSON.parse(assigneeInput) : [];
                    const tagsInputVal = trMain.querySelector(".edit-tags").value;
                    const tagsList = tagsInputVal ? JSON.parse(tagsInputVal) : [];

                    const sprintInput = trDetails.querySelector(".edit-sprint").value.trim();
                    const catInput = trDetails.querySelector(".edit-category").value.trim();
                    const startInput = trDetails.querySelector(".edit-start").value;
                    const deadInput = trDetails.querySelector(".edit-deadline").value;
                    const endInput = trDetails.querySelector(".edit-end").value;
                    const noteInput = trDetails.querySelector(".edit-note").value.trim();
                    
                    if (!nameInput && canEditFull) { alert("Thiếu tên Use Case"); return; }
                    
                    try {
                        const ref = doc(db, "tasks", t.id);
                        
                        // PM and Devs can both update all fields
                        let updateData = { 
                            name: nameInput, status: statusInput, branch: branchInput, assigneeIds: assignees, tags: tagsList,
                            sprint: sprintInput, category: catInput, startDate: startInput, deadline: deadInput, endDate: endInput, note: noteInput,
                            updatedAt: new Date() 
                        };
                        await updateDoc(ref, updateData);
                        
                        allInputs.forEach(input => input.dataset.original = input.value);
                        checkDirty();
                    } catch (e) {
                        alert("Lỗi: " + e.message);
                    }
                });
            }

            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (confirm(`Xóa mềm task "${t.name}"?`)) {
                        try {
                            // Soft delete
                            await updateDoc(doc(db, "tasks", t.id), { isDeleted: true });
                        } catch (e) {
                            alert("Lỗi: " + e.message);
                        }
                    }
                });
            }
            
            if (resBtn) {
                resBtn.addEventListener('click', async () => {
                    try {
                        // Restore
                        await updateDoc(doc(db, "tasks", t.id), { isDeleted: false });
                    } catch (e) {
                        alert("Lỗi khôi phục: " + e.message);
                    }
                });
            }

            
            if (hardDelBtn) {
                hardDelBtn.addEventListener('click', async () => {
                    // Check commits
                    if (t.commits && t.commits.length > 0) {
                        if (!confirm(`CẢNH BÁO RỦI RO GIT: Task "${t.name}" đã có ${t.commits.length} commit gắn liền.\nNếu xóa vĩnh viễn, bạn sẽ làm mất dữ liệu đối soát tiến độ của sinh viên (chỉ xóa trên hệ thống, không xóa trên Git).\nBạn có thực sự chắc chắn muốn xóa vĩnh viễn không?`)) {
                            return;
                        }
                    } else {
                        if (!confirm(`CẢNH BÁO NGUY HIỂM: Xóa vĩnh viễn task "${t.name}"?\nHành động này không thể hoàn tác.`)) {
                            return;
                        }
                    }
                    
                    try {
                        await deleteDoc(doc(db, "tasks", t.id));
                        if (window.logUserAction) window.logUserAction("Xóa vĩnh viễn Task");
                    } catch (e) {
                        alert("Lỗi khi xóa vĩnh viễn: " + e.message);
                    }
                });
            }
        });
    
    // Call filterTasks to apply current filters to newly rendered rows
    filterTasks();
}

function filterTasks() {
    const searchTaskInput = document.getElementById("searchTaskInput");
    const filterStatus = document.getElementById("filterStatus");
    const filterPriority = document.getElementById("filterPriority");
    const filterAssignee = document.getElementById("filterAssignee");
    const filterSprint = document.getElementById("filterSprint");
    const filterCategory = document.getElementById("filterCategory");
    const filterTag = document.getElementById("filterTag");
    
    const keyword = searchTaskInput ? searchTaskInput.value.toLowerCase().trim() : "";
    const statusVal = filterStatus ? filterStatus.value : "all";
    const priorityVal = filterPriority ? filterPriority.value : "all";
    const assigneeVal = filterAssignee ? filterAssignee.value : "all";
    const sprintVal = filterSprint ? filterSprint.value : "all";
    const categoryVal = filterCategory ? filterCategory.value : "all";
    const tagVal = filterTag ? filterTag.value : "all";
    
    // 1. Filter List Rows
    const rows = document.querySelectorAll("#taskListBody tr.main-row");
    rows.forEach(row => {
        const docId = row.dataset.id;
        const detailsRow = document.querySelector(`tr.details-row[data-id="${docId}"]`);
        
        const textContent = row.textContent.toLowerCase() + (detailsRow ? detailsRow.textContent.toLowerCase() : "");
        const name = row.querySelector(".edit-name") ? row.querySelector(".edit-name").value.toLowerCase() : "";
        
        const statusSelect = row.querySelector(".edit-status");
        const taskStatus = statusSelect ? statusSelect.value : "";
        
        const prioritySelect = row.querySelector(".edit-priority");
        const taskPriority = prioritySelect ? prioritySelect.value : "medium";
        
        const hiddenAssignees = row.querySelector(".edit-assignees");
        let taskAssignees = [];
        try { if(hiddenAssignees) taskAssignees = JSON.parse(hiddenAssignees.value); } catch(e){}
        
        const hiddenTags = row.querySelector(".edit-tags");
        let taskTags = [];
        try { if(hiddenTags) taskTags = JSON.parse(hiddenTags.value); } catch(e){}
        
        const categoryInput = detailsRow ? detailsRow.querySelector(".edit-category") : null;
        const taskCategory = categoryInput ? categoryInput.value.trim() : "";
        
        const sprintInput = detailsRow ? detailsRow.querySelector(".edit-sprint") : null;
        const taskSprint = sprintInput ? sprintInput.value.trim() : "";
        
        const matchKeyword = textContent.includes(keyword) || name.includes(keyword);
        const matchStatus = (statusVal === "all") || (taskStatus === statusVal);
        const matchPriority = (priorityVal === "all") || (taskPriority === priorityVal);
        const matchAssignee = (assigneeVal === "all") || taskAssignees.includes(assigneeVal);
        const matchSprint = (sprintVal === "all") || (taskSprint === sprintVal);
        const matchCategory = (categoryVal === "all") || (taskCategory === categoryVal);
        const matchTag = (tagVal === "all") || taskTags.includes(tagVal);
        
        if(matchKeyword && matchStatus && matchPriority && matchAssignee && matchSprint && matchCategory && matchTag) {
            row.style.display = "";
        } else {
            row.style.display = "none";
            if (detailsRow) detailsRow.style.display = "none";
        }
    });
    
    // Helper for cards
    const filterCards = (selector, displayStyle) => {
        const cards = document.querySelectorAll(selector);
        cards.forEach(card => {
            const textContent = card.textContent.toLowerCase();
            const taskStatus = card.dataset.status;
            const taskPriority = card.dataset.priority || 'medium';
            
            let taskAssignees = [];
            try { if(card.dataset.assignees) taskAssignees = JSON.parse(card.dataset.assignees); } catch(e){}
            
            let taskTags = [];
            try { if(card.dataset.tags) taskTags = JSON.parse(card.dataset.tags); } catch(e){}
            
            const taskCategory = (card.dataset.category || "").trim();
            const taskSprint = (card.dataset.sprint || "").trim();
            
            const matchKeyword = textContent.includes(keyword);
            const matchStatus = (statusVal === "all") || (taskStatus === statusVal);
            const matchPriority = (priorityVal === "all") || (taskPriority === priorityVal);
            const matchAssignee = (assigneeVal === "all") || taskAssignees.includes(assigneeVal);
            const matchSprint = (sprintVal === "all") || (taskSprint === sprintVal);
            const matchCategory = (categoryVal === "all") || (taskCategory === categoryVal);
            const matchTag = (tagVal === "all") || taskTags.includes(tagVal);
            
            if(matchKeyword && matchStatus && matchPriority && matchAssignee && matchSprint && matchCategory && matchTag) {
                card.style.display = displayStyle;
            } else {
                card.style.display = "none";
            }
        });
    };
    
    // 2. Filter Kanban Cards
    filterCards('.kanban-card', '');
    
    // 3. Filter Matrix Cards
    filterCards('.matrix-card', 'flex');
    
    // 4. Filter Gantt Rows
    filterCards('.gantt-row', 'flex');
}

function setupSearch() {
    const searchTaskInput = document.getElementById("searchTaskInput");
    const filterStatus = document.getElementById("filterStatus");
    const filterAssignee = document.getElementById("filterAssignee");
    const filterSprint = document.getElementById("filterSprint");
    const filterCategory = document.getElementById("filterCategory");
    const filterTag = document.getElementById("filterTag");
    
    if(searchTaskInput) searchTaskInput.addEventListener("input", filterTasks);
    if(filterStatus) filterStatus.addEventListener("change", filterTasks);
    const filterPriority = document.getElementById("filterPriority");
    if(filterPriority) filterPriority.addEventListener("change", filterTasks);
    if(filterAssignee) filterAssignee.addEventListener("change", filterTasks);
    if(filterSprint) filterSprint.addEventListener("change", filterTasks);
    if(filterCategory) filterCategory.addEventListener("change", filterTasks);
    if(filterTag) filterTag.addEventListener("change", filterTasks);
}


function setupAccordions() {
    const panels = [
        { header: 'headerProjectInfo', content: 'contentProjectInfo', storageKey: 'pmlite_panel_projInfo' },
        { header: 'headerTeamRoles', content: 'contentTeamRoles', storageKey: 'pmlite_panel_teamRoles' }
    ];
    
    panels.forEach(p => {
        const header = document.getElementById(p.header);
        const content = document.getElementById(p.content);
        if (!header || !content) return;
        const icon = header.querySelector('.accordion-icon');
        
        const isCollapsed = localStorage.getItem(p.storageKey) === 'true';
        if (isCollapsed) {
            content.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(-90deg)';
        }
        
        header.addEventListener('click', () => {
            const currentlyCollapsed = content.style.display === 'none';
            if (currentlyCollapsed) {
                content.style.display = p.content === 'contentProjectInfo' ? 'flex' : 'block';
                if (icon) icon.style.transform = 'rotate(0deg)';
                localStorage.setItem(p.storageKey, 'false');
            } else {
                content.style.display = 'none';
                if (icon) icon.style.transform = 'rotate(-90deg)';
                localStorage.setItem(p.storageKey, 'true');
            }
        });
    });
}

function renderTeamRoles(p, allUsers) {
    const tbody = document.getElementById("teamRolesBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const memberRoles = p.memberRoles || {};
    const btnSaveTeamRoles = document.getElementById("btnSaveTeamRoles");
    
    const addRow = (uid, roleName) => {
        if (!uid || !allUsers[uid]) return;
        const user = allUsers[uid];
        const currentDesc = memberRoles[uid] || "";
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid var(--border-color)";
        
        const tdName = document.createElement("td");
        tdName.style.padding = "10px 0";
        tdName.innerHTML = `<strong>${user.fullName}</strong><br><span style="font-size:0.85em;color:var(--text-secondary)">${user.email}</span>`;
        
        const tdRole = document.createElement("td");
        tdRole.textContent = roleName;
        tdRole.style.fontWeight = "600";
        if (roleName === "PO") tdRole.style.color = "var(--status-done)";
        if (roleName === "PM") tdRole.style.color = "var(--primary-color)";
        
        const tdDesc = document.createElement("td");
        if (isPMUser) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "grid-input";
            input.style.width = "100%";
            input.placeholder = "Nhập mô tả phân công...";
            input.value = currentDesc;
            input.dataset.uid = uid;
            
            input.addEventListener("input", () => {
                input.classList.add("unsaved-input");
                btnSaveTeamRoles.style.display = "inline-block";
            });
            tdDesc.appendChild(input);
        } else {
            tdDesc.textContent = currentDesc || "Chưa có mô tả";
            tdDesc.style.color = currentDesc ? "inherit" : "var(--text-secondary)";
        }
        
        tr.appendChild(tdName);
        tr.appendChild(tdRole);
        tr.appendChild(tdDesc);
        tbody.appendChild(tr);
    };
    
    if (p.poId) addRow(p.poId, "PO");
    if (p.pmId) addRow(p.pmId, "PM");
    
    if (p.studentIds && Array.isArray(p.studentIds)) {
        p.studentIds.forEach(id => {
            if (id !== p.pmId && id !== p.poId) {
                addRow(id, "Dev");
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // We attach this globally. Since btnSaveTeamRoles is in the DOM on load, it's safe.
    const btnSaveTeamRoles = document.getElementById("btnSaveTeamRoles");
    if (btnSaveTeamRoles) {
        btnSaveTeamRoles.addEventListener("click", async (e) => {
            e.stopPropagation(); // just in case
            try {
                const inputs = document.querySelectorAll("#teamRolesBody input");
                const newMemberRoles = { ...(currentProjectObj.memberRoles || {}) };
                inputs.forEach(inp => {
                    newMemberRoles[inp.dataset.uid] = inp.value.trim();
                });
                
                const pRef = doc(db, "projects", currentProjectId);
                await updateDoc(pRef, {
                    memberRoles: newMemberRoles
                });
                
                if (window.logUserAction) window.logUserAction("Cập nhật phân công nhân sự");
                alert("Đã lưu phân công thành công!");
                btnSaveTeamRoles.style.display = 'none';
                
                // Remove unsaved highlighting
                inputs.forEach(inp => inp.classList.remove("unsaved-input"));
                
                // Update local state so it doesn't revert if not reloaded
                currentProjectObj.memberRoles = newMemberRoles;
            } catch (err) {
                console.error(err);
                alert("Lỗi khi lưu phân công: " + err.message);
            }
        });
    }
});

function setupViewToggle() {
    const btnViewList = document.getElementById("btnViewList");
    const btnViewKanban = document.getElementById("btnViewKanban");
    const btnViewMatrix = document.getElementById("btnViewMatrix");
    const btnViewGantt = document.getElementById("btnViewGantt");
    const ganttViewContainer = document.getElementById("ganttViewContainer");
    const listViewContainer = document.getElementById("listViewContainer");
    const kanbanViewContainer = document.getElementById("kanbanViewContainer");
    const matrixViewContainer = document.getElementById("matrixViewContainer");
    const filterStatus = document.getElementById("filterStatus");

    btnViewList.addEventListener("click", () => {
        currentView = "list";
        listViewContainer.style.display = "block";
        kanbanViewContainer.style.display = "none";
        if(matrixViewContainer) matrixViewContainer.style.display = "none";
        if(ganttViewContainer) ganttViewContainer.style.display = "none";
        filterStatus.style.display = "inline-block";
        
        btnViewList.classList.add('active'); btnViewKanban.classList.remove('active'); if(btnViewMatrix) btnViewMatrix.classList.remove('active'); if(btnViewGantt) btnViewGantt.classList.remove('active');
        
        
        
        
    });

    btnViewKanban.addEventListener("click", () => {
        currentView = "kanban";
        listViewContainer.style.display = "none";
        if(matrixViewContainer) matrixViewContainer.style.display = "none";
        if(ganttViewContainer) ganttViewContainer.style.display = "none";
        kanbanViewContainer.style.display = "block";
        filterStatus.style.display = "none"; // Hide status filter in kanban view
        filterStatus.value = "all";
        filterTasks();
        
        btnViewKanban.classList.add('active'); btnViewList.classList.remove('active'); if(btnViewMatrix) btnViewMatrix.classList.remove('active'); if(btnViewGantt) btnViewGantt.classList.remove('active');
        
        
        
        
    });
    if(btnViewMatrix) {
        btnViewMatrix.addEventListener("click", () => {
            currentView = "matrix";
            listViewContainer.style.display = "none";
            kanbanViewContainer.style.display = "none";
            matrixViewContainer.style.display = "block";
            filterStatus.style.display = "none"; 
            filterStatus.value = "all";
            filterTasks();
            
            btnViewMatrix.classList.add('active'); btnViewList.classList.remove('active'); btnViewKanban.classList.remove('active'); if(btnViewGantt) btnViewGantt.classList.remove('active');
            
            
            
            
        });
    }
    if(btnViewGantt) {
        btnViewGantt.addEventListener("click", () => {
            currentView = "gantt";
            listViewContainer.style.display = "none";
            kanbanViewContainer.style.display = "none";
            if(matrixViewContainer) matrixViewContainer.style.display = "none";
            ganttViewContainer.style.display = "block";
            filterStatus.style.display = "inline-block"; 
            filterTasks();
            
            btnViewGantt.classList.add('active'); btnViewList.classList.remove('active'); btnViewKanban.classList.remove('active'); if(btnViewMatrix) btnViewMatrix.classList.remove('active');
            
            
            
            
            
            
        });
    }

}

function renderKanbanView(tasksArray) {
    const columns = {
        'backlog': document.querySelector('.kanban-dropzone[data-status="backlog"]'),
        'todo': document.querySelector('.kanban-dropzone[data-status="todo"]'),
        'inprogress': document.querySelector('.kanban-dropzone[data-status="inprogress"]'),
        'done': document.querySelector('.kanban-dropzone[data-status="done"]')
    };

    const counts = { 'backlog': 0, 'todo': 0, 'inprogress': 0, 'done': 0 };

    Object.values(columns).forEach(col => col.innerHTML = '');

    tasksArray.forEach(t => {
        if (t.isDeleted) return; // Don't show deleted tasks in Kanban
        
        const col = columns[t.status];
        if (!col) return;
        
        counts[t.status]++;

        const card = document.createElement('div');
        let isDragging = false;
        card.className = 'kanban-card min-card';
        card.draggable = true;
        card.dataset.id = t.id;
        card.dataset.status = t.status;
        card.dataset.assignees = JSON.stringify(t.assigneeIds || []);
        card.dataset.tags = JSON.stringify(t.tags || []);
        card.dataset.category = t.category || "";
        card.dataset.sprint = t.sprint || "";
        card.dataset.priority = t.priority || "medium";
        
        let isLate = false;
        let isDueSoon = false;
        if (t.status !== 'done' && t.deadline) {
            const deadlineDate = new Date(t.deadline);
            deadlineDate.setHours(0,0,0,0);
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const diffTime = deadlineDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                isLate = true;
            } else if (diffDays <= 1) { // 0 or 1 day left
                isDueSoon = true;
            }
        }

        let cardBg = 'white';
        if (isLate) cardBg = '#ffebee';
        else if (isDueSoon) cardBg = '#fff3e0';

        card.style = `
            background: ${cardBg}; 
            border-radius: 6px; 
            padding: 10px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
            cursor: grab; 
            display: flex; 
            flex-direction: column; 
            gap: 8px;
            border-left: 3px solid ${t.status === 'backlog' ? '#9E9E9E' : t.status === 'todo' ? '#2196F3' : t.status === 'inprogress' ? '#FF9800' : '#4CAF50'};
        `;

        const assigneesHtml = (t.assigneeIds || []).map(id => {
            const dev = projectDevs.find(d => d.id === id);
            return dev ? `<span title="${dev.fullName}" class="min-avatar">${dev.fullName.charAt(0)}</span>` : '';
        }).join('');

        let badgeHtml = '';
        if (isLate) {
            badgeHtml = '<span style="font-size: 0.7em; background: var(--status-danger); color: white; padding: 2px 4px; border-radius: 4px;">Trễ hạn</span>';
        } else if (isDueSoon) {
            badgeHtml = '<span style="font-size: 0.7em; background: #F57C00; color: white; padding: 2px 4px; border-radius: 4px;">Tới hạn</span>';
        }

        const taskPriority = t.priority || 'medium';
        const priorityIcon = taskPriority === 'urgent' ? '🔴' : taskPriority === 'high' ? '🟠' : taskPriority === 'low' ? '🔵' : '🟡';

        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-id">${t.displayId || 'TASK'} ${priorityIcon}</span>
                ${typeof badgeHtml !== 'undefined' ? badgeHtml : (typeof dateHtml !== 'undefined' ? dateHtml : '')}
            </div>
            <div class="card-title">${t.name}</div>
            <div class="card-footer">
                <span class="card-status-badge">${t.status.toUpperCase()}</span>
                <div style="display: flex; padding-left: 5px;">${assigneesHtml}</div>
            </div>
        `;

        // Drag events
        card.addEventListener('dragstart', (e) => {
            isDragging = true;
            e.dataTransfer.setData('text/plain', t.id);
            card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', () => {
            setTimeout(() => { isDragging = false; }, 50);
            card.style.opacity = '1';
        });

        // Click to open modal
        card.addEventListener('click', (e) => {
            if (isDragging) return;
            openKanbanModal(t.id);
        });

        col.appendChild(card);
    });

    // Update counts
    document.querySelector('.kanban-count[data-count="backlog"]').textContent = counts['backlog'];
    document.querySelector('.kanban-count[data-count="todo"]').textContent = counts['todo'];
    document.querySelector('.kanban-count[data-count="inprogress"]').textContent = counts['inprogress'];
    document.querySelector('.kanban-count[data-count="done"]').textContent = counts['done'];

    // Empty state handling
    Object.values(columns).forEach(col => {
        if (col.children.length === 0) {
            col.innerHTML = '<div style="text-align: center; color: #a5adba; font-size: 0.85em; padding: 20px 0; border: 2px dashed #dfe1e6; border-radius: 6px;">Kéo thả thẻ vào đây</div>';
        }
    });

    // Setup Dropzones
    Object.values(columns).forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            col.style.background = '#e3e5e8';
        });
        
        col.addEventListener('dragleave', () => {
            col.style.background = 'transparent';
        });

        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.style.background = 'transparent';
            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = col.dataset.status;
            
            const task = allTasks.find(t => t.id === taskId);
            if (task && task.status !== newStatus) {
                // Ensure permission
                const isAssignee = task.assigneeIds && currentUserProfile && task.assigneeIds.includes(currentUserProfile.id);
                if (!isPMUser && !isAssignee) {
                    alert("Bạn không có quyền chuyển trạng thái task này.");
                    return;
                }

                try {
                    const ref = doc(db, "tasks", taskId);
                    let endDate = task.endDate || "";
                    if (newStatus === "done" && !endDate) {
                        endDate = new Date().toISOString().split('T')[0];
                    }
                    
                    await updateDoc(ref, {
                        status: newStatus,
                        endDate: endDate,
                        updatedAt: new Date()
                    });
                    
                    if (window.logUserAction) window.logUserAction("Kéo thả chuyển trạng thái task thành " + newStatus);
                } catch(err) {
                    alert("Lỗi khi chuyển trạng thái: " + err.message);
                }
            }
        });
    });
    
    // Re-apply filters for Kanban
    filterTasks();
}

function openKanbanModal(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById("kanbanTaskModal");
    const isAssignee = task.assigneeIds && currentUserProfile && task.assigneeIds.includes(currentUserProfile.id);
    const canEditFull = isPMUser || isAssignee;

    document.getElementById("kanbanModalDisplayId").textContent = task.displayId || 'TASK';
    
    const inputs = {
        name: document.getElementById("kanbanModalName"),
        priority: document.getElementById("kanbanModalPriority"),
        status: document.getElementById("kanbanModalStatus"),
        branch: document.getElementById("kanbanModalBranch"),
        sprint: document.getElementById("kanbanModalSprint"),
        category: document.getElementById("kanbanModalCategory"),
        start: document.getElementById("kanbanModalStart"),
        deadline: document.getElementById("kanbanModalDeadline"),
        end: document.getElementById("kanbanModalEnd"),
        note: document.getElementById("kanbanModalNote")
    };

    inputs.name.value = task.name || '';
    if(inputs.priority) inputs.priority.value = task.priority || 'medium';
    inputs.status.value = task.status || 'todo';
    inputs.branch.value = task.branch || '';
    inputs.sprint.value = task.sprint || '';
    inputs.category.value = task.category || '';
    inputs.start.value = task.startDate || '';
    inputs.deadline.value = task.deadline || '';
    inputs.end.value = task.endDate || '';
    inputs.note.value = task.note || '';

    // Commits
    const commitsContainer = document.getElementById("kanbanModalCommits");
    commitsContainer.innerHTML = (task.commits && task.commits.length > 0) ? task.commits.map(c => 
        `<div style="margin-bottom: 4px; border-bottom: 1px dashed #ccc; padding-bottom: 2px;">
            <a href="${c.url}" target="_blank" style="color: #2196F3; font-weight: bold;">${c.message || 'Commit'}</a>
            <span style="color: #888; font-size: 0.9em; margin-left: 5px;">(${new Date(c.timestamp).toLocaleString()})</span>
        </div>`
    ).join('') : '<span style="color:#999;">Chưa có commit</span>';

    // Assignees & Tags logic
    const hiddenAssignees = document.getElementById("kanbanModalAssignees");
    const assigneesContainer = document.getElementById("kanbanModalAssigneesContainer");
    hiddenAssignees.value = JSON.stringify(task.assigneeIds || []);
    renderChips(task.assigneeIds || [], assigneesContainer);

    const hiddenTags = document.getElementById("kanbanModalTags");
    const tagsContainer = document.getElementById("kanbanModalTagsContainer");
    
    let currentTags = task.tags || [];
    hiddenTags.value = JSON.stringify(currentTags);
    
    const renderModalTags = () => {
        let tgs = [];
        try { tgs = JSON.parse(hiddenTags.value); } catch(e){}
        tagsContainer.innerHTML = '';
        tgs.forEach((tag, idx) => {
            const tSpan = document.createElement('span');
            tSpan.style = "background: #f1f3f4; color: #3c4043; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #dadce0;";
            if (isPMUser) {
                tSpan.innerHTML = `<span>#${tag}</span> <strong style="cursor:pointer; color:#d32f2f;" title="Xóa tag này">×</strong>`;
                tSpan.querySelector('strong').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    tgs.splice(idx, 1);
                    hiddenTags.value = JSON.stringify(tgs);
                    renderModalTags();
                    btnSaveKanbanTask.style.display = 'inline-block';
                });
            } else {
                tSpan.innerHTML = `<span>#${tag}</span>`;
            }
            tagsContainer.appendChild(tSpan);
        });
        
        if (canEditFull) {
            const addBtn = document.createElement('button');
            addBtn.textContent = "+ Tag";
            addBtn.style = "background: transparent; color: var(--primary-color); border: 1px dashed var(--primary-color); border-radius: 4px; font-size: 0.75em; padding: 2px 6px; cursor: pointer;";
            addBtn.onclick = () => {
                const newTag = prompt("Nhập tên Tag mới:");
                if(newTag && newTag.trim()) {
                    tgs.push(newTag.trim().toLowerCase());
                    hiddenTags.value = JSON.stringify(tgs);
                    renderModalTags();
                    btnSaveKanbanTask.style.display = 'inline-block';
                }
            };
            tagsContainer.appendChild(addBtn);
        }
    };
    renderModalTags();

    // Permissions
    Object.values(inputs).forEach(inp => {
        inp.disabled = !canEditFull;
        if (!canEditFull) {
            inp.style.background = "transparent";
            inp.style.border = "none";
        } else {
            inp.style.background = "";
            inp.style.border = "";
        }
    });

    if (canEditFull) {
        assigneesContainer.style.pointerEvents = "auto";
        assigneesContainer.onclick = () => {
            openAssigneeModal(hiddenAssignees, assigneesContainer);
        };
    } else {
        assigneesContainer.style.pointerEvents = "none";
    }

    // Save Logic
    const btnSaveKanbanTask = document.getElementById("btnSaveKanbanTask");
    btnSaveKanbanTask.style.display = 'none';

    const checkDirty = () => {
        if (canEditFull) btnSaveKanbanTask.style.display = 'inline-block';
    };

    Object.values(inputs).forEach(inp => {
        inp.oninput = checkDirty;
        inp.onchange = checkDirty;
    });
    hiddenAssignees.addEventListener('input', checkDirty);
    hiddenTags.addEventListener('input', checkDirty);

    // We overwrite the click handler to avoid multiple bindings
    btnSaveKanbanTask.onclick = async () => {
        try {
            const ref = doc(db, "tasks", taskId);
            
            const assigneeIds = hiddenAssignees.value ? JSON.parse(hiddenAssignees.value) : [];
            const tags = hiddenTags.value ? JSON.parse(hiddenTags.value) : [];
            
            let updateData = { 
                name: inputs.name.value.trim(), 
                status: inputs.status.value, 
                priority: inputs.priority ? inputs.priority.value : 'medium', 
                branch: inputs.branch.value.trim(), 
                assigneeIds: assigneeIds, 
                tags: tags,
                sprint: inputs.sprint.value.trim(), 
                category: inputs.category.value.trim(), 
                startDate: inputs.start.value, 
                deadline: inputs.deadline.value, 
                endDate: inputs.end.value, 
                note: inputs.note.value.trim(),
                updatedAt: new Date() 
            };

            await updateDoc(ref, updateData);
            
            if (window.logUserAction) window.logUserAction("Cập nhật chi tiết task từ Kanban");
            modal.style.display = "none";
        } catch (e) {
            alert("Lỗi: " + e.message);
        }
    };

    document.getElementById("btnCancelKanbanTask").onclick = () => {
        modal.style.display = "none";
    };

    // Show modal
    modal.style.display = "flex";
}


function renderMatrixView(tasksArray) {
    const q1 = document.getElementById('matrix-q1');
    const q2 = document.getElementById('matrix-q2');
    const q3 = document.getElementById('matrix-q3');
    const q4 = document.getElementById('matrix-q4');
    
    if(!q1 || !q2 || !q3 || !q4) return;
    
    [q1, q2, q3, q4].forEach(col => col.innerHTML = '');

    tasksArray.forEach(t => {
        if (t.isDeleted || t.status === 'done') return; // Don't show deleted or done tasks in Matrix
        
        let isImportant = t.priority === 'urgent' || t.priority === 'high';
        
        let isUrgent = false;
        if (t.deadline) {
            const deadlineDate = new Date(t.deadline);
            deadlineDate.setHours(0,0,0,0);
            const today = new Date();
            today.setHours(0,0,0,0);
            const diffTime = deadlineDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 1) isUrgent = true;
        }

        let targetCol = null;
        if (isImportant && isUrgent) targetCol = q1;
        else if (isImportant && !isUrgent) targetCol = q2;
        else if (!isImportant && isUrgent) targetCol = q3;
        else targetCol = q4;
        
        const card = document.createElement('div');
        card.className = 'matrix-card min-card';
        card.dataset.status = t.status;
        card.dataset.priority = t.priority || 'medium';
        card.dataset.assignees = JSON.stringify(t.assigneeIds || []);
        card.dataset.tags = JSON.stringify(t.tags || []);
        card.dataset.category = t.category || "";
        card.dataset.sprint = t.sprint || "";
        card.style.cssText = `border-left: 3px solid ${t.status === 'backlog' ? '#9E9E9E' : t.status === 'todo' ? '#2196F3' : '#FF9800'};`;
        
        const taskPriority = t.priority || 'medium';
        const priorityIcon = taskPriority === 'urgent' ? '🔴' : taskPriority === 'high' ? '🟠' : taskPriority === 'low' ? '🔵' : '🟡';
        
        let dateHtml = t.deadline ? `<span style="font-size: 0.75em; color: ${isUrgent ? 'var(--status-danger)' : '#666'};">⏱️ ${t.deadline}</span>` : '';
        
        const assigneesHtml = (t.assigneeIds || []).map(id => {
            const dev = projectDevs.find(d => d.id === id);
            return dev ? `<span title="${dev.fullName}" class="min-avatar">${dev.fullName.charAt(0)}</span>` : '';
        }).join('');

        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-id">${t.displayId || 'TASK'} ${priorityIcon}</span>
                ${typeof badgeHtml !== 'undefined' ? badgeHtml : (typeof dateHtml !== 'undefined' ? dateHtml : '')}
            </div>
            <div class="card-title">${t.name}</div>
            <div class="card-footer">
                <span class="card-status-badge">${t.status.toUpperCase()}</span>
                <div style="display: flex; padding-left: 5px;">${assigneesHtml}</div>
            </div>
        `;
        
        card.addEventListener('click', () => openKanbanModal(t.id));
        targetCol.appendChild(card);
    });

    [q1, q2, q3, q4].forEach(col => {
        if (col.children.length === 0) {
            col.innerHTML = '<div style="text-align: center; color: #a5adba; font-size: 0.85em; padding: 20px 0; border: 2px dashed #dfe1e6; border-radius: 6px;">Không có thẻ nào</div>';
        }
    });
}


function renderGanttView(tasksArray) {
    const body = document.getElementById('ganttChartBody');
    const header = document.getElementById('ganttTimelineHeader');
    if(!body || !header) return;
    
    body.innerHTML = '';
    
    // Filter out tasks with no dates and done tasks if we want (let's keep done tasks for history)
    let tasksWithDates = tasksArray.filter(t => !t.isDeleted && (t.startDate || t.deadline || t.createdAt));
    
    if(tasksWithDates.length === 0) {
        body.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Không có dữ liệu ngày tháng</div>';
        header.innerHTML = 'TIMELINE';
        return;
    }
    
    // Find absolute min and max date
    let minTime = Infinity;
    let maxTime = -Infinity;
    
    tasksWithDates.forEach(t => {
        let start = t.startDate ? new Date(t.startDate).getTime() : (t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().getTime() : Date.now());
        let end = t.deadline ? new Date(t.deadline).getTime() : start + (24*60*60*1000); // default 1 day later
        
        // Fix inverted dates
        if (end < start) end = start + (24*60*60*1000);
        
        t._startMs = start;
        t._endMs = end;
        
        if(start < minTime) minTime = start;
        if(end > maxTime) maxTime = end;
    });
    
    // Add 10% padding to left and right
    const padding = (maxTime - minTime) * 0.1 || (24*60*60*1000 * 5); // fallback 5 days padding
    minTime -= padding;
    maxTime += padding;
    const totalMs = maxTime - minTime;
    
    // Render Header dates
    const dMin = new Date(minTime).toLocaleDateString('vi-VN');
    const dMax = new Date(maxTime).toLocaleDateString('vi-VN');
    header.innerHTML = `<div style="display:flex; justify-content:space-between; width: 100%; color: #999;">
        <span>${dMin}</span>
        <span>TIMELINE</span>
        <span>${dMax}</span>
    </div>`;

    // Sort by start date
    tasksWithDates.sort((a,b) => a._startMs - b._startMs);

    tasksWithDates.forEach(t => {
        const leftPct = Math.max(0, ((t._startMs - minTime) / totalMs) * 100);
        let widthPct = Math.max(1, ((t._endMs - t._startMs) / totalMs) * 100);
        if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
        
        let color = '#2196F3'; // Todo
        if(t.status === 'done') color = '#4CAF50';
        else if(t.status === 'inprogress') color = '#FF9800';
        else if(t.status === 'backlog') color = '#9E9E9E';
        
        const isLate = (t.status !== 'done' && t._endMs < Date.now());
        if(isLate) color = '#F44336';
        
        const row = document.createElement('div');
        row.className = 'gantt-row gantt-row-item';
        row.dataset.status = t.status;
        row.dataset.priority = t.priority || 'medium';
        row.dataset.assignees = JSON.stringify(t.assigneeIds || []);
        row.dataset.tags = JSON.stringify(t.tags || []);
        row.dataset.category = t.category || "";
        row.dataset.sprint = t.sprint || "";
        
        
        
        
        const assigneesHtml = (t.assigneeIds || []).map(id => {
            const dev = projectDevs.find(d => d.id === id);
            return dev ? `<span title="${dev.fullName}" style="background: #e3f2fd; color: #1976d2; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6em; font-weight: bold; border: 1px solid white; margin-left: -5px;">${dev.fullName.charAt(0)}</span>` : '';
        }).join('');

        row.innerHTML = `
            <div class="gantt-label" title="${t.name}">
                <span style="color: var(--primary-color); font-weight: bold; font-size: 0.8em;">${t.displayId || ''}</span>
                ${t.name}
                <div style="display:flex; margin-left: auto; padding-right: 5px;">${assigneesHtml}</div>
            </div>
            <div class="gantt-timeline-bg">
                <div class="gantt-bar" style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; background: ${color};" title="Từ ${new Date(t._startMs).toLocaleDateString()} đến ${new Date(t._endMs).toLocaleDateString()}"></div>
            </div>
        `;
        
        row.addEventListener('click', () => openKanbanModal(t.id));
        
        body.appendChild(row);
    });
}
