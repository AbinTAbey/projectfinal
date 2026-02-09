// ================= TEACHER.JS — COMPLETE FIXED VERSION =================
const API_BASE_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser"));
    const token = localStorage.getItem("token");

    if (!currentUser || currentUser.role !== "teacher" || !token) {
        window.location.href = "index.html";
        return;
    }

    // User info
    const userNameEl = document.getElementById("userName");
    const userEmailEl = document.getElementById("userEmail");
    const userAvatarEl = document.getElementById("userAvatar");
    
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userEmailEl) userEmailEl.textContent = currentUser.email;
    if (userAvatarEl) userAvatarEl.textContent = currentUser.name.charAt(0).toUpperCase();

    // Navigation setup
    setupNavigation();
    
    // Create exam form
    const form = document.getElementById("createExamForm");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleCreateExam();
        });
    }

    // Initialize
    showPage("dashboardContent");
    loadDashboardStats();
});

// ================= SETUP NAVIGATION =================
function setupNavigation() {
    const navMap = {
        "dashboardLink": "dashboardContent",
        "createExamLink": "createExamContent",
        "examsLink": "myExamsContent", 
        "resultsLink": "resultsContent"
    };

    Object.entries(navMap).forEach(([linkId, pageId]) => {
        const link = document.getElementById(linkId);
        if (link) {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                showPage(pageId);
                
                // Load data for specific pages
                if (pageId === "dashboardContent") loadDashboardStats();
                if (pageId === "myExamsContent") loadMyExams();
                if (pageId === "resultsContent") loadResults();
            });
        }
    });
}

// ================= PAGE NAVIGATION =================
function showPage(pageId) {
    const pages = ["dashboardContent", "createExamContent", "myExamsContent", "resultsContent"];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === pageId ? "block" : "none";
    });

    // Update active menu
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });
    
    const activeLink = document.getElementById(pageId.replace("Content", "Link"));
    if (activeLink) activeLink.classList.add("active");
}

