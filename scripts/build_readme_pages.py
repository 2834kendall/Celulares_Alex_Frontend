"""Apply shared README presentation and build a local bilingual preview."""
from pathlib import Path
from html import escape, unescape
from base64 import b64encode
import json, os, re, runpy, hashlib, subprocess
from urllib.parse import urlsplit
import markdown

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'docs/assets/readme'
M=runpy.run_path(str(ROOT/'scripts/build_readme_card.py'))
NAV=M['NAV']; REPO=M['REPO']; EN=M['TRANSLATIONS']
START='<!-- sgrh-presentation:start -->'; END='<!-- sgrh-presentation:end -->'
PREVIEW_REV=''
PAIRS={
 'README.es.md':'README.md',
 'srgh-app/README.md':'srgh-app/README.en.md',
 'docs/README.md':'docs/README.en.md',
 'docs/arquitectura/vision-general.md':'docs/arquitectura/vision-general.en.md',
 'docs/guias/testing.md':'docs/guias/testing.en.md',
}
REVERSE={v:k for k,v in PAIRS.items()}
KINDS={'srgh-app/README.md':'start','docs/README.md':'docs','docs/arquitectura/vision-general.md':'architecture','docs/guias/testing.md':'tests'}

def write_atomic(path,text):
 temporary=path.with_name('.'+path.name+'.tmp')
 temporary.write_text(text,encoding='utf-8')
 temporary.replace(path)


def relative(source,target):return os.path.relpath(ROOT/target,(ROOT/source).parent).replace('\\','/')
def strip(s):
 if START in s:return s.split(END,1)[1].lstrip('\n')
 return s

def picture(page,asset,alt,width=''):
 base=relative(page,'docs/assets/readme')
 w=f' width="{width}"' if width else ''
 return f'<picture><source media="(prefers-color-scheme: dark)" srcset="{base}/{asset}-dark.svg"><img src="{base}/{asset}-light.svg"{w} alt="{escape(alt)}"></picture>'

def target(href,lang):
 if href in ('README.md','README.es.md'):return 'README.md' if lang=='en' else 'README.es.md'
 return PAIRS.get(href,href) if lang=='en' else href

def prefix(page,lang,kind=None):
 base=REVERSE.get(page,page)
 paired=base in PAIRS
 if paired:
  modes=' '.join(f'<a href="{relative(page,PAIRS[base] if selected=="en" else base)}" lang="{selected}" hreflang="{selected}">{picture(page,f"lang-{selected}-{lang}","English" if selected=="en" else "Español")}</a>' for selected in ('es','en'))
 else:
  modes=f'Contenido en español · <a href="{relative(page,"README.md")}" lang="en">English overview</a>'
 links=[]
 if base!='README.es.md':links.append(f'<a href="{relative(page,target("README.md",lang))}">{picture(page,f"nav-home-{lang}","Overview" if lang=="en" else "Inicio")}</a>')
 for name,label,href,icon in NAV:
  if base!='README.es.md' and (href==base or (name=='ci' and base not in KINDS)):continue
  href=href if href.startswith('https:') else relative(page,target(href,lang))
  links.append(f'<a href="{href}">{picture(page,f"nav-{name}-{lang}",EN.get(label,label) if lang=="en" else label)}</a>')
 result=START+'\n<p align="center">'+modes+'</p>\n\n<p align="center">\n  '+'\n  '.join(links)+'\n</p>\n\n'
 if kind:result+=picture(page,f'header-{kind}-{lang}',('SGRH documentation' if lang=='en' else 'Documentación del SGRH'),'100%')+'\n\n'
 else:result+=picture(page,f'card-{lang}',('SGRH: People. Time. All in order. Modules, technology and HR workflows.' if lang=='en' else 'SGRH: Personas. Tiempo. Todo en orden. Módulos, tecnologías y gestión laboral.'),'100%')+'\n\n'
 return result+END+'\n\n'

def links_in(page):
 s=strip((ROOT/page).read_text(encoding='utf-8'));items=re.findall(r'\]\(([^)]+)\)',s)
 result=[]
 for href in items:
  if urlsplit(href).scheme or href.startswith('#'):continue
  candidate=((ROOT/page).parent/href.split('#')[0]).resolve()
  if candidate.is_file() and candidate.suffix=='.md' and candidate.is_relative_to(ROOT):result.append(candidate.relative_to(ROOT).as_posix())
 return result

