from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import random
import string

from database.database import get_db
from database.models import User, Exam, Submission
from services.auth_service import get_current_user
from api.routes.auth import oauth2_scheme

router = APIRouter()

# ================= PYDANTIC MODELS =================
class ExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration: int
    questions: List[Dict[str, Any]]
    access_type: str = "link"
    allowed_students: Optional[List[int]] = None

class ExamResponse(BaseModel):
    id: int
    exam_code: str
    title: str
    description: Optional[str]
    duration: int
    teacher_id: int
    teacher_name: str
    is_active: bool
    access_type: str
    created_at: datetime
    questions: List[Dict[str, Any]]

class StartExamResponse(BaseModel):
    exam: ExamResponse
    submission_id: int
    started_at: datetime
    time_remaining: int

class SubmitExamRequest(BaseModel):
    answers: List[Dict[str, Any]]

class SubmitExamResponse(BaseModel):
    message: str
    score: float
    total_marks: float
    percentage: float
    cheating_warnings: int = 0

# ================= UTILITY FUNCTIONS =================
def generate_exam_code():
    """Generate unique 8-character exam code"""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choices(characters, k=8))

def validate_questions(questions: List[Dict[str, Any]]):
    """Validate exam questions structure"""
    for i, q in enumerate(questions):
        if "question_text" not in q:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {i+1} missing 'question_text'"
            )
        
        if "type" not in q:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {i+1} missing 'type'"
            )
        
        if q["type"] == "mcq":
            if "options" not in q or not isinstance(q["options"], list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Question {i+1} (MCQ) missing 'options' array"
                )
            
            if "correct_answer" not in q:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Question {i+1} (MCQ) missing 'correct_answer'"
                )
            
            if not isinstance(q["correct_answer"], int) or q["correct_answer"] < 0 or q["correct_answer"] >= len(q["options"]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Question {i+1} has invalid 'correct_answer'"
                )
        
        if "marks" not in q:
            questions[i]["marks"] = 1

# ================= API ROUTES =================
@router.post("/create", response_model=ExamResponse)
async def create_exam(
    exam_data: ExamCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Create a new exam"""
    user = get_current_user(token, db)
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers and admins can create exams"
        )
    
    # Validate questions
    validate_questions(exam_data.questions)
    
    # Generate unique exam code
    exam_code = generate_exam_code()
    
    # Create exam
    exam = Exam(
        exam_code=exam_code,
        title=exam_data.title,
        description=exam_data.description,
        duration=exam_data.duration,
        questions=exam_data.questions,
        teacher_id=user.id,
        access_type=exam_data.access_type,
        allowed_students=exam_data.allowed_students or []
    )
    
    db.add(exam)
    db.commit()
    db.refresh(exam)
    
    # Get teacher info
    teacher = db.query(User).filter(User.id == user.id).first()
    
    return {
        "id": exam.id,
        "exam_code": exam.exam_code,
        "title": exam.title,
        "description": exam.description,
        "duration": exam.duration,
        "teacher_id": exam.teacher_id,
        "teacher_name": teacher.name,
        "is_active": exam.is_active,
        "access_type": exam.access_type,
        "created_at": exam.created_at,
        "questions": exam.questions
    }

@router.get("/my-exams", response_model=List[ExamResponse])
async def get_my_exams(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get exams created by current teacher"""
    user = get_current_user(token, db)
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers and admins can view their exams"
        )
    
    exams = db.query(Exam).filter(Exam.teacher_id == user.id).all()
    
    teacher = db.query(User).filter(User.id == user.id).first()
    
    return [
        {
            "id": exam.id,
            "exam_code": exam.exam_code,
            "title": exam.title,
            "description": exam.description,
            "duration": exam.duration,
            "teacher_id": exam.teacher_id,
            "teacher_name": teacher.name,
            "is_active": exam.is_active,
            "access_type": exam.access_type,
            "created_at": exam.created_at,
            "questions": exam.questions,
            "submissions_count": len(exam.submissions)
        }
        for exam in exams
    ]


