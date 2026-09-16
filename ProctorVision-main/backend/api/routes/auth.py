from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from pydantic import BaseModel, EmailStr

from database.database import get_db
from database.models import User
from services.auth_service import (
    authenticate_user,
    create_access_token,
    get_current_user,
    create_user as create_user_service,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ===================== SCHEMAS =====================
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# ===================== REGISTER =====================
@router.post("/register", response_model=AuthResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    if user_data.role not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    user = create_user_service(
        db=db,
        email=user_data.email,
        password=user_data.password,
        name=user_data.name,
        role=user_data.role,
    )

    token = create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "role": user.role,
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
    }

# ===================== LOGIN =====================
@router.post("/login", response_model=AuthResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "role": user.role,
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
    }

# ===================== ME =====================
@router.get("/me", response_model=UserResponse)
def me(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    return get_current_user(token, db)
