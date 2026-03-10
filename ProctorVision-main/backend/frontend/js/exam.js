console.log("🔥 AI PROCTORING SYSTEM - ULTRA STABLE WITH FIXED ARCHITECTURE");

const MAX_WARNINGS = 3;
const NO_FACE_TIMEOUT = 5000;
const OBJECT_CHECK_INTERVAL = 2000;
const OBJECT_WARNING_COOLDOWN = 10000;
const UI_UPDATE_INTERVAL = 1000;
const FACE_DETECTION_FPS = 6;
const FACE_DETECTION_INTERVAL = 1000 / FACE_DETECTION_FPS;
const MODEL_LOAD_TIMEOUT = 10000;
const SPEECH_RESTART_DELAY = 2000;
const MAX_POSE_HISTORY = 7;
const MAX_OBJECT_HISTORY = 3;
const HEAD_OFFSET_THRESHOLD = 0.03;
const REQUIRED_AWAY_TIME = 3000;
const AI_WATCHDOG_INTERVAL = 5000;
const MEMORY_CLEANUP_INTERVAL = 60000;

const API_BASE_URL = "/api";
const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (!token || !currentUser || currentUser.role !== "student") {
    window.location.href = "index.html";
}

// AI Model references
let faceMesh = null;
let cocoModel = null;

// Exam state
let currentExam = null;
let currentAttempt = null;
let currentQuestion = 0;
let answers = {};
let timeRemaining = 0;
let examTimer = null;
let cameraStream = null;
let videoElement = null;

// Warning state
let warningCount = 0;
let warningHistory = [];
let isExamActive = false;
let isProctoringActive = false;
let faceDetected = false;
let multipleFaces = false;
let noFaceStartTime = null;
let lookingAwayStartTime = null;
let lastObjectWarningTime = 0;
let isLookingAtScreen = true;
let detectedObjects = [];
let securityBlockersActive = false;

// Detection loop references - single source of truth
let faceDetectionFrame = null;
let objectDetectionInterval = null;
let uiUpdateInterval = null;
let watchdogInterval = null;
let memoryCleanupInterval = null;

// Exam timing
let startExamTime = null;

// Detection locks - CRITICAL for preventing overlaps
let isObjectDetectionRunning = false;
let isFaceProcessing = false;
let isSpeechRestarting = false;
let isRestartingModels = false;
let faceMeshErrorCount = 0;
const MAX_FACE_MESH_ERRORS = 5;
let lastFaceMeshReset = 0;
const FACE_MESH_RESET_INTERVAL = 30000;
let lastFaceDetectionTime = 0;
let aiWatchdogTriggered = false;

// Accessibility Mode
let isAccessibleMode = new URLSearchParams(window.location.search).get("accessible") === "true";
let speechRecognition = null;
let isListening = false;
let currentSpeech = null;
let accessibilityLabel = null;
let hasSpokenFirstQuestion = false;

// Detection buffers for smoothing
let poseHistory = [];
let objectHistory = [];

// Face mesh landmarks indices
const LANDMARK_INDICES = {
    NOSE_TIP: 1,
    LEFT_EYE_OUTER: 33,
    RIGHT_EYE_OUTER: 263
};

// Performance monitoring
let lastFrameTime = 0;
let frameDropCount = 0;
const MAX_FRAME_DROPS = 10;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🎓 Initializing AI Proctoring System...");

    if (isAccessibleMode) {
        createAccessibilityLabel();
        console.log("🔊 Accessibility Mode Enabled");
    }

    videoElement = document.getElementById("videoElement");

    const examCode = new URLSearchParams(window.location.search).get("code");
    if (!examCode) {
        window.location.href = "student-dashboard.html";
        return;
    }

    try {
        await checkAttemptStatus(examCode.toUpperCase());
        await initAIModels();
    } catch (error) {
        console.warn("AI models failed to load:", error);
        updateStatusElement("faceStatus", "⚠️ AI Limited", "#ffc107");
    }

    await loadExamFromBackend(examCode.toUpperCase());

    const startBtn = document.getElementById("startExamBtn");
    if (startBtn) {
        startBtn.onclick = () => window.startExam();
    }
});

// ==================== AI MODEL LIFECYCLE MANAGEMENT ====================

async function initAIModels() {
    console.log("🔄 Initializing AI models...");
    showLoading("Loading AI models...");

    try {
        // Destroy existing models first to prevent leaks
        await destroyAIModels();

        // Load TensorFlow.js and COCO-SSD with memory management
        if (typeof tf !== 'undefined' && typeof cocoSsd !== 'undefined') {
            // Start TensorFlow memory scope
            tf.engine().startScope();
            
            cocoModel = await cocoSsd.load();
            console.log("✅ COCO-SSD model loaded");
            
            // End scope to clean up temporary tensors
            tf.engine().endScope();
        }

        // Load FaceMesh model - FRESH INSTANCE
        if (typeof FaceMesh !== 'undefined') {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 2,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            faceMesh.onResults(handleFaceMeshResults);
            console.log("✅ FaceMesh model loaded");
        }

    } catch (error) {
        console.error("Error loading AI models:", error);
        throw error;
    } finally {
        hideLoading();
    }
}

