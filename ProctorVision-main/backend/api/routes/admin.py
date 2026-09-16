from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import datetime, timedelta

from database.database import get_db
from database.models import User, Exam, Submission, CheatingEvent, SystemLog
from services.auth_service import get_current_user
from api.routes.auth import oauth2_scheme

router = APIRouter()

@router.get("/dashboard-stats")
async def get_dashboard_stats(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get admin dashboard statistics
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Calculate statistics
    total_users = db.query(User).count()
    total_students = db.query(User).filter(User.role == "student").count()
    total_teachers = db.query(User).filter(User.role == "teacher").count()
    total_admins = db.query(User).filter(User.role == "admin").count()
    
    total_exams = db.query(Exam).count()
    active_exams = db.query(Exam).filter(Exam.is_active == True).count()
    
    total_submissions = db.query(Submission).count()
    completed_submissions = db.query(Submission).filter(Submission.status == "completed").count()
    
    cheating_cases = db.query(Submission).filter(Submission.cheating_count > 0).count()
    today = datetime.utcnow().date()
    today_submissions = db.query(Submission).filter(
        func.date(Submission.started_at) == today
    ).count()
    
    # Get recent activities
    recent_logs = db.query(SystemLog).order_by(SystemLog.timestamp.desc()).limit(10).all()
    
    return {
        "users": {
            "total": total_users,
            "students": total_students,
            "teachers": total_teachers,
            "admins": total_admins
        },
        "exams": {
            "total": total_exams,
            "active": active_exams,
            "inactive": total_exams - active_exams
        },
        "submissions": {
            "total": total_submissions,
            "completed": completed_submissions,
            "in_progress": total_submissions - completed_submissions,
            "today": today_submissions
        },
        "cheating": {
            "total_cases": cheating_cases,
            "percentage": (cheating_cases / total_submissions * 100) if total_submissions > 0 else 0
        },
        "recent_activities": [
            {
                "id": log.id,
                "user": log.user.name if log.user else "System",
                "action": log.action,
                "details": log.details,
                "timestamp": log.timestamp.isoformat()
            }
            for log in recent_logs
        ]
    }

@router.get("/users")
async def get_all_users(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get all users with detailed information
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = db.query(User).all()
    
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at.isoformat(),
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "exam_count": db.query(Exam).filter(Exam.teacher_id == u.id).count() if u.role == "teacher" else 0,
            "submission_count": db.query(Submission).filter(Submission.student_id == u.id).count() if u.role == "student" else 0
        }
        for u in users
    ]

