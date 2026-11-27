#!/usr/bin/env bash
# Build the native client from public source. Private scene resources are added before signing.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$root"
work="${RUNNER_TEMP:-/tmp}/monday-velvet-build"
mkdir -p "$work" ThirdParty
if [[ ! -d ThirdParty/onnxruntime.xcframework ]]; then
  curl -fsSL --retry 3 https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/1.22.1/microsoft.ml.onnxruntime.1.22.1.nupkg -o "$work/ort.nupkg"
  echo "7b091e012dcfef2f9cc965f2252041101b1840c748ffbc1c18ba047bd6508b1c  $work/ort.nupkg" | shasum -a 256 -c -
  unzip -p "$work/ort.nupkg" runtimes/ios/native/onnxruntime.xcframework.zip > "$work/ort.zip"
  unzip -q "$work/ort.zip" -d ThirdParty
fi
# The public checkout can be compiled without distributing the owner's four assets.
# Keep the private project's normal resource phase intact when they are present.
if [[ ! -e platform/apple-host/MondayIDHost/VelvetClaire.onnx ]]; then
  python3 - <<'PY'
from pathlib import Path
p=Path('platform/apple-host/MondayIDHost.xcodeproj/project.pbxproj')
files={'VelvetListening.usdz','VelvetStudio.usdz','VelvetChannels.json','VelvetClaire.onnx'}
lines=p.read_text().splitlines(keepends=True)
p.write_text(''.join(line for line in lines if not any(('/* '+name+' in Resources */') in line for name in files)))
PY
fi
for spec in simulator device; do
  if [[ "$spec" == simulator ]]; then dest='generic/platform=iOS Simulator'; else dest='generic/platform=iOS'; fi
  xcodebuild -project platform/apple-host/MondayIDHost.xcodeproj -scheme MondayIDHost -configuration Release -destination "$dest" -derivedDataPath "$work/$spec" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
done
mkdir -p "$work/package/Payload" "$root/velvet-build"
ditto "$work/device/Build/Products/Release-iphoneos/MondayIDHost.app" "$work/package/Payload/MondayIDHost.app"
(cd "$work/package" && ditto -ck --keepParent Payload "$root/velvet-build/Velvet-code.ipa")
ditto -ck --keepParent "$work/simulator/Build/Products/Release-iphonesimulator/MondayIDHost.app" "$root/velvet-build/Velvet-simulator.zip"
