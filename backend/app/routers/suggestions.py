"""建议工作流：专家提交（新增/修改/删除）建议，管理员采纳或驳回。

- 任何对指标的变更都先成为 pending 建议，审核通过后才落库生效；
- 采纳新增 → 创建指标；采纳修改 → 更新字段；采纳删除 → 标记 deleted。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user, require_admin
from ..models import (Suggestion, SuggestionType, SuggestionStatus, Indicator,
                      IndicatorStatus, User)
from ..schemas import SuggestionCreate, SuggestionOut, SuggestionReview
from ..utils import suggestion_out, audit, change_detail

router = APIRouter(prefix="/suggestions", tags=["建议审核"])

# 允许通过建议写入指标的字段白名单
INDICATOR_FIELDS = {"identifier", "name_cn", "name_en", "unit", "definition", "method",
                    "description", "survey_method", "data_source", "frequency",
                    "stratification", "source_tags", "source_other",
                    "classification_id", "source_standard_id"}


@router.get("", response_model=list[SuggestionOut], summary="建议列表（管理员可见全部）")
def list_suggestions(
    status: SuggestionStatus | None = None,
    type: SuggestionType | None = None,
    mine: bool = False,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    query = db.query(Suggestion)
    if mine or user.role.value != "admin":
        query = query.filter(Suggestion.submitted_by == user.id)
    if status:
        query = query.filter(Suggestion.status == status)
    if type:
        query = query.filter(Suggestion.type == type)
    rows = query.order_by(Suggestion.submitted_at.desc()).all()
    return [suggestion_out(s) for s in rows]


@router.post("", response_model=SuggestionOut, status_code=201, summary="提交建议")
def create_suggestion(body: SuggestionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.type in (SuggestionType.edit, SuggestionType.delete):
        if not body.indicator_id or not db.get(Indicator, body.indicator_id):
            raise HTTPException(400, "修改/删除建议必须指定有效的指标")
    if body.type == SuggestionType.add and not body.payload.get("name_cn"):
        raise HTTPException(400, "新增建议必须填写中文名称")
    s = Suggestion(type=body.type, indicator_id=body.indicator_id, payload=body.payload,
                   rationale=body.rationale, priority=body.priority, submitted_by=user.id)
    db.add(s); db.commit(); db.refresh(s)
    return suggestion_out(s)


def _apply(db: Session, s: Suggestion, admin: User):
    fields = {k: v for k, v in (s.payload or {}).items() if k in INDICATOR_FIELDS}
    if s.type == SuggestionType.add:
        ind = Indicator(created_by=admin.id, **fields)
        if not ind.name_cn:
            raise HTTPException(400, "建议内容缺少中文名称")
        db.add(ind); db.flush()
        audit(db, admin.id, "accept_add", "indicator", ind.id, {"suggestion": s.id, "name_cn": ind.name_cn})
    elif s.type == SuggestionType.edit:
        ind = db.get(Indicator, s.indicator_id)
        if not ind:
            raise HTTPException(404, "目标指标不存在")
        detail = change_detail(db, ind, fields)            # 记录旧值→新值
        for k, v in fields.items():
            setattr(ind, k, v)
        ind.version += 1
        audit(db, admin.id, "accept_edit", "indicator", ind.id,
              {"suggestion": s.id, "name_cn": ind.name_cn, "changes": detail})
    elif s.type == SuggestionType.delete:
        ind = db.get(Indicator, s.indicator_id)
        if ind:
            ind.status = IndicatorStatus.deleted
            audit(db, admin.id, "accept_delete", "indicator", ind.id, {"suggestion": s.id, "name_cn": ind.name_cn})


@router.post("/{sug_id}/accept", response_model=SuggestionOut, summary="采纳建议（管理员）")
def accept(sug_id: int, body: SuggestionReview, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    s = db.get(Suggestion, sug_id)
    if not s:
        raise HTTPException(404, "建议不存在")
    if s.status != SuggestionStatus.pending:
        raise HTTPException(400, "该建议已审核")
    _apply(db, s, admin)
    s.status = SuggestionStatus.accepted
    s.reviewed_by = admin.id
    s.reviewed_at = datetime.now(timezone.utc)
    s.review_note = body.review_note
    db.commit(); db.refresh(s)
    return suggestion_out(s)


@router.post("/{sug_id}/reject", response_model=SuggestionOut, summary="驳回建议（管理员）")
def reject(sug_id: int, body: SuggestionReview, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    s = db.get(Suggestion, sug_id)
    if not s:
        raise HTTPException(404, "建议不存在")
    if s.status != SuggestionStatus.pending:
        raise HTTPException(400, "该建议已审核")
    s.status = SuggestionStatus.rejected
    s.reviewed_by = admin.id
    s.reviewed_at = datetime.now(timezone.utc)
    s.review_note = body.review_note
    audit(db, admin.id, "reject", "suggestion", s.id, {})
    db.commit(); db.refresh(s)
    return suggestion_out(s)