@router.post("/{exam_code}/start", response_model=StartExamResponse)
async def start_exam(
    exam_code: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Start an exam (creates a submission)"""
    user = get_current_user(token, db)
    
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can start exams"
        )
    
    # Get exam
    exam = db.query(Exam).filter(Exam.exam_code == exam_code).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found"
        )
    
    if not exam.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam is not active"
        )
    
    # Check access
    if exam.access_type == "specific" and user.id not in exam.allowed_students:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to take this exam"
        )
    
    # Check for existing active submission
    existing_submission = db.query(Submission).filter(
        Submission.exam_id == exam.id,
        Submission.student_id == user.id,
        Submission.status == "in_progress"
    ).first()
    
    if existing_submission:
        # Calculate time remaining
        time_elapsed = (datetime.utcnow() - existing_submission.started_at).total_seconds()
        time_remaining = max(0, exam.duration * 60 - int(time_elapsed))
        
        teacher = db.query(User).filter(User.id == exam.teacher_id).first()
        
        return {
            "exam": {
                "id": exam.id,
                "exam_code": exam.exam_code,
                "title": exam.title,
                "description": exam.description,
                "duration": exam.duration,
                "teacher_id": exam.teacher_id,
                "teacher_name": teacher.name if teacher else "Unknown",
                "is_active": exam.is_active,
                "access_type": exam.access_type,
                "created_at": exam.created_at,
                "questions": exam.questions
            },
            "submission_id": existing_submission.id,
            "started_at": existing_submission.started_at,
            "time_remaining": time_remaining
        }
    
    # Create new submission
    submission = Submission(
        exam_id=exam.id,
        student_id=user.id,
        answers=[],
        started_at=datetime.utcnow(),
        status="in_progress"
    )
    
    db.add(submission)
    db.commit()
    db.refresh(submission)
    
    teacher = db.query(User).filter(User.id == exam.teacher_id).first()
    
    return {
        "exam": {
            "id": exam.id,
            "exam_code": exam.exam_code,
            "title": exam.title,
            "description": exam.description,
            "duration": exam.duration,
            "teacher_id": exam.teacher_id,
            "teacher_name": teacher.name if teacher else "Unknown",
            "is_active": exam.is_active,
            "access_type": exam.access_type,
            "created_at": exam.created_at,
            "questions": exam.questions
        },
        "submission_id": submission.id,
        "started_at": submission.started_at,
        "time_remaining": exam.duration * 60
    }

@router.post("/submit/{submission_id}", response_model=SubmitExamResponse)
async def submit_exam(
    submission_id: int,
    submit_data: SubmitExamRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Submit exam answers"""
    user = get_current_user(token, db)
    
    # Get submission
    submission = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.student_id == user.id
    ).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    if submission.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )
    
    # Get exam for questions
    exam = db.query(Exam).filter(Exam.id == submission.exam_id).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found"
        )
    
    # Calculate score
    score = calculate_score(exam.questions, submit_data.answers)
    total_marks = sum(q.get("marks", 1) for q in exam.questions)
    percentage = (score / total_marks) * 100 if total_marks > 0 else 0
    
    # Update submission
    submission.answers = submit_data.answers
    submission.score = score
    submission.total_marks = total_marks
    submission.percentage = round(percentage, 2)
    submission.status = "completed"
    submission.submitted_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "message": "Exam submitted successfully",
        "score": score,
        "total_marks": total_marks,
        "percentage": round(percentage, 2),
        "cheating_warnings": submission.cheating_count or 0
    }

