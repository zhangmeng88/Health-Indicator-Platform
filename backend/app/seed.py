"""首次启动播种：管理员账户、来源标准、示例分类与指标。"""
from sqlalchemy.orm import Session

from .config import settings
from .models import (User, Role, SourceStandard, Classification, Indicator, IndicatorStatus)
from .security import hash_password

SOURCE_TITLES = [
    "WS/T 598.1—2018 卫生统计指标 第1部分:总则",
    "WS/T 598.2—2018 卫生统计指标 第2部分:居民健康状况",
    "WS/T 598.3—2018 卫生统计指标 第3部分:健康影响因素",
    "WS/T 598.4—2018 卫生统计指标 第4部分:疾病控制",
    "WS/T 598.9—2018 卫生统计指标 第9部分:卫生资源",
]


def seed(db: Session):
    if db.query(User).count() > 0:
        return  # 已初始化

    # 管理员 + 示例专家
    db.add(User(username=settings.admin_username, display_name=settings.admin_name,
                role=Role.admin, password_hash=hash_password(settings.admin_password)))
    db.add(User(username="expert", display_name="示例专家", role=Role.expert,
                password_hash=hash_password("expert123")))

    sources = {t: SourceStandard(title=t) for t in SOURCE_TITLES}
    db.add_all(sources.values())
    db.flush()

    # 分类层级：卫生资源 / 居民健康状况
    res = Classification(name="卫生资源", level=1, sort_order=1); db.add(res); db.flush()
    hr = Classification(name="卫生人力", level=2, parent_id=res.id, sort_order=1)
    fund = Classification(name="卫生经费", level=2, parent_id=res.id, sort_order=2)
    fac = Classification(name="卫生设施", level=2, parent_id=res.id, sort_order=3)
    hs = Classification(name="居民健康状况", level=1, sort_order=2); db.add(hs); db.add_all([hr, fund, fac]); db.flush()
    mort = Classification(name="寿命与死亡", level=2, parent_id=hs.id, sort_order=1)
    db.add(mort); db.flush()

    S9 = sources[SOURCE_TITLES[4]].id
    S2 = sources[SOURCE_TITLES[1]].id
    rows = [
        dict(classification_id=hr.id, source_standard_id=S9, identifier="IHS06.01.001", name_cn="卫生人员数",
             name_en="Number of health personnel", unit="人",
             definition="报告期末在医疗卫生机构工作并由单位支付年底工资的在岗职工数之和……又称在岗职工数。",
             survey_method="全面调查", data_source="卫生统计直报系统", frequency="年度"),
        dict(classification_id=fund.id, source_standard_id=S9, identifier="IHS06.02.001", name_cn="卫生总费用",
             name_en="Total health expenditure", unit="亿元",
             definition="某年某地区用于医疗卫生保健服务的资金总量，包括政府卫生支出、社会卫生支出和个人现金卫生支出。",
             survey_method="核算", data_source="卫生总费用核算", frequency="年度"),
        dict(classification_id=fac.id, source_standard_id=S9, identifier="IHS06.03.005", name_cn="每千人口医疗卫生机构床位数",
             name_en="Number of health institution beds per 1000 population", unit="张",
             definition="指年末每千人口拥有的医疗卫生机构床位数", method="年末医疗卫生机构床位数／年末常住人口数×1000",
             survey_method="全面调查", data_source="卫生统计直报系统", frequency="年度"),
        dict(classification_id=mort.id, source_standard_id=S2, identifier="IHS01.01.001", name_cn="人均预期寿命",
             name_en="Life expectancy at birth", unit="岁",
             definition="某年某地区新出生的婴儿预期存活的平均年数", survey_method="全面调查",
             data_source="人口普查，人口死亡信息登记系统", frequency="年度"),
    ]
    db.add_all([Indicator(status=IndicatorStatus.active, **r) for r in rows])
    db.commit()
