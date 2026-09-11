#!/usr/bin/env python3
"""Read-only monitoring of existing public source URLs. Stdlib only.
An HTTP 200, matching hash or new text is NOT a legal review or a grade.
No student data, no Firebase, no credentials, no publication; proposals only.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, ipaddress, json, re, socket, urllib.parse, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MAX_BYTES=2_000_000
class SourceText(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True);self.skip=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def extract_text(blob:bytes,content_type:str)->str:
    match=re.search(r'charset=([\w-]+)',content_type,re.I)
    charset=match.group(1) if match else 'utf-8'
    try:raw=blob.decode(charset)
    except (LookupError,UnicodeDecodeError):raw=blob.decode('windows-1251',errors='replace')
    if 'html' in content_type:
        parser=SourceText();parser.feed(raw);raw=' '.join(parser.parts)
    return re.sub(r'\s+',' ',raw).strip()

def valid_url(url:str,allowed_hosts:set[str],resolve=False)->bool:
    try:
        u=urllib.parse.urlsplit(url);host=u.hostname or ''
        if u.scheme not in ('https','http') or u.username or u.password or u.port not in (None,80,443) or host not in allowed_hosts or len(url)>2048:return False
        if host.endswith(('.local','.localhost')) or host=='localhost':return False
        try:ipaddress.ip_address(host);return False
        except ValueError:pass
        if resolve:
            addresses=socket.getaddrinfo(host,u.port or (443 if u.scheme=='https' else 80),type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):return False
        return True
    except (ValueError,OSError):return False

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self,hosts):self.hosts=hosts
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        newurl=urllib.parse.urljoin(req.full_url,newurl)
        if not valid_url(newurl,self.hosts,resolve=True):raise ValueError('redirect-blocked')
        if urllib.parse.urlsplit(req.full_url).scheme=='https' and urllib.parse.urlsplit(newurl).scheme!='https':raise ValueError('redirect-blocked')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def compare_observation(url,blob,content_type,previous=None):
    digest=hashlib.sha256(blob).hexdigest()
    if not any(x in content_type.lower() for x in ('text/html','text/plain','application/xhtml+xml','application/json')):
        return {'url':url,'status':'unreadable','rawSHA256':digest,'note':'Тип материала не разбирается; правовой вывод не сделан.'}
    text=extract_text(blob,content_type)
    if len(text)<120:return {'url':url,'status':'unreadable','rawSHA256':digest,'note':'Текст отсутствует или слишком короток.'}
    if re.search(r'captcha|access denied|доступ (?:к сайту )?ограничен|подтвердите.{0,30}не робот',text,re.I):return {'url':url,'status':'blocked','rawSHA256':digest,'note':'Страница ограничения доступа, не источник.'}
    text_hash=hashlib.sha256(text.encode()).hexdigest()
    old=(previous or {}).get('textSHA256') or (previous or {}).get('lastGood',{}).get('textSHA256')
    status='available-first-seen' if not old else 'unchanged' if old==text_hash else 'text-changed'
    return {'url':url,'status':status,'rawSHA256':digest,'textSHA256':text_hash,'characters':len(text),'note':'Сравнение текста всей страницы, включая навигацию. Изменение требует предметного сопоставления; это не подтверждение изменения нормы.'}

def probe(url,allowed_hosts,previous=None,timeout=10):
    at=dt.datetime.now(dt.timezone.utc).isoformat()
    if not valid_url(url,allowed_hosts,resolve=True):return {'url':url,'status':'blocked','observedAt':at,'note':'Адрес не разрешён политикой мониторинга.'}
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'RUDN-Reception-SourceAudit/0.17 (read-only educational source monitoring)','Accept':'text/html,text/plain,application/json'})
        with urllib.request.build_opener(SafeRedirect(allowed_hosts)).open(req,timeout=timeout) as response:
            blob=response.read(MAX_BYTES+1);kind=response.headers.get('Content-Type','')
            result={'url':url,'status':'too-large'} if len(blob)>MAX_BYTES else compare_observation(url,blob,kind,previous)
            result.update({'observedAt':at,'httpStatus':response.status,'contentType':kind,'finalUrl':response.url})
    except ValueError as error:result={'url':url,'status':'redirect-blocked','observedAt':at,'note':str(error)}
    except urllib.error.HTTPError as error:result={'url':url,'status':'blocked' if error.code in (401,403,429) else 'unavailable','httpStatus':error.code,'observedAt':at}
    except (urllib.error.URLError,TimeoutError,OSError) as error:result={'url':url,'status':'unavailable','observedAt':at,'note':type(error).__name__}
    # Failure is not silently rewritten as success; retain last known evidence separately.
    if previous:
        good=previous if previous.get('status') in ('available-first-seen','unchanged','text-changed') else previous.get('lastGood')
        if good and result['status'] not in ('available-first-seen','unchanged','text-changed'):result['lastGood']={k:good[k] for k in ('textSHA256','rawSHA256','observedAt','characters') if k in good}
    return result

def audit(index,*,offline=False,previous=None,limit=12,url_filter='',timeout=10):
    entries=index['entries'];urls=sorted({e['url'] for e in entries if e.get('url') and (not url_filter or url_filter in e['url'])})
    hosts={urllib.parse.urlsplit(e['url']).hostname for e in entries if e.get('url')}
    prev={r['url']:r for r in (previous or {}).get('observations',[])}
    selected=urls[:max(0,limit)]
    observations=[]
    for u in selected:
        result={'url':u,'status':'not-probed'} if offline else probe(u,hosts,prev.get(u),timeout)
        related=[e for e in entries if e.get('url')==u]
        result['sourceIds']=[e['id'] for e in related];result['families']=sorted({f for e in related for f in e.get('families',[])})
        result['caseIds']=sorted({c['id'] for e in related for c in e.get('cases',[])})
        observations.append(result)
    return {'schema':1,'version':'0.17.0','indexVersion':index['version'],'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'mode':'offline-inventory' if offline else 'read-only-network-probe','disclaimer':'Технический отчёт. Нормы, ключи, оценки и файлы банка не обновляются. Полные тексты страниц не сохраняются.','uniqueUrls':len(urls),'selected':len(selected),'observations':observations}

def main():
    p=argparse.ArgumentParser();p.add_argument('--index',type=Path,default=ROOT/'SOURCE_INDEX.json');p.add_argument('--output',type=Path,required=True);p.add_argument('--previous',type=Path);p.add_argument('--offline',action='store_true');p.add_argument('--limit',type=int,default=12);p.add_argument('--url-filter',default='');p.add_argument('--timeout',type=float,default=10);a=p.parse_args()
    index=json.loads(a.index.read_text('utf8'));prev=json.loads(a.previous.read_text('utf8')) if a.previous else None
    out=a.output.resolve();protected=[ROOT/'site',ROOT/'firebase',ROOT/'SOURCE_INDEX.json'];
    if any(out==r.resolve() or r.is_dir() and out.is_relative_to(r.resolve()) for r in protected):raise SystemExit('Monitoring output must be outside site/, firebase/ and the source index.')
    report=audit(index,offline=a.offline,previous=prev,limit=a.limit,url_filter=a.url_filter,timeout=a.timeout);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'path':str(out),'mode':report['mode'],'checked':report['selected'],'statuses':[r['status'] for r in report['observations']]},ensure_ascii=False))
if __name__=='__main__':main()
