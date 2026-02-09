console.log("🔥 AI PROCTORING SYSTEM LOADED - REVISED VERSION");

const MAX_WARNINGS = 3;
const NO_FACE_TIMEOUT = 5000;
const LOOK_AWAY_TIMEOUT = 10000;
const AUDIO_THRESHOLD = 0.18;
const SPEAKING_TIME_THRESHOLD = 5.0;
const OBJECT_SCORE_THRESHOLD = 0.6;
const SUSPICIOUS_OBJECTS = ['cell phone', 'phone', 'book', 'laptop', 'remote', 'tv'];
const OBJECT_CHECK_INTERVAL = 2000;
const OBJECT_WARNING_COOLDOWN = 10000;
const DETECTION_INTERVAL = 150;
const UI_UPDATE_INTERVAL = 1000;

const API_BASE_URL = "/api";
const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (!token || !currentUser || currentUser.role !== "student") {
    window.location.href = "index.html";
}

let currentExam = null;
let currentAttempt = null;
let currentQuestion = 0;
let answers = {};
let timeRemaining = 0;
let examTimer = null;
let cameraStream = null;
let audioContext = null;
let analyser = null;
let microphone = null;
let timeDomainArray = null;
let faceDetection = null;
let faceMesh = null;
let objectDetection = null;

let warningCount = 0;
let warningHistory = [];
let isExamActive = false;
let isProctoringActive = false;
let faceDetected = false;
let multipleFaces = false;
let noFaceStartTime = null;
let lookingAwayStartTime = null;
let speakingTime = 0;
let lastObjectWarningTime = 0;
let isLookingAtScreen = true;
let detectedObjects = [];
let securityBlockersActive = false;

let faceInterval = null;
let audioInterval = null;
let objectInterval = null;
let uiInterval = null;

let totalSpeakingTime = 0;
let totalLookingAwayTime = 0;
let startExamTime = null;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🎓 Initializing AI Proctoring System...");
    
    const examCode = new URLSearchParams(window.location.search).get("code");
    if (!examCode) {
        window.location.href = "student-dashboard.html";
        return;
    }

    try {
        await checkAttemptStatus(examCode.toUpperCase());
        await loadAIModels();
    } catch (error) {
        console.warn("AI models failed to load:", error);
        document.getElementById("faceStatus").textContent = "⚠️ AI Limited";
        document.getElementById("faceStatus").style.color = "#ffc107";
    }

    await loadExamFromBackend(examCode.toUpperCase());
    
    const startBtn = document.getElementById("startExamBtn");
    if (startBtn) {
        startBtn.onclick = () => window.startExam();
    }
});

async function checkAttemptStatus(examCode) {
    try {
        const response = await fetch(`${API_BASE_URL}/exams/${examCode}/attempt-status`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.attempted) {
                alert("You have already attempted this exam. You cannot retake it.");
                window.location.href = "student-dashboard.html";
            }
        }
    } catch (error) {
        console.error("Error checking attempt status:", error);
    }
}

async function loadAIModels() {
    showLoading("Loading AI models...");
    
    try {
        if (typeof cocoSsd !== 'undefined') {
            objectDetection = await cocoSsd.load();
            console.log("✅ COCO-SSD model loaded");
        }
        
        if (typeof FaceDetection !== 'undefined') {
            faceDetection = new FaceDetection({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
                }
            });
            faceDetection.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
            faceDetection.onResults(handleFaceDetection);
            console.log("✅ Face Detection model loaded");
        }
        
        if (typeof FaceMesh !== 'undefined') {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });
            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            faceMesh.onResults(handleFaceMesh);
            console.log("✅ Face Mesh model loaded");
        }
    } catch (error) {
        console.error("Error loading AI models:", error);
        throw error;
    } finally {
        hideLoading();
    }
}

function setupSecurityBlockers() {
    if (securityBlockersActive) return;
    
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopyPaste, true);
    document.addEventListener('paste', handleCopyPaste, true);
    document.addEventListener('cut', handleCopyPaste, true);
    document.addEventListener('dragstart', preventDefault, true);
    document.addEventListener('drop', preventDefault, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    securityBlockersActive = true;
    console.log("✅ Security blockers activated");
}

