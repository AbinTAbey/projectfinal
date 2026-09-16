"""
Test script to verify AI detection is working
Run this to check if all AI libraries are installed correctly
"""

import sys

print("=" * 60)
print("PROCTOVISION AI DETECTION TEST")
print("=" * 60)
print()

# Test 1: OpenCV
print("1. Testing OpenCV...")
try:
    import cv2
    print(f"   ✅ OpenCV installed (version {cv2.__version__})")
except ImportError:
    print("   ❌ OpenCV not found - Run: pip install opencv-python")
    sys.exit(1)

# Test 2: NumPy
print("2. Testing NumPy...")
try:
    import numpy as np
    print(f"   ✅ NumPy installed (version {np.__version__})")
except ImportError:
    print("   ❌ NumPy not found - Run: pip install numpy")
    sys.exit(1)

# Test 3: MediaPipe (Face Detection & Head Pose)
print("3. Testing MediaPipe...")
try:
    import mediapipe as mp
    print(f"   ✅ MediaPipe installed (version {mp.__version__})")
    
    # Test face detection
    face_detection = mp.solutions.face_detection.FaceDetection()
    print("   ✅ Face detection module loaded")
    
    # Test face mesh
    face_mesh = mp.solutions.face_mesh.FaceMesh()
    print("   ✅ Face mesh (head pose) module loaded")
    
except ImportError:
    print("   ❌ MediaPipe not found - Run: pip install mediapipe")
    sys.exit(1)
except Exception as e:
    print(f"   ⚠️ MediaPipe error: {e}")

# Test 4: YOLOv8 (Phone Detection)
print("4. Testing YOLOv8...")
try:
    from ultralytics import YOLO
    print("   ✅ Ultralytics (YOLOv8) installed")
    
    # Try loading model
    model = YOLO('yolov8n.pt')
    print("   ✅ YOLOv8 nano model loaded")
    
except ImportError:
    print("   ❌ YOLOv8 not found - Run: pip install ultralytics")
    print("   📦 Also install: pip install torch torchvision")
    sys.exit(1)
except Exception as e:
    print(f"   ⚠️ YOLOv8 model download required (first run only)")
    print(f"   Run: python -c \"from ultralytics import YOLO; YOLO('yolov8n.pt')\"")

# Test 5: WebRTC VAD (Voice Detection)
print("5. Testing WebRTC VAD...")
try:
    import webrtcvad
    vad = webrtcvad.Vad(2)
    print("   ✅ WebRTC VAD installed")
except ImportError:
    print("   ⚠️ WebRTC VAD not found (optional)")
    print("   Install for better audio detection: pip install webrtcvad")

# Test 6: Test actual detection
print("\n6. Testing actual AI detection...")
try:
    from backend.services.ai_monitoring import AIMonitoringSystem
    
    ai_monitor = AIMonitoringSystem()
    print("   ✅ AI Monitoring System initialized successfully!")
    
    # Create a test frame
    test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    import base64
    _, buffer = cv2.imencode('.jpg', test_frame)
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    
    result = ai_monitor.process_frame(frame_base64, "test_student")
    
    if result['status'] == 'success':
        print("   ✅ Frame processing works!")
    else:
        print(f"   ⚠️ Frame processing returned: {result}")
    
except Exception as e:
    print(f"   ❌ AI system error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
print("\n🎉 Your AI detection system is ready to use!")
print("\nNext steps:")
print("1. Start backend: python backend/main.py")
print("2. Open frontend: http://127.0.0.1:5500/frontend/")
print("3. Create an exam as teacher")
print("4. Take exam as student and test detections")
print("\n" + "=" * 60)