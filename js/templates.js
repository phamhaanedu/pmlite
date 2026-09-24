import { db, auth, collection, addDoc, onSnapshot, query, serverTimestamp, doc, updateDoc, deleteDoc } from './firebase-config.js';

let templatesList = [];
let unsubscribeTemplates = null;

const templatesContainer = document.getElementById("templatesContainer");
const searchTemplateInput = document.getElementById("searchTemplateInput");

// Modal Elements
const templateEditModal = document.getElementById("templateEditModal");
const closeTemplateModalBtn = document.getElementById("closeTemplateModalBtn");
const btnAddNewTemplate = document.getElementById("btnAddNewTemplate");
const btnCancelTemplate = document.getElementById("btnCancelTemplate");
const btnSaveTemplate = document.getElementById("btnSaveTemplate");

const modalTemplateId = document.getElementById("modalTemplateId");
const modalTemplateName = document.getElementById("modalTemplateName");
const modalTemplateDesc = document.getElementById("modalTemplateDesc");
const templateTasksContainer = document.getElementById("templateTasksContainer");
const btnAddTaskToTemplate = document.getElementById("btnAddTaskToTemplate");
const templateModalTitle = document.getElementById("templateModalTitle");

// Wait for user to be loaded
document.addEventListener("UserLoaded", (e) => {
    const profile = e.detail;
    if (profile.role !== "super_admin" && profile.role !== "teacher") {
        alert("Bạn không có quyền truy cập trang này.");
        window.location.href = "index.html";
        return;
    }
    
    // Load templates
    const qTemplates = query(collection(db, "templates"));
    unsubscribeTemplates = onSnapshot(qTemplates, (snapshot) => {
        templatesList = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            templatesList.push({ id: doc.id, ...data });
        });
        renderTemplates();
    }, (error) => {
        console.error("Error fetching templates:", error);
    });
});

document.addEventListener("UserLoggedOut", () => {
    if (unsubscribeTemplates) unsubscribeTemplates();
    templatesList = [];
    renderTemplates();
});

function renderTemplates() {
    if (!templatesContainer) return;
    templatesContainer.innerHTML = "";
    
    const searchTerm = searchTemplateInput ? searchTemplateInput.value.toLowerCase().trim() : "";
    
    let filtered = templatesList.filter(t => {
        if (!searchTerm) return true;
        return (t.name || "").toLowerCase().includes(searchTerm) || (t.description || "").toLowerCase().includes(searchTerm);
    });

    if (filtered.length === 0) {
        templatesContainer.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-secondary); background: var(--surface-color); border-radius: 8px;">Không tìm thấy template nào.</div>`;
        return;
    }

    filtered.forEach(template => {
        const numTasks = (template.tasks && Array.isArray(template.tasks)) ? template.tasks.length : 0;
        
        const isDeleted = template.status === "deleted";
        const card = document.createElement("div");
        card.className = "project-card";
        if (isDeleted) {
            card.style.opacity = "0.6";
            card.style.border = "1px dashed var(--border-color)";
        }
        
        card.innerHTML = `
            <div class="project-header">
                <h4 class="project-title">${template.name || "Không tên"} ${isDeleted ? '<span style="color: var(--status-danger); font-size: 0.8em;">(Đã xóa)</span>' : ''}</h4>
                <div class="project-actions">
                    ${isDeleted ? `
                    <button class="icon-btn btn-restore-template" data-id="${template.id}" style="color: var(--status-success);" title="Khôi phục Template">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                    </button>
                    ` : `
                    <button class="icon-btn btn-edit-template" data-id="${template.id}" title="Sửa Template">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="icon-btn btn-delete-template" data-id="${template.id}" style="color: var(--status-danger);" title="Xóa Template">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                    `}
                </div>
            </div>
            <div style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 15px; min-height: 40px;">
                ${template.description || "Không có mô tả"}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
                <span class="badge badge-primary" style="background: var(--background-color); color: var(--text-secondary);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    ${numTasks} Tasks
                </span>
            </div>
        `;
        
        // Events
        if (isDeleted) {
            const btnRestore = card.querySelector(".btn-restore-template");
            if (btnRestore) {
                btnRestore.addEventListener("click", async () => {
                    if (confirm("Bạn có chắc chắn muốn khôi phục Template này?")) {
                        try {
                            await updateDoc(doc(db, "templates", template.id), {
                                status: "active",
                                updatedAt: serverTimestamp()
                            });
                            window.logUserAction(`Khôi phục template: ${template.name}`);
                        } catch(error) {
                            console.error(error);
                            alert("Lỗi khi khôi phục template!");
                        }
                    }
                });
            }
        } else {
            const btnEdit = card.querySelector(".btn-edit-template");
            if (btnEdit) btnEdit.addEventListener("click", () => openTemplateModal(template));
            
            const btnDelete = card.querySelector(".btn-delete-template");
            if (btnDelete) {
                btnDelete.addEventListener("click", async () => {
                    if (confirm("Bạn có chắc chắn muốn xóa Template này?")) {
                        try {
                            await updateDoc(doc(db, "templates", template.id), {
                                status: "deleted",
                                updatedAt: serverTimestamp()
                            });
                            window.logUserAction(`Xóa template: ${template.name}`);
                        } catch(error) {
                            console.error(error);
                            alert("Lỗi khi xóa template!");
                        }
                    }
                });
            }
        }

        templatesContainer.appendChild(card);
    });
}

