"""Normalize a saved Overpass response. No geocoding or invented facility data."""
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
raw = json.loads((ROOT / 'data/osm-source.json').read_text(encoding='utf-8'))
facilities = []
for item in raw['elements']:
    tags = item.get('tags', {})
    if tags.get('highway') == 'elevator':
        kind = 'elevator'
    elif tags.get('amenity') == 'toilets':
        kind = 'toilet'
    elif tags.get('ramp') == 'yes':
        kind = 'ramp'
    elif tags.get('wheelchair') == 'yes' and (tags.get('name:ko') or tags.get('name')):
        # Stop positions/platforms repeat the same station; only retain the station feature.
        if tags.get('public_transport') in ('stop_position', 'platform') or tags.get('railway') in ('stop', 'platform'):
            continue
        kind = 'place'
    else:
        continue
    point = item if 'lat' in item else item.get('center', {})
    lat, lng = point.get('lat'), point.get('lon')
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        continue
    labels = {'elevator': '엘리베이터', 'toilet': '화장실', 'ramp': '경사로 포함 통로', 'place': '시설'}
    name = tags.get('name:ko') or tags.get('name')
    facilities.append({
        'id': f"{item['type']}/{item['id']}", 'type': kind,
        'name': name or f"이름 미등록 {labels[kind]}", 'named': bool(name),
        'lat': lat, 'lng': lng, 'coordinateType': 'point' if 'lat' in item else 'center',
        'wheelchair': tags.get('wheelchair', 'unknown'),
        'address': tags.get('addr:full') or ' '.join(filter(None, [tags.get('addr:city'), tags.get('addr:district'), tags.get('addr:street'), tags.get('addr:housenumber')])),
        'openingHours': tags.get('opening_hours', ''), 'access': tags.get('access', ''),
        'level': tags.get('level', ''), 'highway': tags.get('highway', ''),
        'phone': tags.get('contact:phone') or tags.get('phone', ''),
        'toiletsWheelchair': tags.get('toilets:wheelchair', ''),
        'checkDate': tags.get('check_date:wheelchair') or tags.get('check_date', ''),
        'sourceUrl': f"https://www.openstreetmap.org/{item['type']}/{item['id']}",
    })
data = {'region': '대전광역시 서구', 'source': 'OpenStreetMap contributors',
        'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'dataAsOf': raw['osm3s']['timestamp_osm_base'],
        'collectedAt': datetime.now(timezone.utc).isoformat(), 'facilities': facilities}
(ROOT / 'data/facilities.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# A classic script also works when opening index.html directly without an HTTP server.
(ROOT / 'data/facilities.js').write_text('window.MODUGIL_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
from collections import Counter
print('Facilities:', len(facilities), dict(Counter(f['type'] for f in facilities)))
