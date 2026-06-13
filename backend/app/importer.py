"""共享的主表导入逻辑：供 CLI 脚本与后端「上传导入」接口复用。

- 按表头名定位列（列序变化也兼容）；
- 来源标准、一级/二级/三级分类自动去重（get_or_create）；
- 指标按「标识符」去重，默认跳过已存在项，update=True 则覆盖更新；
- 幂等，可重复导入。
source 可为文件路径或文件型对象（如上传文件的 BytesIO）。
"""
import openpyxl
from sqlalchemy.orm import Session

from . import models

COLS = {
    "source": "来源标准/部分", "l1": "一级分类", "l2": "二级分类", "l3": "三级分类",
    "identifier": "标识符", "name_cn": "中文名称", "name_en": "英文名称", "unit": "计量单位",
    "definition": "定义", "method": "计算方法", "description": "指标说明",
    "survey_method": "调查方法", "data_source": "数据来源", "frequency": "发布频率",
}


def _norm(v):
    return ("" if v is None else str(v)).strip()


def _get_or_create_source(db, cache, title):
    title = _norm(title)
    if not title:
        return None
    if title in cache:
        return cache[title]
    obj = db.query(models.SourceStandard).filter(models.SourceStandard.title == title).first()
    if not obj:
        obj = models.SourceStandard(title=title); db.add(obj); db.flush()
    cache[title] = obj
    return obj


def _get_or_create_class(db, cache, name, parent_id, level):
    name = _norm(name)
    if not name:
        return None
    key = (parent_id, name)
    if key in cache:
        return cache[key]
    obj = (db.query(models.Classification)
           .filter(models.Classification.name == name,
                   models.Classification.parent_id == parent_id,
                   models.Classification.level == level).first())
    if not obj:
        obj = models.Classification(name=name, parent_id=parent_id, level=level, sort_order=0)
        db.add(obj); db.flush()
    cache[key] = obj
    return obj


def _resolve_class_id(db, ccache, l1, l2, l3):
    node = None
    for level, name in enumerate([l1, l2, l3], start=1):
        if not _norm(name):
            break
        node = _get_or_create_class(db, ccache, name, node.id if node else None, level)
    return node.id if node else None


def run_import(db: Session, source, update: bool = False, sheet: str | None = None) -> dict:
    """执行导入，返回统计字典。source 为路径或文件型对象。"""
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active

    rows = ws.iter_rows(values_only=True)
    header = [_norm(h) for h in next(rows)]
    idx = {}
    for key, label in COLS.items():
        if label not in header:
            raise ValueError(f"主表缺少列「{label}」，请检查表头。")
        idx[key] = header.index(label)

    scache, ccache = {}, {}
    inserted = updated = skipped = 0

    for raw in rows:
        if not raw or not _norm(raw[idx["name_cn"]]):
            continue
        g = lambda k: _norm(raw[idx[k]])
        identifier = g("identifier")
        class_id = _resolve_class_id(db, ccache, g("l1"), g("l2"), g("l3"))
        source_obj = _get_or_create_source(db, scache, g("source"))
        fields = dict(
            identifier=identifier, name_cn=g("name_cn"), name_en=g("name_en"),
            unit=g("unit"), definition=g("definition"), method=g("method"),
            description=g("description"), survey_method=g("survey_method"),
            data_source=g("data_source"), frequency=g("frequency"),
            classification_id=class_id,
            source_standard_id=source_obj.id if source_obj else None,
        )
        existing = db.query(models.Indicator).filter(models.Indicator.identifier == identifier).first() if identifier else None
        if existing:
            if update:
                for k, v in fields.items():
                    setattr(existing, k, v)
                existing.version += 1
                updated += 1
            else:
                skipped += 1
        else:
            db.add(models.Indicator(status=models.IndicatorStatus.active, **fields))
            inserted += 1

    db.commit()
    return {"inserted": inserted, "updated": updated, "skipped": skipped,
            "sources": len(scache), "classifications": len(ccache)}
