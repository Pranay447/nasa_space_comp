import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]
REPO = API.parent
if str(API) not in sys.path:
    sys.path.insert(0, str(API))

SNAPSHOT = REPO / "NASA_GISTEMP_ZONAL_SNAPSHOT.txt"
