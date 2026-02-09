from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import asyncio
from datetime import datetime
from services.ai_monitoring import ai_monitor
from database.database import SessionLocal
from database.models import CheatingEvent, Submission

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.student_exams: Dict[str, str] = {}  # student_id -> exam_id
        self.cheating_counts: Dict[str, int] = {}  # student_id -> count
    
    async def connect(self, websocket: WebSocket, student_id: str, exam_id: str):
        await websocket.accept()
        self.active_connections[student_id] = websocket
        self.student_exams[student_id] = exam_id
        self.cheating_counts[student_id] = 0
        
        print(f"Student {student_id} connected for exam {exam_id}")
    
    def disconnect(self, student_id: str):
        if student_id in self.active_connections:
            del self.active_connections[student_id]
        if student_id in self.student_exams:
            del self.student_exams[student_id]
        if student_id in self.cheating_counts:
            del self.cheating_counts[student_id]
        
        print(f"Student {student_id} disconnected")
    
    async def send_personal_message(self, message: str, student_id: str):
        if student_id in self.active_connections:
            await self.active_connections[student_id].send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)
    
    async def process_data(self, student_id: str, exam_id: str, data: dict):
        """
        Process incoming data from student (frames, audio, events)
        """
        try:
            violations = []
            
            # Process frame if present
            if "frame" in data:
                frame_result = ai_monitor.process_frame(data["frame"], student_id)
                if "violations" in frame_result:
                    violations.extend(frame_result["violations"])
            
            # Process audio if present
            if "audio" in data:
                audio_result = ai_monitor.process_audio(data["audio"], student_id)
                if "violations" in audio_result:
                    violations.extend(audio_result["violations"])
            
            # Check tab switching
            if "is_focused" in data:
                focus_result = ai_monitor.check_tab_switch(student_id, data["is_focused"])
                violations.extend(focus_result.get("violations", []))
            
            # Save cheating events to database
            db = SessionLocal()
            try:
                # Get submission for this student and exam
                submission = db.query(Submission).filter(
                    Submission.student_id == int(student_id),
                    Submission.exam_id == int(exam_id),
                    Submission.status == "in_progress"
                ).first()
                
                if submission and violations:
                    # Update cheating count
                    self.cheating_counts[student_id] = self.cheating_counts.get(student_id, 0) + len(violations)
                    
                    # Save each violation as cheating event
                    for violation in violations:
                        cheating_event = CheatingEvent(
                            submission_id=submission.id,
                            event_type=violation["type"],
                            severity=violation["severity"],
                            confidence=violation["confidence"],
                            timestamp=datetime.fromisoformat(violation["timestamp"])
                        )
                        db.add(cheating_event)
                    
                    # Update submission cheating count
                    submission.cheating_count = self.cheating_counts[student_id]
                    submission.warnings = submission.warnings or []
                    submission.warnings.extend(violations)
                    
                    db.commit()
                    
                    # Send warning to student if cheating detected
                    if violations:
                        warning_message = {
                            "type": "cheating_warning",
                            "violations": violations,
                            "total_warnings": self.cheating_counts[student_id],
                            "timestamp": datetime.now().isoformat()
                        }
                        await self.send_personal_message(
                            json.dumps(warning_message), 
                            student_id
                        )
                        
                        # Auto-submit on 3rd warning
                        if self.cheating_counts[student_id] >= 3:
                            auto_submit_message = {
                                "type": "auto_submit",
                                "reason": "Multiple cheating violations detected",
                                "violation_count": self.cheating_counts[student_id],
                                "timestamp": datetime.now().isoformat()
                            }
                            await self.send_personal_message(
                                json.dumps(auto_submit_message),
                                student_id
                            )
                            
                            # Update submission status
                            submission.status = "completed"
                            submission.auto_submitted = True
                            submission.auto_submit_reason = "Multiple cheating violations"
                            submission.submitted_at = datetime.now()
                            db.commit()
                            
                            # Disconnect student
                            self.disconnect(student_id)
            finally:
                db.close()
            
            # Send monitoring feedback
            feedback = {
                "type": "monitoring_feedback",
                "timestamp": datetime.now().isoformat(),
                "violations_detected": len(violations),
                "total_warnings": self.cheating_counts.get(student_id, 0)
            }
            
            await self.send_personal_message(json.dumps(feedback), student_id)
            
        except Exception as e:
            print(f"Error processing data: {e}")

# Global WebSocket manager
manager = ConnectionManager()