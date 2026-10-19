#!/usr/bin/env python3
"""Local process adapter for the exported shell. No HTTP server and no shell eval."""
import concurrent.futures,contextlib,fcntl,json,os,pathlib,re,shutil,socket,subprocess,sys,time
APPS={'terminal':['kitty'],'browser':['firefox'],'files':['thunar'],'music':['playerctl','play-pause'],'settings':['pavucontrol'],'network':['nm-connection-editor'],'bluetooth':['blueman-manager'],'calculator':['qalculate-gtk'],'lock':['hyprlock']}
def run(args):
    if not shutil.which(args[0]): return None
    try:
        p=subprocess.run(args,capture_output=True,text=True,timeout=2,env={**os.environ,'LC_ALL':'C'})
        return p.stdout.strip() if p.returncode==0 else None
    except (subprocess.TimeoutExpired,OSError): return None

def mpv_ipc(command):
    path=pathlib.Path(__file__).resolve().parent/'.mpv.sock'
    if not path.exists():return None
    try:
        client=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);client.settimeout(.35);client.connect(str(path));client.sendall((json.dumps({'command':command})+'\n').encode());reply=json.loads(client.recv(65536).decode().splitlines()[0]);client.close()
        if reply.get('error')!='success':return None
        # Commands such as cycle/pause succeed with JSON data:null.  Preserve
        # None for failures only so a successful pause never starts another mpv.
        return True if reply.get('data') is None else reply.get('data')
    except (OSError,ValueError,IndexError):return None

@contextlib.contextmanager
def player_lock():
    path=pathlib.Path(__file__).resolve().parent/'.mpv.lock';handle=path.open('a+')
    try:fcntl.flock(handle,fcntl.LOCK_EX);yield
    finally:fcntl.flock(handle,fcntl.LOCK_UN);handle.close()

def local_player_pid():
    path=pathlib.Path(__file__).resolve().parent/'.mpv.pid'
    try:
        pid=int(path.read_text());os.kill(pid,0)
        command=pathlib.Path('/proc')/str(pid)/'cmdline';executable=pathlib.Path('/proc')/str(pid)/'exe'
        root=str(pathlib.Path(__file__).resolve().parent/'audio').encode()
        if not os.readlink(executable).endswith('/mpv') or root not in command.read_bytes():raise OSError('stale player pid')
        return pid
    except (OSError,ValueError):
        path.unlink(missing_ok=True);return None

def start_local_track(arg):
    if not re.fullmatch(r'audio/\d+\.(mp3|ogg|wav|flac|m4a)',arg):return {'ok':False,'error':'Invalid bundled audio path'}
    player=shutil.which('mpv');root=pathlib.Path(__file__).resolve().parent;media=(root/arg).resolve()
    if not player:return {'ok':False,'error':'Missing application: mpv'}
    if media.parent.parent!=root or not media.is_file():return {'ok':False,'error':'Bundled audio file is missing'}
    socket_path=root/'.mpv.sock';pid_path=root/'.mpv.pid'
    with player_lock():
        # A rapid second click can arrive while mpv is still creating its socket.
        existing=local_player_pid()
        if existing:
            for _ in range(10):
                paused=mpv_ipc(['get_property','pause'])
                if paused is not None:
                    mpv_ipc(['cycle','pause']);return {'ok':True,'message':'Local playback toggled'}
                time.sleep(.04)
            try:os.kill(existing,15);time.sleep(.08)
            except OSError:pass
        socket_path.unlink(missing_ok=True)
        try:
            process=subprocess.Popen([player,'--no-video','--force-window=no','--audio-display=no','--idle=no','--input-ipc-server='+str(socket_path),str(media)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            pid_path.write_text(str(process.pid));return {'ok':True,'message':'Bundled track started'}
        except OSError as e:return {'ok':False,'error':str(e)}

def workspace_snapshot():
    if not shutil.which('hyprctl'): return {'workspace':None}
    try:
        p=subprocess.run(['hyprctl','-j','activeworkspace'],capture_output=True,text=True,timeout=.45,env={**os.environ,'LC_ALL':'C'})
        return {'workspace':json.loads(p.stdout).get('id')} if p.returncode==0 else {'workspace':None}
    except (subprocess.TimeoutExpired,OSError,ValueError): return {'workspace':None}

def spectrum_snapshot():
    path=pathlib.Path(__file__).resolve().parent/'.spectrum.json'
    try:
        data=json.loads(path.read_text())
        if time.time()-float(data.get('updated',0))>3:return {'available':False,'error':'Audio capture is stale','bins':[0]*64}
        return data
    except (OSError,ValueError,TypeError):return {'available':False,'error':'Audio engine is starting','bins':[0]*64}

def snapshot():
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        requests={'audio':['wpctl','get-volume','@DEFAULT_AUDIO_SINK@'],'network':['nmcli','-t','-f','STATE','general'],'bluetooth':['bluetoothctl','show'],'title':['playerctl','metadata','--format','{{title}}'],'playing':['playerctl','status'],'notifications':['swaync-client','-c'],'gpu_nvidia':['nvidia-smi','--query-gpu=utilization.gpu','--format=csv,noheader,nounits']}
        values={k:pool.submit(run,v) for k,v in requests.items()}
        data={k:f.result() for k,f in values.items()}
    local_pause=mpv_ipc(['get_property','pause'])
    if local_pause is not None:
        data['playing']='Paused' if local_pause else 'Playing';data['title']=mpv_ipc(['get_property','media-title']) or data['title']
    audio=data['audio'];match=re.search(r'Volume:\s*([\d.]+)',audio or '')
    data['volume']=round(float(match[1])*100) if match else None;data['muted']='MUTED' in (audio or '')
    data['bluetooth']=('Powered: yes' in data['bluetooth']) if data['bluetooth'] is not None else None
    try:
        def cpu():
            v=list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:]));return sum(v[:8]),v[3]+v[4]
        total,idle=cpu();time.sleep(.12);total2,idle2=cpu();data['cpu']=round(100*(1-(idle2-idle)/max(1,total2-total)))
        mem=dict(re.findall(r'^(\w+):\s+(\d+)',pathlib.Path('/proc/meminfo').read_text(),re.M));data['memory']=round(100*(1-int(mem['MemAvailable'])/int(mem['MemTotal'])))
    except (OSError,KeyError,ValueError): data['cpu']=None;data['memory']=None
    try:
        total,used,free=shutil.disk_usage('/');data['disk']=round(100*used/total)
    except (OSError,ZeroDivisionError): data['disk']=None
    try:data['gpu']=round(float((data.pop('gpu_nvidia',None) or '').splitlines()[0]))
    except (ValueError,IndexError):
        data['gpu']=None
        for gpu_path in pathlib.Path('/sys/class/drm').glob('card*/device/gpu_busy_percent'):
            try:data['gpu']=round(float(gpu_path.read_text().strip()));break
            except (OSError,ValueError):pass
    try:data['temperature']=round(int(pathlib.Path('/sys/class/thermal/thermal_zone0/temp').read_text())/1000)
    except (OSError,ValueError):data['temperature']=None
    try:
        minutes=round(float(pathlib.Path('/proc/uptime').read_text().split()[0])/60);data['uptime']=f'{minutes//60}h {minutes%60}m'
    except (OSError,ValueError,IndexError):data['uptime']=None
    light=run(['brightnessctl','-m']);match=re.search(r',(\d+)%,',light or '');data['brightness']=int(match[1]) if match else None
    data['battery']=None
    for p in pathlib.Path('/sys/class/power_supply').glob('*'):
        try:
            if (p/'type').read_text().strip()=='Battery':data['battery']=int((p/'capacity').read_text());data['charging']=(p/'status').read_text().strip();break
        except (OSError,ValueError): pass
    return data

