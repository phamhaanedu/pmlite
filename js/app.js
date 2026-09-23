import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, where, getDocs } from './firebase-config.js';

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
                querySnapshot.forEach((doc) => {
                    currentUserProfile = { id: doc.id, ...doc.data() };
                });
                console.log("Profile mapped:", currentUserProfile);
                updateUIForLogin(userInfo, btnLogin, currentUserProfile);
                // Dispatch event so other scripts know user is ready
                document.dispatchEvent(new CustomEvent("UserLoaded", { detail: currentUserProfile }));
            }
        } else {
            // User is signed out
            currentUserProfile = null;
            updateUIForLogout(userInfo, btnLogin);
            document.dispatchEvent(new CustomEvent("UserLoggedOut"));
        }
    });

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
});

function updateUIForLogin(userInfoContainer, btnLogin, profile) {
    userInfoContainer.innerHTML = `
        <span style="font-size: 0.9em; color: var(--text-secondary);">
            ${profile.fullName} <strong style="color: var(--primary-color);">(${profile.role})</strong>
        </span>
    `;
    userInfoContainer.appendChild(btnLogin);
    btnLogin.innerText = "Logout";
    btnLogin.style.background = "var(--status-danger)";
}

function updateUIForLogout(userInfoContainer, btnLogin) {
    userInfoContainer.innerHTML = ``;
    userInfoContainer.appendChild(btnLogin);
    btnLogin.innerText = "Login";
    btnLogin.style.background = "var(--primary-color)";
}
