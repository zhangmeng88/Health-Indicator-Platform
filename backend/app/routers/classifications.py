"""分类层级（一级/二级/三级）：读取树、增改删（增改删仅管理员）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import get_current_user, require_admin
from ..models import Classification, Indicator, IndicatorStatus, User
from ..schemas import ClassificationNode, ClassificationCreate, ClassificationUpdate, ReorderBody
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


def _descendant_ids(db: Session, node_id: int) -> set[int]:
    out, stack = set(), [node_id]
    while stack:
        pid = stack.pop()
        for k in db.query(Classification).filter(Classification.parent_id == pid).all():
            out.add(k.id); stack.append(k.id)
    return out


def _subtree_height(db: Session, node_id: int) -> int:
    kids = db.query(Classification).filter(Classification.parent_id == node_id).all()
    return 1 + max((_subtree_height(db, k.id) for k in kids), default=-1) if kids else 0


def _set_levels(db: Session, node: Classification, level: int):
    node.level = level
    for k in db.query(Classification).filter(Classification.parent_id == node.id).all():
        _set_levels(db, k, level + 1)


@router.patch("/{node_id}", response_model=ClassificationNode)
def update_node(node_id: int, body: ClassificationUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    node = db.get(Classification, node_id)
    if not node:
        raise HTTPException(404, "分类不存在")
    data = body.model_dump(exclude_unset=True)
    data.pop("level", None)  # 级别由层级关系自动推导，不直接设置

    if "parent_id" in data:
        new_parent_id = data.pop("parent_id")
        if new_parent_id == node_id:
            raise HTTPException(400, "不能把分类移动到它自己之下")
        if new_parent_id is not None:
            if new_parent_id in _descendant_ids(db, node_id):
                raise HTTPException(400, "不能把分类移动到它自己的子分类之下")
            parent = db.get(Classification, new_parent_id)
            if not parent:
                raise HTTPException(404, "目标上级分类不存在")
            new_level = parent.level + 1
        else:
            new_level = 1
        if new_level + _subtree_height(db, node_id) > 3:
            raise HTTPException(400, "移动后层级将超过三级，请先调整其子分类")
        node.parent_id = new_parent_id
        _set_levels(db, node, new_level)   # 递归重算本节点及全部子孙的级别

    for k, v in data.items():
        setattr(node, k, v)
    audit(db, admin.id, "update_classification", "classification", node.id, {"name": node.name, "level": node.level})
    db.commit(); db.refresh(node)
    return ClassificationNode(id=node.id, name=node.name, level=node.level, parent_id=node.parent_id, sort_order=node.sort_order, children=[])


@router.post("/reorder", summary="调整同级分类顺序（管理员）")
def reorder_classifications(body: ReorderBody, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    for i, cid in enumerate(body.ordered_ids):
        n = db.get(Classification, cid)
        if n:
            n.sort_order = i
    db.commit()
    return {"ok": True, "count": len(body.ordered_ids)}


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
