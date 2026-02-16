console.log("🔥 AI PROCTORING SYSTEM LOADED - PRODUCTION STABLE VERSION");

const MAX_WARNINGS = 3;
const NO_FACE_TIMEOUT = 5000;
const LOOK_AWAY_TIMEOUT = 10000;
const OBJECT_CHECK_INTERVAL = 2000;
const OBJECT_WARNING_COOLDOWN = 10000;
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
let faceMesh = null;
let cocoModel = null;

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

let faceAnimationFrame = null;
let objectInterval = null;
let uiInterval = null;

let startExamTime = null;

// Detection locks
let isDetectingObject = false;
let isRestartingSpeech = false;

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
const POSE_HISTORY_SIZE = 7;
const OBJECT_HISTORY_SIZE = 3;
const HEAD_OFFSET_THRESHOLD = 0.03;
const REQUIRED_AWAY_TIME = 3000;

// Face mesh landmarks indices
const LANDMARK_INDICES = {
    NOSE_TIP: 1,
    LEFT_EYE_OUTER: 33,
    RIGHT_EYE_OUTER: 263
};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🎓 Initializing AI Proctoring System...");

    // Create accessibility label if in accessible mode
    if (isAccessibleMode) {
        createAccessibilityLabel();
        console.log("🔊 Accessibility Mode Enabled");
    }

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
        // Load TensorFlow.js and COCO-SSD
        if (typeof tf !== 'undefined' && typeof cocoSsd !== 'undefined') {
            cocoModel = await cocoSsd.load();
            console.log("✅ COCO-SSD model loaded");
        } else {
            console.warn("TensorFlow.js or COCO-SSD not available");
        }

        // Load FaceMesh model
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
        } else {
            console.warn("FaceMesh not available");
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
        // Allow F12 in accessibility mode for debugging
        if (isAccessibleMode) {
            console.log("F12 allowed in accessibility mode");
            return true;
        }
        e.preventDefault();
        addWarning("F12 blocked - developer tools disabled");
        return false;
    }

    if (e.ctrlKey && e.shiftKey && (keyCode === 73 || keyCode === 74)) {
        // Allow Ctrl+Shift+I/J in accessibility mode for debugging
        if (isAccessibleMode) {
            console.log("Developer tools allowed in accessibility mode");
            return true;
        }
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

    try {
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
    } catch (e) {
        console.warn("Fullscreen denied:", e);
        addWarning("Fullscreen mode could not be enabled");
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
            audio: false
        });

        cameraStream = stream;

        const video = document.getElementById("videoElement");
        if (video) {
            video.srcObject = stream;
            await video.play();
        }

        console.log("✅ Camera enabled (640x480)");
        return true;

    } catch (err) {
        console.error("Camera permission denied:", err);
        alert("❌ Camera permission is REQUIRED for this proctored exam.\n\nPlease enable camera access, then refresh the page.");
        return false;
    } finally {
        hideLoading();
    }
}

// Text-to-Speech Functionality
function speakText(text) {
    console.log("🔊 speakText called with:", text);

    if (!isAccessibleMode || !window.speechSynthesis) {
        console.log("⚠️ TTS not available. isAccessibleMode:", isAccessibleMode, "speechSynthesis:", !!window.speechSynthesis);
        return;
    }

    try {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = 'en-US';

        // Set a voice if available
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google UK English Female'));
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

// Speech-to-Text Functionality
function setupSpeechRecognition() {
    if (!isAccessibleMode) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported in this browser");
        if (isExamActive) {
            speakText("Speech recognition not supported in this browser. Please use Chrome for accessibility features.");
        }
        return;
    }

    try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true; // Changed to true for better responsiveness
        speechRecognition.lang = 'en-US';
        speechRecognition.maxAlternatives = 1;

        speechRecognition.onresult = (event) => {
            try {
                const result = event.results[event.results.length - 1];
                // Only process final results, not interim ones
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
                console.warn("Microphone access denied for speech recognition");
                isListening = false;
            }
        };

        speechRecognition.onend = () => {
            console.log("Speech recognition ended");
            // Safe restart with delay to prevent rapid cycling
            if (isExamActive && isAccessibleMode && isListening && !isRestartingSpeech) {
                isRestartingSpeech = true;
                setTimeout(() => {
                    try {
                        if (isExamActive && isAccessibleMode && isListening && speechRecognition) {
                            speechRecognition.start();
                            console.log("Speech recognition restarted");
                        }
                    } catch (e) {
                        console.error("Failed to restart speech recognition:", e);
                        isListening = false;
                    } finally {
                        isRestartingSpeech = false;
                    }
                }, 1000);
            }
        };

        // Start listening if in accessible mode and exam active
        if (isExamActive) {
            startListening();
        }
    } catch (error) {
        console.error("Failed to setup speech recognition:", error);
    }
}

