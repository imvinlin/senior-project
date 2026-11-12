# senior-project

### Useful (Populated) Metadata Fields
- `organism_scientific_name` -> species
- `run_accession` -> unique ID
- `paipu_tissue_final` -> tissue type
- `paipu_cancer_type_final` -> cancer type

### Running from a Local Terminal
Install dependencies (perform once):
```
# navigate to root directory, i.e. senior-project/
uv sync
cd web && npm ci
```

Start the backend and frontend in separate terminals:
```
# start the backend in one terminal:
# (in the root directory)
make prep  # prepares the expression matrix for visualization
make dev

# in a separate terminal, start the frontend:
# (in the root directory)
make wdev
```
If the backend make commands throw a `ModuleNotFoundError: No module named 'cancerlike'\n make: *** [dev] Error 1` AND you're on MacOS, try prepending `PYTHONPATH=src UV_NO_SYNC=1 ` to each command (i.e. `PYTHONPATH=src UV_NO_SYNC=1 make prep` and `PYTHONPATH=src UV_NO_SYNC=1 make dev`) to resolve the issue.

Navigate to localhost:3000 in a browser to interact with the UI.

### Free Vercel Deployment for User Testing

The project is deployed to Vercel via the repository [youngrach/senior-project](https://github.com/youngrach/senior-project), cloned from this repository to get around restrictions regarding deployment and repo ownership. Check it out at [https://cancerlike.vercel.app](https://cancerlike.vercel.app). Note: the hosted app may not be up-to-date with the most recent changes in this repository, since it pulls from a different repository.