function removeSecurityBlockers() {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('contextmenu', handleContextMenu, true);
    document.removeEventListener('copy', handleCopyPaste, true);
    document.removeEventListener('paste', handleCopyPaste, true);
    document.removeEventListener('cut', handleCopyPaste, true);
    document.removeEventListener('dragstart', preventDefault, true);
    document.removeEventListener('drop', preventDefault, true);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handlePageHide);
    
    securityBlockersActive = false;
}

function handleKeyDown(e) {
    if (!isExamActive) return true;
    
    const key = e.key || String.fromCharCode(e.keyCode);
    const keyCode = e.keyCode;
    
    if (key === 'Escape' || keyCode === 27) {
        e.preventDefault();
        addWarning("Escape key blocked - cannot exit fullscreen");
        forceFullscreen();
        return false;
    }
    
    if (key === 'F11' || keyCode === 122) {
        e.preventDefault();
        addWarning("F11 blocked - cannot exit fullscreen");
        forceFullscreen();
        return false;
    }
    
    if (keyCode === 123) {
        e.preventDefault();
        addWarning("F12 blocked - developer tools disabled");
        return false;
    }
    
    if (e.ctrlKey && e.shiftKey && (keyCode === 73 || keyCode === 74)) {
        e.preventDefault();
        addWarning("Developer tools blocked");
        return false;
    }
    
    if (e.ctrlKey && (keyCode === 85 || keyCode === 83 || keyCode === 80)) {
        e.preventDefault();
        addWarning(`Ctrl+${key} blocked`);
        return false;
    }
    
    if (e.ctrlKey && (key === 'c' || key === 'v' || key === 'x')) {
        e.preventDefault();
        addWarning(`Copy/paste blocked`);
        return false;
    }
    
    return true;
}

function handleContextMenu(e) {
    if (isExamActive) {
        e.preventDefault();
        addWarning("Right-click context menu blocked");
        return false;
    }
}

function handleCopyPaste(e) {
    if (isExamActive) {
        e.preventDefault();
        addWarning("Copy/paste/cut operation blocked");
        return false;
    }
}

function handleFullscreenChange() {
    if (!isExamActive) return;
    
    const isFullscreen = document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement || 
                        document.msFullscreenElement;
    
    if (!isFullscreen) {
        addWarning("Exited fullscreen mode");
        setTimeout(forceFullscreen, 100);
    }
}

function handleVisibilityChange() {
    if (!isExamActive) return;
    
    if (document.hidden) {
        addWarning("Tab switching detected");
        showTabSwitchWarning();
    }
}

function handleBeforeUnload(e) {
    if (isExamActive) {
        cleanupProctoring();
        const message = "Are you sure you want to leave? Your exam will be submitted automatically with violations recorded.";
        e.returnValue = message;
        return message;
    }
}

function handlePageHide() {
    if (isExamActive) {
        cleanupProctoring();
    }
}

function preventDefault(e) {
    if (isExamActive) {
        e.preventDefault();
        return false;
    }
}

async function requestCameraAndMic() {
    try {
        showLoading("Requesting camera and microphone access...");
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        cameraStream = stream;
        
        const video = document.getElementById("videoElement");
        if (video) {
            video.srcObject = stream;
            await video.play();
        }
        
        setupAudioAnalysis(stream);
        
        console.log("✅ Camera & Microphone enabled");
        return true;
        
    } catch (err) {
        console.error("Camera/Mic permission denied:", err);
        alert("❌ Camera & Microphone permission is REQUIRED for this proctored exam.\n\nPlease enable camera and microphone access, then refresh the page.");
        return false;
    } finally {
        hideLoading();
    }
}

function setupAudioAnalysis(stream) {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        microphone.connect(analyser);
        
        timeDomainArray = new Float32Array(analyser.fftSize);
        
        console.log("✅ Audio analysis setup complete");
    } catch (error) {
        console.error("Audio analysis setup failed:", error);
    }
}

