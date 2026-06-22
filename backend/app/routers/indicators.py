"""指标读取与来源标准列表。指标的新增/修改/删除一律通过建议审核流（见 suggestions）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user, require_admin
from ..models import Indicator, IndicatorStatus, SourceStandard, User
from ..schemas import IndicatorOut, SourceStandardOut, IndicatorCreate, IndicatorUpdate, ReorderBody
from ..utils import indicator_out, audit, change_detail

router = APIRouter(tags=["指标"])


@router.get("/indicators", response_model=list[IndicatorOut], summary="指标列表（支持搜索/分类/状态筛选）")
def list_indicators(
    q: str | None = Query(None, description="按中文名称或标识符搜索"),
    classification_id: int | None = None,
    status: IndicatorStatus = IndicatorStatus.active,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    query = db.query(Indicator).filter(Indicator.status == status)
    if classification_id:
        query = query.filter(Indicator.classification_id == classification_id)
    if q:
        like = f"%{q}%"
        query = query.filter((Indicator.name_cn.like(like)) | (Indicator.identifier.like(like)))
    return [indicator_out(db, i) for i in query.order_by(Indicator.sort_order, Indicator.identifier).all()]


@router.post("/indicators/reorder", summary="调整分类内指标顺序（管理员，影响导出顺序）")
def reorder_indicators(body: ReorderBody, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    for i, iid in enumerate(body.ordered_ids):
        ind = db.get(Indicator, iid)
        if ind:
            ind.sort_order = i
    db.commit()
    return {"ok": True, "count": len(body.ordered_ids)}


@router.get("/indicators/{indicator_id}", response_model=IndicatorOut)
def get_indicator(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    ind = db.get(Indicator, indicator_id)
    if not ind:
        raise HTTPException(404, "指标不存在")
    return indicator_out(db, ind)


@router.get("/source-standards", response_model=list[SourceStandardOut], summary="来源标准/部分列表")
def list_sources(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(SourceStandard).order_by(SourceStandard.id).all()


# ---------- 管理员直接增改删（立即生效，不经审核） ----------

@router.post("/indicators", response_model=IndicatorOut, status_code=201, summary="新增指标（管理员，立即生效）")
def create_indicator(body: IndicatorCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ind = Indicator(status=IndicatorStatus.active, created_by=admin.id, **body.model_dump())
    db.add(ind); db.flush()
    audit(db, admin.id, "admin_create", "indicator", ind.id, {"name_cn": ind.name_cn})
    db.commit(); db.refresh(ind)
    return indicator_out(db, ind)


@router.patch("/indicators/{indicator_id}", response_model=IndicatorOut, summary="修改指标（管理员，立即生效）")
def update_indicator(indicator_id: int, body: IndicatorUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ind = db.get(Indicator, indicator_id)
    if not ind:
        raise HTTPException(404, "指标不存在")
    changes = body.model_dump(exclude_unset=True)
    detail = change_detail(db, ind, changes)            # 在应用前记录旧值→新值
    for k, v in changes.items():
        setattr(ind, k, v)
    if changes:
        ind.version = (ind.version or 1) + 1
    audit(db, admin.id, "admin_update", "indicator", ind.id, {"name_cn": ind.name_cn, "changes": detail})
    db.commit(); db.refresh(ind)
    return indicator_out(db, ind)


@router.delete("/indicators/{indicator_id}", status_code=204, summary="删除指标（管理员，软删除立即生效）")
def delete_indicator(indicator_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ind = db.get(Indicator, indicator_id)
    if not ind:
        raise HTTPException(404, "指标不存在")
    ind.status = IndicatorStatus.deleted
    audit(db, admin.id, "admin_delete", "indicator", ind.id, {"name_cn": ind.name_cn})
    db.commit()
