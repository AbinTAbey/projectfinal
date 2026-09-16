from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # student, teacher, admin
    status = Column(String, default="active")  # active, inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    exams_created = relationship("Exam", back_populates="teacher")
    submissions = relationship("Submission", back_populates="student")

class Exam(Base):
    __tablename__ = "exams"
    
    id = Column(Integer, primary_key=True, index=True)
    exam_code = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration = Column(Integer, nullable=False)  # in minutes
    questions = Column(JSON, nullable=False)  # Store questions as JSON
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    access_type = Column(String, default="link")  # link, specific
    allowed_students = Column(JSON, default=[])  # List of student IDs if access_type is specific
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    teacher = relationship("User", back_populates="exams_created")
    submissions = relationship("Submission", back_populates="exam")

class Submission(Base):
    __tablename__ = "submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    answers = Column(JSON, nullable=False)  # Store answers as JSON
    score = Column(Float, nullable=True)
    total_marks = Column(Float, nullable=True)
    percentage = Column(Float, nullable=True)
    cheating_count = Column(Integer, default=0)
    warnings = Column(JSON, default=[])  # Store warnings as JSON
    started_at = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="in_progress")  # in_progress, completed
    auto_submitted = Column(Boolean, default=False)
    auto_submit_reason = Column(String, nullable=True)
    
    # Relationships
    exam = relationship("Exam", back_populates="submissions")
    student = relationship("User", back_populates="submissions")

class CheatingEvent(Base):
    __tablename__ = "cheating_events"
    
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    event_type = Column(String, nullable=False)  # face_not_visible, multiple_faces, etc.
    severity = Column(String, nullable=False)  # low, medium, high
    confidence = Column(Float, nullable=False)
    frame_data = Column(Text, nullable=True)  # Base64 encoded frame
    audio_data = Column(Text, nullable=True)  # Base64 encoded audio snippet
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    submission = relationship("Submission")

class SystemLog(Base):
    __tablename__ = "system_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    details = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    user = relationship("User")