function startProctoring() {
    if (isProctoringActive || !isExamActive) return;
    
    isProctoringActive = true;
    startExamTime = Date.now();
    console.log("🚀 Starting proctoring...");
    
    if (faceDetection && !faceInterval) {
        faceInterval = setInterval(async () => {
            if (!faceDetection || !isExamActive) return;
            
            try {
                const video = document.getElementById("videoElement");
                if (!video) return;
                
                await faceDetection.send({ image: video });
            } catch (error) {
                console.error("Face detection error:", error);
            }
        }, DETECTION_INTERVAL);
    }
    
    if (analyser && !audioInterval) {
        audioInterval = setInterval(() => {
            if (!analyser || !timeDomainArray || !isExamActive) return;
            
            analyser.getFloatTimeDomainData(timeDomainArray);
            
            let sum = 0;
            for (let i = 0; i < timeDomainArray.length; i++) {
                sum += timeDomainArray[i] * timeDomainArray[i];
            }
            
            const rms = Math.sqrt(sum / timeDomainArray.length);
            
            if (rms > AUDIO_THRESHOLD) {
                speakingTime += 0.5;
                totalSpeakingTime += 0.5;
            } else {
                speakingTime = Math.max(0, speakingTime - 0.2);
            }
            
            if (speakingTime >= SPEAKING_TIME_THRESHOLD) {
                addWarning('Speaking detected continuously');
                speakingTime = 0;
            }
            
            updateAudioStatus(rms);
        }, 500);
    }
    
    if (objectDetection && !objectInterval) {
        objectInterval = setInterval(async () => {
            if (!objectDetection || !isExamActive) return;
            
            try {
                const video = document.getElementById("videoElement");
                if (!video) return;
                
                const predictions = await objectDetection.detect(video);
                const suspicious = predictions.filter(p => 
                    p.score >= OBJECT_SCORE_THRESHOLD && 
                    SUSPICIOUS_OBJECTS.some(obj => 
                        p.class.toLowerCase().includes(obj.toLowerCase())
                    )
                );
                
                if (suspicious.length > 0) {
                    const now = Date.now();
                    if (now - lastObjectWarningTime >= OBJECT_WARNING_COOLDOWN) {
                        const objectNames = [...new Set(suspicious.map(p => p.class))].join(', ');
                        addWarning(`Suspicious object detected: ${objectNames}`);
                        lastObjectWarningTime = now;
                    }
                    detectedObjects = suspicious;
                } else {
                    detectedObjects = [];
                }
                
                updateObjectDetectionStatus();
            } catch (error) {
                console.error("Object detection error:", error);
            }
        }, OBJECT_CHECK_INTERVAL);
    }
    
    if (!uiInterval) {
        uiInterval = setInterval(() => {
            if (!isExamActive) return;
            
            checkFaceTimeout();
            checkLookingAwayTimeout();
            
            updateFaceStatus();
            updateHeadPoseStatus();
            updateObjectDetectionStatus();
        }, UI_UPDATE_INTERVAL);
    }
}

function stopProctoring() {
    isProctoringActive = false;
    
    if (faceInterval) {
        clearInterval(faceInterval);
        faceInterval = null;
    }
    
    if (audioInterval) {
        clearInterval(audioInterval);
        audioInterval = null;
    }
    
    if (objectInterval) {
        clearInterval(objectInterval);
        objectInterval = null;
    }
    
    if (uiInterval) {
        clearInterval(uiInterval);
        uiInterval = null;
    }
    
    console.log("✅ Proctoring stopped");
}

function checkFaceTimeout() {
    if (!faceDetected && isExamActive) {
        if (!noFaceStartTime) {
            noFaceStartTime = Date.now();
        } else if (Date.now() - noFaceStartTime > NO_FACE_TIMEOUT) {
            addWarning('No face detected for extended period');
            noFaceStartTime = null;
        }
    } else {
        noFaceStartTime = null;
    }
}

function checkLookingAwayTimeout() {
    if (!isLookingAtScreen && isExamActive) {
        if (!lookingAwayStartTime) {
            lookingAwayStartTime = Date.now();
        } else {
            const awayTime = Date.now() - lookingAwayStartTime;
            totalLookingAwayTime += 0.1;
            
            if (awayTime > LOOK_AWAY_TIMEOUT) {
                addWarning('Looking away from screen for extended period');
                lookingAwayStartTime = Date.now();
            }
        }
    } else {
        lookingAwayStartTime = null;
    }
}

function handleFaceDetection(results) {
    if (!results || !results.detections) {
        faceDetected = false;
        multipleFaces = false;
        return;
    }
    
    const numFaces = results.detections.length;
    faceDetected = numFaces > 0;
    multipleFaces = numFaces > 1;
    
    if (multipleFaces && isExamActive) {
        addWarning('Multiple faces detected');
    }
    
    if (faceDetected && faceMesh) {
        const video = document.getElementById("videoElement");
        if (video) {
            faceMesh.send({ image: video });
        }
    }
}

