'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const dataset = window.MODUGIL_DATA;
  if (!dataset || !Array.isArray(dataset.facilities)) {
    $('message').textContent = '시설 데이터를 불러오지 못했습니다. data 폴더가 함께 업로드되었는지 확인해 주세요.';
    $('total-count').textContent = '데이터 오류';
    $('locate').disabled = true;
    return;
  }
  const facilities = dataset.facilities;
  const kinds = {elevator:'엘리베이터', toilet:'화장실', ramp:'경사로 포함 통로', place:'휠체어 접근 시설'};
  const symbols = {elevator:'엘', toilet:'화', ramp:'경', place:'휠'};
  const defaultOrigin = {lat:36.3504, lng:127.3845};
  let origin = {...defaultOrigin}, located = false, filter = 'all', selected = null;
  let map, markers, userMarker;
  const storageKey = 'modugil-v2-local-memos';
  const ttl = 24 * 60 * 60 * 1000, cooldown = 5 * 60 * 1000;
  let reports = {};
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) reports = value;
  } catch { $('message').textContent = '이 브라우저에서 저장된 메모를 읽지 못했어요. 시설 검색은 사용할 수 있어요.'; }
  function memo(f) {
    const t = reports[f.id];
    return Number.isFinite(t) && t <= Date.now() && Date.now() - t < ttl ? t : null;
  }
  function accessible(f) { return f.wheelchair === 'yes' || (f.type === 'toilet' && f.toiletsWheelchair === 'yes'); }
  function accessText(f) {
    if (f.type === 'toilet' && f.toiletsWheelchair === 'yes') return '장애인 화장실 있음으로 등록';
    return ({yes:'휠체어 이용 가능으로 등록', limited:'휠체어 이용에 제한 있음으로 등록', no:'휠체어 이용 불가로 등록'})[f.wheelchair] || '휠체어 이용 정보 미등록';
  }
  function distance(f) {
    const rad = n => n * Math.PI / 180;
    const a = Math.sin(rad(f.lat-origin.lat)/2)**2 + Math.cos(rad(origin.lat))*Math.cos(rad(f.lat))*Math.sin(rad(f.lng-origin.lng)/2)**2;
    return 6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));
  }
  function distanceText(f) { const d=distance(f); return d<1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(1)}km`; }
  function node(tag, text, className) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(className)e.className=className; return e; }
  function render() {
    const q=$('search').value.trim().toLocaleLowerCase();
    const visible=facilities.filter(f=>(filter==='all'||f.type===filter)&&(!$('accessible-only').checked||accessible(f))&&`${f.name} ${f.address} ${f.id}`.toLocaleLowerCase().includes(q)).sort((a,b)=>distance(a)-distance(b));
    $('result-count').textContent=`${visible.length}개 지점`;
    $('list').replaceChildren();
    $('empty').hidden=visible.length>0;
    markers?.clearLayers();
    for(const f of visible) {
      const card=node('li',undefined,'facility');
      const top=node('div',undefined,'facility-top');
      top.append(node('span',kinds[f.type],'badge'),node('span',`직선 ${distanceText(f)}`,'distance'));
      const status=node('p',accessText(f),accessible(f)?'access-yes':f.wheelchair==='no'?'access-no':'');
      card.append(top,node('h3',f.name),node('p',f.address||`주소 미등록 · OSM ${f.id}`),status);
      if(f.highway==='steps')card.append(node('p','계단에 경사로가 포함된 구조 · 현장 확인 필요','access-no'));
      if(memo(f))card.append(node('p','내 기기에 고장 의심 메모 있음','memo'));
      const bottom=node('div',undefined,'facility-bottom'), button=node('button','상세 보기');
      button.type='button'; button.setAttribute('aria-label',`${f.name} ${f.id} 상세 보기`); button.onclick=()=>openDetail(f);
      bottom.append(node('small',f.coordinateType==='center'?'건물·통로 대표 좌표':'등록 지점 좌표'),button);card.append(bottom);$('list').append(card);
      if(map) {
        const mark=L.marker([f.lat,f.lng],{icon:L.divIcon({className:`pin ${f.type}${memo(f)?' memo':''}`,html:`<span>${memo(f)?'!':symbols[f.type]}</span>`,iconSize:[34,34],iconAnchor:[17,17]}),title:`${f.name} · ${accessText(f)}`,alt:f.name}).addTo(markers);
        mark.bindTooltip(node('span',f.name));mark.on('click',()=>openDetail(f));
      }
    }
    if(selected)updateDetail();
  }
  function updateDetail() {
    const f=selected;
    $('detail-type').textContent=kinds[f.type];$('detail-title').textContent=f.name;
    $('detail-id').textContent=`OpenStreetMap · ${f.id}`;$('detail-access').textContent=accessText(f);
    const access={private:'사유 시설 · 출입 허가 필요',customers:'이용 고객만',permissive:'소유자의 허용에 따른 출입',yes:'출입 가능으로 등록',no:'출입 불가로 등록'};
    const fields=[['주소',f.address||'미등록'],['출입 조건',access[f.access]||f.access||'미등록 · 방문 전 확인'],['운영시간',f.openingHours||'미등록'],['층 정보',f.level||'미등록'],['등록 좌표',`${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}`],['거리',`${distanceText(f)} · 직선거리`],['원본 점검일',f.checkDate||'미등록'],['데이터 기준',new Date(dataset.dataAsOf).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})]];
    if(f.highway==='steps')fields.push(['통로 구조','계단에 경사로 포함 · 단차 없는 이동 보장 안 됨']);
    $('detail-fields').replaceChildren(...fields.flatMap(([k,v])=>[node('dt',k),node('dd',v)]));
    $('coordinate-note').textContent=f.coordinateType==='center'?'건물·통로의 대표 좌표입니다. 실제 출입구·승강기 위치와 다를 수 있습니다.':'지도에 등록된 지점입니다. 실제 출입구와 접근 경로, 현재 이용 가능 여부는 현장에서 확인해 주세요.';
    $('source-link').href=f.sourceUrl;
    $('external-map').href=`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=19/${f.lat}/${f.lng}`;
    const phone=f.phone.replace(/[^+\d-]/g,'');$('phone-link').hidden=!phone;
    if(phone)$('phone-link').href=`tel:${phone}`;
    $('report-area').hidden=f.type!=='elevator';$('delete-report').hidden=!memo(f);
    const timestamp=memo(f);
    $('report-message').textContent=timestamp?`내 기기 메모: ${new Date(timestamp).toLocaleString('ko-KR')} · 현재 고장 여부는 확인되지 않았습니다.`:'내 기기에 최근 고장 메모가 없습니다. 정상 작동 확인을 뜻하지 않습니다.';
  }
  function openDetail(f) { selected=f;updateDetail();if(!$('detail').open)$('detail').showModal(); }
  $('close').onclick=()=>$('detail').close();$('detail').addEventListener('close',()=>{selected=null;});
  $('report').onclick=()=>{
    if(!selected||selected.type!=='elevator')return;
    const previous=memo(selected);
    if(previous&&Date.now()-previous<cooldown){$('report-message').textContent='이미 메모했어요. 같은 시설은 5분 뒤 다시 메모할 수 있어요.';return;}
    const next={...reports,[selected.id]:Date.now()};
    try{localStorage.setItem(storageKey,JSON.stringify(next));reports=next;render();}catch{$('report-message').textContent='저장하지 못했어요. 브라우저 저장소 설정을 확인해 주세요.';}
  };
  $('delete-report').onclick=()=>{if(!selected)return;const next={...reports};delete next[selected.id];try{localStorage.setItem(storageKey,JSON.stringify(next));reports=next;render();}catch{$('report-message').textContent='메모를 삭제하지 못했어요.';}};
  document.querySelectorAll('[data-filter]').forEach(button=>{button.querySelector('span').textContent=button.dataset.filter==='all'?facilities.length:facilities.filter(f=>f.type===button.dataset.filter).length;button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();};});
  $('search').addEventListener('input',render);$('accessible-only').onchange=render;
  $('clear-filters').onclick=()=>{$('search').value='';$('accessible-only').checked=false;document.querySelector('[data-filter="all"]').click();};
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{$('workspace').classList.toggle('list-only',button.dataset.view==='list');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(button.dataset.view==='both')setTimeout(()=>map?.invalidateSize(),0);});
  function updateOrigin(){$('origin-label').textContent=`거리 기준: ${located?'내 위치':'대전시청 주변'} · 직선거리`;$('reset-origin').hidden=!located;render();}
  $('reset-origin').onclick=()=>{origin={...defaultOrigin};located=false;if(userMarker){userMarker.remove();userMarker=null;}map?.setView([origin.lat,origin.lng],13);updateOrigin();};
  $('locate').onclick=()=>{
    if(!navigator.geolocation){$('message').textContent='현재 위치를 지원하지 않는 브라우저예요.';return;}
    $('locate').disabled=true;$('message').textContent='위치 확인 중입니다. 위치는 시설 검색 거리 계산에만 사용해요.';
    navigator.geolocation.getCurrentPosition(position=>{
      $('locate').disabled=false;origin={lat:position.coords.latitude,lng:position.coords.longitude};located=true;
      if(map){userMarker?.remove();userMarker=L.circleMarker([origin.lat,origin.lng],{radius:8,color:'#fff',weight:3,fillColor:'#2878d0',fillOpacity:1}).addTo(map).bindTooltip('내 위치');map.setView([origin.lat,origin.lng],14);}
      $('message').textContent=distance(defaultOrigin)>25000?'현재 위치가 대전 서구에서 멀리 떨어져 있어요. 수록 시설은 대전 서구로 한정됩니다.':'내 위치 기준으로 가까운 순서를 표시했어요.';updateOrigin();
    },error=>{$('locate').disabled=false;$('message').textContent=error.code===1?'위치 권한이 허용되지 않았어요. 기존 거리 기준으로 시설을 표시합니다.':'위치를 확인하지 못했어요. HTTPS 연결과 위치 설정을 확인해 주세요.';},{timeout:10000,maximumAge:60000});
  };
  $('total-count').textContent=`${facilities.length}개 지점`;
  const date=new Date(dataset.dataAsOf).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
  $('data-date').textContent=`데이터 기준 ${date}`;$('source-date').textContent=`지도 데이터 기준: ${date} · 수집본을 표시하며 자동으로 갱신되지 않습니다.`;
  if(window.L){
    map=L.map('map').setView([defaultOrigin.lat,defaultOrigin.lng],13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ODbL'}).on('tileerror',()=>{$('map-note').textContent='지도 배경을 불러오지 못했어요. 목록과 원본 링크에서 시설 정보를 확인할 수 있어요.';}).addTo(map);
    markers=L.layerGroup().addTo(map);
  }else{$('map-note').textContent='지도 라이브러리를 불러오지 못했어요. 목록에서 시설을 확인할 수 있어요.';document.querySelector('[data-view="list"]').click();$('message').textContent='지도를 불러오지 못해 목록으로 표시합니다. 인터넷 연결을 확인해 주세요.';}
  render();setInterval(render,60000);
})();
