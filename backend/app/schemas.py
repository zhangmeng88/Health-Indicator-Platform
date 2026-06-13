"""Pydantic 模型（请求体 / 响应体）。"""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict

from .models import Role, SuggestionType, SuggestionStatus, Priority, IndicatorStatus


# ---------- Auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    role: Role
    is_active: bool


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: Optional[str] = None      # 留空则用默认初始密码
    role: Role = Role.expert


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[Role] = None


class PasswordReset(BaseModel):
    new_password: str


# ---------- Classification ----------
class ClassificationCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    sort_order: int = 0


class ClassificationUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class ClassificationNode(BaseModel):
    id: int
    name: str
    level: int
    parent_id: Optional[int]
    sort_order: int
    children: list["ClassificationNode"] = []


# ---------- Source standard ----------
class SourceStandardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str


# ---------- Indicator ----------
class IndicatorBase(BaseModel):
    identifier: str = ""
    name_cn: str
    name_en: str = ""
    unit: str = ""
    definition: str = ""
    method: str = ""
    description: str = ""
    survey_method: str = ""
    data_source: str = ""
    frequency: str = ""
    classification_id: Optional[int] = None
    source_standard_id: Optional[int] = None


class IndicatorCreate(IndicatorBase):
    pass


class IndicatorOut(IndicatorBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: IndicatorStatus
    version: int
    classification_path: list[str] = []
    source_standard_title: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------- Suggestion ----------
class SuggestionCreate(BaseModel):
    type: SuggestionType
    indicator_id: Optional[int] = None          # edit/delete 必填，add 留空
    payload: dict[str, Any] = {}                # 字段集合（add：全字段；edit：仅变更字段）
    rationale: str = ""
    priority: Optional[Priority] = None          # 仅 add


class SuggestionReview(BaseModel):
    review_note: str = ""


class SuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: SuggestionType
    indicator_id: Optional[int]
    payload: dict[str, Any]
    rationale: str
    priority: Optional[Priority]
    status: SuggestionStatus
    submitted_by: int
    submitter_name: Optional[str] = None
    submitted_at: Optional[datetime]
    reviewed_by: Optional[int]
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime]
    review_note: str
    indicator_name: Optional[str] = None


# ---------- Comment ----------
class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    indicator_id: int
    author_id: int
    author_name: Optional[str] = None
    body: str
    created_at: Optional[datetime]


ClassificationNode.model_rebuild()