function startListening() {
    if (!isAccessibleMode || !speechRecognition || isListening) return;

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
    }
}

function handleVoiceCommand(command) {
    if (!isExamActive) return;

    console.log("Processing voice command:", command);

    // Navigation commands
    if (command.includes('next') || command.includes('nest') || command.includes('move forward') || command.includes('forward')) {
        if (currentQuestion < currentExam.questions.length - 1) {
            window.nextQuestion();
            speakText("Moving to next question.");
        } else {
            speakText("This is the last question.");
        }
        return;
    }

    if (command.includes('previous') || command.includes('move back') || command.includes('back') || command.includes('go back')) {
        if (currentQuestion > 0) {
            window.prevQuestion();
            speakText("Moving to previous question.");
        } else {
            speakText("This is the first question.");
        }
        return;
    }

    if (command.includes('repeat') || command.includes('say again') || command.includes('again')) {
        console.log("🔄 Repeat command detected, speaking current question");
        speakCurrentQuestion();
        return;
    }

    // Submit exam command
    if (command.includes('submit') || command.includes('finish exam') || command.includes('end exam')) {
        console.log("📤 Submit command detected");
        speakText("Are you sure you want to submit the exam? Say 'yes confirm' to submit or 'cancel' to continue.");

        // Set up temporary listener for confirmation
        const originalHandler = speechRecognition.onresult;
        let confirmationTimeout;

        speechRecognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            console.log("Confirmation response:", transcript);

            if (transcript.includes('yes') || transcript.includes('confirm')) {
                speakText("Submitting your exam now.");
                setTimeout(() => {
                    window.submitExam();
                }, 1000);
            } else {
                speakText("Submission cancelled. Continuing with exam.");
            }

            // Restore original handler
            speechRecognition.onresult = originalHandler;
            clearTimeout(confirmationTimeout);
        };

        // Auto-cancel after 10 seconds if no response
        confirmationTimeout = setTimeout(() => {
            speechRecognition.onresult = originalHandler;
            speakText("No response received. Continuing with exam.");
        }, 10000);

        return;
    }

    // Option selection commands
    const currentQ = currentExam.questions[currentQuestion];
    console.log("🎯 Checking option selection. Question type:", currentQ?.type);

    if (currentQ.type === "mcq") {
        // Check for number commands
        console.log("🎯 MCQ detected, checking command:", command);

        if (command.includes('1') || command.includes('one') || command.includes('option 1') || command.includes('first')) {
            console.log("🎯 Selecting option 1");
            selectOption(0);
            return;
        }
        if (command.includes('2') || command.includes('two') || command.includes('option 2') || command.includes('second')) {
            console.log("🎯 Selecting option 2");
            selectOption(1);
            return;
        }
        if (command.includes('3') || command.includes('three') || command.includes('option 3') || command.includes('third')) {
            console.log("🎯 Selecting option 3");
            selectOption(2);
            return;
        }
        if (command.includes('4') || command.includes('four') || command.includes('for') || command.includes('option 4') || command.includes('fourth')) {
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

        // Reload the question to show the selected option visually (but don't speak)
        loadQuestion(currentQuestion, false);

        updateQuestionGrid();

        // Speak confirmation after a short delay to ensure it's not canceled
        setTimeout(() => {
            console.log("🔊 About to speak confirmation for option:", optionIndex + 1);
            speakText(`Selected option ${optionIndex + 1}. ${currentQ.options[optionIndex]}`);
            console.log("🔊 speakText called for confirmation");
        }, 300);

        // Auto-advance to next question after a short delay
        if (currentQuestion < currentExam.questions.length - 1) {
            setTimeout(() => {
                window.nextQuestion();
            }, 2500); // Increased from 1500 to allow confirmation to finish
        } else {
            // For last question, delay the message so confirmation plays first
            setTimeout(() => {
                speakText("This was the last question. You can submit the exam when ready.");
            }, 2500); // Increased delay to let confirmation finish
        }
    } else {
        console.error("❌ selectOption failed! Type:", currentQ?.type, "optionIndex:", optionIndex, "length:", currentQ?.options?.length);
    }
}

