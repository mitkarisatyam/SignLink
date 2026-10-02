import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const SUPPORTED_SIGNS = [
  { id: 'COME', label: 'COME', file: '/animations/come.fbx', desc: 'Arms & hands beckoning towards chest' },
  { id: 'HOME', label: 'HOME', file: '/animations/home.fbx', desc: 'Hands meeting at roof/apex formation' },
  { id: 'PLEASE', label: 'PLEASE', file: '/animations/please.fbx', desc: 'Open flat palm circular chest motion' },
  { id: 'WORK', label: 'WORK', file: '/animations/work.fbx', desc: 'Rhythmic downward hand tapping motion' },
  { id: 'GO', label: 'GO', file: '/animations/go.fbx', desc: 'Index fingers pointing outwards forward' },
  { id: 'WHERE', label: 'WHERE', file: '/animations/where.fbx', desc: 'Dual palms-up questioning shake' },
  { id: 'DEAF', label: 'DEAF', file: '/animations/deaf.fbx', desc: 'Index finger moving from ear to mouth' },
  { id: 'LIKE', label: 'LIKE', file: '/animations/like.fbx', desc: 'Chest touch affirmation of liking' },
  { id: 'NEVER', label: 'NEVER', file: '/animations/never.fbx', desc: 'Two-handed outward denial wave' },
  { id: 'PERFECT', label: 'PERFECT', file: '/animations/perfect.fbx', desc: 'Two-handed precision OK touch' },
  { id: 'HE', label: 'HE', file: '/animations/he.fbx', desc: 'Third-person reference pointing sign' }
];

