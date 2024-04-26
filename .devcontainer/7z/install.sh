#!/bin/bash
export DEBIAN_FRONTEND=noninteractive

echo "(*) Installing 7z"
apt-get update
apt-get install -y --no-install-recommends p7zip-full
apt-get clean -y
rm -rf /var/lib/apt/lists/*;

echo "Done!"