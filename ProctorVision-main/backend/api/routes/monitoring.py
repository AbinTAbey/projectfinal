"""
API Routes for AI Monitoring
Location: backend/api/routes/monitoring.py
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Import DB
from database.database import get_db
from database.models import CheatingEvent, Submission

# Import AI monitoring system
from services.ai_monitoring import ai_monitor

router = APIRouter(tags=["monitoring"])

# ---- severity mapping ------------------------------------------------
SEVERITY_MAP = {
    "phone_detected": "high",
    "multiple_faces": "high",
    "looking_away": "medium",
    "voice_detected": "medium",
    "tab_switch": "low",
    "face_not_visible": "medium",
}


def _persist_violations(submission_id: str, violations: list, db: Session):
    """Save each violation as a CheatingEvent row and bump the Submission counters."""
    if not violations:
        return

    try:
        sub_id = int(submission_id)
    except (ValueError, TypeError):
        return  # non-integer submission ids are used in tests; skip DB writes

    submission = db.query(Submission).filter(Submission.id == sub_id).first()

    for v in violations:
        event_type = v.get("type", "unknown")
        severity = SEVERITY_MAP.get(event_type, "low")
        confidence = float(v.get("confidence", 0.0))

        event = CheatingEvent(
            submission_id=sub_id,
            event_type=event_type,
            severity=severity,
            confidence=confidence,
            timestamp=datetime.utcnow(),
        )
        db.add(event)

        if submission:
            submission.cheating_count = (submission.cheating_count or 0) + 1
            current_warnings = list(submission.warnings or [])
            current_warnings.append({
                "type": event_type,
                "severity": severity,
                "confidence": confidence,
                "timestamp": datetime.utcnow().isoformat(),
            })
            submission.warnings = current_warnings

    db.commit()


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
    request: FrameProcessRequest,
    db: Session = Depends(get_db)
):
    """Process video frame for cheating detection"""
    try:
        result = ai_monitor.process_frame(request.frame, submission_id)
        _persist_violations(submission_id, result.get("violations", []), db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/{submission_id}")
async def process_audio(
    submission_id: str,
    request: AudioProcessRequest,
    db: Session = Depends(get_db)
):
    """Process audio for voice detection"""
    try:
        result = ai_monitor.process_audio(request.audio, submission_id)
        _persist_violations(submission_id, result.get("violations", []), db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tab-switch/{submission_id}")
async def check_tab_switch(
    submission_id: str,
    request: TabSwitchRequest,
    db: Session = Depends(get_db)
):
    """Check for tab switching"""
    try:
        # tab_switch is always a violation when this endpoint is called
        tab_violation = [{"type": "tab_switch", "confidence": 1.0}]
        _persist_violations(submission_id, tab_violation, db)
        return {
            "status": "recorded",
            "violations": tab_violation,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class LogEventRequest(BaseModel):
    event_type: str          # e.g. "face_not_visible", "looking_away", "phone_detected"
    reason: str              # human-readable string from addWarning()
    confidence: float = 1.0
    timestamp: str


@router.post("/log-event/{submission_id}")
async def log_event(
    submission_id: str,
    request: LogEventRequest,
    db: Session = Depends(get_db)
):
    """
    Persist a single malpractice event detected client-side (exam.js).
    Called from addWarning() so every warning the student sees is recorded.
    """
    try:
        violation = [{
            "type": request.event_type,
            "confidence": request.confidence,
        }]
        _persist_violations(submission_id, violation, db)
        return {"status": "recorded", "event_type": request.event_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/auto-submit/{submission_id}")
async def log_auto_submit(
    submission_id: str,
    request: AutoSubmitRequest,
    db: Session = Depends(get_db)
):
    """Log auto-submission due to violations"""
    try:
        print(f"🚨 Auto-submit: {submission_id} - {request.reason}")
        print(f"   Violations: {len(request.violations)}")

        # Persist any remaining violations from the client-side list
        _persist_violations(submission_id, request.violations, db)

        # Mark submission as auto-submitted
        try:
            sub_id = int(submission_id)
            submission = db.query(Submission).filter(Submission.id == sub_id).first()
            if submission:
                submission.auto_submitted = True
                submission.auto_submit_reason = request.reason
                submission.status = "completed"
                submission.submitted_at = datetime.utcnow()
                db.commit()
        except (ValueError, TypeError):
            pass

        return {
            "status": "success",
            "message": "Auto-submission recorded",
            "timestamp": datetime.utcnow().isoformat()
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