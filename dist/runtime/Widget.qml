import QtQuick
import QtQuick.Effects
import Quickshell
Rectangle {
    id: widget
    required property var config
    required property var runtime
    required property var liveData
    required property var fontNames
    property real scaleFactor: 1
    property var opts: config.options || ({})
    property var style: config.appearance || ({})
    property var behavior: config.behavior || ({})
    property var custom: config.custom || ({})
    property var motion: config.animation || ({})
    property var timeline: config.timeline || ({})
    property var signalBindings: config.signalBindings || []
    property var meter: config.meter || ({})
    property string meterStyle: meter.style || "none"
    property real meterRatio: { const raw=logicValue(meter.source || "cpu"); if(raw === undefined || raw === null || isNaN(Number(raw))) return 0; const lo=Number(meter.min || 0), hi=Number(meter.max === undefined ? 100 : meter.max); return Math.max(0,Math.min(1,(Number(raw)-lo)/Math.max(.0001,hi-lo))); }
    Behavior on meterRatio { NumberAnimation { duration: 420; easing.type: Easing.OutCubic } }
    property var hoverSpec: config.hover || ({})
    property bool hoverActive: hoverSpec.enabled === true && hoverWatch.hovered
    property real hoverScale: hoverActive ? Number(hoverSpec.scale || 1.05) : 1
    property real hoverLift: hoverActive ? Number(hoverSpec.lift || 0) : 0
    Behavior on hoverScale { NumberAnimation { duration: 170; easing.type: Easing.OutCubic } }
    Behavior on hoverLift { NumberAnimation { duration: 170; easing.type: Easing.OutCubic } }
    HoverHandler { id: hoverWatch }
    property var gradientSpec: style.gradient || ({})
    property bool useGradient: gradientSpec.enabled === true
    property color gradientEnd: gradientSpec.end || config.fill
    property real gradientAngle: ((Number(gradientSpec.angle === undefined ? 90 : gradientSpec.angle) % 180) + 180) % 180
    property Gradient fillGradient: Gradient {
        orientation: widget.gradientAngle >= 45 && widget.gradientAngle < 135 ? Gradient.Horizontal : Gradient.Vertical
        GradientStop { position: 0; color: Qt.rgba(widget.base.r, widget.base.g, widget.base.b, widget.alpha) }
        GradientStop { position: 1; color: Qt.rgba(widget.gradientEnd.r, widget.gradientEnd.g, widget.gradientEnd.b, widget.alpha) }
    }
    property real timelineProgress: 0
    property int shownWorkspace: runtime.displayWorkspace > 0 ? runtime.displayWorkspace : 1
    property int activeWorkspace: Number(liveData.workspace || 1)
    property var pageLayout: (config.workspaceLayout || [])[Math.max(0,shownWorkspace-1)] || ({})
    property string pageAlign: pageLayout.align || opts.align || "center"
    function visibleOnWorkspace(page) { return (!(config.workspaceOnly > 0) || config.workspaceOnly === page) && (!(config.workspaceHidden > 0) || config.workspaceHidden !== page); }
    visible: visibleOnWorkspace(shownWorkspace)
    property var activeLogic: findLogic()
    property var logicStyle: activeLogic ? activeLogic.style : ({})
    property string effectiveMotion: logicStyle.animation || motion.kind || "none"
    property real alpha: logicStyle.opacity === undefined ? (style.opacity === undefined ? 1 : style.opacity) : logicStyle.opacity
    property color base: logicStyle.fill || config.fill
    color: Qt.rgba(base.r, base.g, base.b, alpha)
    gradient: useGradient ? fillGradient : undefined
    radius: custom.shape === "circle" ? Math.min(width,height)/2 : custom.shape === "pill" ? height/2 : config.radius * scaleFactor
    border.width: (style.borderWidth || 0) * scaleFactor
    border.color: style.borderColor || "#cba6f7"
    layer.enabled: (style.shadow || 0) > 0 || (motion.enabled && effectiveMotion === "glow")
    layer.effect: MultiEffect { id: effects; shadowEnabled: true; shadowBlur: Math.min(1,(widget.style.shadow || 0)/80); shadowVerticalOffset: (widget.style.shadow || 0)/3; shadowColor: widget.effectiveMotion === "glow" ? (widget.logicStyle.color || widget.config.color) : "#66000000" }
    function timelineValue(key, fallback) { const frames=timeline.keyframes || []; if(!timeline.enabled || frames.length<2)return fallback; const p=timelineProgress; let left=frames[0],right=frames[frames.length-1]; for(let i=1;i<frames.length;i++)if(p<=frames[i].at){left=frames[i-1];right=frames[i];break;} const span=Math.max(.0001,right.at-left.at),ratio=Math.max(0,Math.min(1,(p-left.at)/span)); return Number(left[key])+(Number(right[key])-Number(left[key]))*ratio; }
    function bindingValue(target, fallback) { let value=fallback; for(let i=0;i<signalBindings.length;i++){const b=signalBindings[i];if(b.target!==target)continue;const raw=logicValue(b.source);if(raw===undefined||raw===null)continue;const ratio=Math.max(0,Math.min(1,(Number(raw)-Number(b.inputMin))/Math.max(.0001,Number(b.inputMax)-Number(b.inputMin))));value=Number(b.outputMin)+ratio*(Number(b.outputMax)-Number(b.outputMin));} return value; }
    opacity: timelineValue("opacity",1) * bindingValue("opacity",1)
    transform: [Translate { id: motionOffset }, Translate { x: widget.timelineValue("x",0)+widget.bindingValue("xOffset",0); y:widget.timelineValue("y",0)+widget.bindingValue("yOffset",0)-widget.hoverLift }, Scale { origin.x:widget.width/2; origin.y:widget.height/2; xScale:widget.timelineValue("scale",1)*widget.bindingValue("scale",1)*widget.hoverScale; yScale:xScale }, Rotation { origin.x:widget.width/2; origin.y:widget.height/2; angle:widget.timelineValue("rotation",0)+widget.bindingValue("rotation",0) }]
    property string family: style.fontAsset ? (fontNames[style.fontAsset] || "sans-serif") : (style.font || "sans-serif")
    function logicValue(source) { const d=liveData, spectrum=d.spectrum || ({}); return ({cpu:d.cpu,memory:d.memory,battery:d.battery,volume:d.volume,brightness:d.brightness,temperature:d.temperature,disk:d.disk,gpu:d.gpu,workspace:Number(d.workspace || shownWorkspace),network:d.network === true || String(d.network || "").toLowerCase().indexOf("connected") >= 0,musicPlaying:String(d.playing || "").toLowerCase() === "playing" || d.playing === true,charging:["charging","full"].indexOf(String(d.charging || "").toLowerCase()) >= 0,spectrumBass:spectrum.bass,spectrumMid:spectrum.mid,spectrumTreble:spectrum.treble,spectrumBeat:spectrum.beat})[source]; }
    function ruleMatches(rule) { if(!rule.enabled) return false; const a=logicValue(rule.source), b=rule.value; if(a === undefined || a === null) return false; if(rule.operator === "lt") return Number(a)<Number(b); if(rule.operator === "lte") return Number(a)<=Number(b); if(rule.operator === "eq") return String(a)===String(b); if(rule.operator === "neq") return String(a)!==String(b); if(rule.operator === "gte") return Number(a)>=Number(b); if(rule.operator === "gt") return Number(a)>Number(b); return false; }
    function findLogic() { const rules=config.logic || []; for(let i=0;i<rules.length;i++) if(ruleMatches(rules[i])) return rules[i]; return null; }
    function displayText(baseText) { return logicStyle.text ? String(logicStyle.text).replace(/\{\{value\}\}/g,baseText) : baseText; }
    function value(v, suffix) { return v === null || v === undefined ? "Unavailable" : String(v) + suffix }
    function textValue() {
        const t=config.type, d=liveData;
        if (t === "clock") return Qt.formatDateTime(runtime.now, (config.format === "12h" ? "hh:mm" + (opts.showSeconds?":ss":"") + " AP" : "HH:mm" + (opts.showSeconds?":ss":"")) + (opts.showDate ? " · dd MMM" : ""));
        if (t === "volume") return d.volume == null ? "Audio unavailable" : (d.muted ? "Muted" : d.volume + "%");
        if (t === "brightness") return value(d.brightness, "%");
        if (t === "network") return value(d.network, "");
        if (t === "bluetooth") return d.bluetooth == null ? "BT unavailable" : d.bluetooth ? "Bluetooth on" : "Bluetooth off";
        if (t === "battery") return value(d.battery, "%");
        if (t === "notifications") return value(d.notifications, " notifications");
        if (t === "music") return d.title || "No media player";
        if (t === "cpu") return value(d.cpu, "% CPU");
        if (t === "memory") return value(d.memory, "% RAM");
        if (t === "gpu") return value(d.gpu, "% GPU");
        if (t === "temperature") return value(d.temperature, "°C");
        if (t === "disk") return value(d.disk, "% disk");
        if (t === "uptime") return d.uptime || "Uptime unavailable";
        if (t === "launcher") return "Applications";
        if (t === "power") return "Power";
        return "";
    }
    function customValue() {
        const source=custom.dataSource || "static";
        const pages=config.workspaceContent || [];
        const template=pages.length && pages[Math.max(0,shownWorkspace-1)] !== undefined ? pages[Math.max(0,shownWorkspace-1)] : (custom.text || "");
        let v=template;
        if(source === "time") v=Qt.formatDateTime(runtime.now,"HH:mm");
        else if(source === "date") v=Qt.formatDateTime(runtime.now,"dddd, d MMMM");
        else if(source === "cpu") v=value(liveData.cpu,"% CPU");
        else if(source === "memory") v=value(liveData.memory,"% RAM");
        else if(source === "battery") v=value(liveData.battery,"% battery");
        else if(source === "music") v=liveData.title || "No media player";
        else if(source === "network") v=liveData.network || "Network unavailable";
        else if(source === "volume") v=liveData.volume == null ? "Audio unavailable" : (liveData.muted ? "Muted" : liveData.volume + "%");
        else if(source === "brightness") v=value(liveData.brightness,"%");
        else if(source === "temperature") v=value(liveData.temperature,"°C");
        else if(source === "disk") v=value(liveData.disk,"% disk");
        else if(source === "gpu") v=value(liveData.gpu,"% GPU");
        else if(source === "uptime") v=liveData.uptime || "Uptime unavailable";
        else if(source === "workspace") v=String(shownWorkspace);
        const raw=source === "workspace" ? shownWorkspace : logicValue(source);
        const numberText=raw === undefined || raw === null || isNaN(Number(raw)) ? "–" : String(Math.round(Number(raw)));
        const output=template === "" ? "" : (template || "{{value}}");
        return output.replace(/\{\{value\}\}/g,v).replace(/\{\{number\}\}/g,numberText).replace(/\{\{time\}\}/g,Qt.formatDateTime(runtime.now,"HH:mm")).replace(/\{\{date\}\}/g,Qt.formatDateTime(runtime.now,"d MMM"));
    }
    property bool workspaceParticipant: (config.workspaceContent || []).length > 0 || config.workspaceOnly > 0 || config.workspaceHidden > 0
    Connections {
        target: runtime
        function onWorkspaceExitRevisionChanged() { if(widget.workspaceParticipant && widget.visible) workspaceExit.restart(); }
        function onWorkspaceEnterRevisionChanged() { widget.shownWorkspace=Number(runtime.displayWorkspace || 1); if(widget.workspaceParticipant && widget.visible) workspaceEnter.restart(); else { motionOffset.x=0; widget.opacity=1; } }
    }
    SequentialAnimation {
        id: workspaceExit
        PauseAnimation { duration: ((widget.config.workspaceMotion && widget.config.workspaceMotion.order) || 0) * 90 }
        ParallelAnimation { NumberAnimation { target:motionOffset; property:"x"; to:180; duration:320; easing.type:Easing.InCubic } NumberAnimation { target:widget; property:"opacity"; to:0; duration:320; easing.type:Easing.InCubic } }
    }
    SequentialAnimation {
        id: workspaceEnter
        PropertyAction { target:motionOffset; property:"x"; value:-180 }
        PropertyAction { target:widget; property:"opacity"; value:0 }
        PauseAnimation { duration: ((widget.config.workspaceMotion && widget.config.workspaceMotion.order) || 0) * 90 }
        ParallelAnimation { NumberAnimation { target:motionOffset; property:"x"; to:0; duration:400; easing.type:Easing.OutCubic } NumberAnimation { target:widget; property:"opacity"; to:1; duration:400; easing.type:Easing.OutCubic } }
    }
    NumberAnimation on timelineProgress { running:widget.timeline.enabled === true && (widget.timeline.keyframes || []).length>=2; from:0; to:1; duration:widget.timeline.duration || 2000; loops:widget.timeline.loop===false?1:Animation.Infinite; easing.type:Easing.Linear }
    SequentialAnimation on scale { running: widget.motion.enabled && !widget.timeline.enabled && widget.effectiveMotion === "pulse"; loops: widget.motion.iteration === "once" ? 1 : Animation.Infinite; PauseAnimation { duration: widget.motion.delay || 0 } NumberAnimation { to:1.06; duration:(widget.motion.duration || 1200)/2; easing.type:Easing.InOutQuad } NumberAnimation { to:1; duration:(widget.motion.duration || 1200)/2; easing.type:Easing.InOutQuad } }
    RotationAnimation on rotation { running: widget.motion.enabled && !widget.timeline.enabled && widget.effectiveMotion === "rotate"; from:0; to:360; duration:widget.motion.duration || 1200; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite }
    SequentialAnimation on opacity { running: widget.motion.enabled && !widget.timeline.enabled && widget.effectiveMotion === "fade"; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite; NumberAnimation { to:.35; duration:(widget.motion.duration || 1200)/2 } NumberAnimation { to:1; duration:(widget.motion.duration || 1200)/2 } }
    SequentialAnimation { running: widget.motion.enabled && widget.effectiveMotion === "float"; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite; NumberAnimation { target:motionOffset; property:"y"; to:-12; duration:(widget.motion.duration || 1200)/2; easing.type:Easing.InOutQuad } NumberAnimation { target:motionOffset; property:"y"; to:0; duration:(widget.motion.duration || 1200)/2; easing.type:Easing.InOutQuad } }
    SequentialAnimation { running: widget.motion.enabled && widget.effectiveMotion === "slide"; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite; PauseAnimation { duration:widget.motion.delay || 0 } PropertyAction { target:motionOffset; property:"x"; value:-24 } PropertyAction { target:widget; property:"opacity"; value:0 } ParallelAnimation { NumberAnimation { target:motionOffset; property:"x"; to:0; duration:widget.motion.duration || 1200; easing.type:Easing.InOutQuad } NumberAnimation { target:widget; property:"opacity"; to:1; duration:widget.motion.duration || 1200; easing.type:Easing.InOutQuad } } }
    SequentialAnimation { running: widget.motion.enabled && !widget.timeline.enabled && widget.effectiveMotion === "bounce"; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite; PauseAnimation { duration:widget.motion.delay || 0 } NumberAnimation { target:motionOffset; property:"y"; to:-18; duration:(widget.motion.duration || 1200)*.35; easing.type:Easing.OutQuad } NumberAnimation { target:motionOffset; property:"y"; to:0; duration:(widget.motion.duration || 1200)*.65; easing.type:Easing.OutBounce } }
    SequentialAnimation { running: widget.motion.enabled && !widget.timeline.enabled && widget.effectiveMotion === "shake"; loops:widget.motion.iteration === "once" ? 1 : Animation.Infinite; PauseAnimation { duration:widget.motion.delay || 0 } NumberAnimation { target:motionOffset; property:"x"; to:-7; duration:(widget.motion.duration || 1200)*.1 } NumberAnimation { target:motionOffset; property:"x"; to:7; duration:(widget.motion.duration || 1200)*.15 } NumberAnimation { target:motionOffset; property:"x"; to:-4; duration:(widget.motion.duration || 1200)*.15 } NumberAnimation { target:motionOffset; property:"x"; to:4; duration:(widget.motion.duration || 1200)*.15 } NumberAnimation { target:motionOffset; property:"x"; to:0; duration:(widget.motion.duration || 1200)*.1 } PauseAnimation { duration:(widget.motion.duration || 1200)*.35 } }
    // Studio-defined actions map to the fixed bridge.py allowlist; nothing here runs project text.
    function runAction(key) {
        const all=config.actions || ({}), a=all[key];
        if (!a || !a.type || a.type === "none") return false;
        const p=a.params || ({});
        if (a.type === "launch") runtime.act(String(p.app || ""), "");
        else if (a.type === "workspace") runtime.act("workspace", String(p.workspace));
        else if (a.type === "volumeSet") runtime.act("volume", String(p.value));
        else if (a.type === "volumeStep") runtime.act("volume-step", String(p.delta));
        else if (a.type === "muteToggle") runtime.act("mute", "");
        else if (a.type === "media") runtime.act(p.command === "play-pause" ? "play" : String(p.command), "");
        else if (a.type === "openPanel") runtime.openPanel(p.panel === "calendar" ? "clock" : String(p.panel), config);
        else if (a.type === "power") runtime.openPanel("power", ({}));
        else return false;
        return true;
    }
    MouseArea {
        anchors.fill: parent
        enabled: widget.config.type !== "workspaces" && widget.config.type !== "music"
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: (widget.config.actions && (widget.config.actions.click || widget.config.actions.rightClick)) ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: mouse => {
            if (widget.runAction(mouse.button === Qt.RightButton ? "rightClick" : "click")) return;
            if (mouse.button === Qt.RightButton) return;
            if (widget.behavior.click === "none") return;
            if (widget.behavior.click === "mute") runtime.act("mute", "");
            else if (widget.config.type !== "bar" && widget.config.type !== "dock" && widget.config.type !== "visualizer") runtime.openPanel(widget.config.type, widget.config);
        }
        onWheel: event => {
            if (widget.runAction(event.angleDelta.y > 0 ? "scrollUp" : "scrollDown")) return;
            if (widget.config.type === "volume" && widget.behavior.scroll !== "none") runtime.act("volume-step", String((event.angleDelta.y > 0 ? 1 : -1) * (widget.behavior.volumeStep || 5)));
        }
    }
    Item {
        anchors.fill: parent
        anchors.margins: (widget.opts.padding === undefined ? 4 : widget.opts.padding) * widget.scaleFactor
        clip: true
        Image {
            anchors.centerIn: parent
            visible: !!widget.config.bundledIcon
            source: widget.config.bundledIcon ? Qt.resolvedUrl(widget.config.bundledIcon) : ""
            width: widget.config.type === "shape" ? parent.width : (widget.opts.iconSize || 18) * widget.scaleFactor
            height: widget.config.type === "shape" ? parent.height : width
            sourceSize.width: Math.max(16, width * 2)
            sourceSize.height: Math.max(16, height * 2)
            fillMode: Image.PreserveAspectFit
        }
        Item {
            anchors.fill: parent
            visible: widget.meterStyle === "bar"
            Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; height: Math.max(2, (widget.meter.thickness || 8) * widget.scaleFactor); radius: height/2; color: widget.meter.track || "#ffffff"; opacity: .25 }
            Rectangle { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter; width: parent.width * widget.meterRatio; height: Math.max(2, (widget.meter.thickness || 8) * widget.scaleFactor); radius: height/2; color: widget.meter.color || widget.config.color }
        }
        Item {
            anchors.fill: parent
            visible: widget.meterStyle === "vbar"
            Rectangle { anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.horizontalCenter: parent.horizontalCenter; width: Math.max(2, (widget.meter.thickness || 8) * widget.scaleFactor); radius: width/2; color: widget.meter.track || "#ffffff"; opacity: .25 }
            Rectangle { anchors.bottom: parent.bottom; anchors.horizontalCenter: parent.horizontalCenter; height: parent.height * widget.meterRatio; width: Math.max(2, (widget.meter.thickness || 8) * widget.scaleFactor); radius: width/2; color: widget.meter.color || widget.config.color }
        }
        Canvas {
            id: meterRing
            anchors.centerIn: parent
            width: Math.min(parent.width, parent.height)
            height: width
            visible: widget.meterStyle === "ring"
            property real ratio: widget.meterRatio
            onRatioChanged: requestPaint()
            onVisibleChanged: requestPaint()
            onWidthChanged: requestPaint()
            Component.onCompleted: requestPaint()
            onPaint: {
                const ctx=getContext("2d"), t=Math.max(2,(widget.meter.thickness || 8)*widget.scaleFactor), r=Math.max(1,width/2-t/2);
                ctx.reset(); ctx.lineWidth=t; ctx.lineCap="round";
                ctx.globalAlpha=.25; ctx.strokeStyle=String(widget.meter.track || "#ffffff"); ctx.beginPath(); ctx.arc(width/2,height/2,r,0,Math.PI*2); ctx.stroke();
                ctx.globalAlpha=1; ctx.strokeStyle=String(widget.meter.color || widget.config.color); ctx.beginPath(); ctx.arc(width/2,height/2,r,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio); ctx.stroke();
            }
        }
        Text {
            anchors.centerIn: parent
            visible: ["workspaces","bar","dock","widget","text","shape","memoryChart","visualizer","music"].indexOf(widget.config.type) < 0
            text: widget.displayText((widget.opts.icon ? widget.opts.icon + " " : "") + widget.textValue())
            color: widget.logicStyle.color || (widget.config.type === "volume" && widget.liveData.muted ? (widget.behavior.mutedColor || "#ddaaa3") : widget.config.color)
            font.pixelSize: widget.config.fontSize * widget.scaleFactor
            fontSizeMode: Text.Fit
            minimumPixelSize: Math.max(8, 8 * widget.scaleFactor)
            font.family: widget.family
        }
        Text {
            anchors.fill: parent
            visible: ["widget","text","shape"].indexOf(widget.config.type) >= 0
            text: widget.displayText(widget.customValue())
            textFormat: Text.PlainText
            color: widget.logicStyle.color || widget.config.color
            font.pixelSize: widget.config.fontSize * widget.scaleFactor
            fontSizeMode: Text.Fit
            minimumPixelSize: Math.max(8, 8 * widget.scaleFactor)
            font.family: widget.family
            horizontalAlignment: widget.pageAlign === "start" ? Text.AlignLeft : widget.pageAlign === "end" ? Text.AlignRight : Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            wrapMode: Text.Wrap
        }
        Row {
            anchors.centerIn: parent
            visible: widget.config.type === "music"
            spacing: 7 * widget.scaleFactor
            Text { text: widget.liveData.title || "No player"; color:widget.config.color; width:Math.max(60,widget.width-112*widget.scaleFactor); elide:Text.ElideRight; verticalAlignment:Text.AlignVCenter; anchors.verticalCenter:parent.verticalCenter; font.pixelSize:Math.max(10,widget.config.fontSize*widget.scaleFactor) }
            Repeater {
                model: ["previous","play","next"]
                Rectangle { required property int index; required property string modelData; width:27*widget.scaleFactor; height:27*widget.scaleFactor; radius:height/2; color:"transparent"; Text { anchors.centerIn:parent; text:index===0?"⏮":index===2?"⏭":(String(widget.liveData.playing).toLowerCase()==="playing"?"⏸":"▶"); color:widget.config.color; font.pixelSize:14*widget.scaleFactor } MouseArea { anchors.fill:parent; onClicked:widget.runtime.act(parent.modelData,parent.modelData==="play" ? (widget.config.bundledMedia || "") : "") } }
            }
        }
        Item {
            id: memoryGraph
            anchors.fill: parent
            anchors.margins: 22
            visible: widget.config.type === "memoryChart"
            onVisibleChanged: if (visible) graph.requestPaint()
            Text { text: "RAM usage · " + widget.value(widget.liveData.memory, "%"); color: widget.config.color; font.pixelSize: 22 * widget.scaleFactor; font.bold: true }
            Canvas {
                id: graph
                anchors { left: parent.left; right: parent.right; top: parent.top; bottom: parent.bottom; topMargin: 42 }
                onWidthChanged: requestPaint()
                onHeightChanged: requestPaint()
                Component.onCompleted: requestPaint()
                onPaint: {
                    const ctx=getContext("2d"), points=[.78,.68,.73,.48,.57,.31,.39,.16,.22];
                    ctx.clearRect(0,0,width,height); ctx.strokeStyle=widget.config.color; ctx.lineWidth=2; ctx.beginPath();
                    for(let i=0;i<points.length;i++){const x=i*width/(points.length-1),y=points[i]*height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
                }
            }
        }
        Item {
            id: musicWaves
            anchors.fill: parent
            anchors.margins: Math.max(8, widget.opts.padding * widget.scaleFactor)
            visible: widget.config.type === "visualizer"
            property var spectrum: widget.config.spectrum || ({})
            property int barCount: spectrum.bars || 28
            property var bins: (widget.liveData.spectrum || {}).bins || []
            property bool horizontal: ["left","right"].indexOf(spectrum.direction) >= 0
            property bool waveform: spectrum.style === "waveform"
            function rangeBounds() { const value=spectrum.range || "full", count=Math.max(1,bins.length || barCount), bass=Math.max(1,Math.round(count*.375)), treble=Math.max(bass+1,Math.round(count*.765)); return value==="bass"?[0,bass]:value==="mid"?[bass,treble]:value==="treble"?[treble,count]:[0,count]; }
            function amplitude(index) { const bounds=rangeBounds(), count=Math.max(1,bounds[1]-bounds[0]), mirrored=spectrum.mirror===true, ratio=mirrored?Math.abs(index-(barCount-1)/2)/Math.max(1,(barCount-1)/2):index/Math.max(1,barCount-1), source=Math.min(bounds[1]-1,bounds[0]+Math.floor(ratio*count)), raw=bins.length?Number(bins[source]||0):.08; return Math.max(.025,Math.min(1,raw*Number(spectrum.sensitivity||1.4))); }
            Column {
                id: horizontalBars
                anchors.fill: parent
                visible: musicWaves.horizontal
                spacing: Math.max(1, height / 260)
                Repeater {
                    model: musicWaves.horizontal ? musicWaves.barCount : 0
                    Rectangle {
                        required property int index
                        width: horizontalBars.width * musicWaves.amplitude(index)
                        height: Math.max(2,(horizontalBars.height-horizontalBars.spacing*(musicWaves.barCount-1))/musicWaves.barCount)
                        anchors.right: musicWaves.spectrum.direction === "left" ? parent.right : undefined
                        radius: height/2; color:"transparent"; opacity:.94
                        gradient: Gradient { orientation:Gradient.Horizontal; GradientStop { position:0; color:widget.config.color } GradientStop { position:1; color:musicWaves.spectrum.secondaryColor || widget.config.color } }
                        Behavior on width { NumberAnimation { duration:16+Number(musicWaves.spectrum.smoothing||.35)*90; easing.type:Easing.Linear } }
                    }
                }
            }
            Rectangle { visible:musicWaves.waveform && !musicWaves.horizontal; anchors.left:parent.left; anchors.right:parent.right; anchors.verticalCenter:parent.verticalCenter; height:1; color:widget.config.color; opacity:.42 }
            Row {
                id: verticalBars
                anchors.centerIn: parent
                width: musicWaves.waveform ? parent.width * .78 : parent.width
                height: parent.height
                visible: !musicWaves.horizontal
                spacing: Math.max(2, width / 180)
                Repeater {
                    model: musicWaves.horizontal ? 0 : musicWaves.barCount
                    Rectangle {
                        required property int index
                        width: Math.max(1,Math.min(musicWaves.waveform?5:100,(verticalBars.width-verticalBars.spacing*(musicWaves.barCount-1))/musicWaves.barCount))
                        height: verticalBars.height * musicWaves.amplitude(index) * (musicWaves.waveform ? .52 : 1)
                        anchors.bottom: musicWaves.spectrum.direction === "up" ? parent.bottom : undefined
                        anchors.top: musicWaves.spectrum.direction === "down" ? parent.top : undefined
                        anchors.verticalCenter: musicWaves.spectrum.direction === "center" ? parent.verticalCenter : undefined
                        radius: Math.min(width/2,3*widget.scaleFactor); color:"transparent"; opacity:.94
                        gradient: Gradient { orientation:Gradient.Vertical; GradientStop { position:0; color:musicWaves.spectrum.secondaryColor || widget.config.color } GradientStop { position:1; color:widget.config.color } }
                        Behavior on height { NumberAnimation { duration:16+Number(musicWaves.spectrum.smoothing||.35)*90; easing.type:Easing.Linear } }
                    }
                }
            }
        }
        Row {
            anchors.centerIn: parent
            visible: widget.config.type === "workspaces"
            spacing: 4 * widget.scaleFactor
            Repeater {
                model: widget.config.type === "workspaces" ? (widget.behavior.workspaceCount || 5) : 0
                Rectangle {
                    required property int index
                    width: 30 * widget.scaleFactor; height: Math.max(20 * widget.scaleFactor, widget.height-8 * widget.scaleFactor); radius: 6 * widget.scaleFactor
                    color: widget.liveData.workspace === index+1 ? (widget.behavior.activeColor || "#cba6f7") : "transparent"
                    Text { anchors.centerIn: parent; text: parent.index+1; font.pixelSize: widget.config.fontSize * widget.scaleFactor; font.family: widget.family; color: widget.liveData.workspace === parent.index+1 ? "#181825" : widget.config.color }
                    MouseArea { anchors.fill: parent; onClicked: if (widget.behavior.click !== "none") runtime.act("workspace", String(parent.index+1)) }
                }
            }
        }
        Flow {
            width: Math.min(implicitWidth,parent.width)
            anchors.horizontalCenter: widget.pageAlign === "start" || widget.pageAlign === "end" ? undefined : parent.horizontalCenter
            anchors.left: widget.pageAlign === "start" ? parent.left : undefined
            anchors.right: widget.pageAlign === "end" ? parent.right : undefined
            anchors.verticalCenter: parent.verticalCenter
            spacing: (widget.opts.gap || 8) * widget.scaleFactor
            flow: widget.opts.orientation === "vertical" ? Flow.TopToBottom : Flow.LeftToRight
            Repeater {
                model: widget.opts.items || []
                Item {
                    id: shortcut
                    required property var modelData
                    implicitWidth: shortcutContents.implicitWidth
                    implicitHeight: shortcutContents.implicitHeight
                    property color tint: modelData.resolvedAction ? widget.config.color : "#e5a66b"
                    Row { id: shortcutContents; spacing: 8
                    Text { text: shortcut.modelData.icon; textFormat: Text.PlainText; color: shortcut.tint; font.pixelSize: (widget.opts.iconSize || 18) * widget.scaleFactor; font.family: widget.family; anchors.verticalCenter: parent.verticalCenter }
                    Text { text: shortcut.modelData.label; textFormat: Text.PlainText; color: shortcut.tint; font.pixelSize: widget.config.fontSize * widget.scaleFactor; font.family: widget.family; anchors.verticalCenter: parent.verticalCenter }
                    }
                    MouseArea { anchors.fill: parent; onClicked: runtime.act(shortcut.modelData.resolvedAction || "unlinked", "") }
                }
            }
        }
    }
}
