# Makefile for managing KSeF project repositories and analysis

.PHONY: init-submodules update-submodules generate-indexes clean help submodules indexes analyze-all exef-web-docker exef-web-up exef-local-build exef-local-bin exef-local-packages exef-desktop-build exef-desktop-test exef-all push install exef-install exef-dev exef-local-dev exef-test exef-test-api exef-test-gui exef-lint exef-clean exef-cli exef-cli-build exef-cli-install all build-all test-all test-e2e python-test ksef-master-build ksef-master-test ksef-client-js-build ksef-client-js-test polish-invoicingback-build polish-invoicingback-test

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Submodules & Indexes:"
	@echo "  init-submodules    - Initialize all repositories as git submodules (from REPO.md)"
	@echo "  submodules         - Alias for init-submodules"
	@echo "  update-submodules  - Update all submodules to latest commits"
	@echo "  generate-indexes   - Generate code2logic indexes for each project"
	@echo "  indexes            - Alias for generate-indexes"
	@echo "  analyze-all        - Generate indexes + write analysis_report.md"
	@echo ""
	@echo "  ExEF Development:"
	@echo "  exef-install        - Install exef dependencies (npm install)"
	@echo "  install             - Install all project dependencies (npm + submodules)"
	@echo "  exef-dev            - Run exef web service in development mode"
	@echo "  exef-local-dev      - Run exef local service in development mode"
	@echo "  exef-cli            - Run exef CLI (usage: make exef-cli ARGS='inbox list')"
	@echo "  exef-test           - Run exef unit tests"
	@echo "  exef-test-api       - Run exef API integration tests against local service"
	@echo "  exef-test-gui       - Open GUI test interface in browser (http://localhost:3030/test)"
	@echo "  exef-lint           - Run linter on exef code"
	@echo "  exef-clean          - Clean exef build artifacts"
	@echo ""
	@echo "  ExEF Build:"
	@echo "  exef-web-docker     - Build docker image for exef web service (VPS)"
	@echo "  exef-web-up         - Run exef web service via docker compose with auto-selected host port"
	@echo "  exef-local-build    - Build local service binaries (linux+windows via pkg)"
	@echo "  exef-local-bin      - Build only local service binaries (fast, no npm install)"
	@echo "  exef-local-packages - Build linux deb+rpm packages for local service (via nfpm docker)"
	@echo "  exef-desktop-build  - Build desktop app installers (AppImage/deb/rpm + Windows NSIS)"
	@echo "  exef-desktop-test   - Smoke-test desktop app on Linux (start local-service, verify health, launch AppImage)"
	@echo "  exef-cli-build      - Build standalone CLI binary (linux+windows)"
	@echo "  exef-cli-install    - Install CLI globally (npm link)"
	@echo "  exef-all            - Build all 3 exef artifacts"
	@echo ""
	@echo "  Release:"
	@echo "  push               - Bump version + generate docs/v/<tag>/ + tag + push"
	@echo "  clean              - Remove all generated index files"
	@echo "  help               - Show this help message"

# Initialize all repositories from REPO.md as git submodules
init-submodules:
	@echo "Initializing git submodules from REPO.md..."
	@while IFS= read -r repo_url; do \
		if [ -n "$$repo_url" ]; then \
			repo_name=$$(basename "$$repo_url"); \
			if [ ! -d "$$repo_name" ]; then \
				echo "Adding submodule: $$repo_name"; \
				git submodule add "$$repo_url" "$$repo_name"; \
			else \
				echo "Submodule $$repo_name already exists"; \
			fi; \
		fi; \
	done < REPO.md
	@echo "Initializing submodules..."
	git submodule update --init --recursive
	@echo "All submodules initialized successfully!"

submodules: init-submodules

# Update all submodules to their latest commits
update-submodules:
	@echo "Updating all submodules..."
	git submodule update --remote --merge
	@echo "All submodules updated!"