async function destroyAIModels() {
    console.log("🔄 Destroying AI models...");

    // Destroy FaceMesh - COMPLETE DESTRUCTION, NOT REUSE
    if (faceMesh) {
        try {
            faceMesh.close();
            faceMesh = null;
            console.log("✅ FaceMesh destroyed");
        } catch (error) {
            console.error("Error destroying FaceMesh:", error);
            faceMesh = null;
        }
    }

    // Destroy COCO-SSD and cleanup TensorFlow memory
    if (cocoModel) {
        try {
            // Clear any cached tensors
            if (tf && tf.engine) {
                tf.engine().startScope();
                // Force garbage collection hint
                if (tf.memory) {
                    const memory = tf.memory();
                    console.log("TensorFlow memory before cleanup:", memory);
                }
                tf.engine().endScope();
                tf.engine().disposeVariables();
            }
            cocoModel = null;
            console.log("✅ COCO-SSD destroyed");
        } catch (error) {
            console.error("Error destroying COCO-SSD:", error);
            cocoModel = null;
        }
    }

    // Clear detection buffers
    poseHistory = [];
    objectHistory = [];
    
    // Reset error counters
    faceMeshErrorCount = 0;
    lastFaceMeshReset = 0;
}

async function resetFaceMesh() {
    console.log("🔄 Resetting FaceMesh with fresh instance...");
    
    // COMPLETE DESTRUCTION - DO NOT REUSE CLOSED INSTANCE
    if (faceMesh) {
        try {
            faceMesh.close();
        } catch (e) {
            console.warn("Error closing FaceMesh:", e);
        }
        faceMesh = null;
    }

    // Create FRESH instance
    try {
        faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        faceMesh.setOptions({
            maxNumFaces: 2,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(handleFaceMeshResults);
        console.log("✅ FaceMesh fresh instance created");
        faceMeshErrorCount = 0;
    } catch (error) {
        console.error("Failed to create fresh FaceMesh instance:", error);
        faceMesh = null;
    }
}

async function restartAIModels() {
    // Prevent multiple simultaneous restarts
    if (isRestartingModels) {
        console.log("⚠️ Model restart already in progress, skipping...");
        return;
    }
    
    isRestartingModels = true;
    console.log("🔄 Restarting AI models due to watchdog...");
    
    // Stop proctoring completely
    const wasProctoringActive = isProctoringActive;
    if (wasProctoringActive) {
        stopProctoring();
    }
    
    // Small delay to ensure everything is stopped
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reinitialize models - this will create fresh instances
    await initAIModels();
    
    // Small delay for models to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Restart proctoring if it was active
    if (wasProctoringActive && isExamActive) {
        startProctoring();
    }
    
    aiWatchdogTriggered = false;
    isRestartingModels = false;
    console.log("✅ AI models restarted successfully");
}

// ==================== CAMERA LIFECYCLE MANAGEMENT ====================

async function resetCamera() {
    console.log("🔄 Resetting camera...");
    
    // Stop all tracks
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        cameraStream = null;
    }
    
    // COMPLETE video element reset
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement.load();
        videoElement.onloadedmetadata = null;
    }
    
    console.log("✅ Camera reset complete");
}

async function requestCameraAndMic() {
    try {
        showLoading("Requesting camera and microphone access...");
        
        // Reset camera first
        await resetCamera();

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
                frameRate: { ideal: 15 }
            },
            audio: false
        });

        cameraStream = stream;

        if (videoElement) {
            videoElement.srcObject = stream;
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    videoElement.play()
                        .then(resolve)
                        .catch(e => {
                            console.error("Video play failed:", e);
                            resolve();
                        });
                };
            });
        }

        console.log("✅ Camera enabled (640x480 @ 15fps)");
        return true;

    } catch (err) {
        console.error("Camera permission denied:", err);
        alert("❌ Camera permission is REQUIRED for this proctored exam.\n\nPlease enable camera access, then refresh the page.");
        return false;
    } finally {
        hideLoading();
    }
}

// ==================== WATCHDOG SYSTEM ====================

function startWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
    
    watchdogInterval = setInterval(() => {
        if (!isExamActive || !isProctoringActive || isRestartingModels) return;
        
        const now = Date.now();
        
        // Check if face detection has stopped - ONLY trigger if proctoring active and models exist
        if (faceMesh && now - lastFaceDetectionTime > 5000 && !aiWatchdogTriggered) {
            console.warn("⚠️ AI Watchdog: Face detection stalled for 5 seconds");
            aiWatchdogTriggered = true;
            restartAIModels();
        }
        
        // Check for high memory usage
        if (tf && tf.memory) {
            const memory = tf.memory();
            if (memory.numTensors > 100) {
                console.warn("⚠️ High tensor count detected:", memory.numTensors);
                tf.engine().startScope();
                tf.engine().endScope();
            }
        }
    }, AI_WATCHDOG_INTERVAL);
}

function startMemoryCleanup() {
    if (memoryCleanupInterval) {
        clearInterval(memoryCleanupInterval);
        memoryCleanupInterval = null;
    }
    
    memoryCleanupInterval = setInterval(() => {
        if (!isExamActive || isRestartingModels) return;
        
        // Periodic TensorFlow memory cleanup
        if (tf && tf.engine) {
            tf.engine().startScope();
            tf.engine().endScope();
            
            if (tf.memory) {
                const memory = tf.memory();
                console.log("📊 Memory stats:", {
                    tensors: memory.numTensors,
                    bytes: memory.numBytes
                });
            }
        }
    }, MEMORY_CLEANUP_INTERVAL);
}

// ==================== SPEECH RECOGNITION LIFECYCLE ====================

function destroySpeechRecognition() {
    if (speechRecognition) {
        try {
            if (isListening) {
                speechRecognition.stop();
            }
            speechRecognition.abort();
            speechRecognition = null;
            console.log("✅ Speech recognition destroyed");
        } catch (error) {
            console.error("Error destroying speech recognition:", error);
            speechRecognition = null;
        }
    }
    
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    isListening = false;
    isSpeechRestarting = false;
}

// ==================== SECURITY BLOCKERS ====================

function setupSecurityBlockers() {
    if (securityBlockersActive) return;

    const handlers = [
        ['keydown', handleKeyDown, true],
        ['contextmenu', handleContextMenu, true],
        ['copy', handleCopyPaste, true],
        ['paste', handleCopyPaste, true],
        ['cut', handleCopyPaste, true],
        ['dragstart', preventDefault, true],
        ['drop', preventDefault, true],
        ['fullscreenchange', handleFullscreenChange],
        ['webkitfullscreenchange', handleFullscreenChange],
        ['mozfullscreenchange', handleFullscreenChange],
        ['MSFullscreenChange', handleFullscreenChange],
        ['visibilitychange', handleVisibilityChange]
    ];

    handlers.forEach(([event, handler, capture]) => {
        document.addEventListener(event, handler, capture || false);
    });

    securityBlockersActive = true;
    console.log("✅ Security blockers activated");
}

function removeSecurityBlockers() {
    const handlers = [
        ['keydown', handleKeyDown, true],
        ['contextmenu', handleContextMenu, true],
        ['copy', handleCopyPaste, true],
        ['paste', handleCopyPaste, true],
        ['cut', handleCopyPaste, true],
        ['dragstart', preventDefault, true],
        ['drop', preventDefault, true],
        ['fullscreenchange', handleFullscreenChange],
        ['webkitfullscreenchange', handleFullscreenChange],
        ['mozfullscreenchange', handleFullscreenChange],
        ['MSFullscreenChange', handleFullscreenChange],
        ['visibilitychange', handleVisibilityChange]
    ];

    handlers.forEach(([event, handler, capture]) => {
        document.removeEventListener(event, handler, capture || false);
    });

    securityBlockersActive = false;
}

function handleKeyDown(e) {
    if (!isExamActive) return true;

    const key = e.key || String.fromCharCode(e.keyCode);
    const keyCode = e.keyCode;

    const blockedKeys = [
        { condition: key === 'Escape' || keyCode === 27, message: "Escape key blocked" },
        { condition: key === 'F11' || keyCode === 122, message: "F11 blocked" },
        { condition: keyCode === 123 && !isAccessibleMode, message: "F12 blocked" },
        { condition: e.ctrlKey && e.shiftKey && (keyCode === 73 || keyCode === 74) && !isAccessibleMode, message: "Developer tools blocked" },
        { condition: e.ctrlKey && (keyCode === 85 || keyCode === 83 || keyCode === 80), message: `Ctrl+${key} blocked` },
        { condition: e.ctrlKey && (key === 'c' || key === 'v' || key === 'x'), message: "Copy/paste blocked" }
    ];

    for (const { condition, message } of blockedKeys) {
        if (condition) {
            e.preventDefault();
            addWarning(message);
            if (message.includes('Escape') || message.includes('F11')) {
                forceFullscreen();
            }
            return false;
        }
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
        persistViolationToBackend('Tab switch detected');
        submitAnswers("Tab switch detected - auto submitted");
    }
}

function preventDefault(e) {
    if (isExamActive) {
        e.preventDefault();
        return false;
    }
}

