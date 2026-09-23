import { db, collection, getDocs, doc, setDoc, writeBatch, deleteDoc, query, where } from './firebase-config.js';

const userListBody = document.getElementById("userListBody");
const btnImportCsv = document.getElementById("btnImportCsv");
const csvFileInput = document.getElementById("csvFileInput");
const btnSaveAll = document.getElementById("btnSaveAll");
const btnInlineAdd = document.getElementById("btnInlineAdd");

// Inline Add elements
const newEmail = document.getElementById("newEmail");
const newName = document.getElementById("newName");
const newRole = document.getElementById("newRole");

document.addEventListener("DOMContentLoaded", () => {
    loadUsers();

    // Event listener for Search
    const searchUserInput = document.getElementById("searchUserInput");
    if(searchUserInput) {
        searchUserInput.addEventListener("input", (e) => {
            const keyword = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll("#userListBody tr:not(.add-row)");
            
            rows.forEach(row => {
                const textContent = row.textContent.toLowerCase();
                const email = row.querySelector(".edit-email") ? row.querySelector(".edit-email").value.toLowerCase() : "";
                const name = row.querySelector(".edit-name") ? row.querySelector(".edit-name").value.toLowerCase() : "";
                
                if(textContent.includes(keyword) || email.includes(keyword) || name.includes(keyword)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        });
    }

    // Event listener for inline add
    btnInlineAdd.addEventListener("click", async () => {
        const email = newEmail.value.trim();
        const name = newName.value.trim();
        const role = newRole.value;

        if (!email || !name) {
            alert("Vui lòng nhập Email và Tên");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert("Email không đúng định dạng!");
            return;
        }

        try {
            // Check trùng email
            const q = query(collection(db, "users"), where("email", "==", email));
            const qs = await getDocs(q);
            if(!qs.empty) {
                alert(`Email ${email} đã tồn tại trong hệ thống!`);
                return;
            }

            const newUserRef = doc(collection(db, "users"));
            await setDoc(newUserRef, {
                email: email,
                fullName: name,
                role: role,
                createdAt: new Date()
            });
            // Reset fields
            newEmail.value = "";
            newName.value = "";
            newRole.value = "student";
            
            loadUsers(); // Refresh
        } catch (error) {
            console.error("Lỗi tạo user:", error);
            alert("Lỗi: " + error.message);
        }
    });

    // Event listener for Save All
    btnSaveAll.addEventListener("click", async () => {
        const dirtyRows = document.querySelectorAll("#userListBody tr.dirty-row");
        if (dirtyRows.length === 0) return;

        let hasError = false;
        let errorMsg = "";

        try {
            const batch = writeBatch(db);
            
            dirtyRows.forEach(row => {
                const docId = row.dataset.id;
                const emailInput = row.querySelector(".edit-email").value.trim();
                const nameInput = row.querySelector(".edit-name").value.trim();
                const roleInput = row.querySelector(".edit-role").value;

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(emailInput)) {
                    hasError = true;
                    errorMsg = `Email không đúng định dạng tại dòng của user: ${nameInput}`;
                    return; // exit forEach callback
                }

                if (docId && emailInput && nameInput) {
                    const userRef = doc(db, "users", docId);
                    batch.update(userRef, {
                        email: emailInput,
                        fullName: nameInput,
                        role: roleInput
                    });
                }
            });

            if (hasError) {
                alert(errorMsg);
                return;
            }

            await batch.commit();
            alert(`Đã lưu thành công ${dirtyRows.length} hồ sơ!`);
            loadUsers(); // Refresh to clean dirty state
        } catch (err) {
            console.error("Lỗi khi lưu nhiều dòng:", err);
            alert("Lỗi: " + err.message);
        }
    });

    // CSV Import Logic
    btnImportCsv.addEventListener("click", () => {
        csvFileInput.click();
    });

    csvFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target.result;
                const workbook = XLSX.read(data, {type: 'binary'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
                // Lấy danh sách email hiện tại để check trùng
                const existingEmails = new Set();
                const snapshot = await getDocs(collection(db, "users"));
                snapshot.forEach(d => existingEmails.add(d.data().email));

                let addedCount = 0;
                let skipCount = 0;

                for(let i = 1; i < rows.length; i++) {
                    const cols = rows[i];
                    if(cols && cols.length >= 2) {
                        try {
                            const email = cols[0] ? String(cols[0]).trim() : "";
                            const name = cols[1] ? String(cols[1]).trim() : "";
                            const role = cols[2] ? String(cols[2]).trim() : "student";

                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            if (!emailRegex.test(email)) {
                                skipCount++;
                                continue; // Skip invalid email formats in CSV
                            }

                            if(email && name) {
                                if(existingEmails.has(email)) {
                                    skipCount++;
                                    continue;
                                }

                                const ref = doc(collection(db, "users"));
                                await setDoc(ref, {
                                    email, fullName: name, role, createdAt: new Date()
                                });
                                addedCount++;
                                existingEmails.add(email); // Add to set to prevent duplicates within same file
                            }
                        } catch (e) {
                            console.error("Lỗi dòng " + i, e);
                        }
                    }
                }
                
                let msg = `Đã import thành công ${addedCount} hồ sơ!`;
                if(skipCount > 0) msg += `\nBỏ qua ${skipCount} dòng do trùng email.`;
                alert(msg);
                
                csvFileInput.value = ""; // reset
                loadUsers();
            } catch (err) {
                console.error(err);
                alert("Lỗi khi đọc file: " + err.message);
            }
        };
        reader.readAsBinaryString(file);
    });
});

