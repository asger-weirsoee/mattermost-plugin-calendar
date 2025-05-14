#!/usr/bin/env bash

# mattermost-dev-setup.sh
# Automate local Mattermost plugin development and testing
# Usage: ./mattermost-dev-setup.sh [start|build|upload|remove|stop|status]

set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ID=$(jq -r .id "$PLUGIN_DIR/plugin.json")
PLUGIN_DIST="$PLUGIN_DIR/dist/${PLUGIN_ID}.tar.gz"
DOCKER_DIR="$PLUGIN_DIR/../mattermost-docker"

function start_server() {
    if [ ! -d "$DOCKER_DIR" ]; then
        echo "Cloning mattermost-docker..."
        git clone https://github.com/mattermost/mattermost-docker.git "$DOCKER_DIR"
    fi
    cd "$DOCKER_DIR"
    echo "Starting Mattermost server with Docker..."
    docker-compose up -d
    echo "Mattermost server running at http://localhost:8065"
}

function stop_server() {
    if [ -d "$DOCKER_DIR" ]; then
        cd "$DOCKER_DIR"
        docker-compose down
        echo "Mattermost server stopped."
    fi
}

function build_plugin() {
    cd "$PLUGIN_DIR"
    echo "Building plugin..."
    make dist
    echo "Plugin built at $PLUGIN_DIST"
}

function upload_plugin() {
    build_plugin
    echo "Uploading plugin to Mattermost..."
    # Use curl to upload via API (requires server running and admin credentials)
    read -p "Enter Mattermost admin email: " MM_ADMIN
    read -s -p "Enter Mattermost admin password: " MM_PASS; echo
    SESSION=$(curl -s -i -c cookies.txt -X POST http://localhost:8065/api/v4/users/login -d '{"login":"'$MM_ADMIN'","password":"'$MM_PASS'"}' -H 'Content-Type: application/json')
    TOKEN=$(grep 'MMAUTHTOKEN' cookies.txt | awk '{print $7}')
    curl -b cookies.txt -X POST http://localhost:8065/api/v4/plugins -F "plugin=@$PLUGIN_DIST" -H "Authorization: Bearer $TOKEN"
    echo "Plugin uploaded. Enable it in the System Console if not enabled automatically."
}

function remove_plugin() {
    echo "Removing plugin $PLUGIN_ID from Mattermost..."
    read -p "Enter Mattermost admin email: " MM_ADMIN
    read -s -p "Enter Mattermost admin password: " MM_PASS; echo
    SESSION=$(curl -s -i -c cookies.txt -X POST http://localhost:8065/api/v4/users/login -d '{"login":"'$MM_ADMIN'","password":"'$MM_PASS'"}' -H 'Content-Type: application/json')
    TOKEN=$(grep 'MMAUTHTOKEN' cookies.txt | awk '{print $7}')
    curl -b cookies.txt -X DELETE http://localhost:8065/api/v4/plugins/$PLUGIN_ID -H "Authorization: Bearer $TOKEN"
    echo "Plugin removed."
}

function status() {
    if docker ps | grep -q mattermost; then
        echo "Mattermost server is running."
    else
        echo "Mattermost server is not running."
    fi
}

function usage() {
    echo "Usage: $0 [start|build|upload|remove|stop|status]"
    echo "  start   - Start local Mattermost server with Docker"
    echo "  stop    - Stop the local Mattermost server"
    echo "  build   - Build the plugin (make dist)"
    echo "  upload  - Build and upload the plugin to the server (requires admin credentials)"
    echo "  remove  - Remove the plugin from the server (requires admin credentials)"
    echo "  status  - Show if the server is running"
}

case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    build)
        build_plugin
        ;;
    upload)
        upload_plugin
        ;;
    remove)
        remove_plugin
        ;;
    status)
        status
        ;;
    *)
        usage
        ;;
esac 