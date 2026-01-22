# Makefile for managing KSeF project repositories and analysis

.PHONY: init-submodules update-submodules generate-indexes clean help

# Default target
help:
	@echo "Available commands:"
	@echo "  init-submodules    - Initialize all repositories as git submodules"
	@echo "  update-submodules  - Update all submodules to latest commits"
	@echo "  generate-indexes   - Generate code2logic indexes for each project"
	@echo "  clean              - Remove all generated .toon files"
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
	git submodule init
	git submodule update
	@echo "All submodules initialized successfully!"

# Update all submodules to their latest commits
update-submodules:
	@echo "Updating all submodules..."
	git submodule update --remote --merge
	@echo "All submodules updated!"

# Generate code2logic indexes for each project
generate-indexes:
	@echo "Generating code2logic indexes for all projects..."
	@for dir in */; do \
		if [ -d "$$dir" ] && [ -f "$$dir/.git" ]; then \
			project_name=$$(basename "$$dir"); \
			echo "Processing $$project_name..."; \
			cd "$$dir" && \
			if command -v code2logic >/dev/null 2>&1; then \
				code2logic ./ -f toon --compact --function-logic --with-schema -o "../$$project_name.toon" && \
				echo "Generated $$project_name.toon" || \
				echo "Failed to generate index for $$project_name"; \
			else \
				echo "code2logic command not found. Please install the package first."; \
			fi; \
			cd ..; \
		fi; \
	done
	@echo "Index generation completed!"

# Clean generated .toon files
clean:
	@echo "Cleaning generated .toon files..."
	@rm -f *.toon
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
	@for toon_file in *.toon; do \
		if [ -f "$$toon_file" ]; then \
			project_name=$$(basename "$$toon_file" .toon); \
			echo "- $$project_name" >> analysis_report.md; \
		fi; \
	done
	@echo "" >> analysis_report.md
	@echo "## Generated Files" >> analysis_report.md
	@ls -la *.toon >> analysis_report.md
	@echo "Analysis report saved to analysis_report.md"
