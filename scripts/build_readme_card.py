"""Build self-contained README artwork and linked navigation. Requires fonttools."""
from base64 import b64encode
from html import escape
from pathlib import Path
import json
import re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets/readme'
FONTS = {name: TTFont(OUT / f'fonts/{name}.ttf') for name in ('InterTight','Manrope')}
LOGO = b64encode((ROOT / 'srgh-app/public/brand/sgrh-isotipo-v1.png').read_bytes()).decode()
REPO = 'https://github.com/2834kendall/Celulares_Alex_Frontend'
LANG = 'es'
TRANSLATIONS = json.loads((OUT / 'copy.en.json').read_text(encoding='utf-8'))

def write_atomic(path,text):
 temporary=path.with_name('.'+path.name+'.tmp')
 temporary.write_text(text,encoding='utf-8')
 temporary.replace(path)


def translate(s):
 return TRANSLATIONS.get(s,s) if LANG=='en' else s
NAV = [
 ('start','Instalación','srgh-app/README.md','terminal'),
 ('docs','Documentación','docs/README.md','book'),
 ('architecture','Arquitectura','docs/arquitectura/vision-general.md','layers'),
 ('tests','Pruebas','docs/guias/testing.md','flask'),
 ('ci','CI',REPO+'/actions/workflows/ci.yml','check'),
]