function forceFullscreen() {
    const elem = document.documentElement;
    const methods = [
        'requestFullscreen',
        'mozRequestFullScreen',
        'webkitRequestFullscreen',
        'msRequestFullscreen'
    ];

    for (const method of methods) {
        if (elem[method]) {
            try {
                elem[method]();
                console.log("✅ Fullscreen enforced");
                return;
            } catch (e) {
                console.warn(`Fullscreen ${method} failed:`, e);
            }
        }
    }
    
    addWarning("Fullscreen mode could not be enabled");
}

// ==================== PROCTORING LIFECYCLE ====================

function startProctoring() {
    if (isProctoringActive) return;

    // CRITICAL: Stop any existing proctoring to prevent duplicate loops
    stopProctoring();

    isProctoringActive = true;
    startExamTime = Date.now();
    lastFaceDetectionTime = Date.now();
    console.log("🚀 Starting AI proctoring...");

    // Initialize speech recognition if in accessible mode
    if (isAccessibleMode) {
        destroySpeechRecognition();
        setupSpeechRecognition();
        setTimeout(() => {
            speakText(`Exam started with Accessibility Mode enabled. There are ${currentExam.questions.length} questions.`);
        }, 1000);
    }

    // Start face detection with throttled requestAnimationFrame and LOCK PROTECTION
    if (faceMesh) {
        let lastFaceTime = 0;

        async function faceDetectionLoop(timestamp) {
            if (!isExamActive || !isProctoringActive || !faceMesh || isRestartingModels) {
                if (faceDetectionFrame) {
                    cancelAnimationFrame(faceDetectionFrame);
                    faceDetectionFrame = null;
                }
                return;
            }

            // CRITICAL: Check timestamp throttling AND processing lock
            if (!isFaceProcessing && timestamp - lastFaceTime >= FACE_DETECTION_INTERVAL) {
                // ACQUIRE LOCK - prevents overlapping send() calls
                isFaceProcessing = true;
                
                if (videoElement && videoElement.readyState >= 2 && !videoElement.paused) {
                    try {
                        await faceMesh.send({ image: videoElement });
                        lastFaceTime = timestamp;
                        lastFaceDetectionTime = Date.now();
                    } catch (error) {
                        console.error("FaceMesh send error:", error);
                        faceMeshErrorCount++;
                        
                        if (faceMeshErrorCount >= MAX_FACE_MESH_ERRORS && !isRestartingModels) {
                            const now = Date.now();
                            if (now - lastFaceMeshReset > FACE_MESH_RESET_INTERVAL) {
                                // Reset with fresh instance
                                await resetFaceMesh();
                                lastFaceMeshReset = now;
                            }
                        }
                    } finally {
                        // RELEASE LOCK - critical
                        isFaceProcessing = false;
                    }
                } else {
                    // RELEASE LOCK if video not ready
                    isFaceProcessing = false;
                }
            }

            faceDetectionFrame = requestAnimationFrame(faceDetectionLoop);
        }

        faceDetectionFrame = requestAnimationFrame(faceDetectionLoop);
    }

    // Start object detection with interval and LOCK PROTECTION
    if (cocoModel) {
        objectDetectionInterval = setInterval(async () => {
            // CRITICAL: Check exam active, proctoring active, not restarting, and not already running
            if (!isExamActive || !isProctoringActive || isObjectDetectionRunning || isRestartingModels) {
                return;
            }

            // ACQUIRE LOCK
            isObjectDetectionRunning = true;

            try {
                if (!videoElement || videoElement.readyState < 2 || videoElement.paused) {
                    return;
                }

                let predictions;

                // CRITICAL: TensorFlow memory scope - ALWAYS enclosed in try/finally
                tf.engine().startScope();

                try {
                    predictions = await cocoModel.detect(videoElement);
                } finally {
                    // ENSURE scope ends even if detection throws error
                    tf.engine().endScope();
                }

                if (predictions && predictions.length > 0) {
                    const suspicious = predictions.filter(p => {
                        const label = p.class.toLowerCase();
                        const score = p.score;
                        return score > 0.35 && (
                            label.includes('cell phone') ||
                            label.includes('mobile') ||
                            label.includes('phone') ||
                            label.includes('book') ||
                            label.includes('laptop')
                        );
                    }).map(p => ({
                        class: p.class,
                        score: p.score,
                        bbox: p.bbox
                    }));

                    objectHistory.push(suspicious.length > 0);
                    if (objectHistory.length > MAX_OBJECT_HISTORY) {
                        objectHistory.shift();
                    }

                    const confirmedDetection = objectHistory.length >= 2 && 
                        objectHistory.filter(v => v).length >= 2;

                    if (confirmedDetection && suspicious.length > 0) {
                        const now = Date.now();
                        if (now - lastObjectWarningTime >= OBJECT_WARNING_COOLDOWN) {
                            addWarning('Suspicious object detected');
                            lastObjectWarningTime = now;
                        }
                        detectedObjects = suspicious;
                    } else {
                        detectedObjects = [];
                    }
                } else {
                    objectHistory.push(false);
                    if (objectHistory.length > MAX_OBJECT_HISTORY) {
                        objectHistory.shift();
                    }
                    detectedObjects = [];
                }

            } catch (error) {
                console.error("Object detection error:", error);
                objectHistory.push(false);
                detectedObjects = [];
                // Ensure scope is cleaned up - though finally should handle it
                try { tf.engine().endScope(); } catch (e) {}
            } finally {
                // RELEASE LOCK
                isObjectDetectionRunning = false;
                updateObjectDetectionStatus();
            }
        }, OBJECT_CHECK_INTERVAL);
    }

    // Start UI update interval
    uiUpdateInterval = setInterval(() => {
        if (!isExamActive || !isProctoringActive || isRestartingModels) return;

        checkFaceTimeout();
        checkLookingAwayTimeout();
        updateFaceStatus();
        updateHeadPoseStatus();
        updateObjectDetectionStatus();
    }, UI_UPDATE_INTERVAL);

    // Start watchdog and memory cleanup
    startWatchdog();
    startMemoryCleanup();
}

