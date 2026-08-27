@echo off
REM Regenerate procedural SFX for ComicLesson (requires ffmpeg on PATH).
set OUT=%~dp0..\public\sfx
if not exist "%OUT%" mkdir "%OUT%"

ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.18" -af "afade=t=in:st=0:d=0.01,afade=t=out:st=0.08:d=0.1,volume=0.9" -ac 1 -ar 44100 "%OUT%\pop.mp3"
ffmpeg -y -f lavfi -i "sine=frequency=420:duration=0.45" -af "asetrate=44100*1.35,aresample=44100,afade=t=in:st=0:d=0.05,afade=t=out:st=0.28:d=0.17,volume=0.75" -ac 1 -ar 44100 "%OUT%\swoosh.mp3"
ffmpeg -y -f lavfi -i "sine=frequency=659.25:duration=0.55" -af "afade=t=in:st=0:d=0.02,afade=t=out:st=0.35:d=0.2,volume=0.85" -ac 1 -ar 44100 "%OUT%\_chime_a.mp3"
ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.55" -af "adelay=120|120,afade=t=in:st=0:d=0.02,afade=t=out:st=0.35:d=0.2,volume=0.85" -ac 1 -ar 44100 "%OUT%\_chime_b.mp3"
ffmpeg -y -i "%OUT%\_chime_a.mp3" -i "%OUT%\_chime_b.mp3" -filter_complex "[0][1]amix=inputs=2:duration=longest:dropout_transition=0,volume=1.2" -ac 1 -ar 44100 "%OUT%\chime.mp3"
del /q "%OUT%\_chime_a.mp3" "%OUT%\_chime_b.mp3"
echo SFX ready in %OUT%
