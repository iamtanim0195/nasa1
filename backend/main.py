"""
Earth Metamorphosis - FastAPI Backend
======================================
Team: Nova Matrics - VI | NASA Space Apps Challenge 2026
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

# ──────────────────────────────────────────────────────────────────────
# Bootstrap NASA Earthdata credentials for cloud deployments.
#
# Local dev: ~/.netrc already holds the user's Earthdata login.
# Cloud (Railway/Render): the container is ephemeral, so we materialise
# ~/.netrc from EARTHDATA_USERNAME and EARTHDATA_PASSWORD env vars.
# ──────────────────────────────────────────────────────────────────────
def _bootstrap_netrc() -> None:
    user = os.environ.get("EARTHDATA_USERNAME")
    pwd = os.environ.get("EARTHDATA_PASSWORD")
    if not user or not pwd:
        print("[bootstrap] EARTHDATA_USERNAME/PASSWORD not set — skipping .netrc")
        return
    netrc_path = Path.home() / ".netrc"
    try:
        netrc_path.write_text(
            f"machine urs.earthdata.nasa.gov login {user} password {pwd}\n",
            encoding="utf-8",
        )
        try:
            netrc_path.chmod(0o600)
        except Exception:
            pass
        print(f"[bootstrap] .netrc written to {netrc_path}")
    except Exception as exc:
        print(f"[bootstrap] .netrc write failed: {exc}")


_bootstrap_netrc()


from api.routers import search_location, nisar, mission, events, analyze, results

STATIC_FOLDER = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_FOLDER, exist_ok=True)

# Real processing artifacts (GeoTIFF / PNG / NPY) live in the project-level
# `output/` tree. Mounting it read-only means results can link straight at the
# files the pipeline just wrote, with no copy step to go stale.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FOLDER = os.path.join(PROJECT_ROOT, "output")
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app = FastAPI(
    title="Earth Metamorphosis API",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)

app.mount("/static", StaticFiles(directory=STATIC_FOLDER), name="static")
app.mount("/artifacts", StaticFiles(directory=OUTPUT_FOLDER), name="artifacts")

app.include_router(search_location.router, prefix="/api", tags=["Location"])
app.include_router(nisar.router, prefix="/api", tags=["NISAR"])
app.include_router(mission.router, prefix="/api", tags=["Mission"])
app.include_router(events.router, prefix="/api", tags=["Events"])
app.include_router(analyze.router, prefix="/api", tags=["Analysis"])
app.include_router(results.router, prefix="/api", tags=["Results"])


@app.get("/")
async def root():
    return {"product": "Earth Metamorphosis", "team": "Nova Matrics - VI", "status": "running"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("Earth Metamorphosis API")
    print("Server: http://localhost:8000")
    print("Docs:   http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)