"""上传导入：管理员上传主表 .xlsx，服务端解析并批量导入。"""
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import require_admin
from ..models import User
from ..importer import run_import

router = APIRouter(prefix="/import", tags=["导入"])


@router.post("/xlsx", summary="上传主表 xlsx 批量导入（管理员）")
async def import_xlsx(
    file: UploadFile = File(...),
    update: bool = False,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "请上传 .xlsx 文件")
    data = await file.read()
    if not data:
        raise HTTPException(400, "文件为空")
    try:
        result = run_import(db, BytesIO(data), update=update)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # 解析失败等
        raise HTTPException(400, f"导入失败：{e}")
    return result