class Art:
 def __init__(self,dark,width=900,height=3260):
  self.dark=dark;self.w=width;self.h=height;self.p=[];self.glyphs={};self.sets={}
  self.bg,self.ink,self.muted,self.line,self.soft,self.cyan,self.blue,self.gold=(
   ('#0a1120','#f1f5fc','#a7b8d2','#29384f','#121f33','#56d5e8','#9aafff','#eed29b') if dark else
   ('#f8f9fc','#15243f','#50627e','#c9d4e5','#edf1fa','#007386','#3156bc','#876118'))
 def add(self,s):self.p.append(s)
 def rect(self,x,y,w,h,fill=None,r=0,stroke=None,cls='',extra=''):
  self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill or self.soft}"'+(f' stroke="{stroke}"' if stroke else '')+f' class="{cls}" {extra}/>')
 def path(self,d,color=None,width=1,cls='',extra=''):
  self.add(f'<path d="{d}" fill="none" stroke="{color or self.line}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" class="{cls}" {extra}/>')
 def link(self,d,color=None):
  color=color or self.cyan
  self.path(d,self.line,1.5);self.path(d,color,1.3,'flow')
  self.path(d,color,3,'comet',extra='pathLength="100"')
  tokens=re.findall(r'[MmHhVv]|-?\d+(?:\.\d+)?',d);x=y=px=py=0;i=0
  while i<len(tokens):
   command=tokens[i];i+=1;px,py=x,y
   if command in ('M','m'):
    nx,ny=float(tokens[i]),float(tokens[i+1]);i+=2
    x,y=(x+nx,y+ny) if command=='m' else (nx,ny)
   elif command in ('H','h'):x=float(tokens[i])+(x if command=='h' else 0);i+=1
   elif command in ('V','v'):y=float(tokens[i])+(y if command=='v' else 0);i+=1
  dx,dy=x-px,y-py;length=(dx*dx+dy*dy)**.5
  if length:
   dx/=length;dy/=length
   self.path(f'M{x-7*dx-3*dy} {y-7*dy+3*dx}L{x} {y}L{x-7*dx+3*dy} {y-7*dy-3*dx}',color,1.7)
 def circle(self,x,y,r,fill=None,stroke=None,width=1,cls=''):
  self.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill or "none"}"'+(f' stroke="{stroke}" stroke-width="{width}"' if stroke else '')+f' class="{cls}"/>')
 def text(self,x,y,s,size=20,color=None,weight=450,face='Manrope',anchor='start',cls=''):
  s=translate(s)
  key=(face,weight)
  if key not in self.sets:self.sets[key]=FONTS[face].getGlyphSet(location={'wght':weight})
  gs=self.sets[key];cmap=FONTS[face].getBestCmap();units=FONTS[face]['head'].unitsPerEm;sc=size/units
  glyphs=[];pos=0
  for c in s:
   g=gs[cmap[ord(c)]];gid=f'{face[0]}{weight}_{ord(c):x}'
   if gid not in self.glyphs:
    pen=SVGPathPen(gs);g.draw(pen);self.glyphs[gid]=f'<path id="{gid}" d="{pen.getCommands()}"/>'
   glyphs.append(f'<use href="#{gid}" x="{pos:.2f}"/>');pos+=g.width
  if anchor=='end':x-=pos*sc
  if anchor=='middle':x-=pos*sc/2
  self.add(f'<g role="img" aria-label="{escape(s)}" class="{cls}" fill="{color or self.ink}" transform="translate({x:.2f} {y}) scale({sc:.7f} {-sc:.7f})">'+''.join(glyphs)+'</g>')
 def head(self,x,y,s,size=40,color=None):self.text(x,y,s,size,color,650,'InterTight')
 def logo(self,x,y,size):
  self.add(f'<image x="{x}" y="{y}" width="{size}" height="{size}" href="data:image/png;base64,{LOGO}"/>')
 def icon(self,x,y,name,color=None,scale=1):
  shapes={
   'terminal':'M4 5h24v22H4zM9 11l5 5-5 5M18 21h5',
   'book':'M16 8C10 4 5 5 3 6v21c6-3 10-2 13 0 3-2 7-3 13 0V6c-5-2-10-1-13 2zM16 8v19',
   'layers':'M3 11l13-7 13 7-13 7zM3 17l13 7 13-7M3 23l13 7 13-7',
   'flask':'M11 4h10M13 4v10L5 26q-1 3 3 3h16q4 0 2-3l-7-12V4M9 21h14',
   'check':'M8 16l6 6 11-13M28 16a12 12 0 1 1-6-10',
   'person':'M21 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0M5 29v-3c0-9 22-9 22 0v3',
   'clock':'M29 16a13 13 0 1 1-26 0 13 13 0 0 1 26 0M16 8v8l6 4',
   'file':'M7 3h12l7 7v19H7zM19 3v8h7M12 17h9M12 22h9',
   'branch':'M4 13l12-9 12 9M7 13v16h18V13M13 29V19h6v10',
   'users':'M19 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0M3 28v-3c0-8 22-8 22 0v3M24 5q7 5 0 10M28 20q3 2 3 7',
   'chart':'M4 4v24h25M10 22v-6M17 22V9M24 22v-9',
   'shield':'M16 3l11 5v9q0 8-11 13Q5 25 5 17V8zM10 16l4 4 8-9',
  }
  self.add(f'<g transform="translate({x} {y}) scale({scale})">');self.path(shapes[name],color or self.cyan,1.7);self.add('</g>')
 def rule(self,y):self.path(f'M52 {y}H848')
 def pill(self,x,y,w,label,color=None):
  self.rect(x,y,w,32,self.soft,16,self.line);self.text(x+w/2,y+22,label,14,color or self.muted,600,anchor='middle')
 def module(self,x,y,name,desc,color=None):
  self.circle(x,y-8,3,color or self.cyan);self.head(x+17,y,name,23)
  for i,line in enumerate(desc if isinstance(desc,tuple) else (desc,)):
   self.text(x+17,y+31+i*26,line,18,self.muted)
 def export(self,title):
  defs=''.join(self.glyphs.values())
  css=f'''<style>
.flow{{stroke-dasharray:5 27;animation:flow 3s linear infinite}}
.float{{animation:float 5s ease-in-out infinite}}
.scan{{animation:scan 6s cubic-bezier(.65,0,.35,1) infinite}}
.frame{{animation:frame 6s ease-in-out infinite}}
.hand{{transform-origin:0 0;animation:hand 18s linear infinite}}
.record{{animation:record 9s cubic-bezier(.65,0,.35,1) infinite}}
.draw{{stroke-dasharray:80;animation:draw 6s ease-in-out infinite}}
.bar{{transform-box:fill-box;transform-origin:left;animation:bar 7s cubic-bezier(.16,1,.3,1) infinite}}
.reveal{{animation:reveal 7s ease-in-out infinite}}
.arrow{{animation:arrow 2s ease-in-out infinite}}
@keyframes flow{{to{{stroke-dashoffset:-128}}}}
@keyframes float{{0%,100%{{transform:translateY(0)}}50%{{transform:translateY(-7px)}}}}
@keyframes scan{{0%,12%{{transform:translateY(0);opacity:0}}20%{{opacity:1}}70%{{transform:translateY(114px);opacity:1}}80%,100%{{transform:translateY(114px);opacity:0}}}}
@keyframes frame{{0%,75%,100%{{opacity:.45}}80%,95%{{opacity:1}}}}
@keyframes hand{{to{{transform:rotate(360deg)}}}}
@keyframes record{{0%,8%{{transform:translateX(0);opacity:1}}30%,40%{{transform:translateX(88px);opacity:1}}65%,90%{{transform:translateX(176px);opacity:1}}96%,100%{{transform:translateX(176px);opacity:0}}}}
@keyframes draw{{0%,65%{{stroke-dashoffset:80;opacity:.3}}82%,98%{{stroke-dashoffset:0;opacity:1}}100%{{stroke-dashoffset:80;opacity:.3}}}}
@keyframes bar{{0%,8%,100%{{transform:scaleX(.2);opacity:.5}}35%,90%{{transform:scaleX(1);opacity:1}}}}
@keyframes reveal{{0%,15%,100%{{opacity:.4}}38%,90%{{opacity:1}}}}
@keyframes arrow{{0%,100%{{transform:translateX(0)}}50%{{transform:translateX(4px)}}}}

.comet{{stroke-dasharray:15 85;animation:comet 3.8s cubic-bezier(.4,0,.2,1) infinite}}
.node-arc{{stroke-dasharray:22 78;animation:nodearc 8s linear infinite}}
.mesh{{stroke-dasharray:1;animation:mesh 6s ease-in-out infinite}}
.hire-stamp{{transform-box:fill-box;transform-origin:center;animation:hire 9s cubic-bezier(.16,1,.3,1) infinite}}
.stage-outline{{animation:stage 8s ease-in-out infinite}}
.receipt{{stroke-dasharray:50;animation:receipt 6s ease-out infinite}}
@keyframes comet{{0%{{stroke-dashoffset:115;opacity:.15}}20%,75%{{opacity:1}}100%{{stroke-dashoffset:-100;opacity:.15}}}}
@keyframes nodearc{{0%{{stroke-dashoffset:100;opacity:.25}}35%,65%{{opacity:.9}}100%{{stroke-dashoffset:-100;opacity:.25}}}}
@keyframes mesh{{0%,12%{{stroke-dashoffset:1;opacity:.2}}50%,85%{{stroke-dashoffset:0;opacity:.8}}100%{{stroke-dashoffset:1;opacity:.2}}}}
@keyframes hire{{0%,60%{{opacity:0;transform:scale(.88)}}74%,94%{{opacity:1;transform:scale(1)}}100%{{opacity:0;transform:scale(1)}}}}
@keyframes stage{{0%,100%{{stroke:{self.line}}}35%,62%{{stroke:{self.cyan}}}}}
@keyframes receipt{{0%,45%{{stroke-dashoffset:50}}70%,95%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:50}}}}

@media(prefers-reduced-motion:reduce){{*{{animation:none!important}}.scan,.flow,.comet,.node-arc{{display:none}}}}
</style>'''
  return f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="title desc"><title id="title">{escape(translate(title))}</title><desc id="desc">{escape("SGRH modules, technology and documentation. Illustrative workflows without real personal data." if LANG=="en" else "Módulos, tecnologías y documentación de SGRH. Flujos ilustrativos sin datos reales.")}</desc><defs>{defs}<clipPath id="edge"><rect x="1" y="1" width="{self.w-2}" height="{self.h-2}" rx="22"/></clipPath><clipPath id="candidate"><rect x="66" y="986" width="290" height="140"/></clipPath></defs>{css}'+''.join(self.p)+'</svg>'


