# Serveur TTS XTTS-v2 pour voix Lucas

Serveur Python FastAPI utilisant XTTS-v2 (Coqui) pour générer de la synthèse vocale à partir de votre voix.

## Prérequis

- **Python 3.9+** (testé avec Python 3.11)
- **ffmpeg** (pour conversion audio)
- **Mac Apple Silicon** (M1/M2/M3) - compatible

### Vérification des dépendances

```bash
# Vérifier Python
python3 --version  # Doit être >= 3.9

# Vérifier ffmpeg
ffmpeg -version

# Si ffmpeg n'est pas installé (macOS)
brew install ffmpeg
```

## Installation

### 1. Créer l'environnement virtuel

```bash
cd server_tts
python3 -m venv venv
source venv/bin/activate
```

### 2. Installer les dépendances

```bash
pip install -r requirements.txt
```

**Note** : L'installation de TTS et PyTorch peut prendre plusieurs minutes et télécharger plusieurs GB. Sur Mac Apple Silicon, PyTorch utilisera automatiquement MPS (Metal Performance Shaders).

### 3. Préparer la voix de référence

Le fichier `Voix-Lucas.m4a` doit être converti en WAV mono 24kHz :

```bash
# Depuis la racine du projet
ffmpeg -i "Voix-Lucas.m4a" -ac 1 -ar 24000 -c:a pcm_s16le "server_tts/voices/voice_ref.wav"
```

**Vérifier le résultat** :

```bash
ffmpeg -i "server_tts/voices/voice_ref.wav"
```

Vous devriez voir :
- `Audio: pcm_s16le, 24000 Hz, mono, s16, 384 kb/s`

**Recommandations** :
- Si l'enregistrement contient du bruit de fond notable, envisagez de ré-enregistrer dans un environnement plus calme
- Durée recommandée : 30 secondes à 2 minutes
- Parlez clairement et à un rythme naturel

## Configuration

Copiez `.env.example` vers `.env` et modifiez si nécessaire :

```bash
cp .env.example .env
```

Variables disponibles :
- `TTS_PORT` : Port du serveur (défaut: 5055)
- `TTS_CACHE_PATH` : Chemin du cache (défaut: `server_tts/cache`)
- `TTS_CACHE_MAX_SIZE_GB` : Taille max cache en GB (défaut: 1.0)

## Démarrage

### Démarrage manuel

```bash
cd server_tts
source venv/bin/activate
./start.sh
```

### Démarrage automatique (avec frontend)

Depuis la racine du projet :

```bash
npm run dev:all
```

Cela lance à la fois Vite (frontend) et le serveur TTS.

## Endpoints

### GET /health

Vérifie l'état du serveur :

```bash
curl http://localhost:5055/health
```

Réponse :
```json
{
  "status": "ok",
  "model_loaded": true,
  "voice_ref_exists": true,
  "cache_size_mb": 12.5
}
```

### POST /tts

Génère de l'audio à partir de texte :

```bash
curl -X POST http://localhost:5055/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour, ceci est un test.", "language": "fr", "speed": 1.15}' \
  --output test.wav
```

Paramètres :
- `text` (requis) : Texte à synthétiser
- `language` (optionnel) : Code langue (défaut: "fr")
- `speed` (optionnel) : Vitesse de parole (défaut: 1.15, soit 1.15x)
- `emotions` (optionnel) : Activer émotions (défaut: false)

## Cache

Le serveur met en cache automatiquement les audios générés pour éviter de régénérer le même texte.

- **Emplacement** : `server_tts/cache/` (configurable via `TTS_CACHE_PATH`)
- **Taille max** : 1 GB par défaut (configurable via `TTS_CACHE_MAX_SIZE_GB`)
- **Nettoyage** : Automatique (LRU) si la taille dépasse la limite

## Troubleshooting

### Erreur : "voice_ref.wav non trouvé"

Le serveur démarre mais `/tts` retourne une erreur. Exécutez la commande de conversion :

```bash
ffmpeg -i "Voix-Lucas.m4a" -ac 1 -ar 24000 -c:a pcm_s16le "server_tts/voices/voice_ref.wav"
```

### Erreur : "Modèle TTS non chargé"

- Vérifiez que TTS est installé : `pip list | grep TTS`
- Vérifiez les logs du serveur pour plus de détails
- Sur Mac Apple Silicon, assurez-vous d'utiliser Python natif (pas Rosetta)

### Erreur : Port déjà utilisé

Changez le port dans `.env` :

```bash
TTS_PORT=5056
```

### Performance lente

- Première génération : peut prendre 2-5 secondes (chargement modèle)
- Générations suivantes : 1-3 secondes selon longueur du texte
- Cache : Les textes déjà générés sont instantanés

### Problèmes de mémoire

XTTS-v2 nécessite environ 2-3 GB de RAM. Si vous avez des problèmes :
- Fermez d'autres applications
- Réduisez la taille du cache (`TTS_CACHE_MAX_SIZE_GB=0.5`)

## Logs

Les logs sont affichés dans la console avec le format :
```
[YYYY-MM-DD HH:MM:SS] LEVEL: message
```

Niveaux :
- `INFO` : Opérations normales
- `WARNING` : Avertissements (fallback, cache plein, etc.)
- `ERROR` : Erreurs (modèle non chargé, génération échouée, etc.)

## Support

Pour plus d'informations sur XTTS-v2 :
- Documentation Coqui TTS : https://github.com/coqui-ai/TTS
- XTTS-v2 : https://github.com/coqui-ai/TTS/wiki/XTTS-v2


