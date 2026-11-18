"""Generate WGS84 feature references from pinned Natural Earth ZIPs (pip install pyshp)."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import shapefile

LAYERS = [
    ("10m_cultural/ne_10m_populated_places", "cd149186f03d2603e0410da399b980a4357d0ac32d3a2305a49ed3dffcc41d7b"),
    ("10m_physical/ne_10m_rivers_lake_centerlines", "ded71b01870855ccfe19b51f2ec14c9bb48fae23c0e9f3c11974d426433b5c38"),
    ("110m_physical/ne_110m_rivers_lake_centerlines", "1a010128c0801de738307eda7fd0ad3533a5985bc7e223c6640bdd749495f655"),
]
CENTERS = """北京 北京
天津 天津
河北 石家庄
山西 太原
内蒙古 呼和浩特
辽宁 沈阳
吉林 长春
黑龙江 哈尔滨
上海 上海
江苏 南京
浙江 杭州
安徽 合肥
福建 福州
江西 南昌
山东 济南
河南 郑州
湖北 武汉
湖南 长沙
广东 广州
广西 南宁
重庆 重庆
四川 成都
贵州 贵阳
云南 昆明
西藏 拉萨
陕西 西安
甘肃 兰州
青海 西宁
宁夏 银川
新疆 乌鲁木齐
香港 香港
澳门 澳门"""


def load(layer, checksum, directory):
    file = directory / (layer.split("/")[-1] + ".zip")
    if not file.exists():
        urlretrieve(f"https://naturalearth.s3.amazonaws.com/{layer}.zip", file)
    if hashlib.sha256(file.read_bytes()).hexdigest() != checksum:
        raise ValueError(f"Checksum mismatch: {file}")
    return shapefile.Reader(str(file))


def trace(reader, plan):
    points = []
    for feature, part, reverse in plan:
        shape = reader.shape(feature)
        bounds = [*shape.parts, len(shape.points)]
        segment = shape.points[bounds[part]:bounds[part + 1]]
        if reverse:
            segment.reverse()
        assert not points or max(abs(a-b) for a, b in zip(points[-1], segment[0])) < .008
        points.extend(segment[1:] if points and points[-1] == segment[0] else segment)
    return points


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    places, rivers, lowres = [load(*layer, args.cache) for layer in LAYERS]
    eligible = [
        row for row in places.iterShapeRecords()
        if row.record.ADM0NAME in {"China", "Hong Kong S.A.R.", "Macau S.A.R"}
    ]
    cities = []
    for pair in CENTERS.splitlines():
        region, city = pair.split()
        matches = [
            row for row in eligible if row.record.NAME_ZH == city
        ]
        assert len(matches) == 1, city
        row = matches[0]
        cities.append(dict(region=region, city=city, name=row.record.NAME,
                           sourceId=row.record.NE_ID, point=row.shape.points[0]))
    assert len(cities) == 32
    yangtze = trace(rivers, [(756,0,False), (758,0,False), (760,0,False),
                            (760,1,False), (763,0,False), (763,1,True),
                            (745,1,True), (745,2,False)])
    delta = next(row.shape.points for row in lowres.iterShapeRecords()
                 if row.record.as_dict()['ne_id'] == 1159113707)
    assert len(delta) == 109 and delta[105][0] > yangtze[-1][0] > delta[104][0]
    yangtze.extend(delta[105:])
    yellow = trace(rivers, [(696,0,False), (695,1,False), (696,2,True),
                           (695,0,False), (696,1,False), (720,1,True),
                           (720,0,False)])
    output = Path(__file__).resolve().parents[1] / "data/china-feature-reference.json"
    output.write_text(json.dumps(dict(version="natural-earth-features-1", cities=cities,
                                      rivers=dict(YANGTZE=yangtze, YELLOW=yellow)),
                                 ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(cities)} cities; Yangtze {len(yangtze)}, Yellow {len(yellow)} vertices")


if __name__ == "__main__":
    main()
