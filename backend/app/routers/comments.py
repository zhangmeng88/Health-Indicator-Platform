"""指标评论：读取与发布。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user
from ..models import Comment, Indicator, User
from ..schemas import CommentOut, CommentCreate

router = APIRouter(tags=["评论"])


@router.get("/indicators/{indicator_id}/comments", response_model=list[CommentOut])
def list_comments(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(Comment).filter(Comment.indicator_id == indicator_id).order_by(Comment.created_at.desc()).all()
    out = []
    for c in rows:
        o = CommentOut.model_validate(c); o.author_name = c.author.display_name if c.author else None
        out.append(o)
    return out


@router.post("/indicators/{indicator_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(indicator_id: int, body: CommentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Indicator, indicator_id):
        raise HTTPException(404, "指标不存在")
    c = Comment(indicator_id=indicator_id, author_id=user.id, body=body.body)
    db.add(c); db.commit(); db.refresh(c)
    o = CommentOut.model_validate(c); o.author_name = user.display_name
    return o
