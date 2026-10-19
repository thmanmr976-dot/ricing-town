#!/usr/bin/env python3
"""CAVA/PipeWire spectrum daemon for Ricing Town exports.

CAVA is preferred because its gravity/integral filters and stereo-centred raw
output are the same signal path used by mature desktop visualizer widgets. The
dependency-free PipeWire FFT below remains a truthful fallback.
"""
import array, cmath, json, math, os, pathlib, shutil, subprocess, sys, tempfile, time

RATE = 48000
FFT_SIZE = 2048
BANDS = 64
STATE = pathlib.Path(__file__).resolve().parent / '.spectrum.json'

def cava_config(bands, autosens, noise, channels):
    return f'''[general]
framerate = 60
autosens = {1 if autosens else 0}
sensitivity = 100
bars = {bands}
lower_cutoff_freq = 50
higher_cutoff_freq = 10000
sleep_timer = 0

[input]
method = pipewire
source = auto
active = 1
remix = 1

[output]
method = raw
raw_target = /dev/stdout
data_format = ascii
ascii_max_range = 1000
bar_delimiter = 59
frame_delimiter = 10
channels = {channels}

[smoothing]
monstercat = 0
waves = 0
noise_reduction = {noise}
'''

def run_cava(bands, autosens, noise, channels):
    cava=shutil.which('cava')
    if not cava:return False
    config=None; process=None; previous=[0.0]*bands; flux_avg=.01; beat=0.0; last_beat=0.0
    try:
        with tempfile.NamedTemporaryFile('w',prefix='ricing-town-cava-',suffix='.conf',delete=False) as out:
            config=out.name;out.write(cava_config(bands,autosens,noise,channels))
        process=subprocess.Popen([cava,'-p',config],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        for line in process.stdout:
            try: values=[min(1,max(0,float(v)/1000)) for v in line.strip().split(';') if v!='']
            except ValueError:continue
            if len(values)!=bands:continue
            flux=sum(max(0,n-o) for n,o in zip(values,previous))/bands;previous=values
            flux_avg=flux_avg*.92+flux*.08;now=time.monotonic()
            centre=values[bands//4:bands*3//4] if channels=='stereo' else values[:max(1,bands//3)]
            is_beat=flux>max(.012,flux_avg*1.55) and max(centre or [0])>.2 and now-last_beat>.16
            if is_beat:beat=1.0;last_beat=now
            else:beat*=.7
            if channels=='stereo':
                quarter=max(1,bands//4);bass=max(values[quarter:bands-quarter] or [0]);treble=max(values[:quarter]+values[bands-quarter:] or [0]);mid=max(values[quarter//2:quarter]+values[bands-quarter:bands-quarter//2] or [0])
            else:
                third=max(1,bands//3);bass=max(values[:third] or [0]);mid=max(values[third:third*2] or [0]);treble=max(values[third*2:] or [0])
            publish({'available':True,'engine':'cava','layout':'stereo-center' if channels=='stereo' else 'mono-frequency','bins':[round(x,4) for x in values],'bass':round(bass,4),'mid':round(mid,4),'treble':round(treble,4),'level':round(sum(values)/bands,4),'flux':round(flux,4),'beat':round(beat,4),'updated':time.time()})
        message=(process.stderr.read() or 'CAVA stopped').strip().splitlines()[-1][:160]
        publish({'available':False,'engine':'cava','error':message,'bins':[0]*bands});return True
    except (OSError,subprocess.SubprocessError) as exc:
        publish({'available':False,'engine':'cava','error':str(exc)[:160],'bins':[0]*bands});return True
    finally:
        if process and process.poll() is None:process.terminate()
        if config:
            try:os.unlink(config)
            except OSError:pass

def fft(values):
    n=len(values); j=0
    for i in range(1,n):
        bit=n>>1
        while j & bit: j^=bit; bit>>=1
        j^=bit
        if i<j: values[i],values[j]=values[j],values[i]
    length=2
    while length<=n:
        root=cmath.exp(-2j*math.pi/length); half=length//2
        for start in range(0,n,length):
            w=1+0j
            for offset in range(half):
                even=values[start+offset]; odd=values[start+offset+half]*w
                values[start+offset]=even+odd; values[start+offset+half]=even-odd; w*=root
        length*=2
    return values

def band_edges():
    low,high=20.0,20000.0
    return [low*((high/low)**(i/BANDS)) for i in range(BANDS+1)]

EDGES=band_edges()

def spectrum(samples):
    windowed=[complex(samples[i]*(.5-.5*math.cos(2*math.pi*i/(FFT_SIZE-1))),0) for i in range(FFT_SIZE)]
    values=fft(windowed); mags=[abs(v)/(FFT_SIZE*.18) for v in values[:FFT_SIZE//2]]
    out=[]
    for lo,hi in zip(EDGES,EDGES[1:]):
        a=max(1,int(lo*FFT_SIZE/RATE)); b=max(a+1,min(len(mags),int(hi*FFT_SIZE/RATE)+1))
        energy=math.sqrt(sum(x*x for x in mags[a:b])/max(1,b-a))
        out.append(min(1.0,math.log1p(energy*18)/math.log(19)))
    return out

def publish(payload):
    temp=STATE.with_suffix('.tmp');temp.write_text(json.dumps(payload,separators=(',',':')));os.replace(temp,STATE)

def capture_command():
    tool=shutil.which('pw-cat')
    if not tool:return None
    target=os.environ.get('RICING_TOWN_AUDIO_TARGET','@DEFAULT_AUDIO_SINK@')
    return [tool,'--record','--target',target,'-P','{ stream.capture.sink = true }','--format','s16','--rate',str(RATE),'--channels','1','--raw','-']

def main():
    bands=max(4,min(96,int(sys.argv[1]) if len(sys.argv)>1 else BANDS))
    autosens=(sys.argv[2] if len(sys.argv)>2 else '1')!='0'
    noise=max(0,min(100,int(sys.argv[3]) if len(sys.argv)>3 else 77))
    channels=(sys.argv[4] if len(sys.argv)>4 else 'stereo');channels=channels if channels in ('stereo','mono') else 'stereo'
    engine=sys.argv[5] if len(sys.argv)>5 else 'cava'
    if engine=='cava' and run_cava(bands,autosens,noise,channels):return 0
    command=capture_command()
    if not command:
        publish({'available':False,'error':'pw-cat is not installed','bins':[0]*BANDS});return 1
    smooth=[0.0]*BANDS; previous=[0.0]*BANDS; peak=.08; level_avg=.02; flux_avg=.01; beat=0.0; last_beat=0.0
    while True:
        try:
            process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            publish({'available':True,'bins':smooth,'bass':0,'mid':0,'treble':0,'updated':time.time()})
            while True:
                raw=process.stdout.read(FFT_SIZE*2)
                if len(raw)<FFT_SIZE*2:break
                pcm=array.array('h');pcm.frombytes(raw)
                if sys.byteorder!='little':pcm.byteswap()
                samples=[sample/32768 for sample in pcm[:FFT_SIZE]];current=spectrum(samples)
                frame_peak=max(current);peak=max(.04,frame_peak,peak*.992)
                normalized=[min(1,max(0,value/peak)) for value in current]
                smooth=[old*(.48 if new>old else .82)+new*(.52 if new>old else .18) for old,new in zip(smooth,normalized)]
                flux=sum(max(0,new-old) for new,old in zip(normalized,previous))/BANDS;previous=normalized
                flux_avg=flux_avg*.92+flux*.08;now=time.monotonic()
                is_beat=flux>max(.018,flux_avg*1.65) and max(normalized[:24] or [0])>.28 and now-last_beat>.16
                if is_beat:beat=1.0;last_beat=now
                else:beat*=.72
                rms=math.sqrt(sum(x*x for x in samples)/len(samples));level_avg=level_avg*.96+rms*.04
                level=min(1,rms/max(.015,level_avg*1.8))
                bass=max(smooth[:24] or [0]);mid=max(smooth[24:49] or [0]);treble=max(smooth[49:] or [0])
                publish({'available':True,'bins':[round(x,4) for x in smooth],'bass':round(bass,4),'mid':round(mid,4),'treble':round(treble,4),'level':round(level,4),'flux':round(flux,4),'beat':round(beat,4),'updated':time.time()})
            process.kill();process.wait(timeout=1)
        except (OSError,ValueError,subprocess.SubprocessError) as exc:
            publish({'available':False,'error':str(exc)[:160],'bins':[0]*BANDS})
        time.sleep(1)

if __name__=='__main__':raise SystemExit(main())
