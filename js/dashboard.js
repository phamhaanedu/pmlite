import { db, collection, query, where, or, getDocs } from './firebase-config.js';
import { currentUserProfile } from './app.js';

const myProjectsContainer = document.getElementById("myProjectsContainer");

document.addEventListener("UserLoaded", async (e) => {
    const profile = e.detail;
    if(profile) {
        const myProjects = await loadMyProjects(profile);
        await loadMyTasks(profile, myProjects);
        
        // Hiện Dashboard Giảng viên / Admin
        if (profile.role === 'teacher' || profile.role === 'super_admin') {
            const section = document.getElementById("teacherDashboardSection");
            if (section) {
                section.style.display = "block";
                loadTeacherDashboard();
            }
        }
    }
});

document.addEventListener("UserLoggedOut", () => {
    if(myProjectsContainer) myProjectsContainer.innerHTML = `<p style="color: var(--text-secondary);">Vui lòng đăng nhập để xem dự án.</p>`;
    const myTasksContainer = document.getElementById("myTasksContainer");
    if(myTasksContainer) myTasksContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Vui lòng đăng nhập để xem công việc.</div>`;
});

async function loadMyProjects(profile) {
    if(!myProjectsContainer) return [];
    myProjectsContainer.innerHTML = `<p style="color: var(--text-secondary);">Đang tải dự án...</p>`;
    
    try {
        let q;
        if (profile.role === 'super_admin' || profile.role === 'teacher') {
            q = collection(db, "projects");
        } else {
            q = query(collection(db, "projects"), or(where("pmId", "==", profile.email), where("studentIds", "array-contains", profile.email)));
        }
        const querySnapshot = await getDocs(q);
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
            return [];
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
        
        return myProjects;
    } catch (err) {
        console.error(err);
        myProjectsContainer.innerHTML = `<p style="color: red;">Lỗi tải dự án: ${err.message}</p>`;
        return [];
    }
}

async function loadMyTasks(profile, myProjects) {
    const container = document.getElementById("myTasksContainer");
    if (!container) return;
    
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Đang tải công việc...</div>`;
    
    try {
        // Hide the filter dropdown as it's no longer needed for minimalist Action Center
        const filterSelect = document.getElementById("taskFilter");
        if (filterSelect) {
            filterSelect.style.display = "none";
        }

        const projectMap = {};
        if (myProjects && myProjects.length > 0) {
            myProjects.forEach(p => {
                projectMap[p.id] = p.name;
            });
        }

        // We fetch ALL projects in case the user has tasks in projects they are not directly members of (super_admin case or just global query)
        const allProjectsSnap = await getDocs(collection(db, "projects"));
        allProjectsSnap.forEach(doc => {
             projectMap[doc.id] = doc.data().name;
        });

        // Query tasks assigned to this user
        const qTasks = query(collection(db, "tasks"), where("assigneeIds", "array-contains", profile.id));
        const tasksSnap = await getDocs(qTasks);
        
        let urgentTasks = [];
        
        const today = new Date();
        today.setHours(0,0,0,0);

        tasksSnap.forEach(docSnap => {
            const t = docSnap.data();
            if (t.isDeleted || t.status === 'done') return;
            
            let isLate = false;
            let isDueSoon = false;
            let isUrgent = (t.priority === 'urgent');

            if (t.deadline) {
                const dl = new Date(t.deadline);
                dl.setHours(0,0,0,0);
                const diffTime = dl.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) {
                    isLate = true;
                } else if (diffDays <= 1) {
                    isDueSoon = true;
                }
            }

            if (isLate || isDueSoon || isUrgent) {
                urgentTasks.push({
                    id: docSnap.id,
                    ...t,
                    isLate,
                    isDueSoon,
                    isUrgentPriority: isUrgent
                });
            }
        });

        if (urgentTasks.length === 0) {
            container.innerHTML = `<div style="padding: 30px 20px; text-align: center; color: var(--text-secondary); background: #f8f9fa; border-radius: 8px; border: 1px dashed var(--border-color);">
                <div style="font-size: 2em; margin-bottom: 10px;">🎉</div>
                <div style="font-weight: 500; color: var(--status-success);">Tuyệt vời!</div>
                <div>Bạn không có công việc nào bị trễ hạn hay khẩn cấp.</div>
            </div>`;
            return;
        }

        // Sort: Late -> Due Soon -> Urgent
        urgentTasks.sort((a, b) => {
            if (a.isLate && !b.isLate) return -1;
            if (!a.isLate && b.isLate) return 1;
            if (a.isDueSoon && !b.isDueSoon) return -1;
            if (!a.isDueSoon && b.isDueSoon) return 1;
            if (a.isUrgentPriority && !b.isUrgentPriority) return -1;
            if (!a.isUrgentPriority && b.isUrgentPriority) return 1;
            
            if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
            return 0;
        });

        // Take max 10 tasks to keep it minimal
        urgentTasks = urgentTasks.slice(0, 10);

        let html = `<table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border-color); background: var(--background-color);">
                    <th style="padding: 12px; font-weight: 500; color: var(--text-secondary); width: 40%;">Task cần chú ý</th>
                    <th style="padding: 12px; font-weight: 500; color: var(--text-secondary); width: 25%;">Dự án</th>
                    <th style="padding: 12px; font-weight: 500; color: var(--text-secondary); width: 20%;">Trạng thái báo động</th>
                    <th style="padding: 12px; font-weight: 500; color: var(--text-secondary); width: 15%;">Hạn chót</th>
                </tr>
            </thead>
            <tbody>`;
        
        urgentTasks.forEach(t => {
            const pName = projectMap[t.projectId] || "Dự án không rõ";
            
            let alarmBadge = '';
            if (t.isLate) alarmBadge = `<span class="badge" style="background: var(--status-danger); color: white;">🔴 Quá hạn</span>`;
            else if (t.isDueSoon) alarmBadge = `<span class="badge" style="background: #ff9800; color: white;">🟠 Tới hạn</span>`;
            else if (t.isUrgentPriority) alarmBadge = `<span class="badge" style="background: #e91e63; color: white;">🔥 Khẩn cấp</span>`;
            
            let deadlineStr = t.deadline ? t.deadline : "<span style='color: var(--text-secondary);'>Không có</span>";
            let warningColor = t.isLate ? "color: var(--status-danger); font-weight: bold;" : (t.isDueSoon ? "color: #ff9800; font-weight: bold;" : "");

            html += `
                <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer;" class="hover-row" onclick="window.location.href='tasks.html?projectId=${t.projectId}'">
                    <td style="padding: 12px; font-weight: 500;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${t.name}
                        </div>
                    </td>
                    <td style="padding: 12px; font-size: 0.9em; color: var(--text-secondary);">${pName}</td>
                    <td style="padding: 12px;">${alarmBadge}</td>
                    <td style="padding: 12px; ${warningColor}">${deadlineStr}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
        
        // Thêm hiệu ứng hover bằng JS
        const rows = container.querySelectorAll('.hover-row');
        rows.forEach(r => {
            r.addEventListener('mouseenter', () => { r.style.background = 'var(--background-color)'; });
            r.addEventListener('mouseleave', () => { r.style.background = 'transparent'; });
        });

    } catch (e) {
        console.error("Lỗi khi tải công việc của tôi:", e);
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">Lỗi tải dữ liệu.</div>`;
    }
}

async function loadTeacherDashboard() {
    try {
        const [tasksSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, "tasks")),
            getDocs(collection(db, "users"))
        ]);
        
        let todo = 0, inprogress = 0, done = 0;
        const studentStats = {}; // { userId: { name, commits: 0, completedTasks: 0 } }
        
        // Map users
        usersSnap.forEach(u => {
            const data = u.data();
            if (data.role === 'student' || data.role === 'user') {
                studentStats[u.id] = { name: data.fullName || data.email, commits: 0, completedTasks: 0 };
            }
        });
        
        tasksSnap.forEach(tDoc => {
            const task = tDoc.data();
            if (task.isDeleted) return;
            
            if (task.status === 'todo') todo++;
            else if (task.status === 'inprogress') inprogress++;
            else if (task.status === 'done') {
                done++;
                // Add points to assignees if done
                if (task.assigneeIds) {
                    task.assigneeIds.forEach(id => {
                        if (studentStats[id]) studentStats[id].completedTasks++;
                    });
                }
            }
            
            // Count commits per user (naively matching authorName to student name, or just counting total commits for the task's assignees)
            if (task.commits && task.commits.length > 0) {
                // If a task has commits, we add them to the assignees
                // In a real system, we'd match the commit author email to the user email.
                if (task.assigneeIds) {
                    task.assigneeIds.forEach(id => {
                        if (studentStats[id]) {
                            studentStats[id].commits += (task.commits.length / task.assigneeIds.length); // split commits among assignees
                        }
                    });
                }
            }
        });

        // 1. Chart.js (Doughnut)
        const ctx = document.getElementById('projectProgressChart');
        if (ctx && typeof Chart !== 'undefined') {
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['To Do', 'In Progress', 'Done'],
                    datasets: [{
                        data: [todo, inprogress, done],
                        backgroundColor: ['#e0e0e0', '#ff9800', '#4caf50'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
        
        // 2. Leaderboard
        const lbContainer = document.getElementById('leaderboardContainer');
        const sortedStudents = Object.values(studentStats)
                                     .filter(s => s.commits > 0 || s.completedTasks > 0)
                                     .sort((a, b) => (b.completedTasks * 10 + b.commits) - (a.completedTasks * 10 + a.commits));
                                     
        if (sortedStudents.length === 0) {
            lbContainer.innerHTML = '<p style="color: var(--text-secondary);">Chưa có dữ liệu sinh viên đóng góp.</p>';
        } else {
            lbContainer.innerHTML = '';
            sortedStudents.forEach((st, idx) => {
                const item = document.createElement('div');
                item.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color);";
                
                let medal = `#${idx + 1}`;
                if (idx === 0) medal = '🥇';
                if (idx === 1) medal = '🥈';
                if (idx === 2) medal = '🥉';
                
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: bold; width: 25px; text-align: center;">${medal}</span>
                        <span style="font-weight: 500;">${st.name}</span>
                    </div>
                    <div style="text-align: right; font-size: 0.9em; color: var(--text-secondary);">
                        <span style="color: #4caf50; font-weight: 600;">${st.completedTasks} Tasks</span> | 
                        <span style="color: #2196f3; font-weight: 600;">${Math.round(st.commits)} Commits</span>
                    </div>
                `;
                lbContainer.appendChild(item);
            });
        }

    } catch (e) {
        console.error("Lỗi load teacher dashboard:", e);
        document.getElementById('leaderboardContainer').innerHTML = `<p style="color: red;">Lỗi tải thống kê.</p>`;
    }
}
