import { db, collection, getDocs, doc, setDoc, writeBatch, deleteDoc, getDoc, query, where, or } from './firebase-config.js';
import { currentUserProfile as appUserProfile } from './app.js';

const projectListBody = document.getElementById("projectListBody");
const btnSaveAll = document.getElementById("btnSaveAll");

// Add Row elements
const btnInlineAdd = document.getElementById("btnInlineAdd");
const newNameInput = document.getElementById("newName");
const newDescInput = document.getElementById("newDesc");

// Modal Elements
const userPickerModal = document.getElementById("userPickerModal");
const closePickerBtn = document.getElementById("closePickerBtn");
const pickerSearchInput = document.getElementById("pickerSearchInput");
const pickerResults = document.getElementById("pickerResults");
const pickerModalTitle = document.getElementById("pickerModalTitle");

// Global State
let allUsers = [];
let allTeachers = [];
let allStudents = [];
let allTemplates = [];

// Track selections for each row (including 'new' row)
// Format: { 'rowId': { po: null, pm: null, devs: [] } }
let rowStates = {
    'new': { po: null, pm: null, devs: [] }
};

let currentRowIdForPicker = null;
let currentPickerMode = ""; // "po", "pm", or "dev"
let currentUserProfile = null;
let currentCollection = "projects";

// Function to setup admin filter if user is admin
function setupAdminFilter(profile) {
    if (profile && profile.role === 'super_admin') {
        const pf = document.getElementById('projectFilter');
        if (pf && pf.style.display !== 'inline-block') {
            pf.style.display = 'inline-block';
            pf.addEventListener('change', async () => {
                currentCollection = pf.value;
                await loadProjects(currentCollection);
            });
        }
    }
}

// Wait for Auth to setup Admin filter
document.addEventListener("UserLoaded", async (e) => {
    currentUserProfile = e.detail;
    setupAdminFilter(currentUserProfile);
    await loadProjects(currentCollection);
});

