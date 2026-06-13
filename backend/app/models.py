"""ORM 数据模型 —— 与现行标准的层级结构和元数据字段对应。

字段对照（标准列名 → 模型字段）：
  来源标准/部分 → indicator.source_standard
  一级/二级/三级分类 → classification 自引用树（level=1/2/3）
  标识符 → indicator.identifier
  中文名称 → indicator.name_cn
  英文名称 → indicator.name_en
  计量单位 → indicator.unit
  定义 → indicator.definition
  计算方法 → indicator.method
  指标说明 → indicator.description
  调查方法 → indicator.survey_method
  数据来源 → indicator.data_source
  发布频率 → indicator.frequency
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, JSON, func
)
from sqlalchemy.orm import relationship

from .database import Base


class Role(str, enum.Enum):
    admin = "admin"
    expert = "expert"


class IndicatorStatus(str, enum.Enum):
    active = "active"
    deleted = "deleted"


class SuggestionType(str, enum.Enum):
    add = "add"
    edit = "edit"
    delete = "delete"


class SuggestionStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Priority(str, enum.Enum):
    high = "high"   # 强烈推荐
    mid = "mid"     # 中度推荐


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(128), nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.expert)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())


class SourceStandard(Base):
    """来源标准/部分（如 WS/T 598.9—2018 第9部分:卫生资源）。"""
    __tablename__ = "source_standards"
    id = Column(Integer, primary_key=True)
    title = Column(String(255), unique=True, nullable=False)


class Classification(Base):
    """分类层级（自引用树，最多三级：一级/二级/三级分类）。"""
    __tablename__ = "classifications"
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("classifications.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(128), nullable=False)
    level = Column(Integer, nullable=False, default=1)        # 1/2/3
    sort_order = Column(Integer, nullable=False, default=0)
    children = relationship("Classification", cascade="all, delete-orphan",
                            backref="parent", remote_side=[id], single_parent=True)


class Indicator(Base):
    __tablename__ = "indicators"
    id = Column(Integer, primary_key=True)
    classification_id = Column(Integer, ForeignKey("classifications.id"), nullable=True, index=True)
    source_standard_id = Column(Integer, ForeignKey("source_standards.id"), nullable=True)

    identifier = Column(String(64), index=True)   # 标识符
    name_cn = Column(String(255), nullable=False)  # 中文名称
    name_en = Column(String(512), default="")      # 英文名称
    unit = Column(String(64), default="")          # 计量单位
    definition = Column(Text, default="")          # 定义
    method = Column(Text, default="")              # 计算方法
    description = Column(Text, default="")         # 指标说明
    survey_method = Column(String(128), default="")# 调查方法
    data_source = Column(String(255), default="")  # 数据来源
    frequency = Column(String(64), default="")     # 发布频率

    status = Column(Enum(IndicatorStatus), nullable=False, default=IndicatorStatus.active, index=True)
    version = Column(Integer, nullable=False, default=1)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    classification = relationship("Classification")
    source_standard = relationship("SourceStandard")


class Suggestion(Base):
    __tablename__ = "suggestions"
    id = Column(Integer, primary_key=True)
    type = Column(Enum(SuggestionType), nullable=False)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), nullable=True)  # add 时为空
    payload = Column(JSON, default=dict)   # 拟新增/修改的字段集合
    rationale = Column(Text, default="")   # 理由（新增推荐理由 / 修改理由 / 删除理由）
    priority = Column(Enum(Priority), nullable=True)  # 仅新增建议：强烈/中度推荐

    status = Column(Enum(SuggestionStatus), nullable=False, default=SuggestionStatus.pending, index=True)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    submitted_at = Column(DateTime, server_default=func.now())
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, default="")

    indicator = relationship("Indicator")
    submitter = relationship("User", foreign_keys=[submitted_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    author = relationship("User")


class AuditLog(Base):
    """审计日志：记录采纳/驳回、账户操作等关键动作。"""
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(64), nullable=False)
    entity_type = Column(String(64))
    entity_id = Column(Integer)
    detail = Column(JSON, default=dict)
    created_at = Column(DateTime, server_default=func.now())
