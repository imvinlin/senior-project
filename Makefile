UV ?= uv
.PHONY: sync lint fmt check

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

