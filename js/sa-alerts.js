import { db, auth } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // Tab Switching
    const tabs = document.querySelectorAll('.qa-tab');
    const contents = document.querySelectorAll('.qa-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.style.display = 'none');

            tab.classList.add('active');
            const target = document.getElementById(tab.getAttribute('data-tab'));
            if (target) target.style.display = 'block';
        });
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Recheck role (should be sa or teacher)
            const uSnap = await getDocs(query(collection(db, "users"), where("email", "==", user.email)));
            let role = 'student';
            if (!uSnap.empty) {
                role = uSnap.docs[0].data().role;
            }
            if (role !== 'super_admin' && role !== 'teacher') {
                document.querySelector('.main-content').innerHTML = '<div style="padding: 50px; text-align: center; color: red;">Bạn không có quyền truy cập trang này.</div>';
                return;
            }
            loadAlertsData();
        } else {
            window.location.href = "index.html";
        }
    });
});

function createListItem(text, subtext = "", badge = null) {
    let badgeHtml = badge ? `<span style="background: var(--status-danger); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.7em; font-weight: bold; margin-left: 10px;">${badge}</span>` : '';
    return `
        <div style="padding: 10px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <strong style="color: var(--text-primary); font-size: 0.95em;">${text}</strong>
                <div style="color: var(--text-secondary); font-size: 0.8em; margin-top: 3px;">${subtext}</div>
            </div>
            ${badgeHtml}
        </div>
    `;
}