const IslAvatarViewer = forwardRef(({ activeSign = 'COME', onStatusUpdate, onAnimationStateChange, onSignsLoaded }, ref) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const mixerRef = useRef(null);
  const actionsMapRef = useRef({});
  const clipsMapRef = useRef({});
  const currentActionRef = useRef(null);
  const avatarRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const boneMapRef = useRef(new Map());

  const [loadingStep, setLoadingStep] = useState('Loading avatar...');
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWord, setCurrentWord] = useState('COME');
  const [signSpeed, setSignSpeed] = useState(1.0);
  const [signsMeta, setSignsMeta] = useState({});

  const isPlayingRef = useRef(false);
  const currentWordRef = useRef('COME');
  const finishTimeoutRef = useRef(null);
  const pendingSignRef = useRef(null);
  const lastPlayTimestampRef = useRef(0);

  // Expose playSign & controls to parent component
  useImperativeHandle(ref, () => ({
    playSign: (word) => {
      playSignAnimation(word);
    },
    playCome: () => playSignAnimation('COME'),
    playHome: () => playSignAnimation('HOME'),
    playPlease: () => playSignAnimation('PLEASE'),
    playWork: () => playSignAnimation('WORK'),
    playGo: () => playSignAnimation('GO'),
    playWhere: () => playSignAnimation('WHERE'),
    playDeaf: () => playSignAnimation('DEAF'),
    playLike: () => playSignAnimation('LIKE'),
    playNever: () => playSignAnimation('NEVER'),
    playPerfect: () => playSignAnimation('PERFECT'),
    playHe: () => playSignAnimation('HE'),
    resetCamera: () => {
      frameUpperBody();
    },
    setPlaybackSpeed: (speed) => {
      setSignSpeed(speed);
      Object.values(actionsMapRef.current).forEach((action) => {
        action.timeScale = speed;
      });
    },
    getCurrentWord: () => currentWordRef.current,
    isCurrentlyPlaying: () => isPlayingRef.current,
    getSignsMeta: () => signsMeta
  }));

  const playSignAnimation = (word = 'COME') => {
    const targetWord = word.toUpperCase();
    const now = Date.now();

    // If animations are still loading, queue the sign to play immediately upon completion
    if (!isLoaded && !actionsMapRef.current[targetWord]) {
      console.log(`[AVATAR] Sign "${targetWord}" requested while loading. Queued for playback on ready.`);
      pendingSignRef.current = targetWord;
      return;
    }

    // Debounce exact same word triggered within 350ms to ignore accidental rapid double-triggers
    if (isPlayingRef.current && currentWordRef.current === targetWord && (now - lastPlayTimestampRef.current < 350)) {
      return;
    }

    const action = actionsMapRef.current[targetWord];
    const clip = clipsMapRef.current[targetWord];

    if (!action) {
      console.warn(`Sign animation "${targetWord}" not found or still loading`);
      return;
    }

    lastPlayTimestampRef.current = now;

    // Clear any active watchdog timer from prior sign
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }

    // Stop current playing action if different
    if (currentActionRef.current && currentActionRef.current !== action) {
      currentActionRef.current.stop();
    }

    currentActionRef.current = action;
    setCurrentWord(targetWord);
    currentWordRef.current = targetWord;

    action.stop();
    action.reset();
    action.timeScale = signSpeed;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    isPlayingRef.current = true;
    setIsPlaying(true);

    if (onAnimationStateChange) onAnimationStateChange(true, targetWord);
    if (onStatusUpdate && clip) {
      onStatusUpdate({
        word: targetWord,
        duration: clip.duration,
        tracks: clip.tracks.length,
        file: SUPPORTED_SIGNS.find((s) => s.id === targetWord)?.file || ''
      });
    }

    // Bulletproof Watchdog Timer:
    // Guarantees isPlaying is reset even if Three.js mixer drops the 'finished' event
    const durationMs = ((clip?.duration || 2.0) / (signSpeed || 1.0)) * 1000;
    finishTimeoutRef.current = setTimeout(() => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      if (onAnimationStateChange) onAnimationStateChange(false, targetWord);
      finishTimeoutRef.current = null;
    }, durationMs + 120);
  };

  const frameUpperBody = () => {
    if (!avatarRef.current || !cameraRef.current) return;
    const camera = cameraRef.current;

    // Optimal front-facing framing: head through lower torso, large hands clearly visible
    const focalPoint = new THREE.Vector3(0, 580, 0);

    camera.position.set(0, 580, 900);
    camera.lookAt(focalPoint);
    camera.near = 1;
    camera.far = 3000;
    camera.updateProjectionMatrix();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = null; // Transparent background to blend with UI

    // 2. Camera setup with front-facing angle to capture full head and signing space
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 3000);
    camera.position.set(0, 580, 900);
    camera.lookAt(new THREE.Vector3(0, 580, 0));
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0); // Transparent
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lighting setup (optimized for human avatar world coordinates y: 0..800)
    // Soft, realistic studio lighting - NO harsh white reflections
    const ambientLight = new THREE.AmbientLight(0x404452, 1.2); // Soft, non-directional neutral ambient
    scene.add(ambientLight);

    // Warm, soft key light for natural skin
    const keyLight = new THREE.DirectionalLight(0xfff0e6, 1.4);
    keyLight.position.set(200, 800, 800);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Soft neutral fill light to ensure hands and face are clear
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-300, 600, 600);
    scene.add(fillLight);

    // Very soft cool-blue rim light (matching the UI colors but not overpowering)
    const rimLight = new THREE.DirectionalLight(0x5ca0e8, 1.2);
    rimLight.position.set(-400, 800, -600);
    scene.add(rimLight);

    // Texture loader for explicit mesh texture enhancements
    const texLoader = new THREE.TextureLoader();
    const shirtTex = texLoader.load('/models/sanket/textures/Shirt-A.jpeg');
    shirtTex.colorSpace = THREE.SRGBColorSpace;
    shirtTex.wrapS = THREE.RepeatWrapping;
    shirtTex.wrapT = THREE.RepeatWrapping;
    shirtTex.repeat.set(4, 4);

    // Warm, realistic human skin tone texture (natural face, lips, ears, hands, fingers)
    const skinTex = texLoader.load('/models/sanket/textures/human_diffusedit.jpg');
    skinTex.colorSpace = THREE.SRGBColorSpace;
    skinTex.flipY = false;

    const hairTex = texLoader.load('/models/sanket/textures/ablackhair.jpg');
    hairTex.colorSpace = THREE.SRGBColorSpace;
    hairTex.flipY = false;

    // 5. Loading Avatar
    const manager = new THREE.LoadingManager();
    const fbxLoader = new FBXLoader(manager);
    fbxLoader.setResourcePath('/models/sanket/textures/');

    setLoadingStep('Loading avatar...');

    fbxLoader.load(
      '/models/sanket/MaleModelSankit.fbx',
      (fbx) => {
        console.log('Loaded avatar FBX successfully:', fbx);
        avatarRef.current = fbx;

        // Traverse avatar to inspect bones and materials
        const boneMap = new Map();
        fbx.traverse((child) => {
          if (child.isBone && !boneMap.has(child.name)) {
            boneMap.set(child.name, child);
          }
          if (child.isMesh) {
            const matList = Array.isArray(child.material) ? child.material : [child.material];
            console.log(`[AVATAR_INSPECT] mesh: "${child.name}", vertCount: ${child.geometry.attributes.position.count}, materials:`, matList.map(m => m.name));
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;

            // Refine materials for realistic skin, shirt, hair, eyes, teeth
            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              
              mats.forEach((mat, index) => {
                const lowerName = (child.name || '').toLowerCase();
                const matName = (mat.name || '').toLowerCase();

                // Create a completely fresh Standard Material to avoid shiny Phong issues
                // and to guarantee no unwanted maps causing dark faces or glowing eyes.
                const newMat = new THREE.MeshStandardMaterial({
                  roughness: 1.0,  // Maximum roughness (completely matte)
                  metalness: 0.0,
                  envMapIntensity: 0.0 // Ensure absolutely zero environmental reflections
                });

                // 1. Outfit
                if (
                  lowerName.includes('kurta') ||
                  matName.includes('kurta') ||
                  lowerName.includes('shirt') ||
                  matName.includes('shirt') ||
                  lowerName.includes('suit') ||
                  matName.includes('casualsuit') ||
                  lowerName.includes('pant') ||
                  matName.includes('bottom')
                ) {
                  newMat.color.setHex(0x1a202c); // Dark charcoal/navy
                }
                // 2. Hair
                else if (lowerName.includes('hair') || matName.includes('hair') || lowerName.includes('short')) {
                  newMat.color.setHex(0x1a1a1a);
                }
                // 3. Eyes
                else if (lowerName.includes('eye') || matName.includes('eye')) {
                  if (matName.includes('cornea')) {
                    newMat.transparent = true;
                    newMat.opacity = 0.0; // Hide completely to prevent glossy glass layer
                  } else {
                    newMat.color.setHex(0x2a1a10); // Very dark brown (human eye color)
                  }
                }
                // 4. Teeth
                else if (lowerName.includes('teeth') || matName.includes('teeth')) {
                  newMat.color.setHex(0xe0e0e0);
                }
                // 5. Skin (Fair Skin)
                else {
                  newMat.color.setHex(0xffd1b3); // Fair, natural human skin tone
                }

                // Replace material
                if (Array.isArray(child.material)) {
                  child.material[index] = newMat;
                } else {
                  child.material = newMat;
                }
              });
            }
          }
        });

        boneMapRef.current = boneMap;
        window.__sanketBones = Array.from(boneMap.keys());
        window.__sanketBoneMap = boneMap;
        
        const boneHierarchyInfo = {};
        boneMap.forEach((bone, name) => {
          boneHierarchyInfo[name] = {
            pos: [Math.round(bone.position.x), Math.round(bone.position.y), Math.round(bone.position.z)],
            children: bone.children.filter(c => c.isBone).map(c => ({
              name: c.name,
              pos: [Math.round(c.position.x * 10) / 10, Math.round(c.position.y * 10) / 10, Math.round(c.position.z * 10) / 10]
            }))
          };
        });
        window.__boneHierarchy = boneHierarchyInfo;
        if (typeof document !== 'undefined') {
          document.body.setAttribute('data-bone-keys', Object.keys(boneHierarchyInfo).join(','));
          let debugEl = document.getElementById('debug-bone-info');
          if (!debugEl) {
            debugEl = document.createElement('div');
            debugEl.id = 'debug-bone-info';
            debugEl.style.display = 'none';
            document.body.appendChild(debugEl);
          }
          debugEl.textContent = JSON.stringify(boneHierarchyInfo);
        }
        console.log('BONE_HIERARCHY_SAMPLE:', {
          head: boneHierarchyInfo['head'],
          neck: boneHierarchyInfo['neck'],
          spine03: boneHierarchyInfo['spine03'],
          clavicleL: boneHierarchyInfo['clavicleL'],
          upperarmL: boneHierarchyInfo['upperarmL'],
          forearmL: boneHierarchyInfo['forearmL'],
          handL: boneHierarchyInfo['handL'],
          index01L: boneHierarchyInfo['index01L'],
          index02L: boneHierarchyInfo['index02L'],
          index03L: boneHierarchyInfo['index03L']
        });
        
        scene.add(fbx);

        // Frame avatar upper body
        frameUpperBody();

        // Setup Animation Mixer
        const mixer = new THREE.AnimationMixer(fbx);
        mixerRef.current = mixer;

        mixer.addEventListener('finished', () => {
          if (finishTimeoutRef.current) {
            clearTimeout(finishTimeoutRef.current);
            finishTimeoutRef.current = null;
          }
          const finishedWord = currentWordRef.current;
          console.log(`[ANIMATION] Finished playing sign: ${finishedWord}`);
          isPlayingRef.current = false;
          setIsPlaying(false);
          if (onAnimationStateChange) onAnimationStateChange(false, finishedWord);
        });

        // 6. Now load all 5 whole-word animations
        loadAllAnimations(mixer, boneMap);
      },
      (progress) => {
        if (progress.total > 0) {
          const p = Math.round((progress.loaded / progress.total) * 100);
          setLoadProgress(p);
        }
      },
      (err) => {
        console.error('Error loading avatar model FBX:', err);
        setLoadingStep('Failed to load avatar model');
      }
    );

    // Helper: load all 5 animations asynchronously
    const loadAllAnimations = async (mixer, boneMap) => {
      const animLoader = new FBXLoader();
      const metaObj = {};

      // Create a normalized alphanumeric bone map: 'upperarmr' -> 'upperarm.R'
      // This is crucial because signs like 'please.fbx' use 'upperarmR' while the skeleton uses 'upperarm.R'
      const normBoneMap = new Map();
      boneMap.forEach((bone, name) => {
        const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        normBoneMap.set(norm, name);
      });

      for (let i = 0; i < SUPPORTED_SIGNS.length; i++) {
        const sign = SUPPORTED_SIGNS[i];
        // Static loading text

        try {
          let rawClip = null;
          if (sign.file.endsWith('.json')) {
            const resp = await fetch(sign.file);
            const clipJson = await resp.json();
            rawClip = THREE.AnimationClip.parse(clipJson);
          } else {
            const animFbx = await new Promise((resolve, reject) => {
              animLoader.load(sign.file, resolve, undefined, reject);
            });
            if (animFbx.animations && animFbx.animations.length > 0) {
              rawClip = animFbx.animations[0];
            }
          }

          if (rawClip) {
            // Sanitize / match track names with Sanket skeleton
            const sanitizedTracks = [];
            rawClip.tracks.forEach((track) => {
              const parts = track.name.split('.');
              const property = parts[parts.length - 1];
              let nodeName = parts.slice(0, -1).join('.');

              if (nodeName.includes(':')) {
                nodeName = nodeName.split(':').pop();
              }
              if (nodeName.includes('|')) {
                nodeName = nodeName.split('|').pop();
              }

              // Match bone using direct name OR normalized alphanumeric name
              let matchedBoneName = null;
              if (boneMap.has(nodeName)) {
                matchedBoneName = nodeName;
              } else {
                const normNode = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normBoneMap.has(normNode)) {
                  matchedBoneName = normBoneMap.get(normNode);
                }
              }

              // Filter out position root motion so avatar stays anchored firmly in front of camera
              if (property === 'position') {
                const lowerCheck = (matchedBoneName || nodeName).toLowerCase();
                if (
                  lowerCheck.includes('metarig') ||
                  lowerCheck.includes('armature') ||
                  lowerCheck.includes('root') ||
                  lowerCheck.includes('hip') ||
                  lowerCheck.includes('pelvis') ||
                  !matchedBoneName
                ) {
                  return; // Exclude root translation track
                }
              }

              if (matchedBoneName) {
                const newTrack = track.clone();
                newTrack.name = `${matchedBoneName}.${property}`;
                sanitizedTracks.push(newTrack);
              }
            });

            const signClip = new THREE.AnimationClip(
              `${sign.id}_Sign`,
              rawClip.duration,
              sanitizedTracks
            );

            if (sign.id === 'PLEASE') {
              console.log('[PLEASE DIAGNOSTIC] Duration:', rawClip.duration, 'Tracks:', rawClip.tracks.length);
              let changedTracks = 0;
              rawClip.tracks.forEach((t) => {
                let maxDelta = 0;
                for (let k = 0; k < t.values.length; k++) {
                  maxDelta = Math.max(maxDelta, Math.abs(t.values[k] - t.values[0]));
                }
                if (maxDelta > 0.001) {
                  changedTracks++;
                  if (changedTracks <= 10) console.log(`[PLEASE ACTIVE TRACK] ${t.name}, maxDelta: ${maxDelta}`);
                }
              });
              console.log(`[PLEASE DIAGNOSTIC] Total tracks with motion: ${changedTracks} / ${rawClip.tracks.length}`);
            }

            clipsMapRef.current[sign.id] = signClip;
            const action = mixer.clipAction(signClip);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            actionsMapRef.current[sign.id] = action;

            metaObj[sign.id] = {
              duration: signClip.duration,
              tracks: signClip.tracks.length,
              file: sign.file,
              desc: sign.desc
            };

            console.log(`[ANIMATION] Successfully loaded & bound: ${sign.id} (${signClip.duration.toFixed(2)}s, ${signClip.tracks.length} tracks)`);
          }
        } catch (err) {
          console.error(`Error loading sign ${sign.id}:`, err);
        }
      }

      setSignsMeta(metaObj);
      setIsLoaded(true);
      // Finished loading

      if (onSignsLoaded) {
        onSignsLoaded(SUPPORTED_SIGNS);
      }

      if (onStatusUpdate && metaObj['COME']) {
        onStatusUpdate({
          word: 'COME',
          duration: metaObj['COME'].duration,
          tracks: metaObj['COME'].tracks,
          file: '/animations/come.fbx'
        });
      }

      // Check if user requested a sign while loading
      if (pendingSignRef.current && actionsMapRef.current[pendingSignRef.current]) {
        const queuedWord = pendingSignRef.current;
        pendingSignRef.current = null;
        setTimeout(() => {
          playSignAnimation(queuedWord);
        }, 150);
      }
    };

    // 7. Render & Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clockRef.current.getDelta();
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      frameUpperBody();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="avatar-viewer-wrapper">
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="avatar-canvas-container" />

      {/* Loading Overlay */}
      {!isLoaded && (
        <div className="avatar-loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-title">{loadingStep}</div>
          {loadProgress > 0 && (
            <div className="loading-bar-track">
              <div className="loading-bar-fill" style={{ width: `${loadProgress}%` }} />
            </div>
          )}
          {/* Subtitle removed */}
        </div>
      )}

      {/* Top Left Badge: Avatar Info */}
      <div className="avatar-badge-top-left">
        <span className="live-dot" />
        <span>SignLink • ISL Interpreter Avatar</span>
        {isLoaded && (
          <span className="duration-pill">Ready</span>
        )}
      </div>

      {/* Top Right: Reset Camera View Button */}
      <div className="avatar-controls-top-right">
        <button
          onClick={frameUpperBody}
          className="reset-view-btn"
          title="Reset Camera to Upper Body View"
        >
          Reset View
        </button>
      </div>

      {/* Signing Active Banner */}
      {isPlaying && (
        <div className="avatar-signing-banner">
          <span className="signing-dot" />
          <span>SIGNING: "{currentWord}" (Complete Whole-Word Sign)</span>
        </div>
      )}
    </div>
  );
});

export default IslAvatarViewer;
