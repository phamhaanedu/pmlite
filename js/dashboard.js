import { db, collection, getDocs } from './firebase-config.js';
import { currentUserProfile } from './app.js';

const myProjectsContainer = document.getElementById("myProjectsContainer");

document.addEventListener("UserLoaded", async (e) => {
    const profile = e.detail;
    if(profile) {
        await loadMyProjects(profile);
    }
});

document.addEventListener("UserLoggedOut", () => {
    if(myProjectsContainer) myProjectsContainer.innerHTML = `<p style="color: var(--text-secondary);">Vui lòng đăng nhập để xem dự án.</p>`;
});

async function loadMyProjects(profile) {
    if(!myProjectsContainer) return;
    myProjectsContainer.innerHTML = `<p style="color: var(--text-secondary);">Đang tải dự án...</p>`;
    
    try {
        const querySnapshot = await getDocs(collection(db, "projects"));
        const myProjects = [];
        
        querySnapshot.forEach(docSnap => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            // Check if user is involved
            const isPO = p.teacherId === profile.id;
            const isPM = p.pmId === profile.id;
            const isDev = p.studentIds && p.studentIds.includes(profile.id);
            
            if (isPO || isPM || isDev || profile.role === "super_admin") {
                myProjects.push({ id, ...p, isPO, isPM, isDev });
            }
        });
        
        if (myProjects.length === 0) {
            myProjectsContainer.innerHTML = `<p style="color: var(--text-secondary);">Bạn chưa tham gia dự án nào.</p>`;
            return;
        }
        
        myProjectsContainer.innerHTML = "";
        
        myProjects.forEach(p => {
            // Render card
            let roleStr = "Super Admin";
            if(p.isPO) roleStr = "Product Owner";
            else if(p.isPM) roleStr = "Project Manager";
            else if(p.isDev) roleStr = "Developer";
            
            const card = document.createElement("div");
            card.style.background = "var(--surface-color)";
            card.style.border = "1px solid var(--border-color)";
            card.style.borderRadius = "var(--border-radius-md)";
            card.style.padding = "20px";
            card.style.boxShadow = "var(--box-shadow-sm)";
            card.style.cursor = "pointer";
            card.style.transition = "transform 0.2s, box-shadow 0.2s";
            card.style.display = "flex";
            card.style.flexDirection = "column";
            
            card.onmouseenter = () => {
                card.style.transform = "translateY(-5px)";
                card.style.boxShadow = "var(--box-shadow-md)";
            };
            card.onmouseleave = () => {
                card.style.transform = "translateY(0)";
                card.style.boxShadow = "var(--box-shadow-sm)";
            };
            
            card.onclick = () => {
                window.location.href = `tasks.html?projectId=${p.id}`;
            };
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h3 style="margin: 0; font-size: 1.2em; font-weight: 600;">${p.name}</h3>
                    <span class="badge badge-success" style="font-size: 0.8em;">Active</span>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">
                    ${p.description || 'Không có mô tả.'}
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 15px; margin-top: auto;">
                    <span style="font-size: 0.85em; font-weight: 500; color: var(--primary-color);">Vai trò: ${roleStr}</span>
                    <span style="font-size: 0.85em; color: var(--text-secondary);">Tiến độ: 0%</span>
                </div>
            `;
            myProjectsContainer.appendChild(card);
        });
        
    } catch (err) {
        console.error(err);
        myProjectsContainer.innerHTML = `<p style="color: red;">Lỗi tải dự án: ${err.message}</p>`;
    }
}
