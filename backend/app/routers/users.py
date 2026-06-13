"""专家账户管理（仅管理员）：创建、更新、重置密码、删除。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import require_admin, hash_password
from ..models import User, Role
from ..schemas import UserOut, UserCreate, UserUpdate, PasswordReset
from ..utils import audit

router = APIRouter(prefix="/users", tags=["专家账户"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, "用户名已存在")
    user = User(username=body.username, display_name=body.display_name, role=body.role,
                password_hash=hash_password(body.password or "123456"))
    db.add(user); db.flush()
    audit(db, admin.id, "create_user", "user", user.id, {"username": user.username})
    db.commit(); db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit(); db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", status_code=204)
def reset_password(user_id: int, body: PasswordReset, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    user.password_hash = hash_password(body.new_password)
    audit(db, admin.id, "reset_password", "user", user.id, {})
    db.commit()


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.role == Role.admin:
        raise HTTPException(400, "不可删除管理员账户")
    db.delete(user); db.commit()
