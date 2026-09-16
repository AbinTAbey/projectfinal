import random
import string
from datetime import datetime
import base64
import json

def generate_exam_code(length=8):
    """Generate unique exam code"""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

def format_timestamp(timestamp: datetime = None):
    """Format timestamp for display"""
    if timestamp is None:
        timestamp = datetime.now()
    return timestamp.strftime("%Y-%m-%d %H:%M:%S")

def calculate_score(questions: list, answers: list) -> float:
    """Calculate exam score"""
    score = 0.0
    
    for i, question in enumerate(questions):
        if i < len(answers):
            user_answer = answers[i].get("answer", "")
            
            if question["type"] == "mcq":
                correct_options = [opt["id"] for opt in question["options"] if opt.get("isCorrect", False)]
                
                if isinstance(user_answer, list):
                    # Multiple correct answers
                    if set(user_answer) == set(correct_options):
                        score += question.get("marks", 1)
                else:
                    # Single correct answer
                    if str(user_answer) in [str(opt) for opt in correct_options]:
                        score += question.get("marks", 1)
            
            elif question["type"] == "short":
                # For short answers, give partial credit
                expected = question.get("expectedAnswer", "").lower()
                if expected and expected in user_answer.lower():
                    score += question.get("marks", 1) * 0.5  # 50% for keyword match
    
    return score

def validate_email(email: str) -> bool:
    """Simple email validation"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def base64_to_image(base64_string):
    """Convert base64 string to image bytes"""
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        return base64.b64decode(base64_string)
    except:
        return None

def image_to_base64(image_bytes):
    """Convert image bytes to base64 string"""
    try:
        return base64.b64encode(image_bytes).decode('utf-8')
    except:
        return None