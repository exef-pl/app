# EXEF Testing Documentation

## Overview

EXEF uses a comprehensive testing strategy with mock services for E2E testing, ensuring all functionality works correctly without external dependencies.

## Test Types

### 1. Unit Tests
- Individual component testing
- Located in `tests/` directory
- Run with: `make test-api`

### 2. Integration Tests
- API endpoint testing
- Database operations
- External service integration
- Run with: `make test`

### 3. E2E Tests with Mock Services
- Full user workflows
- UI interaction testing
- Mock external APIs
- Run with: `make test-e2e`

## Mock Services

The mock server (`tests/mock_services.py`) provides mock implementations for:

### KSeF API
- OAuth token endpoint
- Invoice upload and retrieval
- Invoice querying
- URL: `/api/v1/*`

### Email/IMAP Service
- Folder listing
- Message retrieval
- Attachment downloads
- URL: `/imap/*`

### OCR Service
- Text extraction from documents
- Support for invoices and other document types
- URL: `/ocr/extract`

### Signature Providers
- Certificate management
- Document signing simulation
- Signature verification
- URL: `/signature/*`

## Running Tests

### Quick Start
```bash
# Run all E2E tests with mock services
make test-e2e

# Run specific test suites
make test-signature
make test-api
```

### Manual Test Execution
```bash
# Start mock services
docker-compose --profile test up -d mock-services

# Run tests
cd tests
python -m pytest test_complete_e2e.py -v

# Cleanup
docker-compose --profile test down -v
```

## Test Configuration

### Environment Variables
- `EXEF_TEST_MOCK_SERVICES=true` - Enable mock services
- `MOCK_SERVICES_URL=http://mock-services:8888` - Mock server URL
- See `.env.test` for complete configuration

### Test Data
- Automatic test data creation
- Isolated test environments
- Automatic cleanup after tests

## Test Coverage

### Features Tested
- ✅ Profile management
- ✅ Document workflow (create → describe → sign → export)
- ✅ Delegation system
- ✅ Electronic signature (QES, QSEAL)
- ✅ Import/Export endpoints
- ✅ Bulk operations
- ✅ Filtering and search
- ✅ Error handling
- ✅ Performance under load

### UI Components Tested
- ✅ Navigation between views
- ✅ Profile switching
- ✅ Document selection and bulk actions
- ✅ Inline editing
- ✅ Modal dialogs (legacy)
- ✅ Toast notifications
- ✅ Form validation

### API Endpoints Tested
- ✅ `/api/profiles/*`
- ✅ `/api/profiles/{id}/documents/*`
- ✅ `/api/profiles/{id}/delegates/*`
- ✅ `/api/profiles/{id}/endpoints/*`
- ✅ `/api/profiles/{id}/signature/*`

## Writing New Tests

### Test Structure
```python
class TestNewFeature:
    @pytest.fixture(autouse=True)
    async def setup(self):
        # Setup test data
        yield
        # Cleanup
    
    async def test_specific_functionality(self, page: Page):
        # Test implementation
        pass
```

### Best Practices
1. Use fixtures for setup/teardown
2. Test both happy path and error cases
3. Use descriptive test names
4. Assert specific outcomes
5. Clean up test data

### Mock Service Extensions
To add new mock endpoints:
1. Update `mock_services.py`
2. Add corresponding tests
3. Update documentation

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run E2E Tests
  run: |
    docker-compose --profile test up -d --build
    make test-e2e
    docker-compose --profile test down -v
```

### Test Reports
- JUnit XML output
- Screenshot capture on failure
- Detailed error logs
- Performance metrics

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports 8002, 8000, 8888 are free
2. **Docker not running**: Start Docker daemon
3. **Test timeouts**: Increase timeout in test configuration
4. **Mock service failures**: Check mock service logs

### Debug Mode
```bash
# Run with debug logs
EXEF_DEBUG=true make test-e2e

# View specific service logs
docker-compose --profile test logs mock-services
docker-compose --profile test logs backend
```

## Performance Testing

### Load Tests
- Bulk document creation (100+ documents)
- Concurrent signature operations (10+ signatures)
- Profile switching performance
- Memory usage monitoring

### Metrics
- Response times
- Throughput
- Error rates
- Resource utilization

## Security Testing

### Test Scenarios
- Invalid authentication
- SQL injection attempts
- XSS protection
- CSRF token validation
- File upload security

## Future Enhancements

### Planned Features
- Visual regression testing
- Accessibility testing (WCAG)
- Mobile responsiveness tests
- Cross-browser testing
- API contract testing

### Tools to Consider
- Schemathesis for API testing
- Percy for visual testing
- Axe for accessibility
- BrowserStack for cross-browser
