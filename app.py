"""
EdgeSense - DC Motor Health Backend Application
Root entrypoint for Render and Uvicorn deployment.
Proxies to motor_health_system/app.py while ensuring internal module paths resolve cleanly.
"""
import os
import sys
from pathlib import Path

# Add motor_health_system directory to sys.path so health_engine imports resolve seamlessly
CURRENT_DIR = Path(__file__).resolve().parent
MOTOR_SYSTEM_DIR = CURRENT_DIR / "motor_health_system"

if str(MOTOR_SYSTEM_DIR) not in sys.path:
    sys.path.insert(0, str(MOTOR_SYSTEM_DIR))

# Import the FastAPI application instance from motor_health_system
from motor_health_system.app import app

__all__ = ["app"]

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