document.addEventListener("DOMContentLoaded", async () => {
    if (appUserProfile) {
        currentUserProfile = appUserProfile;
        setupAdminFilter(currentUserProfile);
    }

    // 1. Fetch Users first so we can map IDs to names when rendering projects
    await loadUsersForDropdowns();
    await loadTemplatesForDropdown();
    
    // 2. Load Projects and render Grid
    if (currentUserProfile) {
        await loadProjects(currentCollection);
    }

    // 3. Setup Picker Modal logic
    setupPickerListeners();



    // 4. Setup Grid Search
    const searchProjectInput = document.getElementById("searchProjectInput");
    const statusFilter = document.getElementById("statusFilter");
    
    function filterProjects() {
        const keyword = searchProjectInput ? searchProjectInput.value.toLowerCase().trim() : "";
        const statusVal = statusFilter ? statusFilter.value : "all";
        
        const rows = document.querySelectorAll("#projectListBody tr:not(.add-row)");
        
        rows.forEach(row => {
            const textContent = row.textContent.toLowerCase();
            const name = row.querySelector(".edit-name") ? row.querySelector(".edit-name").value.toLowerCase() : "";
            const desc = row.querySelector(".edit-desc") ? row.querySelector(".edit-desc").value.toLowerCase() : "";
            const status = row.querySelector(".edit-status") ? row.querySelector(".edit-status").value : "";
            
            const matchKeyword = textContent.includes(keyword) || name.includes(keyword) || desc.includes(keyword);
            const matchStatus = (statusVal === "all") || (status === statusVal);
            
            if (matchKeyword && matchStatus) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        });
    }

    if (searchProjectInput) {
        searchProjectInput.addEventListener("input", filterProjects);
    }
    if (statusFilter) {
        statusFilter.addEventListener("change", filterProjects);
    }

    // Event listener for inline add (Tạo dự án mới)
    btnInlineAdd.addEventListener("click", async () => {
        const name = newNameInput.value.trim();
        const desc = newDescInput.value.trim();
        const templateInput = document.getElementById("newTemplate");
        const template = templateInput ? templateInput.value : "";
        
        const state = rowStates['new'];
        const teacherId = state.po ? state.po.id : "";
        const pmId = state.pm ? state.pm.id : "";
        let studentIds = state.devs.map(d => d.id);
        
        // Cần ít nhất tên dự án
        if (!name) {
            alert("Vui lòng nhập Tên Dự Án!");
            return;
        }

        // PM must be in the studentIds array as well (if pm is selected)
        if (pmId && !studentIds.includes(pmId)) {
            studentIds.push(pmId);
        }

        try {
            btnInlineAdd.disabled = true;
            btnInlineAdd.innerText = "Đang tạo...";
            
            const newProjRef = doc(collection(db, "projects"));
            const batch = writeBatch(db);
            
            batch.set(newProjRef, {
                name: name,
                description: desc,
                teacherId: teacherId,
                pmId: pmId,
                studentIds: studentIds,
                status: "active",
                createdAt: new Date()
            });

            // Nếu có dùng Template, tạo sẵn các Tasks (Use cases)
            if (template) {
                const selectedTemplate = allTemplates.find(t => t.id === template);
                if (selectedTemplate && selectedTemplate.tasks && Array.isArray(selectedTemplate.tasks)) {
                    selectedTemplate.tasks.forEach(task => {
                        const taskRef = doc(collection(db, "tasks"));
                        const randomCode = Math.floor(1000 + Math.random() * 9000);
                        batch.set(taskRef, {
                            displayId: `#TASK-${randomCode}`,
                            projectId: newProjRef.id,
                            name: task.name,
                            category: task.category || "",
                            sprint: "Sprint 1",
                            tags: [],
                            status: "todo",
                            assigneeIds: [],
                            branch: "",
                            commitUrl: "",
                            commits: [],
                            startDate: "",
                            deadline: "",
                            endDate: "",
                            note: "",
                            createdAt: new Date()
                        });
                    });
                }
            }
            
            await batch.commit();
            
            // Reset Add form
            newNameInput.value = "";
            newDescInput.value = "";
            if (templateInput) templateInput.value = "";
            rowStates['new'] = { po: null, pm: null, devs: [] };
            renderChipsForRow('new');
            
            if (window.logUserAction) window.logUserAction("Tạo Dự án mới");
            alert("Đã khởi tạo Dự án thành công!");
            await loadProjects(currentCollection); // refresh grid
            
            btnInlineAdd.disabled = false;
            btnInlineAdd.innerText = "Tạo Dự Án";
        } catch (error) {
            console.error("Lỗi tạo dự án:", error);
            alert("Lỗi: " + error.message);
            btnInlineAdd.disabled = false;
            btnInlineAdd.innerText = "Tạo Dự Án";
        }
    });

    // Event listener for Save All
    btnSaveAll.addEventListener("click", async () => {
        const dirtyRows = document.querySelectorAll("#projectListBody tr.dirty-row");
        if (dirtyRows.length === 0) return;

        try {
            const batch = writeBatch(db);
            
            dirtyRows.forEach(row => {
                const docId = row.dataset.id;
                const nameInput = row.querySelector(".edit-name").value.trim();
                const descInput = row.querySelector(".edit-desc").value.trim();
                const statusInput = row.querySelector(".edit-status").value;
                
                const state = rowStates[docId];
                if (state && nameInput) {
                    const teacherId = state.po ? state.po.id : "";
                    const pmId = state.pm ? state.pm.id : "";
                    let studentIds = state.devs.map(d => d.id);
                    if (pmId && !studentIds.includes(pmId)) studentIds.push(pmId);

                    const rowCol = row.dataset.col || "projects";
                    const ref = doc(db, rowCol, docId);
                    batch.update(ref, {
                        name: nameInput,
                        description: descInput,
                        status: statusInput,
                        teacherId: teacherId,
                        pmId: pmId,
                        studentIds: studentIds
                    });
                }
            });

            await batch.commit();
            if (window.logUserAction) window.logUserAction("Lưu thay đổi Dự Án");
            alert(`Đã lưu thành công ${dirtyRows.length} dự án!`);
            await loadProjects(currentCollection); // Refresh to clean dirty state
        } catch (err) {
            console.error("Lỗi khi lưu nhiều dòng:", err);
            alert("Lỗi: " + err.message);
        }
    });
});

