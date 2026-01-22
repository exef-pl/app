# Makefile for managing KSeF project repositories and analysis

.PHONY: init-submodules update-submodules generate-indexes clean help submodules indexes analyze-all exef-web-docker exef-local-build exef-local-bin exef-desktop-build exef-all push

# Default target
help:
	@echo "Available commands:"
	@echo "  init-submodules    - Initialize all repositories as git submodules (from REPO.md)"
	@echo "  submodules         - Alias for init-submodules"
	@echo "  update-submodules  - Update all submodules to latest commits"
	@echo "  generate-indexes   - Generate code2logic indexes for each project"
	@echo "  indexes            - Alias for generate-indexes"
	@echo "  analyze-all        - Generate indexes + write analysis_report.md"
	@echo "  exef-web-docker     - Build docker image for exef web service (VPS)"
	@echo "  exef-local-build    - Build local service binaries (linux+windows via pkg)"
	@echo "  exef-local-bin      - Build only local service binaries (fast, no npm install)"
	@echo "  exef-local-packages - Build linux deb+rpm packages for local service (via nfpm docker)"
	@echo "  exef-desktop-build  - Build desktop app installers (AppImage/deb/rpm + Windows NSIS)"
	@echo "  exef-all            - Build all 3 exef artifacts"
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

exef-all: exef-web-docker exef-local-packages exef-desktop-build
	@echo "All exef artifacts built."

# Release automation: bump version, generate docs/v/<tag>/, commit, tag and push
push:
	@node scripts/release.cjs
