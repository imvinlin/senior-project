UV ?= uv
.PHONY: help sync lint fmt check

help: ## lists the targets 
	@grep -E '^[a-zA-Z0-9_-]+:.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf " %-10s %s\n", $$1, $$2}'

sync: ## installing the depndencies
	$(UV) sync 

test: ## running the python tests 
	$(UV) run pytest 

lint: ## ruff and mypy linting 
	$(UV) run ruff check .
	$(UV) run mypy

fmt: ## formatting in place 
	$(UV) run ruff format .

check: lint ## pre commit gate 