async function loadUsers() {
    // Keep only the first row (inline add) safely
    Array.from(userListBody.children).forEach(child => {
        if (!child.classList.contains("add-row")) {
            child.remove();
        }
    });
    
    // Hide Save All button
    btnSaveAll.style.display = "none";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        if(querySnapshot.empty) {
            // Nothing to show
            return;
        }

        const usersArray = [];
        querySnapshot.forEach((docSnap) => {
            usersArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sắp xếp theo quyền: SA > Teacher > Student
        const roleOrder = { "super_admin": 1, "teacher": 2, "student": 3 };
        
        usersArray.sort((a, b) => {
            const roleA = roleOrder[a.role] || 4;
            const roleB = roleOrder[b.role] || 4;
            if (roleA !== roleB) {
                return roleA - roleB;
            }
            return (a.email || "").localeCompare(b.email || "");
        });

        usersArray.forEach((u) => {
            const id = u.id;
            
            const tr = document.createElement("tr");
            tr.dataset.id = id;
            
            // Format Date Safely
            let dateStr = "N/A";
            if (u.createdAt && typeof u.createdAt.toDate === 'function') {
                dateStr = u.createdAt.toDate().toLocaleDateString('vi-VN');
            } else if (u.createdAt && u.createdAt.seconds) {
                dateStr = new Date(u.createdAt.seconds * 1000).toLocaleDateString('vi-VN');
            } else if (u.createdAt) {
                try {
                    const d = new Date(u.createdAt);
                    if (!isNaN(d)) dateStr = d.toLocaleDateString('vi-VN');
                } catch(e) {}
            }

            tr.innerHTML = `
                <td>
                    <input type="email" class="grid-input edit-email" value="${u.email}" data-original="${u.email}" style="margin-bottom: 5px;">
                    <input type="text" class="grid-input edit-name" value="${u.fullName}" data-original="${u.fullName}">
                </td>
                <td>
                    <select class="grid-select edit-role" data-original="${u.role}">
                        <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
                        <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                        <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                    </select>
                </td>
                <td><span style="font-size: 0.9em; color: var(--text-secondary);">${dateStr}</span></td>
                <td style="text-align: center;">
                    <button class="icon-btn btn-save-row" title="Lưu dòng này" style="display: none;">💾</button>
                    <button class="icon-btn btn-delete-row" title="Xóa dòng này" style="color: var(--status-danger);">🗑️</button>
                </td>
            `;

            userListBody.appendChild(tr);

            // Add change listener to inputs
            const inputs = tr.querySelectorAll('input, select');
            const saveBtn = tr.querySelector('.btn-save-row');
            const delBtn = tr.querySelector('.btn-delete-row');
            
            const checkDirty = () => {
                let isDirty = false;
                inputs.forEach(input => {
                    if (input.value !== input.dataset.original) {
                        isDirty = true;
                    }
                });
                
                if (isDirty) {
                    tr.classList.add("dirty-row");
                    saveBtn.style.display = "inline-block";
                    btnSaveAll.style.display = "flex";
                } else {
                    tr.classList.remove("dirty-row");
                    saveBtn.style.display = "none";
                    
                    // Hide SaveAll if no dirty rows left
                    if (document.querySelectorAll("#userListBody tr.dirty-row").length === 0) {
                        btnSaveAll.style.display = "none";
                    }
                }
            };

            inputs.forEach(input => input.addEventListener("input", checkDirty));
            inputs.forEach(input => input.addEventListener("change", checkDirty));

            // Single Save listener
            saveBtn.addEventListener("click", async () => {
                const emailInput = tr.querySelector(".edit-email").value.trim();
                const nameInput = tr.querySelector(".edit-name").value.trim();
                const roleInput = tr.querySelector(".edit-role").value;
                
                try {
                    // Check nếu email bị đổi thì có trùng email khác không
                    if (emailInput !== u.email) {
                        const q = query(collection(db, "users"), where("email", "==", emailInput));
                        const qs = await getDocs(q);
                        if (!qs.empty) {
                            alert(`Email ${emailInput} đã tồn tại!`);
                            return;
                        }
                    }

                    const userRef = doc(db, "users", id);
                    await setDoc(userRef, {
                        email: emailInput,
                        fullName: nameInput,
                        role: roleInput
                    }, { merge: true });
                    
                    // Update originals
                    tr.querySelector(".edit-email").dataset.original = emailInput;
                    tr.querySelector(".edit-name").dataset.original = nameInput;
                    tr.querySelector(".edit-role").dataset.original = roleInput;
                    
                    checkDirty(); // will remove dirty class
                    alert("Đã lưu!");
                } catch (e) {
                    console.error(e);
                    alert("Lỗi lưu dòng: " + e.message);
                }
            });

            // Delete listener
            delBtn.addEventListener("click", async () => {
                if(confirm(`Bạn có chắc chắn muốn xóa user ${u.email} không?`)) {
                    try {
                        await deleteDoc(doc(db, "users", id));
                        tr.remove(); // Remove visually
                        // Hide saveAll if this was the last dirty row
                        if (document.querySelectorAll("#userListBody tr.dirty-row").length === 0) {
                            btnSaveAll.style.display = "none";
                        }
                    } catch(e) {
                        alert("Lỗi khi xóa: " + e.message);
                    }
                }
            });
        });

    } catch(err) {
        console.error(err);
        const errTr = document.createElement("tr");
        errTr.innerHTML = `<td colspan="4" style="text-align:center; color:red;">Lỗi tải dữ liệu: ${err.message}</td>`;
        userListBody.appendChild(errTr);
    }
}
