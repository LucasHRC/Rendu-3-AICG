# Guide de test - Serveur TTS + Barge-in

## Test rapide (5 minutes)

### 1. Lancer le serveur TTS

```bash
cd tts-server
npm install
npm start
```

Vous devriez voir :
```
[TTS Server] Listening on http://localhost:3001
[TTS Server] Endpoint: http://localhost:3001/api/tts?text=...
[TTS Server] Test: http://localhost:3001/api/tts?text=bonjour
```

### 2. Tester l'endpoint dans le navigateur

Ouvrez : `http://localhost:3001/api/tts?text=bonjour%20lucas`

- ✅ **Succès** : Le navigateur télécharge un fichier WAV
- ❌ **Échec** : Vérifiez que `say` et `afconvert` sont disponibles :
  ```bash
  which say
  which afconvert
  ```

### 3. Lancer le front

Dans un **nouveau terminal** :
```bash
cd ..
npm run dev
```

### 4. Test Hands-Free

1. Ouvrez l'application dans le navigateur
2. Activez le mode Hands-Free
3. Parlez pour déclencher une réponse TTS
4. **Pendant que le TTS parle** : parlez par-dessus
5. ✅ **Résultat attendu** : Le TTS s'arrête immédiatement et l'écoute redémarre

## Dépannage

### Si ça ne coupe pas quand vous parlez

**A) Vérifier que la référence est attachée**

Ouvrez la console du navigateur et cherchez :
```
[EchoBargeIn] TTS output attached for NCC
```

Si absent, le problème vient de `attachTTSOutput()`.

**B) Activer le debug**

Dans la console du navigateur :
```javascript
window.DEBUG_ECHO_BARGE_IN = true;
```

Puis regardez les logs :
- Si `NCC` ne bouge jamais (reste ~0) → la référence est vide
- Si `NCC` est toujours élevé (>0.3) → la référence fonctionne mais le seuil est trop haut

**C) Ajuster les seuils**

Dans `src/audio/EchoBargeIn.js`, modifiez le constructeur :

```javascript
this.THRESH_RMS = 0.008;  // Plus sensible (était 0.012)
this.THRESH_NCC = 0.15;   // Plus sensible (était 0.2)
```

### Si ça coupe trop facilement (faux positifs)

**A) Monter les seuils**

```javascript
this.THRESH_RMS = 0.020;  // Moins sensible
this.THRESH_NCC = 0.25;   // Moins sensible
this.VOICE_STREAK_THRESH = 3;  // Exige 3 frames consécutives (était 2)
```

**B) Augmenter le hangover**

```javascript
this.HANGOVER_MS = 400;  // Plus de temps entre interruptions (était 300)
```

### Si audio double/écho

L'élément audio est automatiquement muté (`audioEl.muted = true`). Si vous entendez encore un écho :

1. Vérifiez dans la console : `[EchoBargeIn] Audio element muted, output via WebAudio only`
2. Si absent, le muting n'est pas appliqué

### Latence / "ça coupe mais trop tard"

```javascript
this.FRAME_SIZE = 1024;   // Plus réactif (était 2048)
this.HANGOVER_MS = 200;   // Plus réactif (était 300)
```

## Commandes utiles

**Vérifier les outils macOS** :
```bash
which say
which afconvert
```

**Tester l'endpoint directement** :
```bash
curl "http://localhost:3001/api/tts?text=test" -o test.wav
```

**Lancer les deux en parallèle** :
```bash
npm run dev:all
```