function handleFaceMesh(results) {
    if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        isLookingAtScreen = false;
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    if (landmarks && landmarks.length > 0) {
        const nose = landmarks[1];
        if (nose) {
            const noseX = nose.x;
            isLookingAtScreen = noseX > 0.3 && noseX < 0.7;
        }
    }
}

function updateFaceStatus() {
    const faceStatus = document.getElementById("faceStatus");
    if (!faceStatus) return;
    
    if (!faceDetected) {
        faceStatus.textContent = "❌ No Face";
        faceStatus.style.color = "#f72585";
    } else if (multipleFaces) {
        faceStatus.textContent = "⚠️ Multiple Faces";
        faceStatus.style.color = "#ffc107";
    } else {
        faceStatus.textContent = "✅ Detected";
        faceStatus.style.color = "#28a745";
    }
}

function updateHeadPoseStatus() {
    const headPoseElement = document.getElementById("headPoseStatus") || createHeadPoseElement();
    if (!headPoseElement) return;
    
    if (isLookingAtScreen) {
        headPoseElement.textContent = "✅ Center";
        headPoseElement.style.color = "#28a745";
    } else {
        headPoseElement.textContent = "⚠️ Away";
        headPoseElement.style.color = "#ffc107";
    }
}

function createHeadPoseElement() {
    const monitoringStats = document.querySelector(".monitoring-stats");
    if (!monitoringStats) return null;
    
    const statItem = document.createElement("div");
    statItem.className = "stat-item";
    statItem.innerHTML = `
        <span><i class="fas fa-head-side-vision"></i> Head Position</span>
        <span id="headPoseStatus" style="color: #28a745;">✅ Center</span>
    `;
    
    monitoringStats.appendChild(statItem);
    return document.getElementById("headPoseStatus");
}

function updateObjectDetectionStatus() {
    const objectStatus = document.getElementById("objectStatus") || createObjectStatusElement();
    if (!objectStatus) return;
    
    if (detectedObjects.length === 0) {
        objectStatus.textContent = "✅ None";
        objectStatus.style.color = "#28a745";
    } else {
        const objects = [...new Set(detectedObjects.map(obj => obj.class))].join(', ');
        objectStatus.textContent = `⚠️ ${objects}`;
        objectStatus.style.color = "#ffc107";
    }
}

function createObjectStatusElement() {
    const monitoringStats = document.querySelector(".monitoring-stats");
    if (!monitoringStats) return null;
    
    const statItem = document.createElement("div");
    statItem.className = "stat-item";
    statItem.innerHTML = `
        <span><i class="fas fa-search"></i> Objects Detected</span>
        <span id="objectStatus" style="color: #28a745;">✅ None</span>
    `;
    
    monitoringStats.appendChild(statItem);
    return document.getElementById("objectStatus");
}

function updateAudioStatus(volume) {
    const audioStatus = document.getElementById("audioStatus");
    if (!audioStatus) return;
    
    if (volume > AUDIO_THRESHOLD) {
        audioStatus.textContent = "🗣️ Speaking";
        audioStatus.style.color = "#ffc107";
    } else {
        audioStatus.textContent = "✅ Normal";
        audioStatus.style.color = "#28a745";
    }
}

function forceFullscreen() {
    try {
        const elem = document.documentElement;
        
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
        
        console.log("✅ Fullscreen enforced");
        
    } catch (error) {
        console.warn("Fullscreen denied:", error);
        addWarning("Fullscreen mode could not be enabled");
    }
}

function showTabSwitchWarning() {
    const fullscreenWarning = document.getElementById("fullscreenWarning");
    if (fullscreenWarning) {
        fullscreenWarning.classList.add("show");
        
        setTimeout(() => {
            fullscreenWarning.classList.remove("show");
        }, 3000);
    }
}

function addWarning(reason) {
    if (!isExamActive) return;
    
    warningCount++;
    const warning = {
        id: Date.now(),
        reason: reason,
        timestamp: new Date().toISOString(),
        count: warningCount
    };
    
    warningHistory.push(warning);
    
    updateWarningCount();
    showWarningMessage(reason);
    
    if (warningCount <= MAX_WARNINGS - 1) {
        showCheatingAlert(reason);
    }
    
    if (warningCount >= MAX_WARNINGS) {
        setTimeout(() => {
            alert("🚨 MAXIMUM WARNINGS REACHED! Exam will be auto-submitted.");
            submitAnswers("Maximum warnings reached");
        }, 1000);
    }
    
    console.log(`⚠️ Warning #${warningCount}: ${reason}`);
}

