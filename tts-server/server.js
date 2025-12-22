/**
 * Serveur TTS local simple pour Hands-Free mode
 * Utilise `say` (macOS) + `afconvert` pour générer des fichiers WAV
 * 
 * Nécessite: npm install express cors
 * Usage: node tts-server/server.js
 * 
 * Endpoint: GET /api/tts?text=...
 * Retourne: fichier WAV
 */

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;
const TMP_DIR = path.join(__dirname, 'tmp');

// Créer dossier tmp s'il n'existe pas
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR);
}

app.use(cors());

/**
 * Endpoint TTS
 * GET /api/tts?text=...
 */
app.get('/api/tts', async (req, res) => {
  const text = req.query.text;
  
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  const timestamp = Date.now();
  const aiffFile = path.join(TMP_DIR, `tts_${timestamp}.aiff`);
  const wavFile = path.join(TMP_DIR, `tts_${timestamp}.wav`);

  try {
    // macOS: utiliser say pour générer AIFF
    // say -v Thomas -r 175 -o file.aiff "text"
    const sayCommand = `say -v Thomas -r 175 -o "${aiffFile}" "${text.replace(/"/g, '\\"')}"`;
    console.log(`[TTS Server] Generating AIFF: ${text.substring(0, 50)}...`);
    await execAsync(sayCommand);
    
    // Convertir AIFF -> WAV (PCM 16-bit)
    // afconvert file.aiff -f WAVE -d LEI16 file.wav
    const convertCommand = `afconvert "${aiffFile}" -f WAVE -d LEI16 "${wavFile}"`;
    console.log(`[TTS Server] Converting to WAV...`);
    await execAsync(convertCommand);
    
    // Cleanup AIFF
    try {
      fs.unlinkSync(aiffFile);
    } catch (e) {
      console.warn('[TTS Server] Failed to delete AIFF:', e);
    }
    
    // Envoyer le fichier WAV
    res.sendFile(wavFile, (err) => {
      // Nettoyer le fichier temporaire après envoi
      setTimeout(() => {
        if (fs.existsSync(wavFile)) {
          fs.unlinkSync(wavFile);
        }
      }, 1000);
      
      if (err) {
        console.error('[TTS Server] Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to send audio' });
        }
      } else {
        console.log(`[TTS Server] Audio sent successfully (${text.length} chars)`);
      }
    });
  } catch (error) {
    console.error('[TTS Server] Error:', error);
    
    // Cleanup en cas d'erreur
    try {
      if (fs.existsSync(aiffFile)) fs.unlinkSync(aiffFile);
      if (fs.existsSync(wavFile)) fs.unlinkSync(wavFile);
    } catch (e) {}
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'TTS generation failed', 
        details: error.message 
      });
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tts-server' });
});

app.listen(PORT, () => {
  console.log(`[TTS Server] Listening on http://localhost:${PORT}`);
  console.log(`[TTS Server] Endpoint: http://localhost:${PORT}/api/tts?text=...`);
  console.log(`[TTS Server] Using macOS 'say' command with 'afconvert'`);
  console.log(`[TTS Server] Test: http://localhost:${PORT}/api/tts?text=bonjour`);
});

