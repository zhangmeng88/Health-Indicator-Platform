"""把《卫生统计指标》主表（.xlsx）全量导入后端数据库（命令行方式）。

用法：
    cd backend
    python scripts/import_xlsx.py /path/to/2018卫生统计指标完整.xlsx
    python scripts/import_xlsx.py data.xlsx --update   # 已存在的标识符也更新

导入逻辑与平台「上传导入」按钮完全一致（见 app/importer.py）。
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import Base, engine, SessionLocal   # noqa: E402
from app.importer import run_import                    # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", help="主表 .xlsx 路径")
    ap.add_argument("--sheet", default=None, help="工作表名（默认第一个）")
    ap.add_argument("--update", action="store_true", help="已存在标识符则更新而非跳过")
    args = ap.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        r = run_import(db, args.xlsx, update=args.update, sheet=args.sheet)
    finally:
        db.close()

    print("导入完成：")
    print(f"  新增指标 : {r['inserted']}")
    print(f"  更新指标 : {r['updated']}")
    print(f"  跳过(已存在): {r['skipped']}")
    print(f"  来源标准 : {r['sources']} 项   分类节点(本次涉及): {r['classifications']} 个")


if __name__ == "__main__":
    main()