def calculate_score(questions: List[Dict], answers: List[Dict]) -> float:
    """Calculate exam score based on correct answers"""
    score = 0.0
    
    for answer_data in answers:
        question_index = answer_data.get("question_index", -1)
        user_answer = answer_data.get("answer")
        
        if question_index < 0 or question_index >= len(questions):
            continue
        
        question = questions[question_index]
        
        if question["type"] == "mcq":
            # MCQ scoring
            correct_answer = question.get("correct_answer")
            
            if correct_answer is not None and user_answer == correct_answer:
                score += question.get("marks", 1)
        
        elif question["type"] == "short":
            # Short answer scoring (simple keyword matching)
            expected_answer = question.get("expected_answer", "").lower()
            user_answer_str = str(user_answer).lower() if user_answer else ""
            
            if expected_answer and expected_answer in user_answer_str:
                score += question.get("marks", 1) * 0.5  # 50% for keyword match
    
    return round(score, 2)

# ================= ADDITIONAL ROUTES =================
@router.get("/student/active")
async def get_student_active_exams(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get active exams for student"""
    user = get_current_user(token, db)
    
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view active exams"
        )
    
    # Get all active exams accessible to student
    exams = db.query(Exam).filter(Exam.is_active == True).all()
    
    accessible_exams = []
    for exam in exams:
        if exam.access_type == "link":
            accessible_exams.append(exam)
        elif exam.access_type == "specific" and user.id in exam.allowed_students:
            accessible_exams.append(exam)
    
    teacher_cache = {}
    
    return [
        {
            "id": exam.id,
            "exam_code": exam.exam_code,
            "title": exam.title,
            "description": exam.description,
            "duration": exam.duration,
            "teacher_id": exam.teacher_id,
            "teacher_name": teacher_cache.get(exam.teacher_id) or 
                           db.query(User).filter(User.id == exam.teacher_id).first().name,
            "is_active": exam.is_active,
            "access_type": exam.access_type,
            "created_at": exam.created_at,
            "questions": exam.questions
        }
        for exam in accessible_exams
    ]

@router.get("/student/submissions")
async def get_student_submissions(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get all submissions for current student"""
    user = get_current_user(token, db)
    
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view submissions"
        )
    
    submissions = db.query(Submission).filter(
        Submission.student_id == user.id,
        Submission.status == "completed"
    ).all()
    
    result = []
    for sub in submissions:
        exam = db.query(Exam).filter(Exam.id == sub.exam_id).first()
        if exam:
            result.append({
                "exam_id": exam.id,
                "exam_title": exam.title,
                "exam_code": exam.exam_code,
                "submitted_at": sub.submitted_at,
                "score": sub.score,
                "total_marks": sub.total_marks,
                "percentage": sub.percentage,
                "cheating_warnings": sub.cheating_count or 0
            })
    
    return result

@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Delete an exam"""
    user = get_current_user(token, db)
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers and admins can delete exams"
        )
    
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found"
        )
    
    # Check ownership (unless admin)
    if user.role != "admin" and exam.teacher_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own exams"
        )
    
    # Delete associated submissions first
    db.query(Submission).filter(Submission.exam_id == exam_id).delete()
    
    # Delete exam
    db.delete(exam)
    db.commit()
    
    return {"message": "Exam deleted successfully"}
@router.get("/{exam_code}")
async def get_exam_by_code(
    exam_code: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get exam details by code"""
    user = get_current_user(token, db)
    
    exam = db.query(Exam).filter(Exam.exam_code == exam_code).first()
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found"
        )
    
    # Check access
    if exam.access_type == "specific" and user.id not in exam.allowed_students:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this exam"
        )
    
    if not exam.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This exam is no longer active"
        )
    
    # Get teacher info
    teacher = db.query(User).filter(User.id == exam.teacher_id).first()
    
    return {
        "id": exam.id,
        "exam_code": exam.exam_code,
        "title": exam.title,
        "description": exam.description,
        "duration": exam.duration,
        "teacher_id": exam.teacher_id,
        "teacher_name": teacher.name if teacher else "Unknown",
        "is_active": exam.is_active,
        "access_type": exam.access_type,
        "created_at": exam.created_at,
        "questions": exam.questions
    }