def category(page):
 if page in KINDS:return KINDS[page]
 if '/supabase/' in page:return 'database'
 if '/arquitectura/' in page:return 'security' if any(s in page for s in ('seguridad','roles','jwt')) else 'architecture'
 if '/modules/' in page or '/components/' in page or '/lib/' in page:return 'modules'
 return 'guides'


VISUAL_START='<!-- sgrh-visual:start -->';VISUAL_END='<!-- sgrh-visual:end -->'
DIAGRAMS={
 'srgh-app/README.md':('setup','Dependencias, entorno, vínculo a Supabase dev e inicio de la aplicación.','Dependencies, environment, development Supabase link and application startup.'),
 'docs/README.md':('docs','Mapa de lectura: ejecutar, entender, modificar y validar el proyecto.','Reading map: run, understand, change and validate the project.'),
 'docs/arquitectura/vision-general.md':('architecture','Navegador a Next.js y PostgreSQL con sesión y RLS; Next.js integra Auth y Storage.','Browser to Next.js and PostgreSQL using session and RLS; Next.js integrates Auth and Storage.'),
 'docs/guias/testing.md':('tests','Lint, tipos, dos shards de Vitest, cobertura y E2E convergen en CI passed.','Lint, types, two Vitest shards, coverage and E2E converge on CI passed.'),
 'docs/arquitectura/capas-de-seguridad.md':('security','Autenticación, autorización y aislamiento; usePermisos controla la interfaz y no reemplaza la seguridad.','Authentication, authorization and isolation; usePermisos controls the UI and does not replace security.'),
 'srgh-app/src/modules/attendance/README.md':('kiosk','Flujo facial: validar acceso, identificar, elegir la marca y guardar con idempotencia.','Facial flow: validate access, identify, choose the punch and save idempotently.'),
 'srgh-app/src/modules/payroll/README.md':('payroll','Borrador, pago por fila y emisión de comprobantes; el período se paga cuando todas las filas están pagadas.','Draft, per-row payment and payslips; a period is paid when every row is paid.'),
}

def add_visual(page,body):
 base=REVERSE.get(page,page)
 if base not in DIAGRAMS:return body
 body=re.sub(re.escape(VISUAL_START)+r'.*?'+re.escape(VISUAL_END)+r'\n*','',body,flags=re.S)
 kind,es,en=DIAGRAMS[base];lang='en' if page in REVERSE else 'es'
 block=VISUAL_START+'\n'+picture(page,f'diagram-{kind}-{lang}',en if lang=='en' else es,'100%')+'\n'
 if kind=='architecture':
  block+='\n'+('The diagram shows the session-client path. Administrative operations require their own permission and company checks.' if lang=='en' else 'El diagrama muestra la ruta con cliente de sesión. Las operaciones administrativas validan sus propios permisos y contexto de empresa.')+'\n'
 block+=VISUAL_END+'\n\n'
 first=body.find('\n')
 return body[:first+1]+'\n'+block+body[first+1:].lstrip('\n')


def add_section_visual(page,body):
 base=REVERSE.get(page,page);lang='en' if page in REVERSE else 'es'
 spec={
  'docs/README.md':('modules',r'(?m)^## (?:Por módulo|Domain references)\s*$',('Relación entre personas, tiempo, nómina y contexto operativo.','Relationships between people, time, payroll and operational context.')),
  'docs/arquitectura/vision-general.md':('code',r'(?m)^## (?:Organización por módulo de negocio|Organize by business domain)\s*$',('Responsabilidades de app, modules, lib y UI compartida.','Responsibilities of app, modules, lib and shared UI.')),
 }.get(base)
 if not spec:return body
 kind,pattern,labels=spec;start=f'<!-- sgrh-section-visual:{kind}:start -->';end=f'<!-- sgrh-section-visual:{kind}:end -->'
 body=re.sub(re.escape(start)+r'.*?'+re.escape(end)+r'\n*','',body,flags=re.S)
 block='\n\n'+start+'\n'+picture(page,f'diagram-{kind}-{lang}',labels[1 if lang=='en' else 0],'100%')+'\n'+end+'\n\n'
 body=re.sub(pattern,lambda m:m.group(0).rstrip()+block,body,count=1)
 if kind=='code' and '<summary>Ver estructura como texto</summary>' not in body and '<summary>Read the folder structure as text</summary>' not in body:
  summary='Read the folder structure as text' if lang=='en' else 'Ver estructura como texto'
  body=re.sub(r'```(?:text)?\n(srgh-app/src/\n.*?\n)```',lambda m:'<details>\n<summary>'+summary+'</summary>\n\n'+m.group(0)+'\n\n</details>',body,count=1,flags=re.S)
 return body