if (searchTemplateInput) {
    searchTemplateInput.addEventListener("input", renderTemplates);
}

// ----------------------------------------------------
// Modal Logic
// ----------------------------------------------------

let currentModalTasks = [];
let draggedTaskIndex = null;

function openTemplateModal(template = null) {
    if (template) {
        templateModalTitle.textContent = "Chỉnh sửa Template";
        modalTemplateId.value = template.id;
        modalTemplateName.value = template.name || "";
        modalTemplateDesc.value = template.description || "";
        currentModalTasks = (template.tasks && Array.isArray(template.tasks)) ? JSON.parse(JSON.stringify(template.tasks)) : [];
    } else {
        templateModalTitle.textContent = "Tạo Template Mới";
        modalTemplateId.value = "";
        modalTemplateName.value = "";
        modalTemplateDesc.value = "";
        currentModalTasks = [];
    }
    
    renderModalTasks();
    templateEditModal.classList.add("show");
}

function closeTemplateModal() {
    templateEditModal.classList.remove("show");
}

if (btnAddNewTemplate) btnAddNewTemplate.addEventListener("click", () => openTemplateModal(null));
if (closeTemplateModalBtn) closeTemplateModalBtn.addEventListener("click", closeTemplateModal);
if (btnCancelTemplate) btnCancelTemplate.addEventListener("click", closeTemplateModal);

// Close on background click
templateEditModal.addEventListener("click", (e) => {
    if (e.target === templateEditModal) closeTemplateModal();
});

