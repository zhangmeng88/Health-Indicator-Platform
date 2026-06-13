"""鉴权路由：登录、获取当前用户。"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import authenticate, create_access_token, get_current_user
from ..schemas import Token, UserOut
from ..models import User

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login", response_model=Token, summary="登录获取令牌")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    return Token(access_token=create_access_token(user.username))


@router.get("/me", response_model=UserOut, summary="当前登录用户")
def me(user: User = Depends(get_current_user)):
    return user
