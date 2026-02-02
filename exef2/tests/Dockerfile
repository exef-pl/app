FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy
WORKDIR /tests
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY test_e2e.py .
CMD ["pytest", "test_e2e.py", "-v", "--tb=short"]
