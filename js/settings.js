import { db, doc, getDoc, setDoc } from './firebase-config.js';
import { currentUserProfile } from './app.js';

document.addEventListener("DOMContentLoaded", () => {
    const keywordTagsContainer = document.getElementById("keywordTagsContainer");
    const newKeywordInput = document.getElementById("newKeywordInput");
    const btnAddKeyword = document.getElementById("btnAddKeyword");
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    
    let currentKeywords = [];
    let isModified = false;

    // Load settings when user is ready
    document.addEventListener("UserLoaded", async (e) => {
        const user = e.detail;
        
        // Basic role check - only allow admins or teachers to save
        if (user.role === 'student') {
            btnSaveSettings.style.display = 'none';
            newKeywordInput.disabled = true;
            btnAddKeyword.disabled = true;
            newKeywordInput.placeholder = "Bạn không có quyền thay đổi cài đặt này.";
        }

        await loadSettings();
    });

    document.addEventListener("UserLoggedOut", () => {
        keywordTagsContainer.innerHTML = '<span style="color: #666; font-style: italic;">Vui lòng đăng nhập...</span>';
        btnSaveSettings.style.display = 'none';
    });

    async function loadSettings() {
        try {
            const systemDocRef = doc(db, "settings", "system");
            const docSnap = await getDoc(systemDocRef);
            
            if (docSnap.exists() && docSnap.data().webhookDoneKeywords) {
                currentKeywords = docSnap.data().webhookDoneKeywords;
            } else {
                // Fallback default if not exists
                currentKeywords = ["fix", "resolve", "complete", "done"];
            }
            renderKeywords();
        } catch (error) {
            console.error("Error loading settings:", error);
            keywordTagsContainer.innerHTML = '<span style="color: red;">Lỗi tải dữ liệu.</span>';
        }
    }

    function renderKeywords() {
        keywordTagsContainer.innerHTML = '';
        currentKeywords.forEach((kw, index) => {
            const tag = document.createElement("div");
            tag.className = "tag";
            tag.innerHTML = `
                ${kw}
                ${currentUserProfile && currentUserProfile.role !== 'student' ? `<span class="tag-remove" data-index="${index}">×</span>` : ''}
            `;
            keywordTagsContainer.appendChild(tag);
        });

        // Add event listeners to remove buttons
        document.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                currentKeywords.splice(idx, 1);
                markAsModified();
                renderKeywords();
            });
        });
    }

    function markAsModified() {
        if (currentUserProfile && currentUserProfile.role !== 'student') {
            isModified = true;
            btnSaveSettings.style.display = 'block';
            btnSaveSettings.style.background = '#ff9800'; // Highlight save button
            btnSaveSettings.innerHTML = '⚠️ Lưu Cài Đặt (Chưa lưu)';
        }
    }

    btnAddKeyword.addEventListener('click', () => {
        const val = newKeywordInput.value.trim().toLowerCase();
        if (val && !currentKeywords.includes(val)) {
            currentKeywords.push(val);
            newKeywordInput.value = '';
            markAsModified();
            renderKeywords();
        }
    });

    newKeywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnAddKeyword.click();
        }
    });

    btnSaveSettings.addEventListener('click', async () => {
        if (!currentUserProfile || currentUserProfile.role === 'student') return;
        
        btnSaveSettings.innerHTML = 'Đang lưu...';
        btnSaveSettings.disabled = true;

        try {
            const systemDocRef = doc(db, "settings", "system");
            await setDoc(systemDocRef, {
                webhookDoneKeywords: currentKeywords
            }, { merge: true });

            isModified = false;
            btnSaveSettings.style.background = 'var(--primary-color)';
            btnSaveSettings.innerHTML = '✅ Đã Lưu Thành Công';
            
            setTimeout(() => {
                if (!isModified) {
                    btnSaveSettings.style.display = 'none';
                }
            }, 3000);
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Lỗi khi lưu cài đặt: " + error.message);
            btnSaveSettings.innerHTML = 'Lưu Thất Bại';
        } finally {
            btnSaveSettings.disabled = false;
        }
    });
});
