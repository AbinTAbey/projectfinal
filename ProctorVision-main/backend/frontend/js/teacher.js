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
        "resultsLink": "resultsContent",
        "malpracticeLink": "malpracticeContent"
    };

    Object.entries(navMap).forEach(([linkId, pageId]) => {
        const link = document.getElementById(linkId);
        if (link) {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                showPage(pageId);

                if (pageId === "dashboardContent") loadDashboardStats();
                if (pageId === "myExamsContent") loadMyExams();
                if (pageId === "resultsContent") loadResults();
            });
        }
    });
}

// ================= PAGE NAVIGATION =================
function showPage(pageId) {
    const pages = [
        "dashboardContent", "createExamContent",
        "myExamsContent", "resultsContent", "malpracticeContent"
    ];
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
                        <button onclick="openMalpracticeModal('${exam.exam_code}')" class="btn btn-secondary"
                                style="font-size:.8em; padding:4px 10px;">
                            <i class="fas fa-shield-alt"></i> Log
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

// ================= MALPRACTICE LOG =================

// Internal cache of last fetched log (used for CSV export)
let _lastMalpracticeLog = [];

/**
 * Helper: build an HTML table string from a log events array.
 */
function _buildLogTable(events) {
    if (!events || events.length === 0) {
        return '<p style="color:#999; padding:10px;">No malpractice events recorded for this exam.</p>';
    }

    const severityStyle = {
        high: 'background:#fdecea; color:#c0392b; border-left:4px solid #e74c3c;',
        medium: 'background:#fef3e2; color:#a04000; border-left:4px solid #e67e22;',
        low: 'background:#fefde2; color:#7d6608; border-left:4px solid #f1c40f;'
    };
    const severityBadge = {
        high: '<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">HIGH</span>',
        medium: '<span style="background:#e67e22;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">MED</span>',
        low: '<span style="background:#f1c40f;color:#333;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">LOW</span>'
    };

    let rows = events.map((e, i) => `
        <tr style="${severityStyle[e.severity] || ''}">
            <td>${i + 1}</td>
            <td><strong>${e.student_name}</strong></td>
            <td style="font-size:.85em;color:#666;">${e.student_email}</td>
            <td>${e.event_label}</td>
            <td>${severityBadge[e.severity] || e.severity}</td>
            <td>${e.confidence}%</td>
            <td style="font-size:.85em;white-space:nowrap;">
                ${new Date(e.timestamp).toLocaleString()}
            </td>
        </tr>
    `).join('');

    return `
        <table style="width:100%; border-collapse:collapse; font-size:.9em;">
            <thead>
                <tr style="background:#2c3e50; color:#fff;">
                    <th style="padding:8px 12px;">#</th>
                    <th style="padding:8px 12px;">Student</th>
                    <th style="padding:8px 12px;">Email</th>
                    <th style="padding:8px 12px;">Violation Detected</th>
                    <th style="padding:8px 12px;">Severity</th>
                    <th style="padding:8px 12px;">Confidence</th>
                    <th style="padding:8px 12px;">Date &amp; Time</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

/**
 * Called from the dedicated Malpractice Log page (search by code input).
 */
async function fetchMalpracticeLog() {
    const codeInput = document.getElementById('malpracticeExamCode');
    const examCode = codeInput ? codeInput.value.trim().toUpperCase() : '';

    if (!examCode) {
        showToast('Please enter an exam code', 'error');
        return;
    }

    const btn = document.getElementById('fetchLogBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…'; }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/exams/${examCode}/malpractice-log`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error ${res.status}`);
        }

        const data = await res.json();
        _lastMalpracticeLog = data.events || [];

        // --- summary banner ---
        const summary = document.getElementById('malpracticeSummary');
        const titleEl = document.getElementById('malpracticeExamTitle');
        const totalEl = document.getElementById('malpracticeTotalLabel');
        const badgeHigh = document.getElementById('badgeHigh');
        const badgeMed = document.getElementById('badgeMedium');
        const badgeLow = document.getElementById('badgeLow');

        const high = _lastMalpracticeLog.filter(e => e.severity === 'high').length;
        const medium = _lastMalpracticeLog.filter(e => e.severity === 'medium').length;
        const low = _lastMalpracticeLog.filter(e => e.severity === 'low').length;

        if (summary) summary.style.display = 'block';
        if (titleEl) titleEl.textContent = data.exam_title || examCode;
        if (totalEl) totalEl.textContent = `${data.total_events} event(s) recorded`;
        if (badgeHigh) badgeHigh.textContent = `HIGH ${high}`;
        if (badgeMed) badgeMed.textContent = `MED ${medium}`;
        if (badgeLow) badgeLow.textContent = `LOW ${low}`;

        // --- table ---
        const tbody = document.getElementById('malpracticeTableBody');
        if (tbody) {
            const severityStyle = {
                high: 'background:#fdecea;',
                medium: 'background:#fef3e2;',
                low: 'background:#fefde2;'
            };
            const severityBadge = {
                high: '<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">HIGH</span>',
                medium: '<span style="background:#e67e22;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">MED</span>',
                low: '<span style="background:#f1c40f;color:#333;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8em;">LOW</span>'
            };

            if (_lastMalpracticeLog.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">No malpractice events recorded for this exam. 🎉</td></tr>';
            } else {
                tbody.innerHTML = _lastMalpracticeLog.map((e, i) => `
                    <tr style="${severityStyle[e.severity] || ''}">
                        <td>${i + 1}</td>
                        <td><strong>${e.student_name}</strong></td>
                        <td style="font-size:.85em;color:#666;">${e.student_email}</td>
                        <td>${e.event_label}</td>
                        <td>${severityBadge[e.severity] || e.severity}</td>
                        <td>${e.confidence}%</td>
                        <td style="font-size:.85em;white-space:nowrap;">${new Date(e.timestamp).toLocaleString()}</td>
                    </tr>
                `).join('');
            }
        }

        // Show export button
        const exportRow = document.getElementById('malpracticeExportRow');
        if (exportRow) exportRow.style.display = _lastMalpracticeLog.length > 0 ? 'block' : 'none';

        showToast(`Log loaded: ${data.total_events} event(s)`, 'success');

    } catch (err) {
        console.error('Malpractice log error:', err);
        showToast('Failed to load log: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Fetch Log'; }
    }
}

/**
 * Called from the "Log" button in the My Exams table row.
 * Opens a modal with the log for that specific exam code.
 */
async function openMalpracticeModal(examCode) {
    const modal = document.getElementById('malpracticeModal');
    const title = document.getElementById('malpracticeModalTitle');
    const body = document.getElementById('malpracticeModalBody');

    if (!modal) return;

    if (title) title.innerHTML = `<i class="fas fa-shield-alt"></i> Malpractice Log — ${examCode}`;
    if (body) body.innerHTML = '<p style="padding:20px; color:#999;"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
    modal.style.display = 'flex';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/exams/${examCode}/malpractice-log`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error ${res.status}`);
        }

        const data = await res.json();
        const events = data.events || [];

        const high = events.filter(e => e.severity === 'high').length;
        const medium = events.filter(e => e.severity === 'medium').length;
        const low = events.filter(e => e.severity === 'low').length;

        const summary = `
            <div style="margin-bottom:14px; padding:12px 16px; background:#fff3cd;
                        border-left:4px solid #ffc107; border-radius:6px;">
                <strong>${data.exam_title}</strong> &mdash;
                ${data.total_events} event(s) &nbsp;
                <span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:4px;font-size:.8em;font-weight:700;">HIGH ${high}</span>
                <span style="background:#e67e22;color:#fff;padding:2px 8px;border-radius:4px;font-size:.8em;font-weight:700;margin-left:6px;">MED ${medium}</span>
                <span style="background:#f1c40f;color:#333;padding:2px 8px;border-radius:4px;font-size:.8em;font-weight:700;margin-left:6px;">LOW ${low}</span>
            </div>
        `;

        if (body) body.innerHTML = summary + _buildLogTable(events);

    } catch (err) {
        if (body) body.innerHTML = `<p style="color:#e74c3c; padding:20px;">Error: ${err.message}</p>`;
    }
}

/**
 * Export the currently displayed malpractice log as a CSV file.
 */
function exportMalpracticeCSV() {
    if (!_lastMalpracticeLog || _lastMalpracticeLog.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const examCode = document.getElementById('malpracticeExamCode')?.value.trim() || 'exam';

    const header = ['#', 'Student Name', 'Student Email', 'Violation', 'Severity', 'Confidence (%)', 'Timestamp'];
    const rows = _lastMalpracticeLog.map((e, i) => [
        i + 1, e.student_name, e.student_email,
        e.event_label, e.severity.toUpperCase(),
        e.confidence, new Date(e.timestamp).toLocaleString()
    ]);

    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `malpractice-log-${examCode}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully!', 'success');
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
// Malpractice log
window.fetchMalpracticeLog = fetchMalpracticeLog;
window.openMalpracticeModal = openMalpracticeModal;
window.exportMalpracticeCSV = exportMalpracticeCSV;