def card(dark):
 a=Art(dark,900,2910);a.add('<g clip-path="url(#edge)">');a.rect(0,0,900,2910,a.bg)
 # Royal blue is a brand plane, not a gradient-text effect.
 a.rect(0,0,900,540,'#132a60' if dark else '#e8edfc')
 a.head(52,85,'SGRH',40)
 a.text(848,67,'Gestión de Recursos Humanos',17,a.muted,550,anchor='end')
 a.path('M52 127H848',a.line)
 a.head(52,229,'Personas.',68)
 a.head(52,309,'Tiempo.',68)
 a.head(52,389,'Todo en orden.',60,a.cyan)
 # Hero: one connected constellation anchored by the actual brand symbol.
 for d in ['M604 254H560Q540 254 540 232V202','M714 248H794V206','M634 332V389H574','M714 318H801V378']:
  a.path(d,a.line,1.5);a.path(d,a.cyan,3,'comet',extra='pathLength="100"')
 # Center the visible symbol, accounting for the original PNG transparency.
 a.logo(550,174,235)
 for x,y,name,color,delay in [(493,153,'person',a.gold,0),(765,153,'clock',a.cyan,-1.5),(508,358,'file',a.blue,-3),(770,358,'chart',a.cyan,-.7)]:
  a.add(f'<g><g class="float" style="animation-delay:{delay}s">')
  a.circle(x+31,y+31,32,a.bg,a.line,1)
  a.add(f'<circle cx="{x+31}" cy="{y+31}" r="39" fill="none" stroke="{color}" stroke-width="1.7" pathLength="100" class="node-arc" style="animation-delay:{delay}s"/>')
  if name=='clock':
   a.circle(x+31,y+31,13,stroke=color,width=1.7);a.add(f'<g transform="translate({x+31} {y+31})"><g class="hand">');a.path('M0 -8V0L6 4',color,1.7);a.add('</g></g>')
  else:a.icon(x+15,y+15,name,color)
  a.add('</g></g>')
  a.text(x+31,y+75,{'person':'Equipo','clock':'Jornada','file':'Contratos','chart':'Paneles'}[name],13,a.muted,600,anchor='middle')
 a.pill(52,470,142,'Multiempresa');a.pill(206,470,149,'Por sucursal');a.pill(367,470,166,'Roles y permisos')
 a.add('<g transform="translate(0 -265)">')
 a.head(52,863,'Módulos',38)
 # People chapter: a miniature hiring board, record crossing stages.
 a.text(52,962,'Personas',29,a.gold,650,'InterTight')
 for i,label in enumerate(['Postular','Evaluar','Contratar']):
  x=66+i*95;a.text(x,1005,label,13,a.muted,650);a.path(f'M{x} 1021h78',a.line)
 a.add('<g clip-path="url(#candidate)"><g class="record">')
 a.rect(69,1040,79,67,a.soft,9,a.line);a.circle(86,1059,5,a.gold)
 a.path('M99 1058h31M80 1076h49M80 1088h33',a.muted,2)
 a.add('</g></g>')
 a.add('<g class="hire-stamp">')
 a.rect(205,1114,151,32,a.soft,8,a.gold)
 a.path('M216 1130l5 5 10-12',a.gold,1.8)
 a.text(238,1136,'Expediente',13,a.ink,650)
 a.add('</g>')
 a.path('M84 1160h231',a.line);a.path('M84 1160h231',a.gold,2,'flow')
 for x in [84,179,274]:a.circle(x,1160,4,a.gold)
 a.text(66,1203,'Contratar crea el empleado.',15,a.muted)
 a.module(413,978,'Reclutamiento',('Compara candidatos y organiza etapas.','Vincula la contratación con el expediente.'),a.gold)
 a.module(413,1076,'Expedientes',('Centraliza contratos y documentos.','Da contexto a asistencia y nómina.'),a.gold)
 a.module(413,1174,'Evaluaciones',('Define rubros y registra calificaciones.','Conserva fortalezas y acciones de mejora.'),a.gold)
 a.rule(1264)

 # Time chapter: visual on the right, modules on the left.
 a.text(52,1331,'Tiempo',29,a.cyan,650,'InterTight')
 a.module(52,1392,'Horarios',('Programa turnos por persona y sucursal.','Asigna plantillas y tipos de jornada.'))
 a.module(52,1490,'Asistencia y kiosco',('Reconoce el rostro y permite elegir la marca.','Gestiona tardías y justificaciones.'))
 a.module(52,1588,'Ausencias',('Registra permisos e incapacidades.','Se guardan aprobadas con el permiso requerido.'))
 a.add('<g class="frame">');a.path('M557 1390v-20h23M796 1390v-20h-23M557 1515v20h23M796 1515v20h-23',a.cyan,2.5);a.add('</g>')
 # Face mesh geometry: short connected landmarks give an actual biometric diagram.
 pts=[(628,1397),(652,1386),(678,1386),(703,1397),(619,1425),(643,1420),(688,1420),(713,1425),(623,1452),(645,1445),(666,1435),(688,1445),(709,1452),(637,1480),(666,1491),(696,1480),(653,1510),(680,1510)]
 for edge_no,(i,j) in enumerate([(0,1),(1,2),(2,3),(0,4),(3,7),(4,5),(5,10),(6,10),(6,7),(4,8),(7,12),(8,13),(12,15),(13,16),(15,17),(16,17),(13,14),(14,15),(5,9),(9,10),(10,11),(11,6),(9,13),(11,15)]):
  d=f'M{pts[i][0]} {pts[i][1]}L{pts[j][0]} {pts[j][1]}'
  a.path(d,a.line)
  a.path(d,a.cyan,1.3,'mesh',extra=f'pathLength="1" style="animation-delay:{edge_no*.025}s"')
 for x,y in pts:a.circle(x,y,2.7,a.cyan)
 a.path('M574 1387H780',a.cyan,2,'scan')
 a.text(677,1572,'Identificar → Elegir marca',16,a.muted,600,anchor='middle')
 for i,day in enumerate(['M','T','W','T','F'] if LANG=='en' else ['L','M','X','J','V']):
  x=565+i*47;a.text(x,1620,day,13,a.muted,600);a.rect(x-4,1635,27,8,a.cyan if i%2 else a.blue,4,cls='bar',extra=f'style="animation-delay:-{i*.45}s"')
 a.rule(1704)

 a.text(52,1771,'Gestión',29,a.blue,650,'InterTight')
 a.head(52,1825,'Del tiempo a la planilla.',36)
 # Attendance and contract are inputs; recalculation is an explicit action.
 a.path('M52 1898H848',a.line)
 a.text(64,1953,'Asistencia',20,a.muted,600)
 a.text(64,2023,'Contrato',20,a.muted,600)
 for d in ['M210 1947H286V1978H350','M190 2017H286V1978','M526 1978H679']:
  a.link(d,a.blue)
 a.rect(350,1947,176,62,a.soft,11,a.line,cls='stage-outline')
 a.text(438,1985,'Recalcular',19,a.ink,650,anchor='middle')
 a.icon(700,1917,'file',a.cyan,2)
 a.path('M722 1954h21M722 1965h21',a.cyan,1.8,'receipt')
 a.text(738,2017,'Planilla',19,a.ink,650,anchor='middle')
 a.path('M749 1949l9 9 15-20',a.cyan,2,'draw')
 a.text(64,2088,'Recalcular no modifica filas pagadas.',17,a.muted)
 a.module(52,2140,'Nómina',('Calcula la planilla y genera comprobantes.','Incluye horas extra, aguinaldo y liquidación.'),a.blue)
 a.rule(2240)

 # One flat operations rail, with actual domain-specific icons.
 for x,name,sub,icon in [(52,'Dashboard',('Organiza indicadores en paneles.','Respeta los permisos del usuario.'),'chart'),(326,'Sucursales',('Administra sedes y kioscos.','Vincula accesos a cada sucursal.'),'branch'),(600,'Usuarios',('Asigna roles y permisos.','Controla las cuentas del sistema.'),'users')]:
  a.icon(x,2282,icon,a.cyan,.9)
  a.path(f'M{x+45} 2297h175',a.line)
  a.path(f'M{x+45} 2297h175',a.cyan,2.5,'comet',extra='pathLength="100"')
  a.head(x,2356,name,23)
  for i,line in enumerate(sub):a.text(x,2387+i*24,line,15,a.muted)
 a.rule(2430)

 a.head(52,2500,'Stack',36)
 # Architecture: real separation of UI, server logic and managed persistence.
 for x,name,sub,icon in [(52,'Interfaz','Next.js 16 · React 19','terminal'),(337,'Negocio','Server Actions · Zod','layers'),(622,'Datos','Supabase · PostgreSQL','shield')]:
  a.icon(x,2580,icon,a.cyan,.85);a.head(x+41,2601,name,22);a.text(x,2637,sub,16,a.muted)
  if x<622:
   a.path(f'M{x+216} 2602h43',a.line,1.5);a.path(f'M{x+216} 2602h43',a.cyan,2,'flow')
 # Three readable layers replace the flat technology inventory.
 for x,lines in [(52,['TypeScript · Tailwind CSS 4','React Hook Form · Zod','MediaPipe · face-api.js']),(337,['Validación + permisos','PDF-lib · ExcelJS','Revalidación de páginas']),(622,['Supabase Auth','RLS · Storage','Contexto por empresa'])]:
  for i,line in enumerate(lines):a.text(x,2685+i*31,line,16,a.muted)
  a.path(f'M{x} 2776h215',a.line)
  a.path(f'M{x} 2776h215',a.cyan,2.6,'comet',extra='pathLength="100"')
 a.rect(52,2807,796,107,a.soft,12,a.line,cls='stage-outline')
 a.icon(72,2839,'flask',a.cyan,.9)
 a.head(117,2862,'Calidad',23)
 a.text(337,2851,'Vitest · Testing Library',18,a.ink,600)
 a.text(337,2883,'Playwright · GitHub Actions',17,a.muted)
 a.rule(2972)
 a.head(52,3038,'Desarrollo local',28)
 a.text(52,3090,'cd srgh-app  →  pnpm install --frozen-lockfile  →  pnpm dev',17,a.cyan,650)
 a.text(52,3126,'Node.js ≥ 22.13 · pnpm · Configurá primero el entorno.',15,a.muted)
 a.add('</g></g>');a.rect(1,1,898,2908,'none',22,a.line)
 return a.export('SGRH · Personas. Tiempo. Todo en orden.')


