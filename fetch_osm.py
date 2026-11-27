import json
import urllib.parse
import urllib.request
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent

QUERY = '''[out:json][timeout:40];
area["name"="대전광역시"]["boundary"="administrative"]->.city;
rel(area.city)["name"="서구"]["boundary"="administrative"];
map_to_area->.district;
(nwr(area.district)["highway"="elevator"];
nwr(area.district)["amenity"="toilets"];
nwr(area.district)["ramp"="yes"];
nwr(area.district)["wheelchair"="yes"];);
out center tags;'''
request = urllib.request.Request('https://overpass-api.de/api/interpreter',
    data=urllib.parse.urlencode({'data': QUERY}).encode(),
    headers={'User-Agent': 'Modugil-v2/2.0 (accessibility student project)'})
with urllib.request.urlopen(request, timeout=55) as response:
    data = json.load(response)
if data.get('remark') or not data.get('elements'):
    raise RuntimeError('Incomplete or empty response; existing data was preserved.')
(ROOT / 'data').mkdir(exist_ok=True)
(ROOT / 'data/osm-source.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print('OSM elements:', len(data.get('elements', [])))
subprocess.run([sys.executable, str(ROOT / 'scripts/build-data.py')], check=True)