// Manage Tasks in Modal
function renderModalTasks() {
    templateTasksContainer.innerHTML = "";
    
    if (currentModalTasks.length === 0) {
        templateTasksContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary); background: var(--background-color); border-radius: 4px; font-style: italic;">Chưa có task nào. Bấm "Thêm Task" để bắt đầu.</div>`;
        return;
    }
    
    currentModalTasks.forEach((task, index) => {
        const row = document.createElement("div");
        row.style.cssText = "display: flex; gap: 10px; align-items: center; background: var(--background-color); padding: 10px; border-radius: 4px; border: 1px solid var(--border-color); margin-bottom: 8px; transition: opacity 0.2s;";
        row.draggable = true;
        
        row.innerHTML = `
            <div style="cursor: grab; color: var(--text-secondary); display: flex; align-items: center; padding: 0 5px;" class="drag-handle" title="Kéo thả để di chuyển">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
            <div style="flex: 2;">
                <input type="text" class="grid-input task-name-input" value="${task.name || ""}" placeholder="Tên Task (Use Case)" style="width: 100%; font-weight: 500;">
            </div>
            <div style="flex: 1;">
                <input type="text" class="grid-input task-cat-input" value="${task.category || ""}" placeholder="Category (vd: Design, Art)" style="width: 100%;">
            </div>
            <button class="icon-btn btn-remove-task" style="color: var(--status-danger); padding: 8px;" title="Xóa Task này">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        
        // Sync inputs back to array
        const nameInput = row.querySelector(".task-name-input");
        const catInput = row.querySelector(".task-cat-input");
        
        nameInput.addEventListener("input", (e) => { currentModalTasks[index].name = e.target.value; });
        catInput.addEventListener("input", (e) => { currentModalTasks[index].category = e.target.value; });
        
        // Remove task
        row.querySelector(".btn-remove-task").addEventListener("click", () => {
            currentModalTasks.splice(index, 1);
            renderModalTasks();
        });
        
        // Drag and drop events
        row.addEventListener("dragstart", (e) => {
            draggedTaskIndex = index;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", index);
            setTimeout(() => row.style.opacity = "0.5", 0);
        });
        
        row.addEventListener("dragend", () => {
            row.style.opacity = "1";
            draggedTaskIndex = null;
        });
        
        row.addEventListener("dragover", (e) => {
            e.preventDefault(); // Necessary to allow dropping
            row.style.borderTop = "2px solid var(--primary-color)";
        });
        
        row.addEventListener("dragleave", () => {
            row.style.borderTop = "1px solid var(--border-color)";
        });
        
        row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.style.borderTop = "1px solid var(--border-color)";
            
            const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
            const targetIndex = index;
            
            if (sourceIndex !== targetIndex && !isNaN(sourceIndex)) {
                // Reorder array
                const movedTask = currentModalTasks.splice(sourceIndex, 1)[0];
                currentModalTasks.splice(targetIndex, 0, movedTask);
                renderModalTasks(); // Re-render everything with new order
            }
        });
        
        templateTasksContainer.appendChild(row);
    });
}

if (btnAddTaskToTemplate) {
    btnAddTaskToTemplate.addEventListener("click", () => {
        currentModalTasks.push({ name: "", category: "" });
        renderModalTasks();
        
        // Scroll to bottom
        setTimeout(() => {
            templateTasksContainer.scrollTop = templateTasksContainer.scrollHeight;
        }, 50);
    });
}

// Save Template
if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener("click", async () => {
        const tName = modalTemplateName.value.trim();
        const tDesc = modalTemplateDesc.value.trim();
        const tId = modalTemplateId.value;
        
        if (!tName) {
            alert("Vui lòng nhập tên Template!");
            modalTemplateName.focus();
            return;
        }
        
        // Filter out completely empty tasks
        const cleanTasks = currentModalTasks.filter(t => t.name.trim() !== "" || t.category.trim() !== "");
        
        const templateData = {
            name: tName,
            description: tDesc,
            tasks: cleanTasks,
            updatedAt: serverTimestamp()
        };
        
        try {
            btnSaveTemplate.disabled = true;
            btnSaveTemplate.textContent = "Đang lưu...";
            
            if (tId) {
                // Update
                const docRef = doc(db, "templates", tId);
                await updateDoc(docRef, templateData);
                window.logUserAction(`Cập nhật template: ${tName}`);
            } else {
                // Create
                templateData.createdAt = serverTimestamp();
                await addDoc(collection(db, "templates"), templateData);
                window.logUserAction(`Tạo mới template: ${tName}`);
            }
            
            closeTemplateModal();
        } catch(error) {
            console.error("Error saving template:", error);
            alert("Đã xảy ra lỗi khi lưu Template: " + error.message);
        } finally {
            btnSaveTemplate.disabled = false;
            btnSaveTemplate.textContent = "Lưu Template";
        }
    });
}
