"""Runtime bridge for the Production Tools Suite.

The suite deliberately reuses the proven implementations from app_simple.py:
attendance (including its SQLite schema and PDFs), cost-calculator PDFs, and
the template-maker PDF/SVG workflow.  A local snapshot is bundled in
vendor/app_simple.py so this folder also runs when the parent application is
not installed.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from types import ModuleType

SUITE_DIR = Path(__file__).resolve().parent
PARENT_APP_DIR = SUITE_DIR.parent
PARENT_APP_FILE = PARENT_APP_DIR / "app_simple.py"
VENDORED_APP_FILE = SUITE_DIR / "vendor" / "app_simple.py"

# Only the three production tools and their required static/API routes are
# exposed by run_tools.py.  Keep this list in sync with the tool HTML forms.
TOOL_GET_PATHS = frozenset(
    {
        "/attendance",
        "/attendance/unlock",
        "/attendance/workspace",
        "/attendance/dashboard",
        "/attendance/report",
        "/attendance/photo",
        "/cost-calculator",
        "/cost-calculator/laser",
        "/cost-calculator/digital",
        "/template-maker",
        "/template-maker/bag",
        "/template-maker/drawer",
        "/template-maker/lidbox",
        "/template-maker/pinchlock",
        "/template-maker/tucklock",
        "/favicon.png",
        "/logo.png",
        "/assets/paper-bag-icon.png",
        "/assets/slidebox-icon.png",
        "/assets/lidbox-icon.png",
        "/assets/pinchlock-icon.png",
        "/assets/tucklock-icon.png",
        "/assets/acrylic-pricing-template.xlsx",
        "/assets/paper-bag-template-reference.png",
        "/assets/smart-accountant-light.png",
        "/assets/smart-accountant-dark.png",
    }
)
TOOL_POST_PATHS = frozenset(
    {
        "/attendance/punch",
        "/attendance/unlock",
        "/attendance/logout-emp",
        "/attendance/dashboard/login",
        "/attendance/dashboard/logout",
        "/attendance/dashboard/add",
        "/attendance/dashboard/delete",
        "/attendance/dashboard/save",
        "/cost-calculator-pdf",
        "/cost-calculator-digital-pdf",
        "/api/template-export-pdf",
    }
)


def _select_app_file() -> Path:
    """Prefer the current parent app; otherwise use the shipped snapshot."""
    return PARENT_APP_FILE if PARENT_APP_FILE.is_file() else VENDORED_APP_FILE


def load_tools_app(use_parent_db: bool = False) -> tuple[ModuleType, Path]:
    """Load and configure app_simple for this suite's isolated runtime.

    `app_simple.py` uses module globals for paths.  Assigning them after import
    preserves all of its original route handlers while making attendance data
    and photos live alongside this suite by default.
    """
    source = _select_app_file()
    if not source.is_file():
        raise RuntimeError(f"app_simple.py غير موجود: {source}")

    module_name = "production_tools_app_simple"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"تعذر تحميل المصدر: {source}")
    app = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = app
    spec.loader.exec_module(app)

    suite_db = SUITE_DIR / "database.db"
    if use_parent_db:
        db_path = PARENT_APP_DIR / "database.db"
    else:
        db_path = suite_db

    # Static assets and PDF fonts are supplied by this package in both modes.
    app.BASE_DIR = str(SUITE_DIR)
    app._DATA_DIR = str(PARENT_APP_DIR if use_parent_db else SUITE_DIR)
    app.DB_PATH = str(db_path)
    app.ATT_PHOTOS_DIR = os.path.join(app._DATA_DIR, "attendance_photos")
    app.init_db()
    return app, source
