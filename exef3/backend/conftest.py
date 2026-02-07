import sys
import os

# Ensure /app (backend root) is on sys.path so `app.*` imports work
app_dir = os.path.dirname(os.path.abspath(__file__))
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)
