"""
API Routes for AI Monitoring
Location: backend/api/routes/monitoring.py
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Import your existing auth dependencies
# from backend.auth import get_current_user  # Adjust import as needed

# Import AI monitoring system
from services.ai_monitoring import ai_monitor


router = APIRouter(prefix="/monitoring", tags=["monitoring"])


# Request Models
class FrameProcessRequest(BaseModel):
    frame: str  # base64 encoded image
    timestamp: str


class AudioProcessRequest(BaseModel):
    audio: str  # base64 encoded audio
    timestamp: str


class TabSwitchRequest(BaseModel):
    is_focused: bool
    duration: Optional[int] = 0
    timestamp: str


class AutoSubmitRequest(BaseModel):
    reason: str
    violations: List[dict]
    timestamp: str


# Routes
@router.post("/frame/{submission_id}")
async def process_frame(
    submission_id: str,
    request: FrameProcessRequest
    # current_user: dict = Depends(get_current_user)  # Uncomment if you have auth
):
    """Process video frame for cheating detection"""
    try:
        result = ai_monitor.process_frame(request.frame, submission_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/{submission_id}")
async def process_audio(
    submission_id: str,
    request: AudioProcessRequest
    # current_user: dict = Depends(get_current_user)
):
    """Process audio for voice detection"""
    try:
        result = ai_monitor.process_audio(request.audio, submission_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tab-switch/{submission_id}")
async def check_tab_switch(
    submission_id: str,
    request: TabSwitchRequest
    # current_user: dict = Depends(get_current_user)
):
    """Check for tab switching"""
    try:
        result = ai_monitor.check_tab_switch(submission_id, request.is_focused)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-submit/{submission_id}")
async def log_auto_submit(
    submission_id: str,
    request: AutoSubmitRequest
    # current_user: dict = Depends(get_current_user)
):
    """Log auto-submission due to violations"""
    try:
        # Here you can save to database
        # For now, just log it
        print(f"🚨 Auto-submit: {submission_id} - {request.reason}")
        print(f"   Violations: {len(request.violations)}")
        
        return {
            "status": "success",
            "message": "Auto-submission recorded",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_monitoring_status():
    """Get monitoring system status"""
    return {
        "status": "active",
        "timestamp": datetime.now().isoformat(),
        "detectors": {
            "faces": ai_monitor.face_detector is not None,
            "head_pose": ai_monitor.head_pose_estimator is not None,
            "phone": ai_monitor.phone_detector is not None,
            "audio": ai_monitor.audio_analyzer is not None
        }
    }