@router.get("/exams")
async def get_all_exams(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get all exams with detailed statistics
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    exams = db.query(Exam).all()
    result = []
    
    for exam in exams:
        teacher = db.query(User).filter(User.id == exam.teacher_id).first()
        submissions = db.query(Submission).filter(Submission.exam_id == exam.id).all()
        cheating_cases = [s for s in submissions if s.cheating_count > 0]
        
        result.append({
            "id": exam.id,
            "exam_code": exam.exam_code,
            "title": exam.title,
            "teacher": teacher.name if teacher else "Unknown",
            "teacher_email": teacher.email if teacher else None,
            "is_active": exam.is_active,
            "access_type": exam.access_type,
            "duration": exam.duration,
            "questions_count": len(exam.questions) if exam.questions else 0,
            "created_at": exam.created_at.isoformat(),
            "submissions": {
                "total": len(submissions),
                "completed": len([s for s in submissions if s.status == "completed"]),
                "in_progress": len([s for s in submissions if s.status == "in_progress"])
            },
            "cheating": {
                "cases": len(cheating_cases),
                "percentage": (len(cheating_cases) / len(submissions) * 100) if submissions else 0
            },
            "average_score": sum(s.percentage or 0 for s in submissions if s.percentage) / len(submissions) if submissions else 0
        })
    
    return result

@router.get("/cheating-cases")
async def get_cheating_cases(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get all cheating cases with details
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    cheating_submissions = db.query(Submission).filter(
        Submission.cheating_count > 0
    ).order_by(Submission.submitted_at.desc()).all()
    
    result = []
    
    for submission in cheating_submissions:
        exam = db.query(Exam).filter(Exam.id == submission.exam_id).first()
        student = db.query(User).filter(User.id == submission.student_id).first()
        teacher = db.query(User).filter(User.id == exam.teacher_id).first() if exam else None
        
        cheating_events = db.query(CheatingEvent).filter(
            CheatingEvent.submission_id == submission.id
        ).all()
        
        result.append({
            "submission_id": submission.id,
            "exam": {
                "id": exam.id if exam else None,
                "title": exam.title if exam else "Unknown",
                "code": exam.exam_code if exam else None
            },
            "student": {
                "id": student.id if student else None,
                "name": student.name if student else "Unknown",
                "email": student.email if student else None
            },
            "teacher": {
                "name": teacher.name if teacher else "Unknown",
                "email": teacher.email if teacher else None
            },
            "submission": {
                "started_at": submission.started_at.isoformat(),
                "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
                "score": submission.score,
                "percentage": submission.percentage,
                "cheating_count": submission.cheating_count,
                "auto_submitted": submission.auto_submitted,
                "auto_submit_reason": submission.auto_submit_reason
            },
            "cheating_events": [
                {
                    "type": event.event_type,
                    "severity": event.severity,
                    "confidence": event.confidence,
                    "timestamp": event.timestamp.isoformat()
                }
                for event in cheating_events
            ],
            "warnings": submission.warnings or []
        })
    
    return result

@router.delete("/user/{user_id}")
async def delete_user(
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Delete a user (admin only)
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete related data
    if user_to_delete.role == "teacher":
        # Delete teacher's exams
        exams = db.query(Exam).filter(Exam.teacher_id == user_id).all()
        for exam in exams:
            db.query(Submission).filter(Submission.exam_id == exam.id).delete()
        db.query(Exam).filter(Exam.teacher_id == user_id).delete()
    
    elif user_to_delete.role == "student":
        # Delete student's submissions
        db.query(Submission).filter(Submission.student_id == user_id).delete()
    
    # Delete user
    db.delete(user_to_delete)
    db.commit()
    
    # Log the action
    log = SystemLog(
        user_id=user.id,
        action="DELETE_USER",
        details={"deleted_user_id": user_id, "deleted_user_email": user_to_delete.email}
    )
    db.add(log)
    db.commit()
    
    return {"message": "User deleted successfully"}

@router.delete("/exam/{exam_id}")
async def delete_exam(
    exam_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Delete an exam and all related data
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # Delete related submissions and cheating events
    submissions = db.query(Submission).filter(Submission.exam_id == exam_id).all()
    for submission in submissions:
        db.query(CheatingEvent).filter(CheatingEvent.submission_id == submission.id).delete()
    
    db.query(Submission).filter(Submission.exam_id == exam_id).delete()
    
    # Delete exam
    db.delete(exam)
    db.commit()
    
    # Log the action
    log = SystemLog(
        user_id=user.id,
        action="DELETE_EXAM",
        details={"exam_id": exam_id, "exam_title": exam.title}
    )
    db.add(log)
    db.commit()
    
    return {"message": "Exam deleted successfully"}

@router.get("/reports/system-usage")
async def get_system_usage_report(
    days: int = 7,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get system usage report for specified days
    """
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # User registrations
    new_users = db.query(User).filter(
        User.created_at.between(start_date, end_date)
    ).all()
    
    # Exam creations
    new_exams = db.query(Exam).filter(
        Exam.created_at.between(start_date, end_date)
    ).all()
    
    # Submissions
    submissions = db.query(Submission).filter(
        Submission.started_at.between(start_date, end_date)
    ).all()
    
    # Cheating cases
    cheating_cases = [s for s in submissions if s.cheating_count > 0]
    
    return {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": days
        },
        "new_users": {
            "total": len(new_users),
            "by_role": {
                "students": len([u for u in new_users if u.role == "student"]),
                "teachers": len([u for u in new_users if u.role == "teacher"]),
                "admins": len([u for u in new_users if u.role == "admin"])
            }
        },
        "new_exams": {
            "total": len(new_exams),
            "by_teacher": [
                {
                    "teacher": db.query(User).filter(User.id == exam.teacher_id).first().name,
                    "count": 1
                }
                for exam in new_exams
            ]
        },
        "submissions": {
            "total": len(submissions),
            "completed": len([s for s in submissions if s.status == "completed"]),
            "average_score": sum(s.percentage or 0 for s in submissions if s.percentage) / len(submissions) if submissions else 0
        },
        "cheating": {
            "cases": len(cheating_cases),
            "percentage": (len(cheating_cases) / len(submissions) * 100) if submissions else 0,
            "by_type": {}  # Would analyze cheating event types
        }
    }