async function loadUsersForDropdowns() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsers = querySnapshot.docs.map(d => ({id: d.id, ...d.data()}));
        
        allTeachers = allUsers.filter(u => u.role === "teacher" || u.role === "super_admin");
        allStudents = allUsers; // Everyone can be PM or Dev now
    } catch (err) {
        console.error("Lỗi tải users: ", err);
    }
}

async function loadTemplatesForDropdown() {
    try {
        const querySnapshot = await getDocs(collection(db, "templates"));
        allTemplates = querySnapshot.docs
            .map(d => ({id: d.id, ...d.data()}))
            .filter(t => t.status !== "deleted");
        
        const newTemplateSelect = document.getElementById("newTemplate");
        if (newTemplateSelect) {
            newTemplateSelect.innerHTML = `<option value="">(Tạo dự án trống - Không dùng Template)</option>`;
            allTemplates.forEach(t => {
                newTemplateSelect.innerHTML += `<option value="${t.id}">Template: ${t.name}</option>`;
            });
        }
    } catch (err) {
        console.error("Lỗi tải templates: ", err);
    }
}

function getUserInfo(userId) {
    if (!userId) return null;
    const u = allUsers.find(x => x.id === userId);
    return u ? { id: u.id, name: u.fullName, email: u.email } : null;
}