def nav_button(dark,name,label,icon,width):
 a=Art(dark,width,54);primary=name=='start';bg='#3159d4' if primary else a.soft;fg='#ffffff' if primary else a.ink
 a.rect(1,1,width-2,52,bg,12,None if primary else a.line)
 a.icon(13,14,icon,fg,.75);a.text(47,33,label,14,fg,650)
 a.path(f'M{width-24} 27h11m-4-4 4 4-4 4',fg,1.6,'arrow')
 return a.export(label)


def language_button(dark,lang,active):
 a=Art(dark,116,42)
 a.rect(1,1,114,40,'#3159d4' if active else a.soft,10,None if active else a.line)
 a.text(58,27,'English' if lang=='en' else 'Español',14,'#fff' if active else a.ink,650,anchor='middle')
 return a.export('English' if lang=='en' else 'Español')


def page_header(dark,kind):
 titles={'start':('Aplicación','Entorno, comandos y desarrollo local.','terminal'),'docs':('Documentación','Índice de documentación y módulos.','book'),'architecture':('Arquitectura','Organización, seguridad y decisiones técnicas.','layers'),'tests':('Pruebas','Convenciones, cobertura y validación continua.','flask'),'modules':('Módulos','Reglas y flujos del sistema.','person'),'guides':('Guías','Instalación y trabajo con el proyecto.','book'),'security':('Seguridad','Acceso, permisos y contexto de empresa.','shield'),'database':('Base de datos','Esquema, migraciones y operación de datos.','layers')}
 title,subtitle,icon=titles[kind]
 a=Art(dark,900,100);a.rect(1,1,898,98,a.bg,14,a.line)
 a.head(52,56,'SGRH',29)
 a.text(190,55,'Gestión de Recursos Humanos',16,a.muted)
 a.icon(794,27,icon,a.cyan,1)
 a.path('M52 84H848',a.line);a.path('M52 84H848',a.cyan,1.5,'flow')
 return a.export(translate(title)+' · SGRH')