function stopProctoring() {
    console.log("🔄 Stopping proctoring...");
    
    isProctoringActive = false;

    // Cancel animation frame
    if (faceDetectionFrame) {
        cancelAnimationFrame(faceDetectionFrame);
        faceDetectionFrame = null;
    }

    // Clear intervals
    if (objectDetectionInterval) {
        clearInterval(objectDetectionInterval);
        objectDetectionInterval = null;
    }

    if (uiUpdateInterval) {
        clearInterval(uiUpdateInterval);
        uiUpdateInterval = null;
    }

    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }

    if (memoryCleanupInterval) {
        clearInterval(memoryCleanupInterval);
        memoryCleanupInterval = null;
    }

    // Destroy speech recognition
    destroySpeechRecognition();

    // Reset detection locks and state
    isObjectDetectionRunning = false;
    isFaceProcessing = false;
    isSpeechRestarting = false;
    poseHistory = [];
    objectHistory = [];
    faceMeshErrorCount = 0;
    aiWatchdogTriggered = false;

    console.log("✅ Proctoring stopped");
}

// ==================== FACE MESH RESULTS HANDLER ====================

function handleFaceMeshResults(results) {
    if (!isProctoringActive || !isExamActive || isRestartingModels) return;

    if (!results || !results.multiFaceLandmarks) {
        faceDetected = false;
        multipleFaces = false;
        isLookingAtScreen = false;
        poseHistory = [];
        return;
    }

    const numFaces = results.multiFaceLandmarks.length;
    faceDetected = numFaces > 0;
    multipleFaces = numFaces > 1;

    if (multipleFaces && isExamActive) {
        addWarning('Multiple faces detected');
    }

    if (faceDetected) {
        const faceLandmarks = results.multiFaceLandmarks[0];

        try {
            const noseTip = faceLandmarks[LANDMARK_INDICES.NOSE_TIP];
            const leftEye = faceLandmarks[LANDMARK_INDICES.LEFT_EYE_OUTER];
            const rightEye = faceLandmarks[LANDMARK_INDICES.RIGHT_EYE_OUTER];

            if (noseTip && leftEye && rightEye) {
                const eyeCenterX = (leftEye.x + rightEye.x) / 2;
                const headOffset = noseTip.x - eyeCenterX;

                poseHistory.push(headOffset);
                if (poseHistory.length > MAX_POSE_HISTORY) {
                    poseHistory.shift();
                }

                const smoothedOffset = poseHistory.reduce((a, b) => a + b, 0) / poseHistory.length;

                isLookingAtScreen = smoothedOffset >= -HEAD_OFFSET_THRESHOLD &&
                    smoothedOffset <= HEAD_OFFSET_THRESHOLD;
            } else {
                isLookingAtScreen = false;
            }
        } catch (error) {
            console.error("Error processing face landmarks:", error);
            isLookingAtScreen = false;
        }
    } else {
        isLookingAtScreen = false;
    }
}

// ==================== TIMEOUT CHECKS ====================

function checkFaceTimeout() {
    if (!faceDetected && isExamActive) {
        if (!noFaceStartTime) {
            noFaceStartTime = Date.now();
        } else {
            const timeoutLimit = isAccessibleMode ? 15000 : NO_FACE_TIMEOUT;

            if (Date.now() - noFaceStartTime > timeoutLimit) {
                addWarning('No face detected for extended period');
                noFaceStartTime = null;
            }
        }
    } else {
        noFaceStartTime = null;
    }
}

