#!/bin/bash
# Start server on port 443 (requires sudo)
export PORT=443
cd ~/projects/food-supply-voice-ai/frontend/dist
sudo -E node server.js