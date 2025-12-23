"""
Serveur TTS XTTS-v2 pour voix Lucas
FastAPI avec endpoints /health et /tts
"""

import os
import hashlib
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import soundfile as sf
import numpy as np

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Variables d'environnement
PORT = int(os.getenv('TTS_PORT', '5055'))
CACHE_PATH = os.getenv('TTS_CACHE_PATH', str(Path(__file__).parent / 'cache'))
CACHE_MAX_SIZE_GB = float(os.getenv('TTS_CACHE_MAX_SIZE_GB', '1.0'))
VOICE_REF_PATH = Path(__file__).parent / 'voices' / 'voice_ref.wav'

# Créer dossiers si nécessaire
Path(CACHE_PATH).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="XTTS-v2 TTS Server", version="1.0.0")

# CORS pour localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèle TTS global (chargé une seule fois)
tts_model = None
model_loaded = False

class TTSRequest(BaseModel):
    text: str
    language: str = "fr"
    speed: Optional[float] = 1.15  # 1.1x-1.2x par défaut
    emotions: Optional[bool] = False

def check_voice_ref():
    """Vérifie que voice_ref.wav existe"""
    if not VOICE_REF_PATH.exists():
        error_msg = f"""
ERREUR: voice_ref.wav non trouvé à {VOICE_REF_PATH}

Pour créer le fichier, exécutez:
ffmpeg -i "Voix-Lucas.m4a" -ac 1 -ar 24000 -c:a pcm_s16le "server_tts/voices/voice_ref.wav"

Vérifiez ensuite avec:
ffmpeg -i "server_tts/voices/voice_ref.wav"
"""
        logger.error(error_msg)
        return False, error_msg
    return True, None

def load_model():
    """Charge le modèle XTTS-v2 et la voix de référence"""
    global tts_model, model_loaded
    
    if model_loaded:
        return True
    
    try:
        logger.info("Chargement du modèle XTTS-v2...")
        from TTS.api import TTS
        
        # Charger modèle XTTS-v2
        tts_model = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True)
        logger.info("Modèle XTTS-v2 chargé avec succès")
        
        # Vérifier que voice_ref.wav existe
        voice_ok, error_msg = check_voice_ref()
        if not voice_ok:
            raise FileNotFoundError(error_msg)
        
        # XTTS-v2 peut charger directement depuis le chemin
        # Pas besoin de charger en mémoire
        logger.info(f"Voix de référence prête: {VOICE_REF_PATH}")
        
        model_loaded = True
        return True
        
    except ImportError as e:
        logger.error(f"Erreur import TTS: {e}")
        logger.error("Installez TTS avec: pip install TTS")
        return False
    except Exception as e:
        logger.error(f"Erreur chargement modèle: {e}")
        return False

def get_cache_path(text: str, language: str) -> Path:
    """Génère le chemin de cache pour un texte"""
    cache_key = hashlib.md5(f"{text}:{language}".encode()).hexdigest()
    return Path(CACHE_PATH) / f"{cache_key}.wav"

def get_cache_size() -> int:
    """Retourne la taille totale du cache en bytes"""
    total = 0
    for file in Path(CACHE_PATH).glob("*.wav"):
        total += file.stat().st_size
    return total

def cleanup_cache():
    """Nettoie le cache si > CACHE_MAX_SIZE_GB (LRU)"""
    cache_size = get_cache_size()
    max_size_bytes = CACHE_MAX_SIZE_GB * 1024 * 1024 * 1024
    
    if cache_size <= max_size_bytes:
        return
    
    logger.info(f"Cache trop volumineux ({cache_size / 1024 / 1024:.1f} MB), nettoyage LRU...")
    
    # Trier par date de modification (plus ancien en premier)
    files = sorted(Path(CACHE_PATH).glob("*.wav"), key=lambda f: f.stat().st_mtime)
    
    # Supprimer les plus anciens jusqu'à être sous la limite
    for file in files:
        if get_cache_size() <= max_size_bytes * 0.9:  # Nettoyer jusqu'à 90% de la limite
            break
        file.unlink()
        logger.debug(f"Supprimé du cache: {file.name}")
    
    logger.info(f"Cache nettoyé: {get_cache_size() / 1024 / 1024:.1f} MB")

@app.on_event("startup")
async def startup_event():
    """Charge le modèle au démarrage"""
    logger.info("Démarrage serveur TTS XTTS-v2...")
    logger.info(f"Port: {PORT}")
    logger.info(f"Cache path: {CACHE_PATH}")
    logger.info(f"Cache max size: {CACHE_MAX_SIZE_GB} GB")
    
    # Vérifier voice_ref.wav avant de charger le modèle
    voice_ok, error_msg = check_voice_ref()
    if not voice_ok:
        logger.error("Serveur démarré mais voice_ref.wav manquant. /tts retournera une erreur.")
        return
    
    # Charger modèle
    success = load_model()
    if success:
        logger.info("Serveur TTS prêt!")
    else:
        logger.error("Échec chargement modèle. Vérifiez les logs.")

@app.get("/health")
async def health():
    """Vérifie l'état du serveur"""
    voice_ok, error_msg = check_voice_ref()
    
    return {
        "status": "ok" if (model_loaded and voice_ok) else "error",
        "model_loaded": model_loaded,
        "voice_ref_exists": voice_ok,
        "cache_size_mb": round(get_cache_size() / 1024 / 1024, 2),
        "error": error_msg if not voice_ok else None
    }

@app.post("/tts")
async def tts(request: TTSRequest):
    """Génère de l'audio à partir de texte"""
    global tts_model
    
    # Vérifier que le modèle est chargé
    if not model_loaded:
        if not load_model():
            raise HTTPException(status_code=503, detail="Modèle TTS non chargé. Vérifiez les logs du serveur.")
    
    # Vérifier voice_ref.wav
    voice_ok, error_msg = check_voice_ref()
    if not voice_ok:
        raise HTTPException(status_code=404, detail=error_msg)
    
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Texte vide")
    
    # Vérifier cache
    cache_path = get_cache_path(request.text, request.language)
    if cache_path.exists():
        logger.info(f"Cache hit: {cache_path.name}")
        return FileResponse(
            str(cache_path),
            media_type="audio/wav",
            headers={"X-Cache": "hit"}
        )
    
    logger.info(f"Génération TTS: '{request.text[:50]}...' (lang={request.language}, speed={request.speed})")
    
    try:
        # Générer audio avec XTTS-v2
        # Note: XTTS-v2 nécessite un speaker_wav (notre voice_ref)
        # La vitesse est gérée via le paramètre speed
        # XTTS-v2 retourne un numpy array directement
        wav = tts_model.tts(
            text=request.text,
            language=request.language,
            speaker_wav=str(VOICE_REF_PATH),  # Chemin du fichier WAV
            speed=request.speed
        )
        
        # Convertir en numpy array si nécessaire
        if not isinstance(wav, np.ndarray):
            wav = np.array(wav)
        
        # Sauvegarder dans le cache
        sf.write(str(cache_path), wav, samplerate=24000)
        logger.info(f"Audio généré et mis en cache: {cache_path.name}")
        
        # Nettoyer le cache si nécessaire
        cleanup_cache()
        
        return FileResponse(
            str(cache_path),
            media_type="audio/wav",
            headers={"X-Cache": "miss"}
        )
        
    except Exception as e:
        logger.error(f"Erreur génération TTS: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur génération audio: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)