// ======================= PROJECT RENDER LOGIC =======================
async function loadProjects(collectionName = 'projects') {
    // Xóa tất cả trừ dòng tạo mới (add-row)
    Array.from(projectListBody.children).forEach(child => {
        if (!child.classList.contains("add-row")) {
            child.remove();
        }
    });
    
    btnSaveAll.style.display = "none";

    try {
        const projectsArray = [];

        if (collectionName === 'all') {
            const cols = ['projects', 'projects_archived', 'projects_deleted'];
            for (let c of cols) {
                let q;
                if (currentUserProfile.role === 'super_admin' || currentUserProfile.role === 'teacher') {
                    q = collection(db, c);
                } else {
                    q = query(collection(db, c), or(where("pmId", "==", currentUserProfile.email), where("studentIds", "array-contains", currentUserProfile.email)));
                }
                const qs = await getDocs(q);
                qs.forEach(docSnap => projectsArray.push({ id: docSnap.id, __col: c, ...docSnap.data() }));
            }
        } else {
            let q;
            if (currentUserProfile.role === 'super_admin' || currentUserProfile.role === 'teacher') {
                q = collection(db, collectionName);
            } else {
                q = query(collection(db, collectionName), or(where("pmId", "==", currentUserProfile.email), where("studentIds", "array-contains", currentUserProfile.email)));
            }
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(docSnap => projectsArray.push({ id: docSnap.id, __col: collectionName, ...docSnap.data() }));
        }

        if(projectsArray.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="4" style="text-align:center; padding: 20px; color: var(--text-secondary);">Chưa có dự án nào. Tự động tạo ở dòng đầu tiên.</td>`;
            projectListBody.appendChild(tr);
            return;
        }

        // Sắp xếp theo createdAt giảm dần (mới nhất lên trên)
        projectsArray.sort((a, b) => {
            let timeA = 0;
            if (a.createdAt && typeof a.createdAt.toDate === 'function') timeA = a.createdAt.toDate().getTime();
            else if (a.createdAt && a.createdAt.seconds) timeA = a.createdAt.seconds * 1000;
            else if (a.createdAt) timeA = new Date(a.createdAt).getTime();
            
            let timeB = 0;
            if (b.createdAt && typeof b.createdAt.toDate === 'function') timeB = b.createdAt.toDate().getTime();
            else if (b.createdAt && b.createdAt.seconds) timeB = b.createdAt.seconds * 1000;
            else if (b.createdAt) timeB = new Date(b.createdAt).getTime();

            return timeB - timeA;
        });

        projectsArray.forEach((p) => {
            const id = p.id;
            
            // Khởi tạo State cho row này
            let devs = [];
            if (p.studentIds && Array.isArray(p.studentIds)) {
                // Loại PM ra khỏi danh sách devs hiển thị (nếu muốn, hoặc gộp chung. Ở đây giữ nguyên danh sách)
                devs = p.studentIds.map(uid => getUserInfo(uid)).filter(x => x !== null);
                // Nhưng nếu dev chính là PM thì có thể ko cần add vào list chip dev, để tránh trùng lặp hiển thị.
                if (p.pmId) devs = devs.filter(d => d.id !== p.pmId);
            }

            rowStates[id] = {
                po: getUserInfo(p.teacherId),
                pm: getUserInfo(p.pmId),
                devs: devs
            };
            
            const tr = document.createElement("tr");
            tr.dataset.id = id;
            tr.dataset.col = p.__col;
            
            let colBadge = '';
            if (collectionName === 'all') {
                if (p.__col === 'projects') colBadge = '<span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: #E3F2FD; color: #1976D2; margin-left: 8px;">Đang chạy</span>';
                if (p.__col === 'projects_archived') colBadge = '<span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: #FFF3E0; color: #F57C00; margin-left: 8px;">Đã lưu trữ</span>';
                if (p.__col === 'projects_deleted') colBadge = '<span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: #FFEBEE; color: #D32F2F; margin-left: 8px;">Thùng rác</span>';
            }

            // Build HTML
            tr.innerHTML = `
                <td style="vertical-align: top;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
                        <input type="text" class="grid-input edit-name" value="${p.name || ''}" data-original="${p.name || ''}" style="font-weight: 600; flex: 1;">
                        ${colBadge}
                    </div>
                    <textarea class="grid-input edit-desc" data-original="${p.description || ''}" style="resize: vertical; min-height: 40px;">${p.description || ''}</textarea>
                </td>
                <td style="vertical-align: top;">
                    <div style="display: flex; gap: 5px; flex-direction: column;">
                        <div style="display: flex; align-items: start; gap: 10px;">
                            <span style="font-size: 0.85em; font-weight: 600; width: 40px; margin-top: 5px;">PO:</span>
                            <div style="flex: 1;">
                                <div class="chip-container" id="${id}-poContainer"></div>
                                <button type="button" class="btn-picker" data-picker-type="po" data-row-id="${id}" style="padding: 2px 8px; font-size: 0.8em; width: auto; display: inline-block;">+ Đổi PO</button>
                            </div>
                        </div>
                        <div style="display: flex; align-items: start; gap: 10px; margin-top: 5px;">
                            <span style="font-size: 0.85em; font-weight: 600; width: 40px; margin-top: 5px;">PM:</span>
                            <div style="flex: 1;">
                                <div class="chip-container" id="${id}-pmContainer"></div>
                                <button type="button" class="btn-picker" data-picker-type="pm" data-row-id="${id}" style="padding: 2px 8px; font-size: 0.8em; width: auto; display: inline-block;">+ Đổi PM</button>
                            </div>
                        </div>
                        <div style="display: flex; align-items: start; gap: 10px; margin-top: 5px;">
                            <span style="font-size: 0.85em; font-weight: 600; width: 40px; margin-top: 5px;">Devs:</span>
                            <div style="flex: 1;">
                                <div class="chip-container" id="${id}-devsContainer"></div>
                                <button type="button" class="btn-picker" data-picker-type="dev" data-row-id="${id}" style="padding: 2px 8px; font-size: 0.8em; width: auto; display: inline-block;">+ Thêm Dev</button>
                            </div>
                        </div>
                    </div>
                </td>
                <td style="vertical-align: top;">
                    <select class="grid-select edit-status" data-original="${p.status || 'active'}">
                        <option value="active" ${(p.status === 'active' || !p.status) ? 'selected' : ''}>Active</option>
                        <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${p.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <button class="icon-btn btn-save-row" title="Lưu dòng này" style="display: none;">💾</button>
                    ${p.__col === 'projects' ? `
                        <button class="icon-btn btn-archive-row" title="Lưu trữ dự án" style="color: #F57C00;">📦</button>
                        <button class="icon-btn btn-delete-row" title="Xóa mềm (Thùng rác)" style="color: var(--status-danger);">🗑️</button>
                        <button class="icon-btn btn-go-tasks" title="Vào bảng Tasks" style="color: var(--primary-color);">📋</button>
                    ` : ''}
                    ${p.__col === 'projects_archived' ? `
                        <button class="icon-btn btn-restore-row" title="Khôi phục dự án" style="color: #4CAF50;">♻️</button>
                        <button class="icon-btn btn-delete-row" title="Xóa mềm (Thùng rác)" style="color: var(--status-danger);">🗑️</button>
                        <button class="icon-btn btn-go-tasks" title="Vào bảng Tasks" style="color: var(--primary-color);">📋</button>
                    ` : ''}
                    ${p.__col === 'projects_deleted' ? `
                        <button class="icon-btn btn-restore-row" title="Khôi phục dự án" style="color: #4CAF50;">♻️</button>
                        <button class="icon-btn btn-hard-delete-row" title="Xóa vĩnh viễn (Không thể hoàn tác)" style="color: red; margin-left: 5px;">⚠️</button>
                    ` : ''}
                </td>
            `;

            projectListBody.appendChild(tr);
            
            // Vẽ Chip
            renderChipsForRow(id);

            // Add change listener to text inputs
            const inputs = tr.querySelectorAll('input, textarea, select');
            const saveBtn = tr.querySelector('.btn-save-row');
            const delBtn = tr.querySelector('.btn-delete-row');
            const archBtn = tr.querySelector('.btn-archive-row');
            const resBtn = tr.querySelector('.btn-restore-row');
            const goTasksBtn = tr.querySelector('.btn-go-tasks');
            
            // Xử lý Dirty Row
            inputs.forEach(input => {
                const handler = () => checkRowDirty(tr);
                input.addEventListener("input", handler);
                input.addEventListener("change", handler);
            });

            // Single Save listener
            saveBtn.addEventListener("click", async () => {
                const nameInput = tr.querySelector(".edit-name").value.trim();
                const descInput = tr.querySelector(".edit-desc").value.trim();
                const statusInput = tr.querySelector(".edit-status").value;
                
                const state = rowStates[id];
                const teacherId = state.po ? state.po.id : "";
                const pmId = state.pm ? state.pm.id : "";
                let studentIds = state.devs.map(d => d.id);
                if (pmId && !studentIds.includes(pmId)) studentIds.push(pmId);

                try {
                    const rowCol = tr.dataset.col || "projects";
                    const ref = doc(db, rowCol, id);
                    await setDoc(ref, {
                        name: nameInput,
                        description: descInput,
                        status: statusInput,
                        teacherId: teacherId,
                        pmId: pmId,
                        studentIds: studentIds
                    }, { merge: true });
                    
                    // Update originals
                    tr.querySelector(".edit-name").dataset.original = nameInput;
                    tr.querySelector(".edit-desc").dataset.original = descInput;
                    tr.querySelector(".edit-status").dataset.original = statusInput;
                    
                    // Remove Dirty Class manually because state check might be complex
                    tr.classList.remove("dirty-row");
                    saveBtn.style.display = "none";
                    if (document.querySelectorAll("#projectListBody tr.dirty-row").length === 0) {
                        btnSaveAll.style.display = "none";
                    }
                    alert("Đã lưu Dự án!");
                } catch (e) {
                    console.error(e);
                    alert("Lỗi lưu dự án: " + e.message);
                }
            });

            // Archive listener
            if (archBtn) {
                archBtn.addEventListener("click", async () => {
                    if (confirm(`Bạn muốn Lưu trữ dự án "${p.name}"?`)) {
                        await moveProjectTo(id, 'projects', 'projects_archived');
                    }
                });
            }

            // Go Tasks listener
            if (goTasksBtn) {
                goTasksBtn.addEventListener("click", () => {
                    window.location.href = `tasks.html?projectId=${id}`;
                });
            }

            // Delete listener
            if (delBtn) {
                delBtn.addEventListener("click", async () => {
                    if (confirm(`Bạn muốn Xóa dự án "${p.name}" vào thùng rác?`)) {
                        await moveProjectTo(id, 'projects', 'projects_deleted');
                    }
                });
            }
            
            // Restore listener
            if (resBtn) {
                resBtn.addEventListener("click", async () => {
                    if (confirm(`Bạn muốn Khôi phục dự án "${p.name}"?`)) {
                        await moveProjectTo(id, p.__col, 'projects');
                    }
                });
            }

            // Hard Delete listener
            const hardDelBtn = tr.querySelector('.btn-hard-delete-row');
            if (hardDelBtn) {
                hardDelBtn.addEventListener("click", async () => {
                    if (confirm(`CẢNH BÁO NGUY HIỂM: Xóa vĩnh viễn dự án "${p.name}"?\nToàn bộ Tasks (Use Cases) của dự án này cũng sẽ bị xóa vĩnh viễn và không thể khôi phục!`)) {
                        await hardDeleteProject(id, p.__col);
                    }
                });
            }
        });
        
        // Cần gắn lại sự kiện cho tất cả btn-picker vì DOM vừa render
        bindPickers();

    } catch(err) {
        console.error(err);
        const errTr = document.createElement("tr");
        errTr.innerHTML = `<td colspan="4" style="text-align:center; color:red;">Lỗi tải dữ liệu: ${err.message}</td>`;
        projectListBody.appendChild(errTr);
    }
}

function checkRowDirty(tr) {
    let isDirty = false;
    const inputs = tr.querySelectorAll('input.grid-input, textarea.grid-input, select.grid-select');
    
    // Check text/select changes
    inputs.forEach(input => {
        if (input.value !== input.dataset.original) {
            isDirty = true;
        }
    });
    
    // Lưu ý: với State PO/PM/Devs, logic bắt dirty tự động sẽ phức tạp. 
    // Tạm thời ta ép nó dirty mỗi khi thay đổi Chip thông qua hàm renderChipsForRow.
    
    const saveBtn = tr.querySelector('.btn-save-row');
    if (isDirty) {
        tr.classList.add("dirty-row");
        if(saveBtn) saveBtn.style.display = "inline-block";
        btnSaveAll.style.display = "flex";
    } else {
        tr.classList.remove("dirty-row");
        if(saveBtn) saveBtn.style.display = "none";
        if (document.querySelectorAll("#projectListBody tr.dirty-row").length === 0) {
            btnSaveAll.style.display = "none";
        }
    }
}

function markRowDirtyById(rowId) {
    if(rowId === 'new') return; // Dòng new không cần hiện nút Save riêng, dùng nút Tạo
    
    const tr = document.querySelector(`tr[data-id="${rowId}"]`);
    if(tr) {
        tr.classList.add("dirty-row");
        const saveBtn = tr.querySelector('.btn-save-row');
        if(saveBtn) saveBtn.style.display = "inline-block";
        btnSaveAll.style.display = "flex";
    }
}

// ======================= CHIP RENDER LOGIC =======================
function renderChipsForRow(rowId) {
    const state = rowStates[rowId];
    if(!state) return;
    
    // Resolve container IDs
    const prefix = rowId === 'new' ? 'new' : rowId + '-';
    const poCont = document.getElementById(prefix + (rowId === 'new' ? 'POContainer' : 'poContainer'));
    const pmCont = document.getElementById(prefix + (rowId === 'new' ? 'PMContainer' : 'pmContainer'));
    const devsCont = document.getElementById(prefix + (rowId === 'new' ? 'DevsContainer' : 'devsContainer'));

    if(poCont) {
        poCont.innerHTML = "";
        if (state.po) {
            poCont.appendChild(createChip(state.po, () => { state.po = null; renderChipsForRow(rowId); markRowDirtyById(rowId); }));
        }
    }
    
    if(pmCont) {
        pmCont.innerHTML = "";
        if (state.pm) {
            pmCont.appendChild(createChip(state.pm, () => { state.pm = null; renderChipsForRow(rowId); markRowDirtyById(rowId); }));
        }
    }
    
    if(devsCont) {
        devsCont.innerHTML = "";
        state.devs.forEach(dev => {
            devsCont.appendChild(createChip(dev, () => {
                state.devs = state.devs.filter(d => d.id !== dev.id);
                renderChipsForRow(rowId);
                markRowDirtyById(rowId);
            }));
        });
    }
}

function createChip(userObj, onRemoveCallback) {
    const div = document.createElement("div");
    div.className = "user-chip";
    // Thêm style nhỏ cho grid đỡ tốn diện tích
    div.style.padding = "2px 8px";
    div.style.fontSize = "0.85em";
    
    div.innerHTML = `
        ${userObj.name}
        <button type="button" class="remove-chip" title="Xóa">&times;</button>
    `;
    div.querySelector(".remove-chip").addEventListener("click", onRemoveCallback);
    return div;
}

// ======================= PICKER LOGIC =======================
function setupPickerListeners() {
    // Initial bindings for 'new' row
    bindPickers();

    // Close Picker
    closePickerBtn.addEventListener("click", () => {
        userPickerModal.classList.remove("show");
    });

    // Close when clicking outside modal content
    userPickerModal.addEventListener("click", (e) => {
        if (e.target === userPickerModal) {
            userPickerModal.classList.remove("show");
        }
    });

    // Search Input Typing
    pickerSearchInput.addEventListener("input", (e) => {
        renderSearchResults(e.target.value);
    });
}

function bindPickers() {
    document.querySelectorAll(".btn-picker").forEach(btn => {
        // Tránh bind nhiều lần
        const clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
        
        clone.addEventListener("click", (e) => {
            currentPickerMode = e.target.dataset.pickerType;
            currentRowIdForPicker = e.target.dataset.rowId;
            openPickerModal();
        });
    });
}

function openPickerModal() {
    pickerSearchInput.value = "";
    
    if (currentPickerMode === "po") {
        pickerModalTitle.innerText = "Chọn Giảng viên (PO)";
    } else if (currentPickerMode === "pm") {
        pickerModalTitle.innerText = "Chọn Trưởng nhóm (PM)";
    } else {
        pickerModalTitle.innerText = "Thêm Thành viên (Dev)";
    }
    
    renderSearchResults("");
    userPickerModal.classList.add("show");
    pickerSearchInput.focus();
}

function renderSearchResults(keyword) {
    const kw = keyword.toLowerCase().trim();
    let sourceArray = [];
    
    if (currentPickerMode === "po") {
        sourceArray = allTeachers;
    } else {
        sourceArray = allStudents;
    }

    const filtered = sourceArray.filter(u => 
        u.fullName.toLowerCase().includes(kw) || 
        u.email.toLowerCase().includes(kw)
    );

    pickerResults.innerHTML = "";
    
    if (filtered.length === 0) {
        pickerResults.innerHTML = '<div style="padding: 10px; color: gray; text-align: center;">Không tìm thấy người dùng phù hợp</div>';
        return;
    }

    const state = rowStates[currentRowIdForPicker];

    filtered.forEach(u => {
        // Check if already selected in current row
        let isAlreadySelected = false;
        if (currentPickerMode === "po" && state.po && state.po.id === u.id) isAlreadySelected = true;
        if (currentPickerMode === "pm" && state.pm && state.pm.id === u.id) isAlreadySelected = true;
        if (currentPickerMode === "dev" && state.devs.find(d => d.id === u.id)) isAlreadySelected = true;

        const div = document.createElement("div");
        div.className = "picker-list-item";
        if (isAlreadySelected) {
            div.style.opacity = "0.5";
            div.style.cursor = "not-allowed";
        }
        
        div.innerHTML = `
            <span class="pi-name">${u.fullName} ${isAlreadySelected ? '(Đã chọn)' : ''}</span>
            <span class="pi-email">${u.email}</span>
        `;
        
        if (!isAlreadySelected) {
            div.addEventListener("click", () => handlePickUser(u));
        }
        pickerResults.appendChild(div);
    });
}

function handlePickUser(userObj) {
    const state = rowStates[currentRowIdForPicker];
    
    if (currentPickerMode === "po") {
        state.po = { id: userObj.id, name: userObj.fullName, email: userObj.email };
    } else if (currentPickerMode === "pm") {
        state.pm = { id: userObj.id, name: userObj.fullName, email: userObj.email };
    } else if (currentPickerMode === "dev") {
        state.devs.push({ id: userObj.id, name: userObj.fullName, email: userObj.email });
    }
    
    renderChipsForRow(currentRowIdForPicker);
    markRowDirtyById(currentRowIdForPicker);
    
    userPickerModal.classList.remove("show");
}


// ======================= BATCH MOVE PROJECT LOGIC =======================
async function moveProjectTo(projectId, fromCol, toCol) {
    try {
        const batch = writeBatch(db);
        
        // Move project document
        const pRef = doc(db, fromCol, projectId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
            throw new Error("Không tìm thấy dự án.");
        }
        batch.set(doc(db, toCol, projectId), pSnap.data());
        batch.delete(pRef);
        
        // Move associated tasks
        const taskFromCol = fromCol === 'projects' ? 'tasks' : (fromCol === 'projects_archived' ? 'tasks_archived' : 'tasks_deleted');
        const taskToCol = toCol === 'projects' ? 'tasks' : (toCol === 'projects_archived' ? 'tasks_archived' : 'tasks_deleted');
        
        const q = query(collection(db, taskFromCol), where("projectId", "==", projectId));
        const tasksSnap = await getDocs(q);
        
        tasksSnap.forEach(tDoc => {
            batch.set(doc(db, taskToCol, tDoc.id), tDoc.data());
            batch.delete(tDoc.ref);
        });
        
        await batch.commit();
        alert("Đã di chuyển dự án thành công!");
        
        // Refresh grid
        await loadProjects(currentCollection);
        
    } catch (e) {
        console.error("Lỗi di chuyển dự án:", e);
        alert("Lỗi di chuyển dự án: " + e.message);
    }
}

async function hardDeleteProject(projectId, fromCol) {
    try {
        const batch = writeBatch(db);
        
        // Delete project document
        const pRef = doc(db, fromCol, projectId);
        batch.delete(pRef);
        
        // Delete associated tasks
        const taskCol = fromCol === 'projects' ? 'tasks' : (fromCol === 'projects_archived' ? 'tasks_archived' : 'tasks_deleted');
        const q = query(collection(db, taskCol), where("projectId", "==", projectId));
        const tasksSnap = await getDocs(q);
        
        tasksSnap.forEach(tDoc => {
            batch.delete(tDoc.ref);
        });
        
        await batch.commit();
        if (window.logUserAction) window.logUserAction("Xóa vĩnh viễn Dự án");
        alert("Đã xóa vĩnh viễn dự án và toàn bộ các task liên quan.");
        
        // Refresh grid
        await loadProjects(currentCollection);
        
    } catch (e) {
        console.error("Lỗi xóa vĩnh viễn dự án:", e);
        alert("Lỗi xóa dự án: " + e.message);
    }
}