// ================= DASHBOARD =================
async function loadDashboardStats() {
    try {
        const token = localStorage.getItem("token");
        
        const response = await fetch(`${API_BASE_URL}/exams/my-exams`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("Failed to load exams");
        
        const exams = await response.json();
        
        // Update dashboard stats
        const totalExamsEl = document.getElementById("totalExams");
        const completedExamsEl = document.getElementById("completedExams");
        const cheatingCasesEl = document.getElementById("cheatingCases");
        const totalStudentsEl = document.getElementById("totalStudents");
        
        if (totalExamsEl) totalExamsEl.textContent = exams.length;
        if (completedExamsEl) completedExamsEl.textContent = exams.reduce((total, exam) => 
            total + (exam.submissions_count || 0), 0
        );
        if (cheatingCasesEl) cheatingCasesEl.textContent = exams.reduce((total, exam) => 
            total + (exam.cheating_cases || 0), 0
        );
        if (totalStudentsEl) totalStudentsEl.textContent = exams.reduce((total, exam) => 
            total + (exam.students_count || 0), 0
        );
        
        // Load recent exams table
        const table = document.querySelector("#examsTable tbody");
        if (table) {
            table.innerHTML = "";
            exams.slice(0, 5).forEach(exam => {
                const row = table.insertRow();
                row.innerHTML = `
                    <td>${exam.title}</td>
                    <td>${new Date(exam.created_at).toLocaleDateString()}</td>
                    <td>${exam.submissions_count || 0}</td>
                    <td><span class="status ${exam.is_active ? 'active' : 'inactive'}">
                        ${exam.is_active ? 'Active' : 'Inactive'}
                    </span></td>
                    <td>
                        <button class="btn btn-view" onclick="viewExamDetails('${exam.exam_code}')">
                            View
                        </button>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error("Error loading dashboard:", error);
        alert("Failed to load dashboard data");
    }
}

// ================= CREATE EXAM =================
let questionCounter = 0;

function addMCQ() {
    questionCounter++;
    const container = document.getElementById("questionsContainer");
    if (!container) return;
    
    container.insertAdjacentHTML("beforeend", `
        <div class="question-item" data-type="mcq" data-id="${questionCounter}">
            <div class="question-header">
                <h4>Question ${questionCounter} (Multiple Choice)</h4>
                <span class="correct-indicator" id="correctIndicator${questionCounter}">Correct: Option A</span>
            </div>
            
            <input class="question-text" placeholder="Enter your question here..." required>
            
            <div class="options-container">
                <div class="option-row">
                    <input type="radio" name="correct_${questionCounter}" value="0" checked 
                           onchange="updateCorrectIndicator(${questionCounter}, 0)">
                    <input class="option-text" placeholder="Option A (Correct Answer)" required>
                    <span class="option-label">A</span>
                </div>
                <div class="option-row">
                    <input type="radio" name="correct_${questionCounter}" value="1" 
                           onchange="updateCorrectIndicator(${questionCounter}, 1)">
                    <input class="option-text" placeholder="Option B" required>
                    <span class="option-label">B</span>
                </div>
                <div class="option-row">
                    <input type="radio" name="correct_${questionCounter}" value="2" 
                           onchange="updateCorrectIndicator(${questionCounter}, 2)">
                    <input class="option-text" placeholder="Option C">
                    <span class="option-label">C</span>
                </div>
                <div class="option-row">
                    <input type="radio" name="correct_${questionCounter}" value="3" 
                           onchange="updateCorrectIndicator(${questionCounter}, 3)">
                    <input class="option-text" placeholder="Option D">
                    <span class="option-label">D</span>
                </div>
            </div>
            
            <div class="marks-row">
                <label>Marks:</label>
                <input class="question-marks" type="number" value="1" min="1">
                <button type="button" onclick="removeQuestion(this)" class="remove-btn">
                    Remove Question
                </button>
            </div>
        </div>
    `);
}

function addShortAnswer() {
    questionCounter++;
    const container = document.getElementById("questionsContainer");
    if (!container) return;
    
    container.insertAdjacentHTML("beforeend", `
        <div class="question-item" data-type="short">
            <h4>Question ${questionCounter} (Short Answer)</h4>
            
            <input class="question-text" placeholder="Enter your question here..." required>
            
            <div class="expected-answer-container">
                <label>Expected Answer (for auto-grading):</label>
                <input class="expected-answer" placeholder="Enter expected answer...">
            </div>
            
            <div class="marks-row">
                <label>Marks:</label>
                <input class="question-marks" type="number" value="5" min="1">
                <button type="button" onclick="removeQuestion(this)" class="remove-btn">
                    Remove Question
                </button>
            </div>
        </div>
    `);
}

function updateCorrectIndicator(questionId, optionIndex) {
    const indicator = document.getElementById(`correctIndicator${questionId}`);
    const optionLabels = ['A', 'B', 'C', 'D'];
    if (indicator) {
        indicator.textContent = `Correct: Option ${optionLabels[optionIndex]}`;
    }
}

function removeQuestion(btn) {
    const questionItem = btn.closest(".question-item");
    if (questionItem) {
        questionItem.remove();
    }
}

async function handleCreateExam() {
    const token = localStorage.getItem("token");
    
    const titleInput = document.getElementById("examTitle");
    const durationInput = document.getElementById("examDuration");
    
    const title = titleInput ? titleInput.value.trim() : "";
    const description = document.getElementById("examDescription")?.value.trim() || "";
    const duration = durationInput ? parseInt(durationInput.value) : 0;
    const accessType = document.getElementById("accessType")?.value || "link";

    if (!title || !duration || duration <= 0) {
        alert("Please fill in all required fields with valid values");
        return;
    }

    // Collect questions
    const questions = [];
    const questionItems = document.querySelectorAll(".question-item");
    
    for (let i = 0; i < questionItems.length; i++) {
        const q = questionItems[i];
        const type = q.dataset.type;
        const questionTextInput = q.querySelector(".question-text");
        const marksInput = q.querySelector(".question-marks");
        
        const questionText = questionTextInput ? questionTextInput.value.trim() : "";
        const marks = marksInput ? parseInt(marksInput.value) || 1 : 1;

        if (!questionText) {
            alert(`Question ${i + 1} needs text`);
            return;
        }

        if (type === "mcq") {
            const optionInputs = q.querySelectorAll(".option-text");
            const options = Array.from(optionInputs)
                .map(input => input.value.trim())
                .filter(val => val !== "");

            if (options.length < 2) {
                alert(`Question ${i + 1} needs at least 2 options`);
                return;
            }

            // Get correct answer
            const questionId = q.dataset.id;
            const correctRadio = q.querySelector(`input[name="correct_${questionId}"]:checked`);
            const correctAnswer = correctRadio ? parseInt(correctRadio.value) : 0;

            questions.push({
                question_text: questionText,
                type: "mcq",
                options: options,
                correct_answer: correctAnswer,
                marks: marks
            });
        } else {
            const expectedAnswerInput = q.querySelector(".expected-answer");
            const expectedAnswer = expectedAnswerInput ? expectedAnswerInput.value.trim() : "";
            
            questions.push({
                question_text: questionText,
                type: "short",
                expected_answer: expectedAnswer,
                marks: marks
            });
        }
    }

    if (questions.length === 0) {
        alert("Please add at least one question");
        return;
    }

    try {
        const examData = {
            title: title,
            description: description,
            duration: duration,
            questions: questions,
            access_type: accessType
        };

        const response = await fetch(`${API_BASE_URL}/exams/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(examData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to create exam");
        }

        const exam = await response.json();
        
        // Show success modal with exam code and link
        const generatedLink = document.getElementById("generatedLink");
        const examCodeDisplay = document.getElementById("examCodeDisplay");
        const examLinkModal = document.getElementById("examLinkModal");
        
        if (generatedLink && exam.exam_code) {
            const examLink = `${window.location.origin}/exam.html?code=${exam.exam_code}`;
            generatedLink.value = examLink;
        }
        
        if (examCodeDisplay && exam.exam_code) {
            examCodeDisplay.textContent = exam.exam_code;
        }
        
        if (examLinkModal) {
            examLinkModal.style.display = "flex";
        }
        
        // Reset form
        const createExamForm = document.getElementById("createExamForm");
        const questionsContainer = document.getElementById("questionsContainer");
        
        if (createExamForm) createExamForm.reset();
        if (questionsContainer) questionsContainer.innerHTML = "";
        questionCounter = 0;
        
    } catch (error) {
        console.error("Error creating exam:", error);
        alert("Failed to create exam: " + error.message);
    }
}

// ================= MY EXAMS =================
async function loadMyExams() {
    try {
        const token = localStorage.getItem("token");
        
        const response = await fetch(`${API_BASE_URL}/exams/my-exams`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("Failed to load exams");
        
        const exams = await response.json();
        const tbody = document.querySelector("#myExamsTable tbody");
        
        if (tbody) {
            tbody.innerHTML = "";
            
            exams.forEach(exam => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>
                        <input type="checkbox" class="exam-checkbox" value="${exam.id}">
                    </td>
                    <td>${exam.title}</td>
                    <td>${exam.is_active ? "Active" : "Inactive"}</td>
                    <td>${new Date(exam.created_at).toLocaleDateString()}</td>
                    <td><strong>${exam.exam_code}</strong></td>
                    <td>${exam.questions?.length || 0}</td>
                    <td>${exam.duration} min</td>
                    <td>${exam.students_count || 0}</td>
                    <td>${exam.submissions_count || 0}</td>
                    <td>
                        <button onclick="viewExamDetails('${exam.exam_code}')" class="btn btn-view">
                            View
                        </button>
                        <button onclick="deleteExam('${exam.id}')" class="btn btn-danger">
                            Delete
                        </button>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error("Error loading exams:", error);
        alert("Failed to load exams");
    }
}

function filterExams(filter) {
    // This would filter the exams table
    console.log(`Filtering exams by: ${filter}`);
    // Implementation would depend on how you want to handle filtering
}

async function deleteExam(examId) {
    if (!confirm("Are you sure you want to delete this exam? This cannot be undone.")) return;
    
    try {
        const token = localStorage.getItem("token");
        
        const response = await fetch(`${API_BASE_URL}/exams/${examId}`, {
            method: "DELETE",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("Failed to delete exam");
        
        alert("Exam deleted successfully");
        loadMyExams();
        loadDashboardStats();
    } catch (error) {
        console.error("Error deleting exam:", error);
        alert("Failed to delete exam");
    }
}

// ================= RESULTS =================
async function loadResults() {
    try {
        const token = localStorage.getItem("token");
        
        const response = await fetch(`${API_BASE_URL}/exams/my-submissions`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const table = document.querySelector("#resultsTable tbody");
            if (table) {
                table.innerHTML = "<tr><td colspan='6'>No results yet</td></tr>";
            }
            return;
        }
        
        const submissions = await response.json();
        const table = document.querySelector("#resultsTable tbody");
        
        if (table) {
            table.innerHTML = "";
            
            submissions.forEach(sub => {
                const row = table.insertRow();
                row.innerHTML = `
                    <td>${sub.student_name || "Unknown"}</td>
                    <td>${sub.exam_title || "Unknown"}</td>
                    <td>${new Date(sub.submitted_at).toLocaleDateString()}</td>
                    <td>${sub.score || 0}/${sub.total_marks || 0}</td>
                    <td>${sub.percentage || 0}%</td>
                    <td>
                        <span class="status ${sub.cheating_count > 0 ? 'warning' : 'completed'}">
                            ${sub.cheating_count > 0 ? '⚠️ Flagged' : 'Completed'}
                        </span>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error("Error loading results:", error);
    }
}

// ================= UTILITIES =================
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
}

async function copyLink() {
    const linkInput = document.getElementById("generatedLink");
    if (!linkInput) {
        showToast("Failed to copy link", "error");
        return;
    }
    
    const link = linkInput.value;
    if (!link) {
        showToast("No exam link available", "error");
        return;
    }
    
    try {
        await navigator.clipboard.writeText(link);
        showToast("Exam link copied to clipboard!", "success");
    } catch (error) {
        console.error("Failed to copy link:", error);
        showToast("Failed to copy link", "error");
    }
}

async function copyExamCode() {
    const linkInput = document.getElementById("generatedLink");
    const examCodeDisplay = document.getElementById("examCodeDisplay");
    
    let examCode = "";
    
    // Try to get from display element first
    if (examCodeDisplay && examCodeDisplay.textContent) {
        examCode = examCodeDisplay.textContent.trim();
    }
    
    // If not available in display, extract from URL
    if (!examCode && linkInput && linkInput.value) {
        try {
            const url = new URL(linkInput.value);
            examCode = url.searchParams.get('code');
        } catch (e) {
            console.error("Failed to parse URL:", e);
        }
    }
    
    if (!examCode) {
        showToast("No exam code available to copy", "error");
        return;
    }
    
    try {
        await navigator.clipboard.writeText(examCode);
        showToast(`Exam code "${examCode}" copied!`, "success");
    } catch (error) {
        console.error("Failed to copy exam code:", error);
        showToast("Failed to copy exam code", "error");
    }
}

function showToast(message, type = "success") {
    // Remove existing toast
    const existingToast = document.querySelector(".toast-notification");
    if (existingToast) existingToast.remove();
    
    // Create new toast
    const toast = document.createElement("div");
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; cursor:pointer;">×</button>
    `;
    
    // Add styles if not already present
    if (!document.querySelector('#toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-width: 300px;
                animation: slideIn 0.3s ease-out;
            }
            .toast-notification.error {
                background: #dc3545;
            }
            .toast-notification button {
                background: transparent;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                margin-left: 15px;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 3000);
}

function viewExamDetails(examCode) {
    alert(`Viewing exam: ${examCode}\n\nDetailed view would open here.`);
}

function toggleSelectAllExams(checkbox) {
    const checkboxes = document.querySelectorAll('.exam-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
}

function deleteMultipleExams() {
    const selectedExams = document.querySelectorAll('.exam-checkbox:checked');
    if (selectedExams.length === 0) {
        alert("Please select exams to delete");
        return;
    }
    
    alert(`Delete ${selectedExams.length} exam(s) functionality would be implemented here.`);
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
window.addMCQ = addMCQ;
window.addShortAnswer = addShortAnswer;
window.removeQuestion = removeQuestion;
window.updateCorrectIndicator = updateCorrectIndicator;
window.closeModal = closeModal;
window.copyLink = copyLink;
window.copyExamCode = copyExamCode;
window.loadMyExams = loadMyExams;
window.loadResults = loadResults;
window.viewExamDetails = viewExamDetails;
window.filterExams = filterExams;
window.deleteExam = deleteExam;
window.toggleSelectAllExams = toggleSelectAllExams;
window.deleteMultipleExams = deleteMultipleExams;
window.logout = logout;