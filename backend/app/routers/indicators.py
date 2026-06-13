"""指标读取与来源标准列表。指标的新增/修改/删除一律通过建议审核流（见 suggestions）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user
from ..models import Indicator, IndicatorStatus, SourceStandard, User
from ..schemas import IndicatorOut, SourceStandardOut
from ..utils import indicator_out

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
    return [indicator_out(db, i) for i in query.order_by(Indicator.identifier).all()]


@router.get("/indicators/{indicator_id}", response_model=IndicatorOut)
def get_indicator(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    ind = db.get(Indicator, indicator_id)
    if not ind:
        raise HTTPException(404, "指标不存在")
    return indicator_out(db, ind)


@router.get("/source-standards", response_model=list[SourceStandardOut], summary="来源标准/部分列表")
def list_sources(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(SourceStandard).order_by(SourceStandard.id).all()