STYLE='''@font-face{font-family:Manrope;src:url(FONT)}*{box-sizing:border-box}body{margin:0;background:#050b15;color:#e9f0fc;font:15px/1.75 Manrope,Arial,sans-serif;--surface:#0a1120;--muted:#a7b8d2;--line:#29384f;--link:#72cfe6}body.light{background:#e7ecf5;color:#15243f;--surface:#f8f9fc;--muted:#50627e;--line:#c9d4e5;--link:#3156bc}header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;background:#0a1120fa;color:#f1f5fc;border-bottom:1px solid #29384f;gap:16px}header small{color:#a7b8d2}button{background:#192b46;color:#f1f5fc;border:1px solid #3f5575;border-radius:9px;padding:8px 12px;cursor:pointer;font:600 12px Manrope,Arial}a{color:var(--link);text-underline-offset:3px}a:focus-visible,button:focus-visible{outline:2px solid #56d5e8;outline-offset:4px}main{max-width:948px;margin:20px auto;padding:0 24px 40px}main p[align=center]{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:12px 0}main p[align=center] a{display:inline-flex;transition:transform .2s}main p[align=center] a:hover{transform:translateY(-2px)}main p[align=center] img{height:clamp(28px,5vw,42px);width:auto}main p[align=center]:first-of-type img{height:31px}picture>img[width="100%"]{display:block;width:100%;height:auto;border-radius:18px;margin:16px 0 24px}article h1{font-size:2.2rem;line-height:1.25;letter-spacing:-.035em;margin:40px 0 18px}article h2{font-size:1.45rem;line-height:1.3;letter-spacing:-.02em;margin:36px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line)}article h3{font-size:1.2rem;margin-top:28px}article table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow:auto}article th,article td{border:1px solid var(--line);padding:10px 13px;text-align:left}article th{background:var(--surface)}article pre{overflow:auto;background:var(--surface);padding:18px 20px;border-radius:12px;border:1px solid var(--line);font:13px/1.7 Consolas,monospace}article :not(pre)>code{padding:2px 5px;border-radius:4px;background:var(--surface);font-size:.9em}article blockquote{margin:22px 0;border-left:2px solid var(--link);padding:4px 18px;color:var(--muted)}article details{padding:18px 0}article summary{cursor:pointer;color:var(--link)}::selection{background:#3159d4;color:white}html{scrollbar-color:#425d83 #0a1120}@media(max-width:520px){main{padding:0 12px 24px}header{padding:8px 12px}header small{display:none}main p[align=center]{gap:5px}main p[align=center] img{height:28px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}'''

def preview_name(page):return page.replace('/','--').removesuffix('.md')+'.html'

