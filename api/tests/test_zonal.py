import pytest

from tests.conftest import SNAPSHOT
from trend_atlas.zonal import ZonalTableError, parse_zonal, sha256

# Header lines copied verbatim from NASA_GISTEMP_ZONAL_SNAPSHOT.txt (lines 8-9).
H1 = "                             24N   24S   90S     64N   44N   24N   EQU   24S   44S   64S   90S"
H2 = "Year  Glob  NHem  SHem    -90N  -24N  -24S    -90N  -64N  -44N  -24N  -EQU  -24S  -44S  -64S Year"


def row(year, vals=None):
    vals = vals or [str(i * 10 - 50) for i in range(14)]
    return f"{year} " + " ".join(vals) + f" {year}"


def write(tmp_path, rows, header=H2):
    p = tmp_path / "z.txt"
    p.write_text("\n".join(["Title", H1, header] + rows) + "\n", encoding="ascii")
    return p


def test_real_snapshot():
    z = parse_zonal(SNAPSHOT)
    assert z["years"] == list(range(1880, 2026))
    assert len(z["series"]) == 14
    assert sha256(SNAPSHOT) == "e489c207215be7210d2f42141681dfd5640f049b704e7ad288b3dcc71114525b"


def test_valid_small_table(tmp_path):
    vals = ["*****"] + ["123"] * 13
    z = parse_zonal(write(tmp_path, [row(2000), row(2001, vals)]))
    assert z["years"] == [2000, 2001]
    assert z["series"]["Glob"] == [-0.5, None]
    assert z["series"]["NHem"][1] == 1.23


@pytest.mark.parametrize("rows,header", [
    ([row(2000), row(2000)], H2),                                   # duplicate year
    ([row(2000), "2001 " + " ".join(["1"] * 13) + " 2001"], H2),     # missing column
    ([row(2000, ["x1"] + ["1"] * 13)], H2),                          # non-numeric
    (["2000 " + " ".join(["1"] * 14) + " 2001"], H2),                # trailing year differs
    ([row(2000)], H2.replace("Glob", "Glbl")),                       # changed header
], ids=["duplicate", "missing_col", "non_numeric", "trailing_year", "header"])
def test_rejects(tmp_path, rows, header):
    with pytest.raises(ZonalTableError):
        parse_zonal(write(tmp_path, rows, header))
