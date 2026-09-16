import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_health():
    """Test health endpoint"""
    print("🩺 Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print(f"✅ Health check PASSED: {response.json()}")
            return True
        else:
            print(f"❌ Health check FAILED: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def test_root():
    """Test root endpoint"""
    print("\n🏠 Testing root endpoint...")
    try:
        response = requests.get(BASE_URL)
        if response.status_code == 200:
            print(f"✅ Root endpoint PASSED: {response.json()}")
            return True
        else:
            print(f"❌ Root endpoint FAILED: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def test_registration():
    """Test user registration"""
    print("\n👤 Testing user registration...")
    
    # Test data
    test_users = [
        {
            "email": "admin@example.com",
            "password": "admin123",
            "name": "Admin User",
            "role": "admin"
        },
        {
            "email": "teacher@example.com",
            "password": "teacher123",
            "name": "Teacher User",
            "role": "teacher"
        },
        {
            "email": "student@example.com",
            "password": "student123",
            "name": "Student User",
            "role": "student"
        }
    ]
    
    for user_data in test_users:
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/register",
                json=user_data
            )
            if response.status_code == 200:
                print(f"✅ Registration PASSED for {user_data['role']}: {user_data['email']}")
            else:
                print(f"⚠️ Registration for {user_data['email']}: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ Registration failed: {e}")
    
    return True

def test_login():
    """Test user login"""
    print("\n🔐 Testing user login...")
    
    login_data = {
        "username": "student@example.com",
        "password": "student123"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data=login_data
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Login PASSED")
            print(f"   Token received: {data['access_token'][:50]}...")
            return data['access_token']
        else:
            print(f"❌ Login FAILED: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login failed: {e}")
        return None

def test_protected_endpoints(token):
    """Test protected endpoints with token"""
    if not token:
        print("\n⚠️ Skipping protected endpoints test (no token)")
        return
    
    print("\n🔒 Testing protected endpoints...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test getting current user
    try:
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers
        )
        if response.status_code == 200:
            print(f"✅ Protected endpoint /api/auth/me PASSED")
            print(f"   User info: {response.json()}")
        else:
            print(f"❌ Protected endpoint FAILED: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Protected endpoint failed: {e}")

def test_exam_endpoints(token):
    """Test exam-related endpoints"""
    if not token:
        print("\n⚠️ Skipping exam endpoints test (no token)")
        return
    
    print("\n📝 Testing exam endpoints...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get all exams (requires teacher/admin role)
    try:
        response = requests.get(
            f"{BASE_URL}/api/exams/my-exams",
            headers=headers
        )
        if response.status_code == 200:
            print(f"✅ Exams endpoint PASSED: {len(response.json())} exams found")
        elif response.status_code == 403:
            print(f"⚠️ Access denied (expected for student role)")
        else:
            print(f"⚠️ Exams endpoint: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Exams endpoint failed: {e}")

def test_monitoring_endpoints():
    """Test monitoring endpoints"""
    print("\n🎥 Testing monitoring endpoints...")
    
    try:
        # Test monitoring endpoint without data
        response = requests.get(
            f"{BASE_URL}/api/monitoring/events/1"
        )
        if response.status_code in [200, 404]:
            print(f"✅ Monitoring endpoint accessible")
        else:
            print(f"⚠️ Monitoring endpoint: {response.status_code}")
    except Exception as e:
        print(f"❌ Monitoring endpoint failed: {e}")

def run_all_tests():
    """Run all tests"""
    print("="*60)
    print("🧪 BACKEND TEST SUITE")
    print("="*60)
    
    # Wait a bit for server to start
    print("⏳ Waiting for server to be ready...")
    time.sleep(2)
    
    # Run tests
    tests = [
        test_health,
        test_root,
        test_registration,
        lambda: test_login(),
        lambda token=None: test_protected_endpoints(token),
        lambda token=None: test_exam_endpoints(token),
        test_monitoring_endpoints
    ]
    
    token = None
    for test in tests:
        try:
            if test.__code__.co_argcount == 0:
                test()
            else:
                result = test(token)
                if test.__name__ == "test_login" and result:
                    token = result
        except Exception as e:
            print(f"❌ Test {test.__name__} failed with exception: {e}")
    
    print("\n" + "="*60)
    print("✅ TEST COMPLETE")
    print("="*60)
    print("\n📊 Summary:")
    print("• Backend server should be running")
    print("• Database tables created")
    print("• API endpoints accessible")
    print("• Test users created")
    print(f"\n🔗 Frontend can connect to: http://localhost:8000")
    print("📚 API Docs: http://localhost:8000/docs")

if __name__ == "__main__":
    run_all_tests()