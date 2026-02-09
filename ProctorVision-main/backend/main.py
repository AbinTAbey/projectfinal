
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.staticfiles import StaticFiles

from database.database import engine, Base
from api.routes.auth import router as auth_router
from api.routes.exams import router as exams_router
from api.routes.monitoring import router as monitoring_router
from api.routes.admin import router as admin_router
from api.routes.websocket import manager

# Load environment variables
load_dotenv()

# ===================== LIFESPAN =====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Exam System Backend...")
    print("📊 Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully!")

    print("\n" + "=" * 60)
    print("🌐 SERVER IS READY!")
    print("=" * 60)

    yield
    print("\n🛑 Shutting down backend...")

# ===================== APP =====================
app = FastAPI(
    title="Exam System Backend",
    description="AI-powered Online Examination System with Cheating Detection",
    version="1.0.0",
    lifespan=lifespan
)

# ===================== CORS =====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # DEV only
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== GLOBAL ERROR HANDLER =====================
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# ===================== CSP (CODESPACES SAFE) =====================
class CSPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' https: data: blob:; "
            "img-src 'self' https: data: blob:; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; "
            "style-src 'self' 'unsafe-inline' https:; "
            "connect-src 'self' https: ws: wss:; "
            "media-src 'self' https: blob:;"
        )
        return response

app.add_middleware(CSPMiddleware)

# ===================== API ROUTERS (FIRST!) =====================
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(exams_router, prefix="/api/exams", tags=["Exams"])
app.include_router(monitoring_router, prefix="/api/monitoring", tags=["Monitoring"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])

# ===================== WEBSOCKET =====================
@app.websocket("/ws/monitoring/{student_id}/{exam_id}")
async def websocket_endpoint(websocket: WebSocket, student_id: str, exam_id: str):
    await manager.connect(websocket, student_id, exam_id)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.process_data(student_id, exam_id, data)
    except WebSocketDisconnect:
        manager.disconnect(student_id, exam_id)
    except Exception:
        manager.disconnect(student_id, exam_id)

# ===================== HEALTH =====================
@app.get("/health")
async def health():
    return {"status": "healthy", "database": "connected"}

# ===================== FRONTEND (LAST!) =====================
app.mount(
    "/",
    StaticFiles(directory="frontend", html=True),
    name="frontend"
)
