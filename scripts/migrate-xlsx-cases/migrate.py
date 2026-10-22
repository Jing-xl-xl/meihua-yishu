#!/usr/bin/env python3
"""从 shared HEXAGRAM_TABLE 生成 examples/hex-table.json，并由 xlsx 生成脱敏样例。

用法：
  python3 scripts/migrate-xlsx-cases/migrate.py \
    --hex-source ../../app/packages/shared/src/constants/hexagrams.ts \
    --xlsx ../../实际案例/梅花易数解卦.xlsx \
    --out examples/cases.sample.json

依赖：examples/hex-table.json（本脚本可先生成）。
xlsx 无动爻/体用列：由本卦/变卦差异推 movingYao，再定体用。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

GUA_ID = {
    "乾": "qian", "兑": "dui", "离": "li", "震": "zhen",
    "巽": "xun", "坎": "kan", "艮": "gen", "坤": "kun",
}
NATURE = {
    "qian": "天", "dui": "泽", "li": "火", "zhen": "雷",
    "xun": "风", "kan": "水", "gen": "山", "kun": "地",
}


def load_hex_table(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    rows = []
    for m in re.finditer(
        r"\{ kingwen: (\d+), upper: '(\w+)', lower: '(\w+)', name: '([^']+)' \}",
        text,
    ):
        rows.append(
            {
                "kingwen": int(m.group(1)),
                "upper": m.group(2),
                "lower": m.group(3),
                "name": m.group(4),
            }
        )
    if len(rows) != 64:
        raise SystemExit(f"hex table parse failed: {len(rows)} != 64")
    return rows


def lines_from_hex(upper: str, lower: str) -> list[int]:
    bits = {
        "qian": [7, 7, 7], "dui": [7, 7, 8], "li": [7, 8, 7], "zhen": [7, 8, 8],
        "xun": [8, 7, 7], "kan": [8, 7, 8], "gen": [8, 8, 7], "kun": [8, 8, 8],
    }
    return bits[lower] + bits[upper]


def find_meta(table: list[dict], full_name: str) -> dict:
    for row in table:
        if row["name"] == full_name or row["name"].endswith(full_name) or full_name.endswith(row["name"]):
            return row
    # 兼容「大畜」单名
    for row in table:
        if full_name in row["name"]:
            return row
    raise KeyError(full_name)


def derive_moving_ti_yong(ben: dict, bian: dict) -> tuple[int, str, str]:
    bl = lines_from_hex(ben["upper"], ben["lower"])
    xl = lines_from_hex(bian["upper"], bian["lower"])
    diff = [i + 1 for i in range(6) if bl[i] != xl[i]]
    if len(diff) != 1:
        raise ValueError("ben/bian should differ at exactly one yao")
    pos = diff[0]
    if pos <= 3:
        return pos, ben["lower"], ben["upper"]
    return pos, ben["upper"], ben["lower"]


def parse_xlsx(path: Path) -> list[list[str]]:
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise SystemExit("need openpyxl: use MIMO_PYTHON")
    wb = load_workbook(path, data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(["" if c is None else str(c) for c in row])
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hex-source", type=Path, required=True)
    ap.add_argument("--xlsx", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hex-out", type=Path, default=None)
    args = ap.parse_args()

    table = load_hex_table(args.hex_source)
    if args.hex_out:
        args.hex_out.parent.mkdir(parents=True, exist_ok=True)
        args.hex_out.write_text(
            json.dumps({"hexagrams": table}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print("wrote", args.hex_out)

    rows = parse_xlsx(args.xlsx)
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}

    def col(row: list[str], name: str) -> str:
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else ""

    samples = []
    for row in rows[1:]:
        if not col(row, "问题").strip():
            continue
        ben_name = col(row, "本卦").strip()
        bian_name = col(row, "变卦").strip()
        hu_name = col(row, "互卦").strip()
        try:
            ben = find_meta(table, ben_name)
            bian = find_meta(table, bian_name)
            hu = find_meta(table, hu_name) if hu_name else None
            moving, ti, yong = derive_moving_ti_yong(ben, bian)
        except Exception as e:
            print("skip", ben_name, e, file=sys.stderr)
            continue

        who = col(row, "求卦人").strip()
        who_safe = "示例A" if who == "我" else ("示例B" if who else "示例A")

        acc = col(row, "解卦是否准确").strip()
        acc_map = {"是": "yes", "部分": "partial", "否": "no"}

        method_raw = col(row, "起卦法").strip()
        method = (
            "number3" if "三数" in method_raw else
            "direction" if "方位" in method_raw else
            "datetime" if "时间" in method_raw else
            "number3"
        )

        nums = re.findall(r"\d+", col(row, "数字/灵机"))
        samples.append(
            {
                "question": col(row, "问题"),
                "input": {
                    "question": col(row, "问题"),
                    "numbers": [int(n) for n in nums] if nums else None,
                    "contextNote": col(row, "数字/灵机") or None,
                },
                "method": method,
                "hex": {
                    "ben": ben["name"],
                    "hu": {
                        "upper": hu["upper"] if hu else ben["upper"],
                        "lower": hu["lower"] if hu else ben["lower"],
                        "name": hu["name"] if hu else None,
                    },
                    "bian": bian["name"],
                    "movingYao": moving,
                    "ti": ti,
                    "yong": yong,
                },
                "detail": col(row, "卦象详解"),
                "actual": col(row, "实际情况") or None,
                "accuracy": acc_map.get(acc),
                "deviationNotes": col(row, "与实际差异之处") or None,
                "person": who_safe,
            }
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"version": 1, "cases": samples}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", args.out, "count", len(samples))


if __name__ == "__main__":
    main()
