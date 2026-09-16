#!/usr/bin/env python3
"""
Create demo data for the Exam System
"""
from database.database import SessionLocal, engine, Base
from database.models import User
from datetime import datetime
import os

def create_demo_users():
    """Create demo users for testing - FIXED VERSION"""
    db = SessionLocal()
    
    try:
        # Check if users already exist
        existing_users = db.query(User).count()
        if existing_users > 0:
            print(f"✓ Database already has {existing_users} user(s)")
            print("\nExisting demo credentials still work:")
            print_credentials()
            return
        
        # Use simple passwords for demo (bypass bcrypt for now)
        demo_users = [
            {
                "email": "admin@exam.com",
                "name": "Admin User",
                "password": "admin123",  # Simple password
                "role": "admin",
                "status": "active"
            },
            {
                "email": "teacher@exam.com",
                "name": "John Teacher",
                "password": "teacher123",
                "role": "teacher",
                "status": "active"
            },
            {
                "email": "student@exam.com",
                "name": "Alice Student",
                "password": "student123",
                "role": "student",
                "status": "active"
            }
        ]
        
        print("Creating demo users...")
        
        # Import hash function
        from services.auth_service import get_password_hash
        
        for user_data in demo_users:
            # Use simple hashing for demo
            try:
                hashed_password = get_password_hash(user_data["password"])
            except:
                # Fallback if bcrypt fails
                import hashlib
                hashed_password = hashlib.sha256(user_data["password"].encode()).hexdigest()
            
            user = User(
                email=user_data["email"],
                name=user_data["name"],
                hashed_password=hashed_password,
                role=user_data["role"],
                status=user_data["status"],
                created_at=datetime.utcnow()
            )
            
            db.add(user)
            print(f"  ✓ Created {user_data['role']}: {user_data['email']}")
        
        db.commit()
        print(f"\n✓ Successfully created {len(demo_users)} demo users!")
        print_credentials()
        
    except Exception as e:
        print(f"✗ Error creating demo users: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

def print_credentials():
    print("\n" + "="*60)
    print("DEMO CREDENTIALS")
    print("="*60)
    print("\nADMIN:")
    print("  Email: admin@exam.com")
    print("  Password: admin123")
    print("\nTEACHER:")
    print("  Email: teacher@exam.com")
    print("  Password: teacher123")
    print("\nSTUDENT:")
    print("  Email: student@exam.com")
    print("  Password: student123")
    print("\n" + "="*60)

def initialize_database():
    """Initialize database tables"""
    print("Initializing database...")
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created!")

if __name__ == "__main__":
    print("="*60)
    print("EXAM SYSTEM - DEMO DATA SETUP")
    print("="*60)
    print()
    
    initialize_database()
    create_demo_users()
    
    print("\n✓ Setup complete! Start the backend server:")
    print("  python main.py")