function checkLookingAwayTimeout() {
    if (isAccessibleMode) return;

    if (isLookingAtScreen) {
        lookingAwayStartTime = null;
        return;
    }

    if (!isLookingAtScreen && isExamActive) {
        if (!lookingAwayStartTime) {
            lookingAwayStartTime = Date.now();
        } else {
            if (Date.now() - lookingAwayStartTime > REQUIRED_AWAY_TIME) {
                addWarning('Looking away from screen for extended period');
                lookingAwayStartTime = Date.now();
            }
        }
    }
}

// ==================== UI UPDATE FUNCTIONS ====================

function updateStatusElement(elementId, text, color) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
        element.style.color = color;
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
        headPoseElement.textContent = "✅ Looking at Screen";
        headPoseElement.style.color = "#28a745";
    } else {
        headPoseElement.textContent = "⚠️ Looking Away";
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
        <span id="headPoseStatus" style="color: #28a745;">✅ Looking at Screen</span>
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
        const objects = [...new Set(detectedObjects.map(d => d.class))].join(', ');
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

// ==================== WARNING AND VIOLATION SYSTEM ====================

function reasonToEventType(reason) {
    const r = (reason || '').toLowerCase();
    if (r.includes('no face')) return 'face_not_visible';
    if (r.includes('multiple face')) return 'multiple_faces';
    if (r.includes('looking away')) return 'looking_away';
    if (r.includes('phone') || r.includes('mobile') || r.includes('cell')) return 'phone_detected';
    if (r.includes('object') || r.includes('book') || r.includes('laptop')) return 'phone_detected';
    if (r.includes('tab') || r.includes('visibility') || r.includes('fullscreen')) return 'tab_switch';
    return 'tab_switch';
}

function persistViolationToBackend(reason) {
    console.log('🔴 persistViolationToBackend called:', reason);

    if (!currentAttempt || !currentAttempt.submission_id) {
        console.warn('🔴 persistViolationToBackend: NO submission_id, skipping!');
        return;
    }

    const payload = {
        event_type: reasonToEventType(reason),
        reason: reason,
        confidence: 1.0,
        timestamp: new Date().toISOString()
    };

    const url = `${API_BASE_URL}/monitoring/log-event/${currentAttempt.submission_id}`;

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    }).catch(err => console.error('🔴 persistViolationToBackend FETCH ERROR:', err));
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
    persistViolationToBackend(reason);

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

// ==================== SPEECH RECOGNITION ====================

function setupSpeechRecognition() {
    if (!isAccessibleMode) return;

    // Destroy existing instance first
    destroySpeechRecognition();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported");
        if (isExamActive) {
            speakText("Speech recognition not supported. Please use Chrome for accessibility features.");
        }
        return;
    }

    try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';
        speechRecognition.maxAlternatives = 1;

        speechRecognition.onresult = (event) => {
            try {
                const result = event.results[event.results.length - 1];
                if (!result.isFinal) return;

                const transcript = result[0].transcript.toLowerCase().trim();
                console.log("Voice command:", transcript);
                handleVoiceCommand(transcript);
            } catch (error) {
                console.error("Error processing speech result:", error);
            }
        };

        speechRecognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                console.warn("Microphone access denied");
                isListening = false;
            }
        };

        speechRecognition.onend = () => {
            console.log("Speech recognition ended");
            if (isExamActive && isAccessibleMode && isListening && !isSpeechRestarting && !isRestartingModels) {
                isSpeechRestarting = true;
                setTimeout(() => {
                    try {
                        if (isExamActive && isAccessibleMode && isListening && speechRecognition && !isRestartingModels) {
                            speechRecognition.start();
                            console.log("Speech recognition restarted");
                        }
                    } catch (e) {
                        console.error("Failed to restart speech recognition:", e);
                        isListening = false;
                    } finally {
                        isSpeechRestarting = false;
                    }
                }, SPEECH_RESTART_DELAY);
            }
        };

        if (isExamActive) {
            startListening();
        }
    } catch (error) {
        console.error("Failed to setup speech recognition:", error);
    }
}

function startListening() {
    if (!isAccessibleMode || !speechRecognition || isListening || isRestartingModels) return;

    try {
        speechRecognition.start();
        isListening = true;
        console.log("🎤 Speech recognition started");
    } catch (error) {
        console.error("Failed to start speech recognition:", error);
        isListening = false;
    }
}

function stopListening() {
    if (!speechRecognition || !isListening) return;

    try {
        speechRecognition.stop();
        isListening = false;
        console.log("🎤 Speech recognition stopped");
    } catch (error) {
        console.error("Failed to stop speech recognition:", error);
        isListening = false;
    }
}

