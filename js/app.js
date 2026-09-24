import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, where, getDocs, doc, updateDoc, addDoc } from './firebase-config.js';

export let currentUserProfile = null;

window.renderSidebar = async function(profile) {
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.querySelector(".main-content");
    if (!sidebar) return;
    
    if (!profile) {
        sidebar.innerHTML = '';
        sidebar.style.display = 'none';
        return;
    }
    
    sidebar.style.display = 'flex';

    // Apply collapsed state from localStorage
    const isCollapsed = localStorage.getItem("pmlite_sidebar_collapsed") === "true";
    if (isCollapsed) {
        sidebar.classList.add("collapsed");
    } else {
        sidebar.classList.remove("collapsed");
    }

    const path = window.location.pathname;
    const isDash = path.includes("index") || path.endsWith("/");
    const isProj = path.includes("projects") || path.includes("tasks");
    const isUser = path.includes("users");
    const isSettings = path.includes("settings");

    let isPM = false;
    if (profile.role === 'student') {
        try {
            // Need to import query and where inside this function if not available, but app.js has them globally
            const pQuery = query(collection(db, "projects"), where("pmId", "==", profile.id));
            const pSnap = await getDocs(pQuery);
            isPM = !pSnap.empty;
        } catch (e) {
            console.error("Error checking PM status:", e);
        }
    }

    let navHtml = `<a href="index.html" title="Dashboard" class="nav-link ${isDash ? 'active' : ''}" style="opacity: ${isDash ? '1' : '0.7'};">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <span class="nav-text">Dashboard</span>
    </a>`;

    if (profile.role === 'super_admin' || profile.role === 'teacher') {
        navHtml += `
            <a href="projects.html" title="Projects" class="nav-link ${isProj ? 'active' : ''}" style="opacity: ${isProj ? '1' : '0.7'};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span class="nav-text">Projects</span>
            </a>
            <a href="users.html" title="Members" class="nav-link ${isUser ? 'active' : ''}" style="opacity: ${isUser ? '1' : '0.7'};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span class="nav-text">Members</span>
            </a>
            <a href="templates.html" title="Templates" class="nav-link ${window.location.pathname.includes('templates.html') ? 'active' : ''}" style="opacity: ${window.location.pathname.includes('templates.html') ? '1' : '0.7'};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span class="nav-text">Templates</span>
            </a>
        `;
    } else if (profile.role === 'student' && isPM) {
        navHtml += `<a href="projects.html" title="Projects" class="nav-link ${isProj ? 'active' : ''}" style="opacity: ${isProj ? '1' : '0.7'};">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span class="nav-text">Projects</span>
        </a>`;
    }

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h2 class="sidebar-title-text" style="margin: 0;">PM Lite</h2>
            <button id="toggleSidebarBtn" class="toggle-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
        </div>
        <nav style="display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto;">
            ${navHtml}
        </nav>
        
        <div class="sidebar-user-info" id="sidebarUserInfo">
            <div id="sidebarProfileBtn" title="Cài đặt tài khoản" style="display: flex; flex: 1; align-items: center; gap: 12px; cursor: pointer; overflow: hidden; padding-right: 5px;">
                <div class="sidebar-avatar">${profile.fullName.charAt(0).toUpperCase()}</div>
                <div class="sidebar-user-name" style="flex: 1; overflow: hidden;">
                    <span style="font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${profile.fullName}</span>
                    <small style="color: var(--text-secondary);">${profile.role}</small>
                </div>
            </div>
            <div class="sidebar-settings-icon" id="sidebarSettingsBtn" title="Cài đặt hệ thống" style="position: relative;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                
                <!-- Settings Popup Menu -->
                <div id="settingsMenuPopup" class="settings-popup" style="display: none; position: absolute;  background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: max-content; min-width: 220px; z-index: 1000; flex-direction: column; overflow: hidden; padding: 5px 0;">
                    <a href="settings.html" style="display: flex; align-items: center; gap: 10px; padding: 10px 15px; color: var(--text-primary); text-decoration: none; font-size: 0.9em; transition: background 0.2s;" onmouseover="this.style.background='var(--background-color)'" onmouseout="this.style.background='transparent'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        Webhook Keywords
                    </a>
                </div>
            </div>
        </div>

    `;

    // Attach toggle event listener
    const toggleBtn = document.getElementById("toggleSidebarBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            const currentlyCollapsed = sidebar.classList.contains("collapsed");
            localStorage.setItem("pmlite_sidebar_collapsed", currentlyCollapsed);
        });
    }

    // Attach click event for settings
    
    // Attach click event for profile
    const sidebarProfileBtn = document.getElementById("sidebarProfileBtn");
    if (sidebarProfileBtn) {
        sidebarProfileBtn.addEventListener("click", () => {
            const sb = document.getElementById("sidebar");
            const bd = document.getElementById("sidebarBackdrop");
            if (sb) sb.classList.remove("mobile-open");
            if (bd) bd.classList.remove("show");

            const profileModal = document.getElementById("profile-modal");
            if (profileModal) {
                document.getElementById("profileFullName").value = profile.fullName || "";
                document.getElementById("profileMssv").value = profile.mssv || "";
                document.getElementById("profilePhone").value = profile.phone || "";
                document.getElementById("profileTeleId").value = profile.teleId || "";
                document.getElementById("profileEmail").value = profile.email || "";
                
                const btnSave = document.getElementById("btnSaveProfile");
                if (btnSave) {
                    btnSave.disabled = true;
                    btnSave.style.background = "#666";
                    btnSave.style.color = "#ccc";
                    btnSave.style.cursor = "not-allowed";
                }
                
                profileModal.classList.add("show");
            }
        });
    }

    // Attach click event for settings popup
    const sidebarSettingsBtn = document.getElementById("sidebarSettingsBtn");
    const settingsMenuPopup = document.getElementById("settingsMenuPopup");
    if (sidebarSettingsBtn && settingsMenuPopup) {
        sidebarSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (settingsMenuPopup.style.display === 'flex') {
                settingsMenuPopup.style.display = 'none';
            } else {
                settingsMenuPopup.style.display = 'flex';
            }
        });
        
        // Close when clicking outside
        document.addEventListener("click", (e) => {
            if (!sidebarSettingsBtn.contains(e.target)) {
                settingsMenuPopup.style.display = 'none';
            }
        });
    }

    // Mobile UX Injection
    let backdrop = document.getElementById("sidebarBackdrop");
    if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "sidebarBackdrop";
        backdrop.className = "sidebar-backdrop";
        document.body.appendChild(backdrop);
        
        backdrop.addEventListener("click", () => {
            sidebar.classList.remove("mobile-open");
            backdrop.classList.remove("show");
        });
    }

    const header = document.querySelector(".header");
    if (header && !document.getElementById("mobileMenuBtn")) {
        const mobileBtn = document.createElement("button");
        mobileBtn.id = "mobileMenuBtn";
        mobileBtn.className = "mobile-menu-btn";
        mobileBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
        
        mobileBtn.addEventListener("click", () => {
            sidebar.classList.add("mobile-open");
            backdrop.classList.add("show");
        });
        
        header.insertBefore(mobileBtn, header.firstChild);
    }
};
 // Store fetched user profile from DB

document.addEventListener("DOMContentLoaded", () => {
    
    const sidebar = document.getElementById("sidebar");
    


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
                updateUIForLogout();
            } else {
                // Email is authorized
                let docData;
                querySnapshot.forEach((doc) => {
                    docData = { id: doc.id, ...doc.data() };
                });

                if (docData.status === "locked") {
                    alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Super Admin.");
                    await signOut(auth);
                    updateUIForLogout();
                    return;
                }
                
                if (docData.status === "deleted") {
                    alert("Tài khoản của bạn không tồn tại (Đã bị xóa).");
                    await signOut(auth);
                    updateUIForLogout();
                    return;
                }

                currentUserProfile = docData;
                console.log("Profile mapped:", currentUserProfile);
                updateUIForLogin(currentUserProfile);
                
                // Dispatch event so other scripts know user is ready
                document.dispatchEvent(new CustomEvent("UserLoaded", { detail: currentUserProfile }));
                
                // Log action
                window.logUserAction("Đăng nhập vào hệ thống");
            }
        } else {
            // User is signed out
            currentUserProfile = null;
            updateUIForLogout();
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
                            <input type="text" id="profileFullName" required style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--surface-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>MSSV</label>
                            <input type="text" id="profileMssv" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--surface-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>Số điện thoại</label>
                            <input type="text" id="profilePhone" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--surface-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>Telegram ID</label>
                            <input type="text" id="profileTeleId" placeholder="Ví dụ: @username" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--surface-color); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label>Email <small style="color: var(--text-secondary);">(Không thể thay đổi)</small></label>
                            <input type="email" id="profileEmail" readonly style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--surface-color); color: var(--text-secondary); opacity: 0.7;">
                        </div>
                        <button type="submit" id="btnSaveProfile" disabled style="padding: 10px; background: #666; color: #ccc; border: none; border-radius: 4px; cursor: not-allowed; transition: all 0.2s;">Lưu thay đổi</button>
                        <button type="button" id="btnLogout" style="padding: 10px; background: var(--status-danger); color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%;">Đăng xuất</button>
                    </form>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", profileModalHTML);

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.addEventListener("click", () => {
            signOut(auth).then(() => {
                alert("Đã đăng xuất.");
                const profileModal = document.getElementById("profile-modal");
                if (profileModal) profileModal.classList.remove("show");
            });
        });
    }


    const profileModal = document.getElementById("profile-modal");
    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    
    const profileFullName = document.getElementById("profileFullName");
    const profileMssv = document.getElementById("profileMssv");
    const profilePhone = document.getElementById("profilePhone");
    const profileTeleId = document.getElementById("profileTeleId");
    const btnSaveProfile = document.getElementById("btnSaveProfile");

    function checkProfileChanges() {
        if (!currentUserProfile || !btnSaveProfile) return;
        const currentFullName = profileFullName.value.trim();
        const currentMssv = profileMssv.value.trim();
        const currentPhone = profilePhone.value.trim();
        const currentTeleId = profileTeleId.value.trim();

        const isChanged = currentFullName !== (currentUserProfile.fullName || "") ||
                          currentMssv !== (currentUserProfile.mssv || "") ||
                          currentPhone !== (currentUserProfile.phone || "") ||
                          currentTeleId !== (currentUserProfile.teleId || "");

        if (isChanged) {
            btnSaveProfile.disabled = false;
            btnSaveProfile.style.background = "var(--status-warning)";
            btnSaveProfile.style.color = "white";
            btnSaveProfile.style.cursor = "pointer";
        } else {
            btnSaveProfile.disabled = true;
            btnSaveProfile.style.background = "#666";
            btnSaveProfile.style.color = "#ccc";
            btnSaveProfile.style.cursor = "not-allowed";
        }
    }

    if (profileFullName) profileFullName.addEventListener("input", checkProfileChanges);
    if (profileMssv) profileMssv.addEventListener("input", checkProfileChanges);
    if (profilePhone) profilePhone.addEventListener("input", checkProfileChanges);
    if (profileTeleId) profileTeleId.addEventListener("input", checkProfileChanges);

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
        const newTeleId = document.getElementById("profileTeleId").value.trim();

        try {
            const userRef = doc(db, "users", currentUserProfile.id);
            await updateDoc(userRef, {
                fullName: newFullName,
                mssv: newMssv,
                phone: newPhone,
                teleId: newTeleId
            });

            // Update local profile
            currentUserProfile.fullName = newFullName;
            currentUserProfile.mssv = newMssv;
            currentUserProfile.phone = newPhone;
            currentUserProfile.teleId = newTeleId;

            // Update UI
            const userNameSpan = document.getElementById("headerUserName");
            if (userNameSpan) {
                userNameSpan.innerHTML = `${currentUserProfile.fullName} <strong style="color: var(--primary-color);">(${currentUserProfile.role})</strong>`;
            }

            alert("Cập nhật thông tin thành công!");
            if (btnSaveProfile) {
                btnSaveProfile.disabled = true;
                btnSaveProfile.style.background = "#666";
                btnSaveProfile.style.color = "#ccc";
                btnSaveProfile.style.cursor = "not-allowed";
            }
            profileModal.classList.remove("show");
            
            // Log action
            window.logUserAction("Cập nhật thông tin cá nhân");
        } catch (error) {
            console.error("Error updating profile: ", error);
            alert("Lỗi khi cập nhật thông tin: " + error.message);
        }
    });
});

function updateUIForLogin(profile) {
    // Hide welcome overlay
    const overlay = document.getElementById("welcome-overlay");
    if (overlay) overlay.style.display = 'none';
    
    // Show content area
    const contentArea = document.querySelector(".content-area");
    if (contentArea) contentArea.style.display = 'block';

    if (window.renderSidebar) {
        window.renderSidebar(profile);
    }
}

function updateUIForLogout() {
    if (window.renderSidebar) {
        window.renderSidebar(null);
    }
    
    // Show welcome overlay
    let overlay = document.getElementById("welcome-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "welcome-overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "60px"; // Approx header height
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "calc(100vh - 60px)";
        overlay.style.background = "var(--bg-color)";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "1000";
        overlay.innerHTML = `
            <h1 style="color: var(--primary-color); font-size: 2.5rem; margin-bottom: 20px;">Welcome to PM Lite</h1>
            <p style="color: var(--text-secondary); font-size: 1.2rem; max-width: 600px; text-align: center; line-height: 1.5;">Hệ thống Quản lý Dự án. <br>Vui lòng đăng nhập để truy cập vào không gian làm việc của bạn.</p>
            <button id="welcomeLoginBtn" style="margin-top: 30px; padding: 12px 24px; font-size: 1.1rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: opacity 0.2s;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                Đăng nhập với Google
            </button>
        `;
        document.body.appendChild(overlay);
        
        const welcomeLoginBtn = document.getElementById("welcomeLoginBtn");
        welcomeLoginBtn.addEventListener("click", () => {
            signInWithPopup(auth, provider).catch(error => {
                console.error("Login failed", error);
                alert("Đăng nhập thất bại: " + error.message);
            });
        });
        welcomeLoginBtn.addEventListener("mouseover", () => welcomeLoginBtn.style.opacity = "0.9");
        welcomeLoginBtn.addEventListener("mouseout", () => welcomeLoginBtn.style.opacity = "1");
    }
    overlay.style.display = "flex";
    
    // Hide content area
    const contentArea = document.querySelector(".content-area");
    if (contentArea) contentArea.style.display = 'none';
}