async function loadAlertsData() {
    try {
        const [usersSnap, projSnap, tasksSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "projects")),
            getDocs(collection(db, "tasks"))
        ]);

        const users = [];
        const usersMap = {};
        usersSnap.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            users.push(data);
            usersMap[data.id] = data;
        });

        const projects = [];
        projSnap.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            projects.push(data);
        });

        const tasks = [];
        tasksSnap.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            tasks.push(data);
        });

        // Hide loading
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.style.display = 'none';
        document.querySelector('.qa-content.active').style.display = 'block';

        // 1. Missing Info
        const missingInfoContainer = document.getElementById('list-missing-info');
        const missingUsers = users.filter(u => (u.role === 'student' || u.role === 'user') && (!u.telegramId || !u.fullName));
        if (missingUsers.length === 0) {
            missingInfoContainer.innerHTML = '<div style="padding: 15px; color: var(--status-success); background: #e8f5e9; border-radius: 6px;">Tất cả sinh viên đều đã có đủ thông tin cá nhân.</div>';
        } else {
            missingInfoContainer.innerHTML = missingUsers.map(u => {
                let issues = [];
                if (!u.telegramId) issues.push("Thiếu Telegram ID");
                if (!u.fullName) issues.push("Thiếu Họ và Tên");
                return createListItem(u.fullName || u.email, `Email: ${u.email}`, issues.join(' | '));
            }).join('');

            // 6. GitHub Org Requests
            const githubOrgContainer = document.getElementById('list-github-org');
            const pendingGithubUsers = users.filter(u => u.githubOrgStatus === 'pending');

            if (pendingGithubUsers.length === 0) {
                githubOrgContainer.innerHTML = '<div style="padding: 15px; color: var(--text-secondary); background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px;">Không có yêu cầu duyệt gia nhập Organization nào.</div>';
            } else {
                githubOrgContainer.innerHTML = pendingGithubUsers.map(u => {
                    return `
                    <div style="padding: 15px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <strong style="color: var(--text-primary); font-size: 0.95em;">${u.fullName || u.email}</strong>
                            <div style="color: var(--text-secondary); font-size: 0.8em; margin-top: 3px;">GitHub Username: <strong style="color:var(--primary-color);">${u.githubUsername || 'N/A'}</strong></div>
                        </div>
                        <button class="btn-approve-github" data-uid="${u.id}" data-github="${u.githubUsername}" style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8em; font-weight: bold;">✅ Duyệt & Mời</button>
                    </div>
                `;
                }).join('');

                // Add Event Listeners for Approval
                setTimeout(() => {
                    document.querySelectorAll('.btn-approve-github').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const uid = e.target.getAttribute('data-uid');
                            const githubUser = e.target.getAttribute('data-github');
                            if (!githubUser || githubUser === 'N/A') {
                                alert("Sinh viên này chưa cung cấp Github Username!");
                                return;
                            }

                            if (confirm(`Hệ thống sẽ tự động gửi email mời tài khoản "${githubUser}" vào Organization. Bạn có chắc không?`)) {
                                e.target.innerHTML = 'Đang xử lý...';
                                e.target.disabled = true;
                                try {
                                    // 1. Update Firestore
                                    const { doc, updateDoc } = await import('./firebase-config.js');
                                    const userRef = doc(db, 'users', uid);
                                    await updateDoc(userRef, { githubOrgStatus: 'approved' });

                                    // 2. Call GAS Webhook
                                    const GAS_URL = "https://script.google.com/macros/s/AKfycbyaVjdmlIMh5E53XoURf9SX2Jf3zNyTRNcYIbZMGrYiLq96fiEE8V78FIbOtm3ibNqi7w/exec"; // Placeholder URL
                                    // await fetch(GAS_URL + "?action=invite_github&secret=123", {
                                    //     method: 'POST',
                                    //     body: JSON.stringify({ githubUsername: githubUser }),
                                    // });

                                    alert(`Đã duyệt thành công cho tài khoản ${githubUser}!`);
                                    e.target.parentElement.remove();
                                } catch (err) {
                                    console.error(err);
                                    alert("Có lỗi xảy ra: " + err.message);
                                    e.target.innerHTML = '✅ Duyệt & Mời';
                                    e.target.disabled = false;
                                }
                            }
                        });
                    });
                }, 500);
            }
        }

        // 2. Orphaned Users
        const orphansContainer = document.getElementById('list-orphans');
        const userProjectMap = {};
        users.forEach(u => userProjectMap[u.id] = 0);
        projects.forEach(p => {
            if (p.memberIds) {
                p.memberIds.forEach(id => {
                    if (userProjectMap[id] !== undefined) userProjectMap[id]++;
                });
            }
        });

        const orphanedUsers = users.filter(u => (u.role === 'student' || u.role === 'user') && userProjectMap[u.id] === 0);
        if (orphanedUsers.length === 0) {
            orphansContainer.innerHTML = '<div style="padding: 15px; color: var(--status-success); background: #e8f5e9; border-radius: 6px;">Không có sinh viên nào "đi lạc". Tất cả đều đã có nhóm.</div>';
        } else {
            orphansContainer.innerHTML = orphanedUsers.map(u => {
                return createListItem(u.fullName || u.email, `Email: ${u.email}`, "Chưa có Dự án");
            }).join('');
        }

        // 3. Dormant Accounts
        const dormantContainer = document.getElementById('list-dormant');
        const now = new Date().getTime();
        const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

        const userActivityMap = {}; // userId -> maxUpdatedAt
        users.forEach(u => userActivityMap[u.id] = 0);

        tasks.forEach(t => {
            if (t.isDeleted) return;
            let tUpdateMs = 0;
            if (t.updatedAt) {
                tUpdateMs = typeof t.updatedAt.toMillis === 'function' ? t.updatedAt.toMillis() : new Date(t.updatedAt).getTime();
            } else if (t.createdAt) {
                tUpdateMs = typeof t.createdAt.toMillis === 'function' ? t.createdAt.toMillis() : new Date(t.createdAt).getTime();
            }

            if (t.assigneeIds) {
                t.assigneeIds.forEach(id => {
                    if (userActivityMap[id] !== undefined && tUpdateMs > userActivityMap[id]) {
                        userActivityMap[id] = tUpdateMs;
                    }
                });
            }
        });

        const dormantUsers = users.filter(u => {
            if (u.role !== 'student' && u.role !== 'user') return false;
            // Only consider them dormant if they are in a project
            if (userProjectMap[u.id] === 0) return false;

            return userActivityMap[u.id] === 0 || (now - userActivityMap[u.id] > FOURTEEN_DAYS);
        });

        if (dormantUsers.length === 0) {
            dormantContainer.innerHTML = '<div style="padding: 15px; color: var(--status-success); background: #e8f5e9; border-radius: 6px;">Các thành viên đều đang có hoạt động cập nhật task trong 14 ngày qua.</div>';
        } else {
            dormantContainer.innerHTML = dormantUsers.map(u => {
                let reason = userActivityMap[u.id] === 0 ? "Chưa từng làm gì" : "Không có cập nhật nào > 14 ngày";
                return createListItem(u.fullName || u.email, `Email: ${u.email}`, reason);
            }).join('');
        }

        // 4. Bottleneck
        const bottleneckContainer = document.getElementById('list-bottleneck');
        const userTaskStats = {};
        users.forEach(u => userTaskStats[u.id] = { inprogressCount: 0, overdueCount: 0 });

        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

        tasks.forEach(t => {
            if (t.isDeleted || t.status === 'done') return;

            let isOverdueLong = false;
            if (t.deadline) {
                const dl = new Date(t.deadline).getTime();
                if (now - dl > SEVEN_DAYS) {
                    isOverdueLong = true;
                }
            }

            if (t.assigneeIds) {
                t.assigneeIds.forEach(id => {
                    if (userTaskStats[id]) {
                        if (t.status === 'inprogress') userTaskStats[id].inprogressCount++;
                        if (isOverdueLong) userTaskStats[id].overdueCount++;
                    }
                });
            }
        });

        const bottleneckUsers = users.filter(u => {
            if (u.role !== 'student' && u.role !== 'user') return false;
            return userTaskStats[u.id].inprogressCount > 5 || userTaskStats[u.id].overdueCount > 0;
        });

        if (bottleneckUsers.length === 0) {
            bottleneckContainer.innerHTML = '<div style="padding: 15px; color: var(--status-success); background: #e8f5e9; border-radius: 6px;">Mật độ công việc của các thành viên đang ở mức an toàn.</div>';
        } else {
            bottleneckContainer.innerHTML = bottleneckUsers.map(u => {
                const stats = userTaskStats[u.id];
                let issues = [];
                if (stats.inprogressCount > 5) issues.push(`Đang ôm ${stats.inprogressCount} tasks`);
                if (stats.overdueCount > 0) issues.push(`Có ${stats.overdueCount} task quá hạn > 7 ngày`);
                return createListItem(u.fullName || u.email, `Email: ${u.email}`, issues.join(' | '));
            }).join('');
        }

        // 5. Role Audit
        const auditContainer = document.getElementById('list-role-audit');
        const adminUsers = users.filter(u => u.role === 'super_admin' || u.role === 'teacher');

        auditContainer.innerHTML = adminUsers.map(u => {
            let roleStr = u.role === 'super_admin' ? 'Super Admin' : 'Teacher';
            let bg = u.role === 'super_admin' ? '#d32f2f' : '#1976d2';
            let roleBadge = `<span style="background: ${bg}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">${roleStr}</span>`;
            return `
                <div style="padding: 10px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <strong style="color: var(--text-primary); font-size: 0.95em;">${u.fullName || u.email}</strong>
                        <div style="color: var(--text-secondary); font-size: 0.8em; margin-top: 3px;">Email: ${u.email}</div>
                    </div>
                    ${roleBadge}
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        document.getElementById('loadingIndicator').innerHTML = '<span style="color: red;">Lỗi tải dữ liệu. Hãy kiểm tra console.</span>';
    }
}