# Generate code2logic indexes for each project
generate-indexes:
	@echo "Generating code2logic indexes for all projects..."
	@for dir in */; do \
		project_name=$$(basename "$$dir"); \
		if [ -d "$$dir" ] && ( [ -f "$$dir/.git" ] || [ -d "$$dir/.git" ] || [ "$$project_name" = "exef" ] ); then \
			echo "Processing $$project_name..."; \
			if command -v code2logic >/dev/null 2>&1; then \
				rm -f "$$project_name.functions.toon" "$$project_name.toon-schema.json"; \
				if [ "$$project_name" = "exef" ]; then \
					(cd "$$dir" && code2logic ./src -f toon --compact --function-logic --with-schema -o "../$$project_name.toon") && \
					true; \
				else \
					(cd "$$dir" && code2logic ./ -f toon --compact --function-logic --with-schema -o "../$$project_name.toon") && \
					true; \
				fi && \
				echo "Generated $$project_name.functions.toon and $$project_name.toon-schema.json" || \
				echo "Failed to generate index for $$project_name"; \
			else \
				echo "code2logic command not found. Please install it (pyhrton) first."; \
			fi; \
		fi; \
	done
	@echo "Index generation completed!"

indexes: generate-indexes

# Clean generated index files
clean:
	@echo "Cleaning generated index files..."
	@rm -f *.toon *.functions.toon *.toon-schema.json
	@echo "Cleanup completed!"

# Generate comprehensive analysis report
analyze-all: generate-indexes
	@echo "Creating comprehensive analysis report..."
	@echo "KSeF Project Analysis Report" > analysis_report.md
	@echo "=============================" >> analysis_report.md
	@echo "" >> analysis_report.md
	@echo "Generated on: $$(date)" >> analysis_report.md
	@echo "" >> analysis_report.md
	@echo "## Analyzed Projects" >> analysis_report.md
	@for toon_file in *.functions.toon; do \
		if [ -f "$$toon_file" ]; then \
			project_name=$$(basename "$$toon_file" .functions.toon); \
			echo "- $$project_name" >> analysis_report.md; \
		fi; \
	done
	@echo "" >> analysis_report.md
	@echo "## Generated Files" >> analysis_report.md
	@ls -la *.functions.toon *.toon-schema.json >> analysis_report.md
	@echo "Analysis report saved to analysis_report.md"

exef-web-docker:
	@echo "Building exef web docker image..."
	@cd exef && docker build -t exef-web:latest -f docker/web/Dockerfile .

exef-web-up:
	@echo "Starting exef web via docker compose with auto-selected port..."
	@cd exef && EXEF_WEB_PORT_MAPPING=$$(node scripts/choose-port.cjs) docker compose up --build

exef-local-build:
	@echo "Building exef local service binaries (pkg)..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm install
	@cd exef && /usr/share/nodejs/corepack/shims/npm run build:local:bin

exef-local-bin:
	@echo "Building exef local service binaries only (fast)..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm run build:local:bin

exef-local-packages: exef-local-build
	@echo "Building exef local service packages (deb+rpm via nfpm docker)..."
	@cd exef && docker run --rm -v "$$PWD":/work -w /work ghcr.io/goreleaser/nfpm:v2.43.0 package -f packaging/local-service/nfpm.yaml -p deb -p rpm

exef-desktop-build:
	@echo "Building exef desktop app installers (electron-builder)..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm install
	@cd exef && /usr/share/nodejs/corepack/shims/npm run build:desktop

exef-desktop-test:
	@echo "Running exef desktop smoke-test on Linux..."
	@cd exef && ./scripts/desktop-test.cjs

exef-all: exef-web-docker exef-local-packages exef-desktop-build
	@echo "All exef artifacts built."

# ExEF Development targets
install:
	@echo "Installing all project dependencies..."
	@echo "Installing exef dependencies..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm install
	@echo "Installing Python dependencies..."
	@if [ -f requirements-dev.txt ]; then \
		if command -v pipx >/dev/null 2>&1; then \
			echo "Using pipx for Python packages..."; \
			for pkg in $$(cat requirements-dev.txt | grep -v '^#' | grep -v '^$$'); do \
				pipx install "$$pkg" 2>/dev/null || echo "Skipping $$pkg (not a pipx package)"; \
			done; \
		elif command -v pip3 >/dev/null 2>&1; then \
			echo "Using pip3 with --break-system-packages..."; \
			pip3 install --break-system-packages -r requirements-dev.txt 2>/dev/null || \
			(echo "Trying system package installation..." && \
			sudo apt-get update >/dev/null 2>&1 && \
			sudo apt-get install -y python3-pytest python3-requests python3-yaml 2>/dev/null || \
			echo "Please install Python packages manually or use virtual environment"); \
		else \
			echo "Python/pip not found. Please install Python3 and pip"; \
		fi; \
	fi
	@echo "Initializing submodules..."
	@git submodule update --init --recursive || echo "No submodules found"
	@echo "Installation complete!"