function updateWarningCount() {
    const warningCountEl = document.getElementById("warningCount");
    const warningCountConfirm = document.getElementById("warningCountConfirm");
    
    if (warningCountEl) {
        warningCountEl.textContent = warningCount;
        warningCountEl.style.color = warningCount >= MAX_WARNINGS - 1 ? '#f72585' : '#ffc107';
    }
    
    if (warningCountConfirm) {
        warningCountConfirm.textContent = warningCount;
    }
    
    const warningStats = document.getElementById("warningStats");
    if (warningStats) {
        warningStats.style.display = warningCount > 0 ? 'block' : 'none';
    }
}

function showWarningMessage(message) {
    const cheatingWarning = document.getElementById("cheatingWarning");
    const warningMessage = document.getElementById("warningMessage");
    
    if (cheatingWarning && warningMessage) {
        warningMessage.textContent = message;
        cheatingWarning.classList.add("show");
        
        setTimeout(() => {
            cheatingWarning.classList.remove("show");
        }, 5000);
    }
}

function showCheatingAlert(reason) {
    const cheatingAlert = document.getElementById("cheatingAlert");
    const cheatingOverlay = document.getElementById("cheatingOverlay");
    const alertCount = document.getElementById("alertCount");
    const alertTitle = document.getElementById("alertTitle");
    const alertMessage = document.getElementById("alertMessage");
    const violationType = document.getElementById("violationType");
    
    if (cheatingAlert && cheatingOverlay && alertCount && alertTitle && alertMessage && violationType) {
        alertCount.textContent = warningCount;
        alertTitle.textContent = warningCount >= MAX_WARNINGS - 1 ? "FINAL WARNING!" : "WARNING!";
        alertMessage.textContent = warningCount >= MAX_WARNINGS - 1 
            ? "One more violation will result in automatic submission!" 
            : "Please follow exam rules to avoid automatic submission.";
        violationType.textContent = reason;
        
        cheatingAlert.classList.add("show");
        cheatingOverlay.classList.add("show");
        
        setTimeout(() => {
            if (cheatingAlert.classList.contains("show")) {
                closeCheatingAlert();
            }
        }, 8000);
    }
}

async function loadExamFromBackend(examCode) {
    try {
        showLoading("Loading exam from server...");
        
        const response = await fetch(`${API_BASE_URL}/exams/${examCode}`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Exam not found. Please check the exam code.");
            } else if (response.status === 403) {
                throw new Error("You are not authorized to access this exam.");
            } else {
                throw new Error(`Server error: ${response.status}`);
            }
        }

        currentExam = await response.json();

        if (!currentExam.questions || !Array.isArray(currentExam.questions)) {
            throw new Error("Invalid exam structure: No questions found.");
        }

        updateExamInfoUI();

        const startBtn = document.getElementById("startExamBtn");
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play-circle"></i> Start Exam with AI Proctoring';
        }

        console.log("✅ Exam loaded successfully");
        
    } catch (error) {
        console.error("❌ Error loading exam:", error);
        alert(`❌ ${error.message}\n\nPlease check with your teacher.`);
        
        setTimeout(() => {
            window.location.href = "student-dashboard.html";
        }, 3000);
    } finally {
        hideLoading();
    }
}

function updateExamInfoUI() {
    const elements = {
        "examTitle": currentExam.title,
        "examDescription": currentExam.description || "",
        "studentName": currentUser.name,
        "examDurationDisplay": `Duration: ${currentExam.duration} minutes`,
        "totalQuestionsDisplay": `Total Questions: ${currentExam.questions.length}`
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });
}

