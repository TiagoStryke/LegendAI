@echo off
setlocal enabledelayedexpansion

echo Starting subtitle extraction...
echo.

for %%f in (*.mkv) do (
    echo Processing: %%f
    set "found_english=0"
    set "sub_index=0"
    
    REM Create a temporary file to store stream info
    ffprobe -v quiet -select_streams s -show_entries stream=index:stream_tags=language -of csv=p=0 "%%f" > temp_streams.txt 2>nul
    
    REM Check if temp file exists and has content
    if exist temp_streams.txt (
        REM Read the temp file line by line to find English subtitles
        for /f "tokens=1,2 delims=," %%a in (temp_streams.txt) do (
            if "!found_english!"=="0" (
                if "%%b"=="eng" (
                    echo Found English subtitle at absolute stream %%a ^(subtitle index !sub_index!^)
                    ffmpeg -y -loglevel error -i "%%f" -map 0:s:!sub_index! -c:s srt "%%~nf_eng.srt"
                    set "found_english=1"
                )
                if "%%b"=="en" (
                    echo Found English subtitle at absolute stream %%a ^(subtitle index !sub_index!^)
                    ffmpeg -y -loglevel error -i "%%f" -map 0:s:!sub_index! -c:s srt "%%~nf_eng.srt"
                    set "found_english=1"
                )
            )
            if "!found_english!"=="0" (
                set /a sub_index+=1
            )
        )
    )
    
    REM If no English subtitle found, extract the first subtitle stream
    if "!found_english!"=="0" (
        echo No English subtitle found, extracting first subtitle stream
        ffmpeg -y -loglevel error -i "%%f" -map 0:s:0 -c:s srt "%%~nf_first.srt" 2>nul
        if errorlevel 1 (
            echo No subtitle streams found in %%f
        )
    )
    
    del temp_streams.txt 2>nul
    echo.
)

echo All files processed!
pause
