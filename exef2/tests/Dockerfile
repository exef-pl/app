FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy
WORKDIR /tests
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
COPY test_e2e.py .
COPY test_all_views_gui.py .
COPY simple_gui_test.py .
COPY pytest.ini .
CMD ["python", "simple_gui_test.py"]