function speakCurrentQuestion() {
    if (!isAccessibleMode || !currentExam) return;

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

function startProctoring() {
    if (isProctoringActive) return;

    stopProctoring();

    isProctoringActive = true;
    startExamTime = Date.now();
    console.log("🚀 Starting AI proctoring...");

    // Initialize speech recognition if in accessible mode
    if (isAccessibleMode) {
        setupSpeechRecognition();
        // Speak exam start message
        setTimeout(() => {
            speakText(`Exam started with Accessibility Mode enabled. Looking away detection is disabled. There are ${currentExam.questions.length} questions. ${currentExam.questions.length > 1 ? 'Say "next" to move to the next question, "previous" to go back, or "repeat" to hear the current question again.' : ''}`);
        }, 1000);
    }

    // Start face detection with requestAnimationFrame throttled to 6 FPS
    if (faceMesh) {
        let lastFaceTime = 0;
        const FACE_FPS = 6;

        function faceLoop(timestamp) {
            if (!isExamActive || !faceMesh) {
                if (faceAnimationFrame) {
                    cancelAnimationFrame(faceAnimationFrame);
                    faceAnimationFrame = null;
                }
                return;
            }

            if (timestamp - lastFaceTime >= 1000 / FACE_FPS) {
                const video = document.getElementById("videoElement");
                if (video && video.readyState >= 2) {
                    try {
                        faceMesh.send({ image: video });
                    } catch (error) {
                        console.error("FaceMesh error:", error);
                    }
                }
                lastFaceTime = timestamp;
            }

            faceAnimationFrame = requestAnimationFrame(faceLoop);
        }

        faceAnimationFrame = requestAnimationFrame(faceLoop);
    }

    // Object detection every 2 seconds using COCO-SSD with detection lock
    if (cocoModel) {
        objectInterval = setInterval(async () => {
            // Prevent overlapping detection calls
            if (isDetectingObject) {
                console.log("Object detection already in progress, skipping...");
                return;
            }

            if (!cocoModel || !isExamActive) return;

            isDetectingObject = true;

            try {
                const video = document.getElementById("videoElement");
                if (!video || video.readyState < 2) {
                    isDetectingObject = false;
                    return;
                }

                // Run COCO-SSD detection
                const predictions = await cocoModel.detect(video);

                // Optional debug logging (5% of cycles)
                if (Math.random() < 0.05) {
                    console.log("Object detection predictions:",
                        predictions.map(p => ({
                            class: p.class,
                            score: p.score.toFixed(2)
                        }))
                    );
                }

                if (predictions && predictions.length > 0) {
                    const suspicious = [];

                    for (const prediction of predictions) {
                        const label = prediction.class.toLowerCase();
                        const score = prediction.score;

                        // Check for suspicious objects with threshold 0.35
                        if (score > 0.35 && (
                            label.includes('cell phone') ||
                            label.includes('mobile phone') ||
                            label.includes('phone') ||
                            label.includes('book') ||
                            label.includes('laptop')
                        )) {
                            suspicious.push({
                                class: prediction.class,
                                score: prediction.score,
                                bbox: prediction.bbox
                            });
                        }
                    }

                    // Add to object history buffer for smoothing (size 3)
                    objectHistory.push(suspicious.length > 0);
                    if (objectHistory.length > OBJECT_HISTORY_SIZE) {
                        objectHistory.shift();
                    }

                    // Smoothing: Confirm if at least 2 out of last 3 cycles detected objects
                    let confirmedDetection = false;
                    if (objectHistory.length >= 2) {
                        const trueCount = objectHistory.filter(v => v === true).length;
                        confirmedDetection = trueCount >= 2;
                    }

                    if (confirmedDetection && suspicious.length > 0) {
                        const now = Date.now();
                        if (now - lastObjectWarningTime >= OBJECT_WARNING_COOLDOWN) {
                            const objectNames = [...new Set(suspicious.map(p => p.class))].join(', ');
                            addWarning(`Suspicious object detected`);
                            lastObjectWarningTime = now;
                        }
                        detectedObjects = suspicious;
                    } else {
                        detectedObjects = [];
                    }

                    updateObjectDetectionStatus();
                } else {
                    objectHistory.push(false);
                    if (objectHistory.length > OBJECT_HISTORY_SIZE) {
                        objectHistory.shift();
                    }
                    detectedObjects = [];
                    updateObjectDetectionStatus();
                }
            } catch (error) {
                console.error("Object detection error:", error);
                objectHistory.push(false);
                if (objectHistory.length > OBJECT_HISTORY_SIZE) {
                    objectHistory.shift();
                }
                detectedObjects = [];
                updateObjectDetectionStatus();
            } finally {
                isDetectingObject = false;
            }
        }, OBJECT_CHECK_INTERVAL);
    }

    // UI updates every second
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

    if (faceAnimationFrame) {
        cancelAnimationFrame(faceAnimationFrame);
        faceAnimationFrame = null;
    }

    if (objectInterval) {
        clearInterval(objectInterval);
        objectInterval = null;
    }

    if (uiInterval) {
        clearInterval(uiInterval);
        uiInterval = null;
    }

    // Stop speech recognition and synthesis
    stopListening();
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    isDetectingObject = false;
    isRestartingSpeech = false;
    poseHistory = [];
    objectHistory = [];

    console.log("✅ Proctoring stopped");
}

function handleFaceMeshResults(results) {
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
            // Extract key landmarks
            const noseTip = faceLandmarks[LANDMARK_INDICES.NOSE_TIP];
            const leftEye = faceLandmarks[LANDMARK_INDICES.LEFT_EYE_OUTER];
            const rightEye = faceLandmarks[LANDMARK_INDICES.RIGHT_EYE_OUTER];

            if (noseTip && leftEye && rightEye) {
                // Calculate eye center position
                const eyeCenterX = (leftEye.x + rightEye.x) / 2;

                // Calculate head offset (nose position relative to eye center)
                const headOffset = noseTip.x - eyeCenterX;

                // Add to pose history buffer for smoothing
                poseHistory.push(headOffset);
                if (poseHistory.length > POSE_HISTORY_SIZE) {
                    poseHistory.shift();
                }

                // Calculate moving average for smooth head pose detection
                let smoothedOffset = headOffset;
                if (poseHistory.length > 0) {
                    const sum = poseHistory.reduce((a, b) => a + b, 0);
                    smoothedOffset = sum / poseHistory.length;
                }

                // Determine if looking at screen based on threshold
                isLookingAtScreen = smoothedOffset >= -HEAD_OFFSET_THRESHOLD &&
                    smoothedOffset <= HEAD_OFFSET_THRESHOLD;

                // Debug logging
                if (Math.random() < 0.02) {
                    console.log(`Head offset: ${smoothedOffset.toFixed(4)}, Looking: ${isLookingAtScreen}`);
                }
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

function checkFaceTimeout() {
    if (!faceDetected && isExamActive) {
        if (!noFaceStartTime) {
            noFaceStartTime = Date.now();
        } else {
            // Extended timeout for accessibility mode (15s vs 5s)
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
    // Disable looking away check for accessibility mode
    if (isAccessibleMode) return;

    if (isLookingAtScreen) {
        // Reset timer if looking at screen
        lookingAwayStartTime = null;
        return;
    }

    if (!isLookingAtScreen && isExamActive) {
        if (!lookingAwayStartTime) {
            lookingAwayStartTime = Date.now();
        } else {
            const awayTime = Date.now() - lookingAwayStartTime;

            if (awayTime > REQUIRED_AWAY_TIME) {
                if (!isLookingAtScreen) {
                    addWarning('Looking away from screen for extended period');
                    lookingAwayStartTime = Date.now();
                }
            }
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

        console.log("✅ AI-proctored exam started");

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

    const video = document.getElementById("videoElement");
    if (video) {
        video.srcObject = null;
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
        audioContext.close();
        audioContext = null;
    }

    // Clean up accessibility features
    stopListening();
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (accessibilityLabel && accessibilityLabel.parentNode) {
        accessibilityLabel.parentNode.removeChild(accessibilityLabel);
    }

    faceMesh = null;
    cocoModel = null;
    poseHistory = [];
    objectHistory = [];
    isDetectingObject = false;
    isRestartingSpeech = false;

    removeSecurityBlockers();

    document.exitFullscreen?.();

    console.log("✅ Camera + Fullscreen cleaned up");
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
            detected_objects: detectedObjects.map(d => d.class || 'Object'),
            exam_duration: startExamTime ? Math.round((Date.now() - startExamTime) / 1000) : 0,
            accessible_mode: isAccessibleMode
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
    if (currentQuestion > 0) {
        loadQuestion(currentQuestion - 1);
    }
};

window.nextQuestion = function () {
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

    // Speak the question if in accessible mode and shouldSpeak is true
    if (isAccessibleMode && isExamActive && shouldSpeak) {
        // Add delay for first question to let the start message finish
        const delay = (index === 0 && !hasSpokenFirstQuestion) ? 8000 : 500;
        if (index === 0) hasSpokenFirstQuestion = true;

        setTimeout(() => {
            if (isAccessibleMode && isExamActive) {
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

window.addEventListener("pagehide", cleanupProctoring);
window.addEventListener("beforeunload", function (e) {
    if (isExamActive) {
        cleanupProctoring();
        const message = "Are you sure you want to leave? Your exam will be submitted automatically with violations recorded.";
        e.returnValue = message;
        return message;
    }
});

console.log("✅ PRODUCTION PROCTORING SYSTEM READY - STABLE BUILD");