window.startExam = async function () {
    if (!currentExam) {
        alert("Exam not loaded properly. Please refresh the page.");
        return;
    }

    const cameraGranted = await requestCameraAndMic();
    if (!cameraGranted) {
        return;
    }

    try {
        showLoading("Starting exam with AI proctoring...");
        
        const response = await fetch(`${API_BASE_URL}/exams/${currentExam.exam_code}/start`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to start exam");
        }

        currentAttempt = await response.json();
        isExamActive = true;
        
        currentExam.questions.forEach((_, index) => {
            answers[index] = null;
        });

        timeRemaining = currentAttempt.time_remaining || (currentExam.duration * 60);

        forceFullscreen();
        setupSecurityBlockers();
        startProctoring();
        
        hideLoading();
        initializeExamUI();
        startTimer();
        
        console.log("✅ AI-proctored exam started successfully");
        
    } catch (error) {
        console.error("❌ Error starting exam:", error);
        alert("Failed to start exam: " + error.message);
        hideLoading();
    }
};

function cleanupProctoring() {
    isExamActive = false;
    stopProctoring();
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        cameraStream = null;
    }
    
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }
    
    if (analyser) {
        analyser.disconnect();
        analyser = null;
    }
    
    if (audioContext) {
        audioContext.close().catch(console.error);
        audioContext = null;
    }
    
    removeSecurityBlockers();
    
    if (document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement) {
        
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
    
    console.log("✅ Proctoring system cleaned up");
}

