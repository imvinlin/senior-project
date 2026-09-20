UV ?= uv
.PHONY: help sync lint rfix fmt check dev wcheck wdev 

help: ## lists the targets 
	@grep -E '^[a-zA-Z0-9_-]+:.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf " %-10s %s\n", $$1, $$2}'

sync: ## install the depndencies
	$(UV) sync 

test: ## run the python tests 
	$(UV) run pytest 

lint: ## ruff and mypy linting 
	$(UV) run ruff check .
	$(UV) run mypy

rfix: ## ruff check with fix 
	$(UV) run ruff check . --fix

fmt: ## format in place 
	$(UV) run ruff format .

check: lint wcheck ## pre commit gate 

dev: ## run the api with reload 
	$(UV) run cancerlike serve --reload

wcheck: ## typecheck and list the frontend
	cd web && npx tsc --noEmit && npm run lint

wdev: ## run the next dev server 
	cd web && npm run dev

