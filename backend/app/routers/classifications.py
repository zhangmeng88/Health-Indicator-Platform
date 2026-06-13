"""分类层级（一级/二级/三级）：读取树、增改删（增改删仅管理员）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user, require_admin
from ..models import Classification, Indicator, IndicatorStatus, User
from ..schemas import ClassificationNode, ClassificationCreate, ClassificationUpdate
from ..utils import build_tree, audit

router = APIRouter(prefix="/classifications", tags=["分类层级"])


@router.get("", response_model=list[ClassificationNode], summary="获取分类树")
def get_tree(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return build_tree(db, None)


def _level_of(db: Session, parent_id: int | None) -> int:
    if parent_id is None:
        return 1
    parent = db.get(Classification, parent_id)
    if not parent:
        raise HTTPException(404, "父级分类不存在")
    if parent.level >= 3:
        raise HTTPException(400, "分类层级最多三级")
    return parent.level + 1


@router.post("", response_model=ClassificationNode, status_code=201)
def create_node(body: ClassificationCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    level = _level_of(db, body.parent_id)
    node = Classification(name=body.name, parent_id=body.parent_id, level=level, sort_order=body.sort_order)
    db.add(node); db.flush()
    audit(db, admin.id, "create_classification", "classification", node.id, {"name": node.name, "level": level})
    db.commit(); db.refresh(node)
    return ClassificationNode(id=node.id, name=node.name, level=node.level, parent_id=node.parent_id, sort_order=node.sort_order, children=[])


@router.patch("/{node_id}", response_model=ClassificationNode)
def update_node(node_id: int, body: ClassificationUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    node = db.get(Classification, node_id)
    if not node:
        raise HTTPException(404, "分类不存在")
    data = body.model_dump(exclude_unset=True)
    if "parent_id" in data:
        node.level = _level_of(db, data["parent_id"])
    for k, v in data.items():
        setattr(node, k, v)
    db.commit(); db.refresh(node)
    return ClassificationNode(id=node.id, name=node.name, level=node.level, parent_id=node.parent_id, sort_order=node.sort_order, children=[])


@router.delete("/{node_id}", status_code=204)
def delete_node(node_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    node = db.get(Classification, node_id)
    if not node:
        raise HTTPException(404, "分类不存在")
    cnt = db.query(Indicator).filter(Indicator.classification_id == node_id,
                                     Indicator.status == IndicatorStatus.active).count()
    if cnt > 0:
        raise HTTPException(400, "该分类下仍有指标，无法删除")
    if db.query(Classification).filter(Classification.parent_id == node_id).count() > 0:
        raise HTTPException(400, "请先删除子分类")
    db.delete(node); db.commit()
