"""Pydantic 模型（请求体 / 响应体）。"""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, field_validator

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
class ReorderBody(BaseModel):
    ordered_ids: list[int]


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
    stratification: str = ""
    source_tags: list[str] = []
    source_other: str = ""
    indicator_type: str = ""
    classification_id: Optional[int] = None
    source_standard_id: Optional[int] = None

    @field_validator("identifier", "name_en", "unit", "definition", "method", "description",
                     "survey_method", "data_source", "frequency", "stratification", "source_other",
                     "indicator_type", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return "" if v is None else v

    @field_validator("source_tags", mode="before")
    @classmethod
    def _none_to_list(cls, v):
        return [] if v is None else v


class IndicatorCreate(IndicatorBase):
    pass


class IndicatorUpdate(BaseModel):
    identifier: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    unit: Optional[str] = None
    definition: Optional[str] = None
    method: Optional[str] = None
    description: Optional[str] = None
    survey_method: Optional[str] = None
    data_source: Optional[str] = None
    frequency: Optional[str] = None
    stratification: Optional[str] = None
    source_tags: Optional[list[str]] = None
    source_other: Optional[str] = None
    indicator_type: Optional[str] = None
    classification_id: Optional[int] = None
    source_standard_id: Optional[int] = None


class IndicatorOut(IndicatorBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: IndicatorStatus
    version: int
    classification_path: list[str] = []
    source_standard_title: Optional[str] = None
    change_type: Optional[str] = None
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


# ---------- 修改历史 ----------
class HistoryEntry(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    actor_name: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    indicator_name: Optional[str] = None
    detail: Optional[Any] = None


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


class VersionCreate(BaseModel):
    label: str
    note: str = ""


class VersionOut(BaseModel):
    id: int
    label: str
    note: str = ""
    indicator_count: int = 0
    creator_name: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