async function submitAnswers(autoSubmitReason = null) {
    try {
        if (!currentAttempt) {
            alert("No active exam session found.");
            return;
        }
        
        showLoading("Submitting exam...");
        
        const formattedAnswers = Object.keys(answers).map(index => ({
            question_index: parseInt(index),
            answer: answers[index]
        }));
        
        const proctoringData = {
            warnings: warningCount,
            warning_history: warningHistory,
            speaking_time: Math.round(totalSpeakingTime),
            looking_away_time: Math.round(totalLookingAwayTime),
            detected_objects: detectedObjects.map(obj => obj.class),
            exam_duration: startExamTime ? Math.round((Date.now() - startExamTime) / 1000) : 0
        };
        
        cleanupProctoring();
        
        const response = await fetch(`${API_BASE_URL}/exams/submit/${currentAttempt.submission_id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ 
                answers: formattedAnswers,
                proctoring_data: proctoringData
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to submit exam");
        }

        const result = await response.json();
        
        if (examTimer) {
            clearInterval(examTimer);
        }
        
        let message = `✅ Exam submitted successfully!\n\n`;
        message += `Score: ${result.score}/${result.total_marks} (${result.percentage}%)\n`;
        message += `Proctoring Warnings: ${warningCount}`;
        
        if (autoSubmitReason) {
            message += `\n\nReason: ${autoSubmitReason}`;
        }
        
        alert(message);
        
        window.location.href = "student-dashboard.html";
        
    } catch (error) {
        console.error("❌ Error submitting exam:", error);
        alert("Failed to submit exam: " + error.message);
        hideLoading();
    }
}

function showLoading(message) {
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingMessage = document.getElementById("loadingMessage");
    
    if (loadingMessage) loadingMessage.textContent = message || "Loading...";
    if (loadingOverlay) loadingOverlay.style.display = "flex";
}

function hideLoading() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) loadingOverlay.style.display = "none";
}

window.confirmSubmit = async function() {
    closeSubmitConfirm();
    await submitAnswers();
};

window.closeSubmitConfirm = function() {
    const elements = ["submitConfirm", "submitOverlay"];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("show");
    });
};

window.closeCheatingAlert = function() {
    const elements = ["cheatingAlert", "cheatingOverlay"];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("show");
    });
};

window.prevQuestion = function() {
    if (currentQuestion > 0) {
        loadQuestion(currentQuestion - 1);
    }
};

window.nextQuestion = function() {
    if (currentExam && currentQuestion < currentExam.questions.length - 1) {
        loadQuestion(currentQuestion + 1);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const buttons = {
        "submitBtn": () => window.submitExam(),
        "markBtn": () => toggleMarkQuestion()
    };
    
    Object.entries(buttons).forEach(([id, handler]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = handler;
    });
});

function initializeExamUI() {
    const instructions = document.getElementById("examInstructions");
    const examContainer = document.getElementById("examContainer");
    
    if (instructions) instructions.style.display = "none";
    if (examContainer) examContainer.style.display = "block";
    
    loadQuestion(0);
    buildQuestionGrid();
}

function startTimer() {
    updateTimerDisplay();
    examTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            clearInterval(examTimer);
            autoSubmitExam("Time expired");
        }
    }, 1000);
}

function updateTimerDisplay() {
    const timerElement = document.getElementById("examTimer");
    if (!timerElement) return;
    
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    timerElement.classList.remove("warning", "danger");
    if (timeRemaining < 300) timerElement.classList.add("warning");
    if (timeRemaining < 60) timerElement.classList.add("danger");
}

function loadQuestion(index) {
    if (!currentExam || !currentExam.questions || !currentExam.questions[index]) return;
    
    currentQuestion = index;
    const question = currentExam.questions[index];
    
    const container = document.getElementById("questionsContainer");
    if (!container) return;
    
    container.innerHTML = '';
    
    const questionDiv = document.createElement("div");
    questionDiv.className = "question-content";
    
    const questionNumberEl = document.createElement("div");
    questionNumberEl.style.cssText = "font-weight: 600; color: #4361ee; margin-bottom: 10px;";
    questionNumberEl.textContent = `Question ${index + 1} of ${currentExam.questions.length}`;
    questionDiv.appendChild(questionNumberEl);
    
    const questionTextEl = document.createElement("div");
    questionTextEl.className = "question-text";
    questionTextEl.innerHTML = `<h3>${question.question_text}</h3>`;
    questionDiv.appendChild(questionTextEl);
    
    const optionsContainer = document.createElement("div");
    optionsContainer.className = "options-container";
    
    if (question.type === "mcq" && question.options) {
        question.options.forEach((option, optionIndex) => {
            const optionDiv = document.createElement("div");
            optionDiv.className = "option";
            if (answers[index] === optionIndex) optionDiv.classList.add("selected");
            
            optionDiv.innerHTML = `
                <input type="radio" name="q${index}" ${answers[index] === optionIndex ? 'checked' : ''}>
                <span class="option-label">${option}</span>
            `;
            
            optionDiv.onclick = () => {
                answers[index] = optionIndex;
                loadQuestion(index);
                updateQuestionGrid();
            };
            
            optionsContainer.appendChild(optionDiv);
        });
    } else if (question.type === "short") {
        const textarea = document.createElement("textarea");
        textarea.className = "short-answer-input";
        textarea.placeholder = "Type your answer here...";
        textarea.value = answers[index] || "";
        textarea.rows = 5;
        
        textarea.oninput = (e) => {
            answers[index] = e.target.value;
            updateQuestionGrid();
        };
        
        optionsContainer.appendChild(textarea);
    }
    
    questionDiv.appendChild(optionsContainer);
    container.appendChild(questionDiv);
    
    updateQuestionGrid();
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const buttons = {
        "prevBtn": currentQuestion > 0,
        "nextBtn": currentQuestion < currentExam.questions.length - 1
    };
    
    Object.entries(buttons).forEach(([id, enabled]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !enabled;
            btn.onclick = id === "prevBtn" ? window.prevQuestion : window.nextQuestion;
        }
    });
}

function buildQuestionGrid() {
    const grid = document.getElementById("questionGrid");
    if (!grid) return;
    
    grid.innerHTML = "";
    
    currentExam.questions.forEach((_, index) => {
        const questionNumber = document.createElement("div");
        questionNumber.className = "question-number";
        questionNumber.textContent = index + 1;
        questionNumber.onclick = () => loadQuestion(index);
        grid.appendChild(questionNumber);
    });
    
    updateQuestionGrid();
}

function updateQuestionGrid() {
    const questionNumbers = document.querySelectorAll(".question-number");
    questionNumbers.forEach((element, index) => {
        element.classList.toggle("active", index === currentQuestion);
        element.classList.toggle("answered", answers[index] !== null && answers[index] !== "");
    });
}

function toggleMarkQuestion() {
    const questionNumbers = document.querySelectorAll(".question-number");
    if (questionNumbers[currentQuestion]) {
        questionNumbers[currentQuestion].classList.toggle("marked");
    }
}

function autoSubmitExam(reason) {
    submitAnswers(reason);
}

window.submitExam = function() {
    if (!isExamActive) return;
    
    const submitConfirm = document.getElementById("submitConfirm");
    const submitOverlay = document.getElementById("submitOverlay");
    
    if (submitConfirm && submitOverlay) {
        submitConfirm.classList.add("show");
        submitOverlay.classList.add("show");
    }
};

console.log("✅ AI Proctoring System fully loaded and ready");