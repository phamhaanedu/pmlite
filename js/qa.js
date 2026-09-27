document.addEventListener("DOMContentLoaded", () => {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".qa-tab-content");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active from all buttons
            tabBtns.forEach(b => b.classList.remove("active"));
            
            // Remove active from all contents
            tabContents.forEach(c => c.classList.remove("active"));
            
            // Add active to clicked button
            btn.classList.add("active");
            
            // Show target content
            const targetId = btn.getAttribute("data-target");
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add("active");
            }
        });
    });
});
