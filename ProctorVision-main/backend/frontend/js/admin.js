// ================= ADMIN.JS - CLEANED VERSION =================
// Single auth check, single navigation system, no duplicates

console.log('Admin dashboard loading...');

// ================= SINGLE AUTH CHECK =================
document.addEventListener("DOMContentLoaded", () => {
  console.log('DOM loaded - checking auth');
  
  const user = JSON.parse(localStorage.getItem("currentUser"));
  const token = localStorage.getItem("token");

  if (!user || !token || user.role !== "admin") {
    console.log('Auth failed, redirecting...');
    window.location.href = "index.html";
    return;
  }

  // Fill header info
  document.getElementById("userName").textContent = user.name || "Admin";
  document.getElementById("userEmail").textContent = user.email || "admin@example.com";
  document.getElementById("userAvatar").textContent = (user.name || "A").charAt(0).toUpperCase();

  // API configuration
  window.API_BASE_URL = window.API_BASE_URL || "https://probable-space-goggles-8000.preview.app.github.dev/api";
  console.log("🌐 Admin using API:", window.API_BASE_URL);

  // Setup navigation
  setupAdminNavigation();
  
  // Load initial dashboard
  showPage('dashboard');
});

// ================= NAVIGATION SETUP =================
function setupAdminNavigation() {
  console.log('Setting up admin navigation...');
  
  // Remove any existing event listeners by cloning
  ['dashboardLink', 'usersLink', 'examsLink', 'cheatingLink', 'reportsLink', 'systemLink'].forEach(id => {
    const link = document.getElementById(id);
    if (link) {
      const newLink = link.cloneNode(true);
      link.parentNode.replaceChild(newLink, link);
    }
  });

  // Add fresh event listeners
  document.getElementById('dashboardLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Dashboard clicked');
    showPage('dashboard');
  });

  document.getElementById('usersLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Users clicked');
    showPage('users');
  });

  document.getElementById('examsLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Exams clicked');
    showPage('exams');
  });

  document.getElementById('cheatingLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Cheating clicked');
    showPage('cheating');
  });

  document.getElementById('reportsLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Reports clicked');
    showPage('reports');
  });

  document.getElementById('systemLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('System clicked');
    showPage('system');
  });

  // Setup form submissions
  document.getElementById('addUserForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addNewUserBackend();
  });

  document.getElementById('editUserForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveUserChangesBackend();
  });

  // Date range toggle
  document.getElementById('dateRange')?.addEventListener('change', function() {
    const customDateRange = document.getElementById('customDateRange');
    if (this.value === 'custom') {
      customDateRange.style.display = 'block';
    } else {
      customDateRange.style.display = 'none';
    }
  });
}

// ================= SINGLE NAVIGATION FUNCTION =================
function showPage(page) {
  console.log('Showing admin page:', page);
  
  // Hide all content sections
  const sections = ['dashboardContent', 'usersContent', 'examsContent', 'cheatingContent', 'reportsContent', 'systemContent'];
  sections.forEach(section => {
    const element = document.getElementById(section);
    if (element) {
      element.style.display = 'none';
    }
  });

  // Remove active class from all menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });

  // Show selected page and set active menu
  let pageTitle = 'Admin Dashboard';
  
  switch(page) {
    case 'dashboard':
      document.getElementById('dashboardContent').style.display = 'block';
      document.getElementById('dashboardLink').classList.add('active');
      pageTitle = 'Admin Dashboard';
      loadAdminDashboard();
      break;
    case 'users':
      document.getElementById('usersContent').style.display = 'block';
      document.getElementById('usersLink').classList.add('active');
      pageTitle = 'User Management';
      loadUsers();
      break;
    case 'exams':
      document.getElementById('examsContent').style.display = 'block';
      document.getElementById('examsLink').classList.add('active');
      pageTitle = 'All Exams';
      loadAllExams();
      break;
    case 'cheating':
      document.getElementById('cheatingContent').style.display = 'block';
      document.getElementById('cheatingLink').classList.add('active');
      pageTitle = 'Cheating Cases';
      loadCheatingCasesBackend();
      break;
    case 'reports':
      document.getElementById('reportsContent').style.display = 'block';
      document.getElementById('reportsLink').classList.add('active');
      pageTitle = 'System Reports';
      loadReports();
      break;
    case 'system':
      document.getElementById('systemContent').style.display = 'block';
      document.getElementById('systemLink').classList.add('active');
      pageTitle = 'System Settings';
      loadSystemSettings();
      break;
  }

  // Update page title
  const pageTitleElement = document.getElementById('pageTitle');
  if (pageTitleElement) {
    pageTitleElement.textContent = pageTitle;
  }
}

