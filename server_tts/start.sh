#!/bin/bash
# Script de démarrage du serveur TTS XTTS-v2
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Vérifier que le venv existe
if [ ! -d "venv" ]; then
    echo "❌ venv non trouvé. Créez-le d'abord:"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -r requirements.txt"
    exit 1
fi

# Activer venv
source venv/bin/activate

# Charger .env si présent
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Port par défaut
PORT=${TTS_PORT:-5055}

echo "🚀 Démarrage serveur TTS XTTS-v2 sur port $PORT..."
echo "📁 Cache: ${TTS_CACHE_PATH:-server_tts/cache}"
echo ""

# Démarrer uvicorn
uvicorn app:app --host 0.0.0.0 --port "$PORT" --reload