def build_preview(page,pages):
 content=markdown.markdown((ROOT/page).read_text(encoding='utf-8').replace('<details>','<details markdown="1">'),extensions=['tables','fenced_code','sane_lists','md_in_html','toc'])
 def attr(match):
  key,value=match.groups()
  if urlsplit(value).scheme or value.startswith('#'):return match.group(0)
  path,_,anchor=value.partition('#')
  resolved=((ROOT/page).parent/path).resolve()
  if not resolved.is_relative_to(ROOT):return match.group(0)
  rel=resolved.relative_to(ROOT).as_posix()
  if rel in pages:value=preview_name(rel)+'?v='+PREVIEW_REV+('#'+anchor if anchor else '')
  elif resolved.suffix=='.svg' and resolved.is_relative_to(ART):value='../'+resolved.relative_to(ART).as_posix()+'?v='+hashlib.sha256(resolved.read_bytes()).hexdigest()[:12]
  elif resolved.is_file():value=REPO+'/blob/dev/'+rel+('#'+anchor if anchor else '')
  return f'{key}="{escape(value,quote=True)}"'
 content=re.sub(r'(src|srcset|href)="([^"]+)"',attr,content)
 lang='en' if page in REVERSE else 'es'
 button='Light theme' if lang=='en' else 'Versión clara'
 note='README preview · Not published' if lang=='en' else 'Vista previa · Sin publicar'
 style=STYLE.replace('FONT','data:font/ttf;base64,'+b64encode((ART/'fonts/Manrope.ttf').read_bytes()).decode())
 # picture's native source selection is replaced only in the local preview, allowing a theme toggle.
 content=re.sub(r'<source[^>]+>','',content)
 content=content.replace('-light.svg','-dark.svg')
 # Inline both variants in the local preview: theme changes require no image requests.
 def embed_image(match):
  tag=match.group(0);src=re.search(r'\bsrc="([^"]+)"',tag)
  if not src:return tag
  file=(ART/'previews'/urlsplit(unescape(src.group(1))).path).resolve()
  if file.suffix!='.svg' or not file.is_relative_to(ART):return tag
  dark=file.with_name(file.name.replace('-light.svg','-dark.svg'))
  light=file.with_name(file.name.replace('-dark.svg','-light.svg'))
  dark_uri='data:image/svg+xml;base64,'+b64encode(dark.read_bytes()).decode()
  light_uri='data:image/svg+xml;base64,'+b64encode(light.read_bytes()).decode()
  return tag[:src.start()]+f'src="{dark_uri}" data-dark="{dark_uri}" data-light="{light_uri}"'+tag[src.end():]
 content=re.sub(r'<img\b[^>]*>',embed_image,content)
 doc=f'<!doctype html><html lang="{lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SGRH · {escape(page)}</title><style>{style}</style><header><div><b>SGRH</b> <small>/ {note}</small></div><button type="button" onclick="toggleTheme()">{button}</button></header><main><article>{content}</article></main><script>const en=document.documentElement.lang==="en";function toggleTheme(){{const light=document.body.classList.toggle("light");for(const img of document.querySelectorAll("img[data-dark]"))img.src=light?img.dataset.light:img.dataset.dark;document.querySelector("button").textContent=light?(en?"Dark theme":"Versión oscura"):(en?"Light theme":"Versión clara");sessionStorage.setItem("sgrh-preview-theme",light?"light":"dark")}}if(sessionStorage.getItem("sgrh-preview-theme")==="light")toggleTheme();</script></html>'
 dest=ART/'previews'/preview_name(page);write_atomic(dest,doc)



def format_pages(pages):
 formatter=ROOT/'srgh-app/node_modules/prettier/bin/prettier.cjs'
 if not formatter.is_file():raise RuntimeError('Run pnpm install in srgh-app before generating documentation.')
 paths=[str(ROOT/page) for page in sorted(pages)]
 for offset in range(0,len(paths),12):
  subprocess.run(['node',str(formatter),'--config',str(ROOT/'srgh-app/.prettierrc'),'--write',*paths[offset:offset+12]],cwd=ROOT,stdout=subprocess.DEVNULL,check=True)


def generate():
 global PREVIEW_REV
 pages=set(PAIRS)|set(REVERSE)
 for page in list(PAIRS):pages.update(links_in(page))
 for page in sorted(pages):
  file=ROOT/page;body=strip(file.read_text(encoding='utf-8'))
  base=REVERSE.get(page,page);lang='en' if page in REVERSE else 'es'
  if base=='README.es.md':body=body[body.index('<details>'):]
  else:body=add_section_visual(page,add_visual(page,body))
  write_atomic(file,prefix(page,lang,None if base=='README.es.md' else category(base))+body)
 format_pages(pages)
 fingerprint=hashlib.sha256(Path(__file__).read_bytes()).digest()+b''.join(hashlib.sha256((ROOT/p).read_bytes()).digest() for p in sorted(pages))+b''.join(hashlib.sha256(p.read_bytes()).digest() for p in sorted(ART.glob('*.svg')))
 PREVIEW_REV=hashlib.sha256(fingerprint).hexdigest()[:12]
 (ART/'previews').mkdir(exist_ok=True)
 for page in sorted(pages):build_preview(page,pages)
 write_atomic((ART/'preview.html'),f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=previews/README.html?v={PREVIEW_REV}"><a href="previews/README.html?v={PREVIEW_REV}">SGRH · ES / EN</a>')
 write_atomic((ART/'preview-pages.json'),json.dumps(sorted(pages),indent=2)+'\n')
 print(f'Applied shared presentation to {len(pages)} Markdown pages; 5 complete ES/EN pairs. Local previews built.')

if __name__=='__main__':generate()
