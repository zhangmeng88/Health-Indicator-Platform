"""序列化辅助：分类路径、指标/建议输出转换、分类树构建。"""
from sqlalchemy.orm import Session

from . import models, schemas


def classification_path(db: Session, class_id: int | None) -> list[str]:
    """返回从一级到当前节点的名称路径。"""
    names: list[str] = []
    cur = db.get(models.Classification, class_id) if class_id else None
    while cur is not None:
        names.insert(0, cur.name)
        cur = db.get(models.Classification, cur.parent_id) if cur.parent_id else None
    return names


def indicator_out(db: Session, ind: models.Indicator) -> schemas.IndicatorOut:
    data = schemas.IndicatorOut.model_validate(ind)
    data.classification_path = classification_path(db, ind.classification_id)
    data.source_standard_title = ind.source_standard.title if ind.source_standard else None
    return data


def suggestion_out(s: models.Suggestion) -> schemas.SuggestionOut:
    out = schemas.SuggestionOut.model_validate(s)
    out.submitter_name = s.submitter.display_name if s.submitter else None
    out.reviewer_name = s.reviewer.display_name if s.reviewer else None
    out.indicator_name = s.indicator.name_cn if s.indicator else (s.payload or {}).get("name_cn")
    return out


def build_tree(db: Session, parent_id: int | None = None) -> list[schemas.ClassificationNode]:
    rows = (db.query(models.Classification)
            .filter(models.Classification.parent_id == parent_id)
            .order_by(models.Classification.sort_order, models.Classification.id).all())
    return [schemas.ClassificationNode(id=r.id, name=r.name, level=r.level, parent_id=r.parent_id,
                                       sort_order=r.sort_order, children=build_tree(db, r.id)) for r in rows]


def audit(db: Session, actor_id: int | None, action: str, entity_type: str, entity_id: int | None, detail: dict | None = None):
    db.add(models.AuditLog(actor_id=actor_id, action=action, entity_type=entity_type,
                           entity_id=entity_id, detail=detail or {}))


def _class_label(db: Session, cid):
    if not cid:
        return ""
    c = db.get(models.Classification, cid)
    return c.name if c else f"#{cid}"


def _src_label(db: Session, sid):
    if not sid:
        return ""
    s = db.get(models.SourceStandard, sid)
    return s.title if s else f"#{sid}"


def change_detail(db: Session, ind, changes: dict) -> dict:
    """构造 {字段: {old, new}} 的变更详情。须在把变更写入 ind 之前调用。"""
    out = {}
    for k, new in changes.items():
        old = getattr(ind, k, None)
        if k == "classification_id":
            out[k] = {"old": _class_label(db, old), "new": _class_label(db, new)}
        elif k == "source_standard_id":
            out[k] = {"old": _src_label(db, old), "new": _src_label(db, new)}
        else:
            out[k] = {"old": "" if old is None else str(old), "new": "" if new is None else str(new)}
    return out
