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

The frontend and API run as two Vercel Hobby projects from this repository.
This keeps the 622 MB raw expression TSV out of Git: the API project's build
downloads the two public source files from Drive, prepares the compact data
files, and includes those prepared files in its Python function bundle. The
raw expression TSV is excluded from the deployed function. Vercel Hobby allows
Python function bundles up to 500 MB and provides up to 2 GB of function
memory; the API bundle should contain only the prepared expression matrix
(about 118 MB), metadata, PCA coordinates, loadings, and runtime dependencies.

Create the API project first, using the repository root as its project root and
the FastAPI framework preset. In that API project's Build & Development
Settings, override the Build Command with:

```sh
uv run python deploy/vercel_prepare.py
```

The root `vercel.json` configures the app entry
point, bundled data files, and a 300-second function duration. Keeping the
preparation command in the API project's settings prevents it from running in
the frontend project. Keep the source files publicly readable in Drive so each
API deployment can fetch them. The initial API build may take several minutes
while it downloads and processes the expression matrix.

Then create a second Vercel project from the same repository with `web` as the
project root. Set `CANCERLIKE_API` to the API project's production URL, without
a trailing slash, for Production and Preview. The existing Next.js rewrite
forwards `/api/*` requests to that project. Leave the frontend project's Build
Command, Install Command, and Output Directory at their Next.js defaults.

Vercel Hobby is free for personal, noncommercial use, subject to its usage
limits. The Python bundle size, memory, and request duration should be checked
on the first deployment. If a build or function exceeds those limits, reduce
the prepared data or move the backend to a paid service.