// ================= ADMIN VARIABLES =================
let currentExamFilter = 'all';
let adminExamsToDelete = [];
let isAdminBatchDelete = false;
let currentUserFilter = 'all';
let currentCheatingFilter = 'all';

// ================= DASHBOARD FUNCTIONS =================
async function loadAdminDashboard() {
  try {
    console.log("📊 Loading admin dashboard...");
    
    // Try backend first
    const token = localStorage.getItem('token');
    if (token && window.API_BASE_URL) {
      try {
        const response = await fetch(`${window.API_BASE_URL}/admin/dashboard-stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const stats = await response.json();
          console.log("✅ Dashboard stats loaded from backend");
          
          document.getElementById('totalUsers').textContent = stats.users?.total || 0;
          document.getElementById('totalExams').textContent = stats.exams?.total || 0;
          document.getElementById('totalSubmissions').textContent = stats.submissions?.total || 0;
          document.getElementById('cheatingCases').textContent = stats.cheating?.total_cases || 0;
          document.getElementById('totalTeachers').textContent = stats.users?.teachers || 0;
          document.getElementById('totalStudents').textContent = stats.users?.students || 0;
          document.getElementById('activeSessions').textContent = stats.submissions?.in_progress || 0;
          
          loadRecentActivityBackend(stats.recent_activities || []);
          calculateStorageUsage();
          return;
        }
      } catch (error) {
        console.warn("Backend fetch failed, using localStorage");
      }
    }
    
    // Fallback to localStorage
    loadAdminDashboardFallback();
    
  } catch (error) {
    console.error("Error loading dashboard:", error);
    loadAdminDashboardFallback();
  }
}

function loadAdminDashboardFallback() {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const exams = JSON.parse(localStorage.getItem('exams')) || [];
  const submissions = JSON.parse(localStorage.getItem('submissions')) || [];
  
  document.getElementById('totalUsers').textContent = users.length;
  document.getElementById('totalExams').textContent = exams.length;
  document.getElementById('totalSubmissions').textContent = submissions.length;
  
  const cheatingCases = submissions.filter(sub => sub.cheatingCount > 0).length;
  document.getElementById('cheatingCases').textContent = cheatingCases;
  
  const teachers = users.filter(user => user.role === 'teacher').length;
  const students = users.filter(user => user.role === 'student').length;
  document.getElementById('totalTeachers').textContent = teachers;
  document.getElementById('totalStudents').textContent = students;
  
  loadRecentActivity();
  calculateStorageUsage();
  document.getElementById('activeSessions').textContent = '0';
}

// ================= USERS MANAGEMENT =================
function filterUsers(filter) {
  currentUserFilter = filter;
  loadUsers();
}

async function loadUsers() {
  console.log('Loading users...');
  
  const token = localStorage.getItem('token');
  
  if (token && window.API_BASE_URL) {
    try {
      const response = await fetch(`${window.API_BASE_URL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const users = await response.json();
        displayUsers(users);
        return;
      }
    } catch (error) {
      console.warn("Backend fetch failed, using localStorage");
    }
  }
  
  // Fallback to localStorage
  loadUsersFallback();
}

function loadUsersFallback() {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const submissions = JSON.parse(localStorage.getItem('submissions')) || [];
  
  let filteredUsers = [...users];
  
  if (currentUserFilter === 'student') {
    filteredUsers = users.filter(user => user.role === 'student');
  } else if (currentUserFilter === 'teacher') {
    filteredUsers = users.filter(user => user.role === 'teacher');
  } else if (currentUserFilter === 'admin') {
    filteredUsers = users.filter(user => user.role === 'admin');
  } else if (currentUserFilter === 'active') {
    filteredUsers = users.filter(user => user.status !== 'inactive');
  } else if (currentUserFilter === 'inactive') {
    filteredUsers = users.filter(user => user.status === 'inactive');
  }
  
  displayUsers(filteredUsers);
}

function displayUsers(users) {
  const usersTable = document.getElementById('usersTable');
  if (!usersTable) return;
  
  const tbody = usersTable.getElementsByTagName('tbody')[0];
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  
  users.forEach(user => {
    const row = tbody.insertRow();
    
    // Check if user data is from backend (has created_at) or localStorage (has createdAt)
    const createdAt = user.created_at || user.createdAt;
    const lastLogin = user.last_login || user.lastLogin;
    const userId = user.id || user.userId;
    const role = user.role;
    const status = user.status || 'active';
    const name = user.name;
    const email = user.email;
    
    row.innerHTML = `
      <td>${userId}</td>
      <td>
        <div><strong>${name}</strong></div>
        ${role === 'student' ? `<small>Email: ${email}</small>` : ''}
      </td>
      <td>${email}</td>
      <td>
        <span class="status ${role === 'admin' ? 'cheating' : role === 'teacher' ? 'completed' : 'pending'}">
          ${role.charAt(0).toUpperCase() + role.slice(1)}
        </span>
      </td>
      <td>
        <span class="status ${status === 'active' ? 'completed' : 'inactive'}">
          ${status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>${createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A'}</td>
      <td>${lastLogin ? new Date(lastLogin).toLocaleDateString() : 'Never'}</td>
      <td>
        <div style="display: flex; gap: 5px;">
          <button class="btn btn-primary" onclick="editUserBackend('${userId}')" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-warning" onclick="toggleUserStatusBackend('${userId}', '${status}')" 
                  title="${status === 'inactive' ? 'Activate' : 'Deactivate'}">
            <i class="fas ${status === 'inactive' ? 'fa-check' : 'fa-ban'}"></i>
          </button>
          ${userId !== currentUser?.id ? 
            `<button class="btn btn-danger" onclick="deleteUserBackend('${userId}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>` : 
            `<button class="btn btn-secondary" disabled title="Cannot delete yourself">
              <i class="fas fa-trash"></i>
            </button>`
          }
        </div>
      </td>
    `;
  });
}

// ================= EXAMS MANAGEMENT =================
function filterAllExams(filter) {
  currentExamFilter = filter;
  loadAllExams();
}

async function loadAllExams() {
  console.log('Loading all exams...');
  
  const token = localStorage.getItem('token');
  
  if (token && window.API_BASE_URL) {
    try {
      const response = await fetch(`${window.API_BASE_URL}/admin/exams`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const exams = await response.json();
        displayExams(exams);
        return;
      }
    } catch (error) {
      console.warn("Backend fetch failed, using localStorage");
    }
  }
  
  // Fallback to localStorage
  loadAllExamsFallback();
}

function loadAllExamsFallback() {
  const exams = JSON.parse(localStorage.getItem('exams')) || [];
  const submissions = JSON.parse(localStorage.getItem('submissions')) || [];
  const users = JSON.parse(localStorage.getItem('users')) || [];
  
  let filteredExams = [...exams];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (currentExamFilter === 'active') {
    filteredExams = exams.filter(exam => exam.isActive);
  } else if (currentExamFilter === 'inactive') {
    filteredExams = exams.filter(exam => !exam.isActive);
  } else if (currentExamFilter === 'today') {
    filteredExams = exams.filter(exam => {
      const examDate = new Date(exam.createdAt);
      examDate.setHours(0, 0, 0, 0);
      return examDate.getTime() === today.getTime();
    });
  }
  
  displayExams(filteredExams, users, submissions);
}

function displayExams(exams, users = [], submissions = []) {
  const allExamsTable = document.getElementById('allExamsTable');
  if (!allExamsTable) return;
  
  const tbody = allExamsTable.getElementsByTagName('tbody')[0];
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  exams.forEach(exam => {
    // Determine if data is from backend or localStorage
    const examId = exam.id || exam.examId;
    const title = exam.title;
    const teacherId = exam.teacher_id || exam.teacherId;
    const isActive = exam.is_active !== undefined ? exam.is_active : exam.isActive;
    const createdAt = exam.created_at || exam.createdAt;
    const duration = exam.duration;
    const questionsCount = exam.questions_count || (exam.questions ? exam.questions.length : 0);
    const examCode = exam.exam_code || exam.examCode;
    
    // Find teacher
    let teacherName = 'Unknown';
    if (users.length > 0) {
      const teacher = users.find(u => (u.id || u.userId) === teacherId);
      teacherName = teacher ? teacher.name : 'Unknown';
    } else if (exam.teacher_name) {
      teacherName = exam.teacher_name;
    } else if (exam.teacher) {
      teacherName = exam.teacher;
    }
    
    // Calculate stats
    let uniqueStudents = 0;
    let totalSubmissions = 0;
    let cheatingCases = 0;
    
    if (submissions.length > 0) {
      const examSubmissions = submissions.filter(sub => sub.examId === examId);
      totalSubmissions = examSubmissions.length;
      uniqueStudents = [...new Set(examSubmissions.map(sub => sub.studentId))].length;
      cheatingCases = examSubmissions.filter(sub => sub.cheatingCount > 0).length;
    } else if (exam.submissions) {
      totalSubmissions = exam.submissions.total || 0;
      uniqueStudents = exam.submissions.unique_students || 0;
      cheatingCases = exam.cheating?.cases || 0;
    }
    
    const row = tbody.insertRow();
    
    row.innerHTML = `
      <td>
        <input type="checkbox" class="admin-exam-checkbox" value="${examId}" onchange="adminUpdateDeleteButton()">
      </td>
      <td><strong>${title}</strong></td>
      <td>${teacherName}</td>
      <td>
        <span class="status ${isActive ? 'completed' : 'inactive'}">
          ${isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>${createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A'}</td>
      <td>${duration} min</td>
      <td>${questionsCount}</td>
      <td>${uniqueStudents}</td>
      <td>${totalSubmissions}</td>
      <td>
        <span class="status ${cheatingCases > 0 ? 'cheating' : 'completed'}">
          ${cheatingCases}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 5px;">
          <button class="btn btn-primary" onclick="viewAdminExamDetails('${examId}')" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-danger" onclick="adminDeleteExamBackend('${examId}', '${title}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
  });
  
  // Reset batch delete
  adminExamsToDelete = [];
  adminUpdateDeleteButton();
  document.getElementById('adminSelectAllExams').checked = false;
}

// ================= UTILITY FUNCTIONS =================
function adminToggleSelectAllExams(checkbox) {
  const examCheckboxes = document.querySelectorAll('.admin-exam-checkbox');
  examCheckboxes.forEach(cb => {
    cb.checked = checkbox.checked;
  });
  adminUpdateDeleteButton();
}

function adminUpdateDeleteButton() {
  const examCheckboxes = document.querySelectorAll('.admin-exam-checkbox:checked');
  const deleteMultipleBtn = document.getElementById('adminDeleteMultipleBtn');
  
  if (examCheckboxes.length > 0) {
    deleteMultipleBtn.style.display = 'inline-block';
  } else {
    deleteMultipleBtn.style.display = 'none';
  }
}

// ================= MODAL FUNCTIONS =================
function showAddUserModal() {
  document.getElementById('addUserForm')?.reset();
  document.getElementById('addUserModal').style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

// ================= OTHER FUNCTIONS (Placeholders) =================
// These are simplified versions - you can expand them later

function addNewUserBackend() {
  alert('Add user functionality - implement backend API call');
  closeModal('addUserModal');
}

function editUserBackend(userId) {
  alert(`Edit user ${userId} - implement backend API call`);
}

function saveUserChangesBackend() {
  alert('Save user changes - implement backend API call');
  closeModal('editUserModal');
}

function toggleUserStatusBackend(userId, currentStatus) {
  alert(`Toggle user status ${userId} from ${currentStatus} - implement backend API call`);
}

function deleteUserBackend(userId) {
  if (confirm('Are you sure you want to delete this user?')) {
    alert(`Delete user ${userId} - implement backend API call`);
  }
}

function adminDeleteSingleExam(examId) {
  adminExamsToDelete = [examId];
  isAdminBatchDelete = false;
  
  const exams = JSON.parse(localStorage.getItem('exams')) || [];
  const exam = exams.find(e => e.id === examId || e.examId === examId);
  
  if (exam) {
    document.getElementById('adminDeleteExamTitle').textContent = `Delete: ${exam.title}`;
    document.getElementById('adminMultipleDeleteInfo').style.display = 'none';
  }
  
  document.getElementById('adminDeleteExamModal').style.display = 'flex';
}

function adminDeleteMultipleExams() {
  const examCheckboxes = document.querySelectorAll('.admin-exam-checkbox:checked');
  adminExamsToDelete = Array.from(examCheckboxes).map(cb => cb.value);
  
  if (adminExamsToDelete.length === 0) {
    alert('Please select at least one exam to delete.');
    return;
  }
  
  isAdminBatchDelete = true;
  document.getElementById('adminDeleteExamTitle').textContent = 'Delete Multiple Exams';
  document.getElementById('adminSelectedExamCount').textContent = adminExamsToDelete.length;
  document.getElementById('adminMultipleDeleteInfo').style.display = 'block';
  document.getElementById('adminDeleteExamModal').style.display = 'flex';
}

function adminConfirmDeleteExam() {
  if (adminExamsToDelete.length === 0) return;
  
  if (isAdminBatchDelete) {
    alert(`Deleting ${adminExamsToDelete.length} exam(s) - implement backend API call`);
  } else {
    alert(`Deleting exam ${adminExamsToDelete[0]} - implement backend API call`);
  }
  
  closeModal('adminDeleteExamModal');
  adminExamsToDelete = [];
  isAdminBatchDelete = false;
  loadAllExams();
}

function adminDeleteExamBackend(examId, examTitle) {
  if (confirm(`Delete exam: ${examTitle}?`)) {
    alert(`Deleting exam ${examId} - implement backend API call`);
    loadAllExams();
  }
}

function viewAdminExamDetails(examId) {
  alert(`View exam details ${examId} - implement backend API call`);
}

// ================= CHEATING CASES =================
function filterCheatingCases(filter) {
  currentCheatingFilter = filter;
  loadCheatingCasesBackend();
}

async function loadCheatingCasesBackend() {
  alert('Loading cheating cases - implement backend API call');
}

function viewCheatingDetailsBackend(submissionId) {
  alert(`View cheating details ${submissionId} - implement backend API call`);
}

// ================= REPORTS =================
function loadReports() {
  // Simple placeholder
  document.getElementById('quickStats').innerHTML = `
    <div style="margin-bottom: 15px;">
      <strong>Reports System</strong>
      <p>Generate detailed reports from the system.</p>
    </div>
  `;
}

function generateDetailedReport() {
  alert('Generate report - implement backend API call');
}

function generateReport() {
  showPage('reports');
}

// ================= SYSTEM SETTINGS =================
function loadSystemSettings() {
  // Load from localStorage or defaults
  const settings = JSON.parse(localStorage.getItem('systemSettings')) || {
    maxWarnings: 3,
    cheatingSensitivity: 'medium',
    enableAudioDetection: true,
    enableFaceDetection: true,
    sessionTimeout: 30,
    examAutoSubmit: 5,
    maxExamDuration: 4,
    enableEmailNotifications: true
  };
  
  // Set form values
  document.getElementById('maxWarnings').value = settings.maxWarnings;
  document.getElementById('cheatingSensitivity').value = settings.cheatingSensitivity;
  document.getElementById('enableAudioDetection').checked = settings.enableAudioDetection;
  document.getElementById('enableFaceDetection').checked = settings.enableFaceDetection;
  document.getElementById('sessionTimeout').value = settings.sessionTimeout;
  document.getElementById('examAutoSubmit').value = settings.examAutoSubmit;
  document.getElementById('maxExamDuration').value = settings.maxExamDuration;
  document.getElementById('enableEmailNotifications').checked = settings.enableEmailNotifications;
}

function saveCheatingSettings() {
  const settings = {
    maxWarnings: parseInt(document.getElementById('maxWarnings').value),
    cheatingSensitivity: document.getElementById('cheatingSensitivity').value,
    enableAudioDetection: document.getElementById('enableAudioDetection').checked,
    enableFaceDetection: document.getElementById('enableFaceDetection').checked,
    sessionTimeout: parseInt(document.getElementById('sessionTimeout').value),
    examAutoSubmit: parseInt(document.getElementById('examAutoSubmit').value),
    maxExamDuration: parseInt(document.getElementById('maxExamDuration').value),
    enableEmailNotifications: document.getElementById('enableEmailNotifications').checked
  };
  
  localStorage.setItem('systemSettings', JSON.stringify(settings));
  alert('Settings saved successfully!');
}

function saveSystemConfig() {
  saveCheatingSettings();
}

function backupDatabase() {
  alert('Backup database - implement backend API call');
}

function clearOldData() {
  if (confirm('Clear old data (30+ days)?')) {
    alert('Clearing old data - implement backend API call');
  }
}

function resetSystem() {
  if (confirm('⚠️ WARNING: Reset all system data?')) {
    if (prompt('Type "RESET" to confirm:') === 'RESET') {
      localStorage.clear();
      alert('System reset complete!');
      window.location.href = 'index.html';
    }
  }
}

// ================= HELPER FUNCTIONS =================
function loadRecentActivityBackend(activities) {
  const table = document.getElementById('recentActivityTable');
  if (!table) return;
  
  const tbody = table.getElementsByTagName('tbody')[0];
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  activities.forEach(activity => {
    const row = tbody.insertRow();
    const time = new Date(activity.timestamp);
    const timeString = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    row.innerHTML = `
      <td>${activity.user || 'System'}</td>
      <td>${activity.action}</td>
      <td>${activity.details ? JSON.stringify(activity.details) : ''}</td>
      <td>${timeString}</td>
    `;
  });
}

function loadRecentActivity() {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const exams = JSON.parse(localStorage.getItem('exams')) || [];
  const submissions = JSON.parse(localStorage.getItem('submissions')) || [];
  
  const activities = [];
  
  // Add user registrations
  users.forEach(user => {
    activities.push({
      user: user.name,
      action: 'Registered',
      time: user.createdAt,
      type: 'user'
    });
  });
  
  // Add exam creations
  exams.forEach(exam => {
    const teacher = users.find(u => u.id === exam.teacherId);
    activities.push({
      user: teacher ? teacher.name : 'Unknown',
      action: `Created exam: ${exam.title}`,
      time: exam.createdAt,
      type: 'exam'
    });
  });
  
  // Add submissions
  submissions.forEach(submission => {
    const student = users.find(u => u.id === submission.studentId);
    const exam = exams.find(e => e.id === submission.examId);
    if (student && exam) {
      activities.push({
        user: student.name,
        action: `Submitted: ${exam.title}`,
        time: submission.submittedAt,
        type: 'submission'
      });
    }
  });
  
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  const recentActivities = activities.slice(0, 10);
  
  const table = document.getElementById('recentActivityTable');
  if (!table) return;
  
  const tbody = table.getElementsByTagName('tbody')[0];
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  recentActivities.forEach(activity => {
    const row = tbody.insertRow();
    const time = new Date(activity.time);
    const timeString = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    row.innerHTML = `
      <td>${activity.user}</td>
      <td>${activity.action}</td>
      <td>${timeString}</td>
    `;
  });
}

function calculateStorageUsage() {
  let totalSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    totalSize += (key.length + value.length) * 2;
  }
  
  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  const percentage = Math.min((sizeInMB / 5) * 100, 100);
  
  const storageBar = document.getElementById('storageBar');
  const storageUsed = document.getElementById('storageUsed');
  const dbStorage = document.getElementById('dbStorage');
  
  if (storageBar) storageBar.style.width = percentage + '%';
  if (storageUsed) storageUsed.textContent = sizeInMB + ' MB / 5 MB';
  if (dbStorage) dbStorage.textContent = sizeInMB + ' MB';
}

// ================= GLOBAL FUNCTIONS =================
window.showPage = showPage;
window.showAddUserModal = showAddUserModal;
window.closeModal = closeModal;
window.filterUsers = filterUsers;
window.editUserBackend = editUserBackend;
window.toggleUserStatusBackend = toggleUserStatusBackend;
window.deleteUserBackend = deleteUserBackend;
window.filterAllExams = filterAllExams;
window.viewAdminExamDetails = viewAdminExamDetails;
window.adminDeleteExamBackend = adminDeleteExamBackend;
window.filterCheatingCases = filterCheatingCases;
window.viewCheatingDetailsBackend = viewCheatingDetailsBackend;
window.generateReport = generateReport;
window.generateDetailedReport = generateDetailedReport;
window.saveCheatingSettings = saveCheatingSettings;
window.saveSystemConfig = saveSystemConfig;
window.backupDatabase = backupDatabase;
window.clearOldData = clearOldData;
window.resetSystem = resetSystem;

window.adminToggleSelectAllExams = adminToggleSelectAllExams;
window.adminUpdateDeleteButton = adminUpdateDeleteButton;
window.adminDeleteSingleExam = adminDeleteSingleExam;
window.adminDeleteMultipleExams = adminDeleteMultipleExams;
window.adminConfirmDeleteExam = adminConfirmDeleteExam;
window.addNewUserBackend = addNewUserBackend;
window.saveUserChangesBackend = saveUserChangesBackend;

window.logout = function() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    window.location.href = 'index.html';
  }
};