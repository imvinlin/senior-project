from fastapi import FastAPI

app = FastAPI(
    title="CancerLike",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}