def diagram(dark,kind):
 heights={'architecture':630,'docs':430,'tests':450,'setup':400,'security':440,'modules':590,'code':470,'kiosk':545,'payroll':470}
 a=Art(dark,900,heights[kind]);a.rect(1,1,898,a.h-2,a.bg,18,a.line)
 def box(x,y,w,h,title,lines,icon=None,color=None):
  a.rect(x,y,w,h,a.soft,12,a.line,cls='stage-outline',extra=f'style="animation-delay:-{x/155}s"')
  if icon:a.icon(x+18,y+17,icon,color or a.cyan,.8)
  a.head(x+18,y+(67 if icon else 34),title,21,color)
  for i,line in enumerate(lines):a.text(x+18,y+(99 if icon else 65)+i*27,line,16,a.muted)
 def edge(d,color=None):a.link(d,color)
 if kind=='architecture':
  a.head(36,58,'De la pantalla a los datos',31)
  box(36,132,228,205,'Navegador',['React · Formularios','Sesión del usuario'],'terminal')
  box(336,132,228,205,'Next.js',['Server Components','Server Actions','Zod + permisos'],'layers')
  box(636,132,228,205,'PostgreSQL',['RLS + RPC','Datos por empresa'],'shield')
  edge('M264 230H336');edge('M564 230H636')
  a.text(300,211,'HTTP',12,a.muted,600,anchor='middle')
  a.text(600,211,'Sesión',12,a.muted,600,anchor='middle')
  box(36,430,228,113,'Supabase Auth',['Sesión y claims del JWT'])
  box(636,430,228,113,'Supabase Storage',['Archivos privados'])
  edge('M450 337V385H150V430');edge('M450 385H750V430')
  a.text(450,592,'Lecturas: Server Components · Escrituras: Server Actions',17,a.muted,anchor='middle')
 elif kind=='docs':
  a.head(36,58,'Qué consultar según tu tarea',31)
  for i,(task,dest,icon) in enumerate([('Ejecutar el proyecto','Instalación + Entorno','terminal'),('Entender el sistema','Arquitectura + Seguridad','layers'),('Cambiar una función','README del módulo','file'),('Validar los cambios','Pruebas + CI','flask')]):
   y=121+i*78;a.icon(38,y-22,icon,a.cyan,.85);a.head(82,y,task,20)
   edge(f'M382 {y-7}H486')
   a.text(517,y,dest,21,a.ink,600)
   if i<3:a.path(f'M36 {y+26}H864',a.line)
 elif kind=='tests':
  a.head(36,58,'Qué debe pasar en CI',31)
  for i,title in enumerate(['Lint + TypeScript','Vitest · 2 shards','Cobertura','Playwright + Supabase local']):
   y=104+i*73;a.rect(36,y,424,50,a.soft,9,a.line);a.text(56,y+32,title,19,a.ink,600)
   edge(f'M460 {y+25}H562V238H654')
  a.rect(654,192,210,92,a.soft,12,a.line);a.icon(671,219,'check',a.cyan,.8)
  a.text(708,246,'CI passed',21,a.ink,650)
  a.text(36,420,'Todos los jobs requeridos deben terminar correctamente.',17,a.muted)
 elif kind=='setup':
  a.head(36,58,'Del repositorio al navegador',31)
  for i,(title,command) in enumerate([('Dependencias','pnpm install'),('Entorno','.env.local'),('Supabase dev','pnpm supabase:link'),('Aplicación','pnpm dev')]):
   x=36+i*213;box(x,143,187,112,title,[command])
   if i<3:edge(f'M{x+187} 199h26')
  a.text(36,312,'El entorno se configura antes de iniciar la aplicación.',18,a.muted)
  a.text(36,355,'Node.js ≥ 22.13 · pnpm',16,a.cyan,600)
 elif kind=='security':
  a.head(36,58,'Tres responsabilidades distintas',30)
  for x,title,lines,icon in [(36,'Autenticación',['Proxy: exige sesión.','Layout: valida claims.'],'person'),(324,'Autorización',['Guard: exige permiso.','Empresa desde JWT.'],'shield'),(612,'Aislamiento',['RLS: limita las filas.','Contexto de empresa.'],'layers')]:
   box(x,123,252,193,title,lines,icon)
  a.path('M36 351H864',a.line)
  a.text(36,394,'usePermisos() controla la interfaz; no reemplaza los guards ni RLS.',17,a.muted)
 elif kind=='modules':
  a.head(36,58,'Cómo se conectan los módulos',31)
  for x,title,lines,icon,color in [(36,'Personas',['Reclutamiento','Expedientes','Evaluaciones'],'person',a.gold),(324,'Tiempo',['Horarios','Asistencia y kiosco','Ausencias'],'clock',a.cyan),(612,'Nómina',['Planilla quincenal','Banco de horas','Comprobantes'],'file',a.blue)]:
   box(x,126,252,208,title,lines,icon,color)
  edge('M288 227H324',a.gold);edge('M576 227H612',a.cyan)
  a.text(36,380,'El contrato da contexto a horarios y nómina.',18,a.muted)
  a.text(36,416,'Asistencia y ausencias alimentan la planilla.',18,a.muted)
  a.path('M36 450H864',a.line)
  for x,title,icon in [(36,'Sucursales','branch'),(324,'Usuarios','users'),(612,'Dashboard','chart')]:
   a.icon(x,480,icon,a.cyan,.85);a.head(x+42,502,title,21)
  a.text(36,555,'Alcance, acceso y seguimiento de la operación.',16,a.muted)
 elif kind=='code':
  a.head(36,58,'Dónde vive cada responsabilidad',29)
  for x,title,lines,icon in [(36,'app/',['Rutas y layouts','Guards + ensamblado'],'branch'),(336,'modules/',['Acciones + componentes','Reglas del dominio'],'layers'),(636,'lib/',['Supabase + Auth','Integraciones y utilidades'],'terminal')]:
   box(x,128,228,199,title,lines,icon)
  edge('M264 223H336');edge('M564 223H636')
  a.path('M36 365H864',a.line)
  a.icon(39,395,'layers',a.cyan,.8)
  a.text(81,417,'components/ui + hooks: piezas compartidas entre módulos.',18,a.muted)
 elif kind=='kiosk':
  a.head(36,58,'La ruta de una marca facial',31)
  for i,(title,lines,icon) in enumerate([('Acceso',['Kiosco y sucursal','Programación del día'],'branch'),('Identidad',['Rostro + prueba de vida','Ticket de verificación'],'person'),('Elección',['Entrada, pausa o salida','La persona elige'],'clock'),('Registro',['Ticket + secuencia','Guardado atómico'],'check')]):
   x=36+i*213;a.rect(x,128,187,186,a.soft,11,a.line);a.icon(x+16,145,icon,a.cyan,.85);a.head(x+16,205,title,21)
   for j,line in enumerate(lines):a.text(x+16,245+j*27,line,14,a.muted)
   if i<3:edge(f'M{x+187} 220h26')
  a.text(36,366,'Reconocer no registra la entrada automáticamente.',18,a.ink,600)
  a.text(36,405,'La cola conserva marcas pendientes; no identifica sin conexión.',17,a.muted)
  a.path('M36 439H864',a.line)
  a.icon(36,471,'file',a.cyan,.75);a.text(74,492,'UUID de operación',17,a.muted)
  a.icon(448,471,'check',a.cyan,.75);a.text(486,492,'Reintentos sin duplicar',17,a.muted)
 elif kind=='payroll':
  a.head(36,58,'Del borrador al comprobante',31)
  for x,title,lines,icon in [(36,'Borrador',['Asistencia + contrato','Revisión manual o Excel','Recalcular cambios'],'layers'),(336,'Pago por fila',['Validar la fila','Marcar pagado','Conservar lo ya pagado'],'check'),(636,'Comprobante',['Emitir documento','Enviar correo','Provisión de aguinaldo'],'file')]:
   box(x,130,228,224,title,lines,icon)
  edge('M264 237H336');edge('M564 237H636')
  a.text(36,411,'Período pagado: todas sus filas están pagadas.',18,a.muted)
 return a.export(translate({'architecture':'De la pantalla a los datos','docs':'Qué consultar según tu tarea','tests':'Qué debe pasar en CI','setup':'Del repositorio al navegador','security':'Tres responsabilidades distintas','modules':'Cómo se conectan los módulos','code':'Dónde vive cada responsabilidad','kiosk':'La ruta de una marca facial','payroll':'Del borrador al comprobante'}[kind]))


def generate():
 global LANG
 for lang in ('es','en'):
  LANG=lang
  for theme in ('dark','light'):
   dark=theme=='dark';write_atomic((OUT/f'card-{lang}-{theme}.svg'),card(dark))
   for name,label,href,icon in NAV+[('home','Inicio','','branch')]:
    width={'start':160,'docs':192,'architecture':178,'tests':145,'ci':95,'home':146}[name]
    write_atomic((OUT/f'nav-{name}-{lang}-{theme}.svg'),nav_button(dark,name,label,icon,width))
   for kind in ('start','docs','architecture','tests','modules','guides','security','database'):
    write_atomic((OUT/f'header-{kind}-{lang}-{theme}.svg'),page_header(dark,kind))
   for kind in ('architecture','docs','tests','setup','security','modules','code','kiosk','payroll'):
    write_atomic((OUT/f'diagram-{kind}-{lang}-{theme}.svg'),diagram(dark,kind))
   for selected in ('es','en'):
    write_atomic((OUT/f'lang-{selected}-{lang}-{theme}.svg'),language_button(dark,selected,lang==selected))
 LANG='es'
 print('Generated bilingual cards, navigation, language selectors and documentation headers.')

if __name__=='__main__':generate()