function speakText(text) {
    console.log("🔊 speakText called with:", text);

    if (!isAccessibleMode || !window.speechSynthesis || isRestartingModels) {
        console.log("⚠️ TTS not available");
        return;
    }

    try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = 'en-US';

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const femaleVoice = voices.find(v => 
                v.name.includes('Female') || 
                v.name.includes('Samantha') || 
                v.name.includes('Google UK English Female')
            );
            if (femaleVoice) {
                utterance.voice = femaleVoice;
            }
        }

        console.log("🔊 Speaking now:", text.substring(0, 50) + "...");
        window.speechSynthesis.speak(utterance);
        currentSpeech = utterance;
    } catch (error) {
        console.error("Text-to-speech error:", error);
    }
}

function handleVoiceCommand(command) {
    if (!isExamActive || isRestartingModels) return;

    console.log("Processing voice command:", command);

    if (command.includes('next') || command.includes('nest') || command.includes('forward')) {
        if (currentQuestion < currentExam.questions.length - 1) {
            window.nextQuestion();
            speakText("Moving to next question.");
        } else {
            speakText("This is the last question.");
        }
        return;
    }

    if (command.includes('previous') || command.includes('back')) {
        if (currentQuestion > 0) {
            window.prevQuestion();
            speakText("Moving to previous question.");
        } else {
            speakText("This is the first question.");
        }
        return;
    }

    if (command.includes('repeat') || command.includes('again')) {
        console.log("🔄 Repeat command detected");
        speakCurrentQuestion();
        return;
    }

    if (command.includes('submit') || command.includes('finish exam')) {
        console.log("📤 Submit command detected");
        speakText("Are you sure you want to submit the exam? Say 'yes confirm' to submit or 'cancel' to continue.");

        const originalHandler = speechRecognition.onresult;
        let confirmationTimeout;

        speechRecognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            console.log("Confirmation response:", transcript);

            if (transcript.includes('yes') || transcript.includes('confirm')) {
                speakText("Submitting your exam now.");
                setTimeout(() => window.submitExam(), 1000);
            } else {
                speakText("Submission cancelled. Continuing with exam.");
            }

            speechRecognition.onresult = originalHandler;
            clearTimeout(confirmationTimeout);
        };

        confirmationTimeout = setTimeout(() => {
            speechRecognition.onresult = originalHandler;
            speakText("No response received. Continuing with exam.");
        }, 10000);

        return;
    }

    const currentQ = currentExam.questions[currentQuestion];
    console.log("🎯 Checking option selection. Question type:", currentQ?.type);

    if (currentQ.type === "mcq") {
        console.log("🎯 MCQ detected, checking command:", command);

        if (command.includes('1') || command.includes('one') || command.includes('option 1')) {
            console.log("🎯 Selecting option 1");
            selectOption(0);
            return;
        }
        if (command.includes('2') || command.includes('two') || command.includes('option 2')) {
            console.log("🎯 Selecting option 2");
            selectOption(1);
            return;
        }
        if (command.includes('3') || command.includes('three') || command.includes('option 3')) {
            console.log("🎯 Selecting option 3");
            selectOption(2);
            return;
        }
        if (command.includes('4') || command.includes('four') || command.includes('option 4')) {
            console.log("🎯 Selecting option 4");
            selectOption(3);
            return;
        }

        console.log("⚠️ No matching option command found");
    }
}

function selectOption(optionIndex) {
    console.log("📝 selectOption called! Index:", optionIndex, "Current question:", currentQuestion);

    const currentQ = currentExam.questions[currentQuestion];
    if (currentQ.type === "mcq" && optionIndex < currentQ.options.length) {
        console.log("📝 Saving answer...");
        answers[currentQuestion] = optionIndex;

        loadQuestion(currentQuestion, false);
        updateQuestionGrid();

        setTimeout(() => {
            console.log("🔊 About to speak confirmation for option:", optionIndex + 1);
            speakText(`Selected option ${optionIndex + 1}. ${currentQ.options[optionIndex]}`);
            console.log("🔊 speakText called for confirmation");
        }, 300);

        if (currentQuestion < currentExam.questions.length - 1) {
            setTimeout(() => {
                window.nextQuestion();
            }, 2500);
        } else {
            setTimeout(() => {
                speakText("This was the last question. You can submit the exam when ready.");
            }, 2500);
        }
    } else {
        console.error("❌ selectOption failed!");
    }
}

function speakCurrentQuestion() {
    if (!isAccessibleMode || !currentExam || isRestartingModels) return;

    try {
        const question = currentExam.questions[currentQuestion];
        let speechText = `Question ${currentQuestion + 1}. ${question.question_text}. `;

        if (question.type === "mcq" && question.options) {
            speechText += `Options: `;
            question.options.forEach((option, index) => {
                speechText += `Option ${index + 1}. ${option}. `;
            });
        } else if (question.type === "short") {
            speechText += `This is a short answer question. Please speak your answer clearly.`;
        }

        speakText(speechText);
    } catch (error) {
        console.error("Error speaking question:", error);
    }
}