def action(name,arg=''):
    commands={'music':['playerctl','play-pause'],'mute':['wpctl','set-mute','@DEFAULT_AUDIO_SINK@','toggle'],'play':['playerctl','play-pause'],'next':['playerctl','next'],'previous':['playerctl','previous'],'notifications':['swaync-client','-t'],'suspend':['systemctl','suspend'],'reboot':['systemctl','reboot'],'shutdown':['systemctl','poweroff']}
    if name=='local-track':return start_local_track(arg)
    if name=='play' and pathlib.Path(__file__).resolve().parent.joinpath('.mpv.sock').exists():
        toggled=mpv_ipc(['cycle','pause'])
        if toggled is not None:return {'ok':True,'message':'Local playback toggled'}
        pathlib.Path(__file__).resolve().parent.joinpath('.mpv.sock').unlink(missing_ok=True)
    if name=='play' and arg:
        return start_local_track(arg)
    if name in ('previous','next') and local_player_pid():
        result=mpv_ipc(['seek',0,'absolute'])
        if result is not None:return {'ok':True,'message':'Local track restarted'}
    if name in APPS and name != 'music':
        args=APPS[name]
        if not shutil.which(args[0]):return {'ok':False,'error':'Missing application: '+args[0]}
        try:subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True);return {'ok':True,'message':'Launch requested'}
        except OSError as e:return {'ok':False,'error':str(e)}
    if name=='volume':
        if not re.fullmatch(r'\d{1,3}',arg) or not 0<=int(arg)<=100:return {'ok':False,'error':'Invalid volume'}
        args=['wpctl','set-volume','@DEFAULT_AUDIO_SINK@',str(int(arg))+'%']
    elif name=='volume-step':
        if not re.fullmatch(r'-?\d{1,2}',arg) or not -25<=int(arg)<=25:return {'ok':False,'error':'Invalid step'}
        args=['wpctl','set-volume','-l','1.0','@DEFAULT_AUDIO_SINK@',str(abs(int(arg)))+'%'+('+' if int(arg)>0 else '-')]
    elif name=='workspace':
        if not arg.isdigit() or not 1<=int(arg)<=10:return {'ok':False,'error':'Invalid workspace'}
        version=run(['hyprctl','-j','version']) or '';v=re.search(r'0\.(\d+)',version)
        if not v:return {'ok':False,'error':'Cannot determine Hyprland version'}
        args=['hyprctl','dispatch',f'hl.dsp.focus({{ workspace = "{int(arg)}" }})'] if int(v[1])>=55 else ['hyprctl','dispatch','workspace',str(int(arg))]
    elif name in commands:args=commands[name]
    else:return {'ok':False,'error':'Unsupported action'}
    output=run(args)
    return {'ok':output is not None,'error':None if output is not None else 'Command unavailable or failed: '+args[0]}
if __name__=='__main__':
    if len(sys.argv)==1 or sys.argv[1]=='snapshot':print(json.dumps(snapshot()))
    elif sys.argv[1]=='workspace-snapshot':print(json.dumps(workspace_snapshot()))
    elif sys.argv[1]=='spectrum-snapshot':print(json.dumps(spectrum_snapshot()))
    elif sys.argv[1]=='check':print(json.dumps({name:bool(shutil.which(name)) for name in ['qs','python3','hyprctl','pw-cat','wpctl','nmcli','bluetoothctl','playerctl','mpv','swaync-client','kitty','firefox','thunar','pavucontrol','nm-connection-editor','blueman-manager','hyprlock']}))
    else:print(json.dumps(action(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else '')))
