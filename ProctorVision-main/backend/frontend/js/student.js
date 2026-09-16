// ================= STUDENT.JS — FINAL WORKING VERSION =================
const API_BASE_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser"));

    if (!currentUser || currentUser.role !== "student") {
        window.location.href = "index.html";
        return;
    }

    // User info
    document.getElementById("userName").textContent = currentUser.name;
    document.getElementById("userEmail").textContent = currentUser.email;
    document.getElementById("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();

    // Navigation
    document.getElementById("dashboardLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("dashboardContent");
        loadStudentDashboard();
    });

    document.getElementById("enterCodeLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("enterCodeContent");
    });

    document.getElementById("myExamsLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("myExamsContent");
        loadMyExams();
    });

    document.getElementById("resultsLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("resultsContent");
        loadMyResults();
    });

    // Enter exam code
    document.getElementById("examCodeInput")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            validateExamCode();
        }
    });

    document.getElementById("validateCodeBtn")?.addEventListener("click", validateExamCode);

    // Initialize
    const isAccessible = localStorage.getItem("accessibilityMode") === "true";
    const toggle = document.getElementById("accessibilityToggle");
    if (toggle) {
        toggle.checked = isAccessible;
        console.log("✅ Accessibility toggle initialized:", isAccessible);
        toggle.addEventListener("change", (e) => {
            localStorage.setItem("accessibilityMode", e.target.checked);
            console.log("🔄 Accessibility mode changed to:", e.target.checked);
        });
    } else {
        console.warn("⚠️ Accessibility toggle element not found!");
    }

    showPage("dashboardContent");
    loadStudentDashboard();
});

// ================= PAGE NAVIGATION =================
function showPage(pageId) {
    const pages = ["dashboardContent", "enterCodeContent", "myExamsContent", "resultsContent"];
    pages.forEach(id => {
        document.getElementById(id).style.display = id === pageId ? "block" : "none";
    });

    // Update active menu
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });
    document.querySelector(`[data-page="${pageId}"]`)?.classList.add("active");
}

// ================= VALIDATE EXAM CODE =================
async function validateExamCode() {
    const codeInput = document.getElementById("examCodeInput");
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        alert("Please enter an exam code");
        return;
    }

    try {
        const token = localStorage.getItem("token");

        // Validate exam code with backend
        const response = await fetch(`${API_BASE_URL}/exams/${code}`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Invalid exam code. Please check and try again.");
            } else if (response.status === 403) {
                throw new Error("You are not authorized to access this exam.");
            } else {
                throw new Error("Failed to validate exam code.");
            }
        }

        // Exam is valid, redirect to exam page
        const isAccessible = document.getElementById("accessibilityToggle")?.checked || false;
        console.log("🔍 Accessibility Toggle State:", isAccessible);
        console.log("🔍 Toggle Element:", document.getElementById("accessibilityToggle"));
        window.location.href = `exam.html?code=${code}${isAccessible ? '&accessible=true' : ''}`;

    } catch (error) {
        console.error("Error validating exam code:", error);
        alert(error.message || "Failed to validate exam code. Please try again.");
        codeInput.value = "";
        codeInput.focus();
    }
}

// ================= STUDENT DASHBOARD =================
async function loadStudentDashboard() {
    try {
        const token = localStorage.getItem("token");

        // Load student's active exams
        const response = await fetch(`${API_BASE_URL}/exams/student/active`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.ok) {
            const exams = await response.json();

            // Update dashboard stats (if element exists)
            const activeExamsElement = document.getElementById("activeExams");
            if (activeExamsElement) {
                activeExamsElement.textContent = exams.length;
            }

            // Load recent exams
            const table = document.querySelector("#activeExamsTable tbody");
            if (table) {
                table.innerHTML = "";
                exams.forEach(exam => {
                    const row = table.insertRow();
                    row.innerHTML = `
                        <td>${exam.title}</td>
                        <td>${exam.duration} min</td>
                        <td>${exam.questions?.length || 0} questions</td>
                        <td>
                            <button class="btn btn-start" onclick="startExam('${exam.exam_code}')">
                                Start Exam
                            </button>
                        </td>
                    `;
                });
            }
        }
    } catch (error) {
        console.error("Error loading student dashboard:", error);
    }
}

function startExam(examCode) {
    const isAccessible = document.getElementById("accessibilityToggle")?.checked || false;
    window.location.href = `exam.html?code=${examCode}${isAccessible ? '&accessible=true' : ''}`;
}

// ================= MY EXAMS =================
async function loadMyExams() {
    try {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_BASE_URL}/exams/student/all`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            document.querySelector("#myExamsTable tbody").innerHTML =
                "<tr><td colspan='5'>No exams available</td></tr>";
            return;
        }

        const exams = await response.json();
        const table = document.querySelector("#myExamsTable tbody");

        if (table) {
            table.innerHTML = "";
            exams.forEach(exam => {
                const row = table.insertRow();
                row.innerHTML = `
                    <td>${exam.title}</td>
                    <td>${exam.duration} min</td>
                    <td>${exam.questions?.length || 0}</td>
                    <td>${exam.is_active ? 'Active' : 'Completed'}</td>
                    <td>
                        <button class="btn btn-view" onclick="viewExam('${exam.exam_code}')">
                            ${exam.is_active ? 'Start' : 'View'}
                        </button>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error("Error loading my exams:", error);
    }
}

// ================= MY RESULTS =================
async function loadMyResults() {
    try {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_BASE_URL}/exams/student/submissions`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            document.querySelector("#resultsTable tbody").innerHTML =
                "<tr><td colspan='6'>No results yet</td></tr>";
            return;
        }

        const submissions = await response.json();
        const table = document.querySelector("#resultsTable tbody");

        if (table) {
            table.innerHTML = "";
            submissions.forEach(sub => {
                const row = table.insertRow();
                row.innerHTML = `
                    <td>${sub.exam_title || "Unknown"}</td>
                    <td>${new Date(sub.submitted_at).toLocaleDateString()}</td>
                    <td>${sub.score || 0}/${sub.total_marks || 0}</td>
                    <td>${sub.percentage || 0}%</td>
                    <td>${sub.cheating_warnings || 0}</td>
                    <td>
                        <span class="status ${sub.cheating_warnings > 0 ? 'warning' : 'completed'}">
                            ${sub.cheating_warnings > 0 ? '⚠️ Flagged' : 'Completed'}
                        </span>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error("Error loading results:", error);
    }
}

function viewExam(examCode) {
    if (confirm("Do you want to view this exam?")) {
        const isAccessible = document.getElementById("accessibilityToggle")?.checked || false;
        window.location.href = `exam.html?code=${examCode}${isAccessible ? '&accessible=true' : ''}`;
    }
}

// ================= LOGOUT =================
function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("token");
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
    }
}

// ================= GLOBAL EXPORTS =================
window.validateExamCode = validateExamCode;
window.startExam = startExam;
window.viewExam = viewExam;
window.logout = logout;
window.closeModal = function (modalId) {
    document.getElementById(modalId).style.display = 'none';
};