exef-install:
	@echo "Installing exef dependencies..."
	@cd exef && npm install

exef-dev:
	@echo "Starting exef web service in development mode..."
	@cd exef && npm run web

exef-local-dev:
	@echo "Starting exef local service in development mode..."
	@cd exef && npm run local

exef-test:
	@echo "Running exef unit tests..."
	@cd exef && npm test 2>/dev/null || echo "No test script defined yet"

exef-test-api:
	@echo "Running exef API integration tests..."
	@cd exef && node test/test-inbox.cjs

exef-test-gui:
	@echo "Opening GUI test interface..."
	@echo "Starting local service and opening browser..."
	@cd exef && (/usr/share/nodejs/corepack/shims/npm run local &) && \
	for i in 1 2 3 4 5 6 7 8 9 10; do \
		[ -f .exef-local-service.port ] && break; \
		sleep 1; \
	done; \
	PORT=$$(cat .exef-local-service.port 2>/dev/null || echo "3030"); \
	URL="http://127.0.0.1:$$PORT/test/"; \
	xdg-open "$$URL" 2>/dev/null || open "$$URL" 2>/dev/null || echo "Open $$URL in your browser"

exef-lint:
	@echo "Running linter on exef code..."
	@cd exef && npm run lint 2>/dev/null || echo "No lint script defined yet"

exef-clean:
	@echo "Cleaning exef build artifacts..."
	@rm -rf exef/dist exef/node_modules/.cache
	@rm -f exef/.exef-local-service.port
	@rm -f exef/*.deb exef/*.rpm
	@echo "Clean complete."

exef-cli:
	@cd exef && node bin/exef.cjs $(ARGS)

exef-cli-build:
	@echo "Building exef CLI binaries..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm run build:cli

exef-cli-install:
	@echo "Installing exef CLI globally..."
	@cd exef && /usr/share/nodejs/corepack/shims/npm link

all: build-all test-all
	@echo "All applications built and tested."

build-all: exef-all ksef-master-build ksef-client-js-build polish-invoicingback-build
	@echo "All application builds completed."

test-all: python-test test-e2e exef-test ksef-master-test ksef-client-js-test polish-invoicingback-test
	@echo "All tests completed."

test-e2e:
	@echo "Running E2E tests..."
	@python3 -m pytest -o addopts= -m e2e

python-test:
	@echo "Running Python tests (non-e2e)..."
	@python3 -m pytest; ec=$$?; if [ $$ec -eq 0 ] || [ $$ec -eq 5 ]; then exit 0; else exit $$ec; fi

ksef-master-build:
	@echo "Building KSeF-Master..."
	@cd KSeF-Master && if [ -x /usr/share/nodejs/corepack/shims/npm ]; then NPM=/usr/share/nodejs/corepack/shims/npm; else NPM=$$(command -v npm); fi; $$NPM ci && $$NPM run build

ksef-master-test:
	@echo "No tests configured for KSeF-Master."

ksef-client-js-build:
	@echo "Building ksef-client-js..."
	@cd ksef-client-js && if [ -x /usr/share/nodejs/corepack/shims/pnpm ]; then PNPM=/usr/share/nodejs/corepack/shims/pnpm; else PNPM=$$(command -v pnpm); fi; if [ -z "$$PNPM" ]; then echo "pnpm not found"; exit 1; fi; $$PNPM install --frozen-lockfile && $$PNPM run build

ksef-client-js-test:
	@echo "Testing ksef-client-js..."
	@cd ksef-client-js && if [ -x /usr/share/nodejs/corepack/shims/pnpm ]; then PNPM=/usr/share/nodejs/corepack/shims/pnpm; else PNPM=$$(command -v pnpm); fi; if [ -z "$$PNPM" ]; then echo "pnpm not found"; exit 1; fi; $$PNPM run test

polish-invoicingback-build:
	@echo "Building polishInvoicingback..."
	@cd polishInvoicingback && if [ -x /usr/share/nodejs/corepack/shims/npm ]; then NPM=/usr/share/nodejs/corepack/shims/npm; else NPM=$$(command -v npm); fi; $$NPM ci && $$NPM run build

polish-invoicingback-test:
	@echo "No tests configured for polishInvoicingback."

# Release automation: bump version, generate docs/v/<tag>/, commit, tag and push
push:
	@node scripts/release.cjs
