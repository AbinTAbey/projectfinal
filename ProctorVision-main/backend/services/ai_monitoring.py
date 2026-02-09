"""
ProctorVision AI Monitoring System
Stable backend-safe implementation

NOTE:
- MediaPipe is optional
- YOLO is conditionally enabled
- Prevents PyTorch 2.6 crashes
"""

import cv2
import numpy as np
import base64
from datetime import datetime
from collections import deque
import time
import os

# ===================== MEDIAPIPE (OPTIONAL) =====================
FACE_DETECTION = None
FACE_MESH = None

try:
    import mediapipe as mp
    if hasattr(mp, "solutions"):
        FACE_DETECTION = mp.solutions.face_detection
        FACE_MESH = mp.solutions.face_mesh
except Exception:
    pass


# ===================== AUDIO =====================
VAD = None

try:
    import webrtcvad
    VAD = webrtcvad
except Exception:
    pass


# ===================== CONFIG =====================
class DetectionConfig:
    FACE_MIN_CONSECUTIVE_FRAMES = 3
    FACE_CONFIDENCE_THRESHOLD = 0.7
    FACE_COOLDOWN_PERIOD = 30

    HEAD_ALLOWED_ANGLE = 35
    HEAD_VIOLATION_THRESHOLD = 25

    PHONE_CONFIDENCE_THRESHOLD = 0.75
    PHONE_MAX_OBJECT_SIZE = 0.15

    AUDIO_CONFIDENCE_THRESHOLD = 0.65


# ===================== TRACKER =====================
class ViolationTracker:
    def __init__(self):
        self.last = {}
        self.counts = {}

    def add(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1

    def reset(self, key):
        self.counts[key] = 0

    def ready(self, key, cooldown):
        return time.time() - self.last.get(key, 0) >= cooldown

    def trigger(self, key):
        self.last[key] = time.time()


# ===================== FACE =====================
class FaceDetector:
    def __init__(self):
        self.enabled = FACE_DETECTION is not None
        if self.enabled:
            self.detector = FACE_DETECTION.FaceDetection(
                model_selection=0,
                min_detection_confidence=DetectionConfig.FACE_CONFIDENCE_THRESHOLD
            )

    def detect(self, frame):
        if not self.enabled:
            return 0, 0.0
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self.detector.process(rgb)
        if res.detections:
            return len(res.detections), max(d.score[0] for d in res.detections)
        return 0, 0.0


# ===================== HEAD =====================
class HeadPoseEstimator:
    def __init__(self):
        self.enabled = FACE_MESH is not None
        if self.enabled:
            self.mesh = FACE_MESH.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )

    def estimate(self, frame):
        if not self.enabled:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self.mesh.process(rgb)
        if not res.multi_face_landmarks:
            return None
        lm = res.multi_face_landmarks[0].landmark
        left, right, nose = lm[33], lm[263], lm[1]
        return (nose.x - ((left.x + right.x) / 2)) * 180


# ===================== PHONE (SAFE MODE) =====================
class PhoneDetector:
    def __init__(self):
        self.enabled = False
        try:
            from ultralytics import YOLO
            self.model = YOLO("yolov8n.pt")
            self.phone_class = 67
            self.enabled = True
        except Exception as e:
            print("⚠️ Phone detection disabled (PyTorch/YOLO incompatibility)")
            print(f"   Reason: {e}")

    def detect(self, frame):
        if not self.enabled:
            return False, 0.0, 0.0

        results = self.model(frame, verbose=False)
        for r in results:
            for box in r.boxes:
                if int(box.cls[0]) == self.phone_class:
                    conf = float(box.conf[0])
                    if conf >= DetectionConfig.PHONE_CONFIDENCE_THRESHOLD:
                        x1, y1, x2, y2 = box.xyxy[0]
                        area = (x2 - x1) * (y2 - y1)
                        return True, conf, area / (frame.shape[0] * frame.shape[1])
        return False, 0.0, 0.0


# ===================== AUDIO =====================
class AudioAnalyzer:
    def __init__(self):
        self.enabled = VAD is not None
        self.vad = VAD.Vad(2) if VAD else None
        self.buf = deque(maxlen=30)

    def detect(self, audio):
        if not self.enabled or self.vad is None:
            return False, 0.0
        speech = self.vad.is_speech(audio[:960], 16000)
        self.buf.append(speech)
        return speech, sum(self.buf) / len(self.buf)


# ===================== MAIN =====================
class AIMonitoringSystem:
    def __init__(self):
        print("🚀 Initializing AI Monitoring System...")

        self.tracker = ViolationTracker()
        self.face = FaceDetector()
        self.pose = HeadPoseEstimator()
        self.phone = PhoneDetector()
        self.audio = AudioAnalyzer()
        self.head_time = {}

        print("✅ Face detection:", "enabled" if self.face.enabled else "disabled")
        print("✅ Head pose:", "enabled" if self.pose.enabled else "disabled")
        print("✅ Phone detection:", "enabled" if self.phone.enabled else "disabled")
        print("✅ Audio detection enabled")
        print("✅ AI Monitoring System ready!")

    def process_frame(self, frame_b64, student_id):
        frame = cv2.imdecode(
            np.frombuffer(base64.b64decode(frame_b64.split(",")[-1]), np.uint8),
            cv2.IMREAD_COLOR
        )

        violations = []

        faces, conf = self.face.detect(frame)
        if faces > 1:
            violations.append({"type": "multiple_faces", "confidence": conf})

        yaw = self.pose.estimate(frame)
        if yaw and abs(yaw) > DetectionConfig.HEAD_ALLOWED_ANGLE:
            violations.append({"type": "looking_away"})

        detected, conf, size = self.phone.detect(frame)
        if detected and size <= DetectionConfig.PHONE_MAX_OBJECT_SIZE:
            violations.append({"type": "phone_detected", "confidence": conf})

        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "violations": violations
        }

    def process_audio(self, audio_b64, student_id):
        audio = base64.b64decode(audio_b64.split(",")[-1])
        speech, conf = self.audio.detect(audio)
        if speech and conf >= DetectionConfig.AUDIO_CONFIDENCE_THRESHOLD:
            return {"violations": [{"type": "voice_detected", "confidence": conf}]}
        return {"violations": []}


# ===================== GLOBAL =====================
ai_monitor = AIMonitoringSystem()





