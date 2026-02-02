# EXEF Deployment Guide

## Environments

| Environment | Purpose | URL | Branch |
|-------------|---------|-----|--------|
| Local | Development | http://localhost:3000 | feature/* |
| Staging | Testing | https://staging.exef.app | develop |
| Production | Live | https://exef.app | main + tags |

---

## Quick Start (Local)

```bash
# Clone
git clone https://github.com/exef-pl/exef.git
cd exef

# Copy config
cp .env.example .env

# Start
make up

# Open http://localhost:3000
```

---

## Deployment Checklist

### Pre-deployment

- [ ] All tests pass (`make test`)
- [ ] CHANGELOG.md updated
- [ ] Version bumped in:
  - [ ] `backend/config.py`
  - [ ] `docker-compose.yml`
  - [ ] `frontend/index.html` (footer)
- [ ] Database migrations reviewed
- [ ] Security scan passed
- [ ] Performance tested

### Deployment Steps

```bash
# 1. Tag release
git tag -a v1.x.x -m "Release v1.x.x"
git push origin v1.x.x

# 2. CI/CD automatically:
#    - Builds Docker images
#    - Runs tests
#    - Pushes to registry
#    - Deploys to staging

# 3. Manual approval for production

# 4. Verify production deployment
curl https://exef.app/health
```

### Post-deployment

- [ ] Health check passed
- [ ] Smoke tests passed
- [ ] Monitoring alerts configured
- [ ] Rollback plan ready

---

## Infrastructure

### Docker Compose (Development/Small)

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    volumes:
      - exef-data:/data
    
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
```

### Kubernetes (Production)

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: exef-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: exef-backend
  template:
    spec:
      containers:
        - name: backend
          image: ghcr.io/softreck/exef-backend:latest
          env:
            - name: EXEF_DB_PATH
              value: /data/exef.db
          volumeMounts:
            - name: data
              mountPath: /data
---
apiVersion: v1
kind: Service
metadata:
  name: exef-backend
spec:
  selector:
    app: exef-backend
  ports:
    - port: 8000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: exef-ingress
spec:
  rules:
    - host: exef.app
      http:
        paths:
          - path: /api
            backend:
              service:
                name: exef-backend
                port:
                  number: 8000
          - path: /
            backend:
              service:
                name: exef-frontend
                port:
                  number: 80
```

---

## Database

### SQLite (Default)

- Single file: `/data/exef.db`
- Backup: `cp /data/exef.db /backup/exef_$(date +%Y%m%d).db`
- Restore: `cp /backup/exef_YYYYMMDD.db /data/exef.db`

### Migrations

```bash
# Check status
python migrations.py status

# Apply pending
python migrations.py upgrade

# Rollback last
python migrations.py downgrade
```

### Backup Strategy

| Type | Frequency | Retention |
|------|-----------|-----------|
| Full | Daily | 30 days |
| Incremental | Hourly | 7 days |
| Before deploy | Each release | 90 days |

---

## Monitoring

### Health Endpoints

```bash
# Basic health
GET /health
# Response: {"status": "ok", "version": "1.1.0", "ts": "..."}

# Detailed stats
GET /api/stats
# Response: {"profiles": 5, "documents": 1234, "endpoints": 12}
```

### Metrics to Monitor

- **Availability**: Uptime percentage
- **Latency**: API response time (p50, p95, p99)
- **Errors**: Error rate by endpoint
- **Business**: Documents processed, sync success rate

### Alerting Rules

| Metric | Warning | Critical |
|--------|---------|----------|
| Uptime | < 99.9% | < 99% |
| Latency p95 | > 500ms | > 2s |
| Error rate | > 1% | > 5% |
| Disk usage | > 80% | > 95% |

---

## Rollback

### Quick Rollback

```bash
# 1. Identify last working version
docker images | grep exef

# 2. Deploy previous version
docker-compose down
docker-compose up -d --pull never exef-backend:v1.0.0

# Or with Kubernetes
kubectl rollout undo deployment/exef-backend
```

### Database Rollback

```bash
# 1. Stop application
docker-compose down

# 2. Restore backup
cp /backup/exef_pre_deploy.db /data/exef.db

# 3. Rollback migrations if needed
python migrations.py downgrade

# 4. Start application
docker-compose up -d
```

---

## Security

### Secrets Management

```bash
# Development: .env file (gitignored)
cp .env.example .env

# Production: Environment variables or secrets manager
export EXEF_JWT_SECRET="$(openssl rand -hex 32)"
export EXEF_KSEF_TOKEN="..."
```

### SSL/TLS

- All traffic HTTPS
- Certificates via Let's Encrypt / cert-manager
- HSTS enabled

### Network Security

- Backend not exposed publicly (only via reverse proxy)
- Rate limiting on API endpoints
- CORS configured for specific origins

---

## Troubleshooting

### Common Issues

**1. Database locked**
```bash
# Check for stale connections
lsof /data/exef.db

# Restart backend
docker-compose restart backend
```

**2. KSeF connection failed**
```bash
# Check certificate
openssl x509 -in cert.pem -text -noout

# Verify KSeF API status
curl https://ksef-test.mf.gov.pl/api/status
```

**3. Email sync not working**
```bash
# Test IMAP connection
openssl s_client -connect imap.gmail.com:993

# Check credentials (Gmail needs App Password)
```

### Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Last 100 lines with timestamps
docker-compose logs -f --tail=100 --timestamps backend
```

---

## Release Schedule

| Version | Target Date | Features |
|---------|-------------|----------|
| v1.0.0 | ✅ Done | MVP - basic flow |
| v1.1.0 | Q1 2026 | Profiles, Auth |
| v1.2.0 | Q1 2026 | Real KSeF/IMAP |
| v1.3.0 | Q2 2026 | OCR |
| v1.4.0 | Q2 2026 | Full KPiR export |
| v1.5.0 | Q3 2026 | Desktop app |
| v2.0.0 | Q4 2026 | Enterprise/SaaS |

---

## Support

- GitHub Issues: https://github.com/softreck/exef/issues
- Documentation: https://docs.exef.app
- Email: support@softreck.dev