function createAccessibilityLabel() {
    accessibilityLabel = document.createElement("div");
    accessibilityLabel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #4361ee;
        color: white;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    accessibilityLabel.innerHTML = `
        <i class="fas fa-universal-access"></i>
        <span>Accessibility Mode Enabled</span>
    `;
    document.body.appendChild(accessibilityLabel);
}

// ==================== EXAM BACKEND FUNCTIONS ====================

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

// ==================== EXAM START/STOP ====================

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

        console.log("✅ AI-proctored exam started");

    } catch (error) {
        console.error("❌ Error starting exam:", error);
        alert("Failed to start exam: " + error.message);
        hideLoading();
    }
};

function initializeExamUI() {
    const instructions = document.getElementById("examInstructions");
    const examContainer = document.getElementById("examContainer");

    if (instructions) instructions.style.display = "none";
    if (examContainer) examContainer.style.display = "block";

    loadQuestion(0);
    buildQuestionGrid();
}

function startTimer() {
    if (examTimer) {
        clearInterval(examTimer);
        examTimer = null;
    }
    
    updateTimerDisplay();
    examTimer = setInterval(() => {
        if (!isExamActive || isRestartingModels) return;
        
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            clearInterval(examTimer);
            examTimer = null;
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

function loadQuestion(index, shouldSpeak = true) {
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
                loadQuestion(index, false);
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

    if (isAccessibleMode && isExamActive && shouldSpeak && !isRestartingModels) {
        const delay = (index === 0 && !hasSpokenFirstQuestion) ? 8000 : 500;
        if (index === 0) hasSpokenFirstQuestion = true;

        setTimeout(() => {
            if (isAccessibleMode && isExamActive && !isRestartingModels) {
                speakCurrentQuestion();
            }
        }, delay);
    }
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

window.submitExam = function () {
    if (!isExamActive) return;

    const submitConfirm = document.getElementById("submitConfirm");
    const submitOverlay = document.getElementById("submitOverlay");

    if (submitConfirm && submitOverlay) {
        submitConfirm.classList.add("show");
        submitOverlay.classList.add("show");
    }
};

window.confirmSubmit = async function () {
    closeSubmitConfirm();
    await submitAnswers();
};

window.closeSubmitConfirm = function () {
    const elements = ["submitConfirm", "submitOverlay"];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("show");
    });
};

window.closeCheatingAlert = function () {
    const elements = ["cheatingAlert", "cheatingOverlay"];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("show");
    });
};

window.prevQuestion = function () {
    if (currentQuestion > 0 && !isRestartingModels) {
        loadQuestion(currentQuestion - 1);
    }
};

window.nextQuestion = function () {
    if (currentExam && currentQuestion < currentExam.questions.length - 1 && !isRestartingModels) {
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

// ==================== SUBMISSION AND CLEANUP ====================

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
            detected_objects: detectedObjects.map(d => d.class || 'Object'),
            exam_duration: startExamTime ? Math.round((Date.now() - startExamTime) / 1000) : 0,
            accessible_mode: isAccessibleMode
        };

        // Full cleanup before submission
        await cleanupExamSession();

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

async function cleanupExamSession() {
    console.log("🧹 Cleaning up exam session...");
    
    isExamActive = false;
    
    // Stop proctoring first
    stopProctoring();
    
    // Clear timer
    if (examTimer) {
        clearInterval(examTimer);
        examTimer = null;
    }
    
    // Reset camera
    await resetCamera();
    
    // Destroy AI models
    await destroyAIModels();
    
    // Remove security blockers
    removeSecurityBlockers();
    
    // Exit fullscreen
    if (document.fullscreenElement) {
        try {
            document.exitFullscreen();
        } catch (e) {
            console.warn("Failed to exit fullscreen:", e);
        }
    }
    
    // Reset state
    warningCount = 0;
    warningHistory = [];
    faceDetected = false;
    multipleFaces = false;
    detectedObjects = [];
    poseHistory = [];
    objectHistory = [];
    hasSpokenFirstQuestion = false;
    isRestartingModels = false;
    isObjectDetectionRunning = false;
    isFaceProcessing = false;
    
    console.log("✅ Exam session cleaned up");
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

// ==================== EVENT LISTENERS ====================

window.addEventListener("pagehide", () => {
    if (isExamActive) {
        cleanupExamSession();
    }
});

window.addEventListener("beforeunload", function (e) {
    if (isExamActive) {
        const message = "Are you sure you want to leave? Your exam will be submitted automatically with violations recorded.";
        e.returnValue = message;
        return message;
    }
});

window.addEventListener("unload", () => {
    // Emergency cleanup on unload
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
});

console.log("✅ ULTRA STABLE PROCTORING SYSTEM WITH FIXED ARCHITECTURE");