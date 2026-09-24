import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, where, getDocs, doc, updateDoc, addDoc } from './firebase-config.js';

export let currentUserProfile = null; // Store fetched user profile from DB

document.addEventListener("DOMContentLoaded", () => {
    const btnLogin = document.getElementById("btnLogin");
    const userInfo = document.getElementById("user-info");
    const sidebar = document.getElementById("sidebar");
    
    // Render dynamic sidebar
    if (sidebar) {
        const path = window.location.pathname;
        const isDash = path.includes("index") || path.endsWith("/");
        const isProj = path.includes("projects");
        const isUser = path.includes("users");
        const isSettings = path.includes("settings");
        
        sidebar.innerHTML = `
            <h2>SGPM</h2>
            <nav style="margin-top: 30px; display: flex; flex-direction: column; gap: 15px;">
                <a href="index.html" style="color: white; text-decoration: none; opacity: ${isDash ? '1' : '0.7'};">Dashboard</a>
                <a href="projects.html" style="color: white; text-decoration: none; opacity: ${isProj ? '1' : '0.7'};">Projects</a>
                <a href="users.html" style="color: white; text-decoration: none; opacity: ${isUser ? '1' : '0.7'};">Members</a>
                <a href="settings.html" style="color: white; text-decoration: none; opacity: ${isSettings ? '1' : '0.7'};">Settings</a>
            </nav>
        `;
    }

    // UI logic for side panel is handled inline via onclick for now

    // Check auth state on load
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Logged in as (Google):", user.email);
            // Query DB to find profile
            const q = query(collection(db, "users"), where("email", "==", user.email));
            const querySnapshot = await getDocs(q);
            
            if(querySnapshot.empty) {
                // Email is not in the system
                alert("Tài khoản của bạn chưa được cấp phép truy cập (Chưa có hồ sơ trên hệ thống).");
                await signOut(auth);
                updateUIForLogout(userInfo, btnLogin);
            } else {
                // Email is authorized
                let docData;
                querySnapshot.forEach((doc) => {
                    docData = { id: doc.id, ...doc.data() };
                });

                if (docData.status === "locked") {
                    alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Super Admin.");
                    await signOut(auth);
                    updateUIForLogout(userInfo, btnLogin);
                    return;
                }
                
                if (docData.status === "deleted") {
                    alert("Tài khoản của bạn không tồn tại (Đã bị xóa).");
                    await signOut(auth);
                    updateUIForLogout(userInfo, btnLogin);
                    return;
                }

                currentUserProfile = docData;
                console.log("Profile mapped:", currentUserProfile);
                updateUIForLogin(userInfo, btnLogin, currentUserProfile);
                
                // Dispatch event so other scripts know user is ready
                document.dispatchEvent(new CustomEvent("UserLoaded", { detail: currentUserProfile }));
                
                // Log action
                window.logUserAction("Đăng nhập vào hệ thống");
            }
        } else {
            // User is signed out
            currentUserProfile = null;
            updateUIForLogout(userInfo, btnLogin);
            document.dispatchEvent(new CustomEvent("UserLoggedOut"));
        }
    });

    // Global logging function
    window.logUserAction = async function(detail) {
        if (!currentUserProfile || !currentUserProfile.id) return;
        
        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString('vi-VN'); // e.g. "24/9/2026"
            const timeStr = now.toLocaleTimeString('vi-VN'); // e.g. "10:38:00"

            const userRef = doc(db, "users", currentUserProfile.id);
            
            // 1. Update lastAction only (for quick UI display)
            await updateDoc(userRef, {
                lastAction: {
                    date: dateStr,
                    time: timeStr,
                    detail: detail
                }
            });
            
            // 2. Add to logs collection (Full Audit Trail)
            const logsRef = collection(db, "logs");
            await addDoc(logsRef, {
                userId: currentUserProfile.id,
                email: currentUserProfile.email,
                action: detail,
                timestamp: now.getTime(),
                date: dateStr,
                time: timeStr
            });

            // Update local state
            currentUserProfile.lastAction = { date: dateStr, time: timeStr, detail: detail };
        } catch (error) {
            console.error("Failed to log user action:", error);
        }
    };

    if(btnLogin) {
        btnLogin.addEventListener("click", () => {
            if(!currentUserProfile) {
                // Do Login
                signInWithPopup(auth, provider).catch(error => {
                    console.error("Login failed", error);
                    alert("Đăng nhập thất bại: " + error.message);
                });
            } else {
                // Do Logout
                signOut(auth).then(() => {
                    alert("Đã đăng xuất.");
                });
            }
        });
    }

    // Inject Profile Modal HTML to body
    const profileModalHTML = `
        <div id="profile-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Thông tin cá nhân</h2>
                    <button class="close-modal" id="closeProfileModalBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="profileForm" style="display: flex; flex-direction: column; gap: 15px;">
                        <div class="form-group">
                            <label>Họ và tên</label>
                            <input type="text" id="profileFullName" required style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>MSSV</label>
                            <input type="text" id="profileMssv" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>Số điện thoại</label>
                            <input type="text" id="profilePhone" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>Email <small style="color: var(--text-secondary);">(Không thể thay đổi)</small></label>
                            <input type="email" id="profileEmail" readonly style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-secondary); opacity: 0.7;">
                        </div>
                        <button type="submit" style="padding: 10px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">Lưu thay đổi</button>
                    </form>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", profileModalHTML);

    const profileModal = document.getElementById("profile-modal");
    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    const profileForm = document.getElementById("profileForm");

    closeProfileModalBtn.addEventListener("click", () => {
        profileModal.classList.remove("show");
    });

    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) profileModal.classList.remove("show");
    });

    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserProfile) return;

        const newFullName = document.getElementById("profileFullName").value.trim();
        const newMssv = document.getElementById("profileMssv").value.trim();
        const newPhone = document.getElementById("profilePhone").value.trim();

        try {
            const userRef = doc(db, "users", currentUserProfile.id);
            await updateDoc(userRef, {
                fullName: newFullName,
                mssv: newMssv,
                phone: newPhone
            });

            // Update local profile
            currentUserProfile.fullName = newFullName;
            currentUserProfile.mssv = newMssv;
            currentUserProfile.phone = newPhone;

            // Update UI
            const userNameSpan = document.getElementById("headerUserName");
            if (userNameSpan) {
                userNameSpan.innerHTML = `${currentUserProfile.fullName} <strong style="color: var(--primary-color);">(${currentUserProfile.role})</strong>`;
            }

            alert("Cập nhật thông tin thành công!");
            profileModal.classList.remove("show");
            
            // Log action
            window.logUserAction("Cập nhật thông tin cá nhân");
        } catch (error) {
            console.error("Error updating profile: ", error);
            alert("Lỗi khi cập nhật thông tin: " + error.message);
        }
    });
});

function updateUIForLogin(userInfoContainer, btnLogin, profile) {
    userInfoContainer.innerHTML = `
        <span id="headerUserName" class="user-profile-link" style="font-size: 0.9em; color: var(--text-secondary); cursor: pointer; transition: color 0.2s;">
            ${profile.fullName} <strong style="color: var(--primary-color);">(${profile.role})</strong>
        </span>
    `;
    userInfoContainer.appendChild(btnLogin);
    btnLogin.innerText = "Logout";
    btnLogin.style.background = "var(--status-danger)";

    // Add click event to open Profile Modal
    const headerUserName = document.getElementById("headerUserName");
    if (headerUserName) {
        headerUserName.addEventListener("click", () => {
            const profileModal = document.getElementById("profile-modal");
            if (profileModal) {
                document.getElementById("profileFullName").value = profile.fullName || "";
                document.getElementById("profileMssv").value = profile.mssv || "";
                document.getElementById("profilePhone").value = profile.phone || "";
                document.getElementById("profileEmail").value = profile.email || "";
                profileModal.classList.add("show");
            }
        });
    }
}

function updateUIForLogout(userInfoContainer, btnLogin) {
    userInfoContainer.innerHTML = ``;
    userInfoContainer.appendChild(btnLogin);
    btnLogin.innerText = "Login";
    btnLogin.style.background = "var(--primary-color)";
}
