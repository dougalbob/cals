#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: ./update-version.sh X.Y.Z"
    exit 1
fi

VERSION=$1

echo "Updating version to $VERSION..."

# Update main.go
sed -i "s/const AppVersion = \".*\"/const AppVersion = \"$VERSION\"/" cmd/server/main.go

# Update app.js
sed -i "s/const APP_VERSION = '.*'/const APP_VERSION = '$VERSION'/" web/static/js/app.js

# Update sw.js
sed -i "s/const APP_VERSION = '.*'/const APP_VERSION = '$VERSION'/" web/public/sw.js

echo "Version updated to $VERSION in:"
echo "  - cmd/server/main.go"
echo "  - web/static/js/app.js"
echo "  - web/public/sw.js"
echo ""
echo "Don't forget to rebuild the image: docker build -t cals-dev-v2:local ."
echo "V2 updates deploy by publishing the GHCR image and applying the Unraid"
echo "container update — see docs/architecture/unraid-image-release.md."
echo "(The legacy V1 Compose server, if still in use, is rebuilt on that server manually.)"
